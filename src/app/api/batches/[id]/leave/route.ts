import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * POST /api/batches/[id]/leave — a student (or their parent) leaves a batch.
 *
 *  · waitlist seat → simply removed.
 *  · joined seat   → seat removed, seatsFilled--, held seat payment refunded
 *                    exactly like the auto-refund flow (payment refunded +
 *                    balanced ledger + payer wallet credit + booking cancelled).
 *    If a confirmed batch drops below its minimum it reopens ("open" + tutor
 *    notice). The earliest waitlist seat is then promoted (seat joined,
 *    booking accepted + payment held + escrow ledger + invoice — mirroring the
 *    join flow) and the batch re-confirms when the minimum is met again.
 */

/** Next occurrence of the batch's weekly pattern (mirrors the join flow). */
function nextOccurrence(dayPattern: string, startDate: Date): { startAt: Date; durationMin: number } {
  const pattern: { day: number; start: number; end: number }[] = JSON.parse(dayPattern || "[]");
  let startAt = new Date(startDate);
  let durationMin = 60;
  if (pattern.length) {
    const p = pattern[0];
    durationMin = Math.max(30, p.end - p.start);
    startAt = new Date();
    const diff = (p.day - startAt.getDay() + 7) % 7;
    startAt.setDate(startAt.getDate() + diff);
    startAt.setHours(Math.floor(p.start / 60), p.start % 60, 0, 0);
    if (startAt.getTime() < Date.now()) startAt.setDate(startAt.getDate() + 7);
  }
  return { startAt, durationMin };
}

/** Resolve the payer for a student's seat payment (linked parent, else the student). */
async function payerIdFor(studentId: string): Promise<string> {
  const profile = await db.studentProfile.findUnique({ where: { userId: studentId }, select: { parentEmail: true } });
  if (profile?.parentEmail) {
    const payer = await db.user.findUnique({ where: { email: profile.parentEmail }, select: { id: true } });
    if (payer) return payer.id;
  }
  return studentId;
}

/** Refund a student's held seat payment (auto-refund pattern): payment refunded,
 *  escrow debit / refunds credit ledger, payer wallet credit, booking cancelled. */
async function refundHeldSeatPayment(batchId: string, batchTitle: string, studentId: string): Promise<number> {
  const payerId = await payerIdFor(studentId);
  const bookings = await db.booking.findMany({ where: { batchId, studentId }, select: { id: true } });
  const bookingIds = bookings.map((b) => b.id);
  /* join links the payment via the seat booking; legacy rows may link straight to the batch */
  const payment = await db.payment.findFirst({
    where: { OR: [{ bookingId: { in: bookingIds } }, { AND: [{ batchId }, { payerId }] }] },
    orderBy: { createdAt: "desc" },
  });
  if (!payment || !["held", "created"].includes(payment.status)) {
    if (bookingIds.length) {
      await db.booking.updateMany({
        where: { id: { in: bookingIds }, state: { not: "cancelled" } },
        data: { state: "cancelled" },
      });
    }
    return 0;
  }

  /* claim the payment atomically so a concurrent refund can't double-credit */
  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: { in: ["held", "created"] } },
    data: { status: "refund_pending" },
  });
  if (claimed.count === 1) {
    await db.ledgerEntry.createMany({
      data: [
        { paymentId: payment.id, account: "escrow", debit: payment.total, credit: 0, memo: `Escrow reversed — seat left ${batchTitle}` },
        { paymentId: payment.id, account: "refunds", debit: 0, credit: payment.total, memo: `Seat fee refund — left ${batchTitle}` },
      ],
    });
    const wallet = await db.wallet.findUnique({ where: { userId: payment.payerId } });
    if (wallet) {
      await db.wallet.update({ where: { id: wallet.id }, data: { available: wallet.available + payment.total } });
    } else {
      await db.wallet.create({ data: { userId: payment.payerId, available: payment.total } });
    }
    await db.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
  }

  if (payment.bookingId) {
    await db.booking.updateMany({ where: { id: payment.bookingId, state: { not: "cancelled" } }, data: { state: "cancelled" } });
  } else if (bookingIds.length) {
    await db.booking.updateMany({ where: { id: { in: bookingIds }, state: { not: "cancelled" } }, data: { state: "cancelled" } });
  }
  return payment.total;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student" && auth.role !== "parent") {
    return forbidden("Only students (or parents on their behalf) can leave a batch.");
  }
  const { id } = await params;

  let body: any = {};
  try {
    body = await _req.json();
  } catch {
    /* empty body is fine */
  }

  /* resolve the student holding the seat */
  let stuId: string | null = auth.role === "student" ? auth.id : null;
  if (auth.role === "parent") {
    if (!body?.studentId) return badRequest("studentId is required when a parent leaves for a child.");
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
    if (!kids.some((k) => k.userId === body.studentId)) return forbidden("You can only leave for your own children.");
    stuId = body.studentId;
  }
  const student = await db.user.findUnique({ where: { id: stuId! }, select: { id: true, name: true } });
  if (!student) return badRequest("Student not found.");

  const batch = await db.batch.findUnique({ where: { id } });
  if (!batch) return notFound("Batch not found.");

  const seat = await db.batchSeat.findFirst({
    where: { batchId: id, studentId: student.id, status: { in: ["joined", "waitlist"] } },
  });
  if (!seat) {
    return notFound("You don't hold a seat in this batch.");
  }

  /* ---- waitlist seat → just remove it ---- */
  if (seat.status === "waitlist") {
    await db.batchSeat.delete({ where: { id: seat.id } });
    await db.notification.create({
      data: {
        userId: student.id,
        title: "Left the waitlist",
        body: `You left the waitlist for “${batch.title}”.`,
        type: "booking",
      },
    });
    await audit(
      { name: auth.name, role: auth.role },
      "batch.waitlist_left",
      `Batch: ${id}`,
      `${student.name} left the waitlist for ${batch.title}`
    );
    return Response.json({ data: { left: "waitlist", batchId: id } });
  }

  /* ---- joined seat → leave + refund ---- */
  if (batch.status === "closed") {
    return Response.json(
      { error: { code: "INVALID_STATE", message: "This batch has already started — leaving is no longer possible." } },
      { status: 409 }
    );
  }

  await db.batchSeat.delete({ where: { id: seat.id } });
  const seatsFilled = Math.max(0, batch.seatsFilled - 1);

  const refundPaise = await refundHeldSeatPayment(batch.id, batch.title, student.id);
  const refundInr = (refundPaise / 100).toFixed(2);

  /* notifications for the leaver + payer (when different) */
  await db.notification.create({
    data: {
      userId: student.id,
      title: "You left the batch",
      body:
        refundPaise > 0
          ? `You left “${batch.title}” — your ₹${refundInr} seat fee held in escrow was refunded in full to your wallet.`
          : `You left “${batch.title}”.`,
      type: "payment",
    },
  });
  if (refundPaise > 0) {
    const payerId = await payerIdFor(student.id);
    if (payerId !== student.id) {
      await db.notification.create({
        data: {
          userId: payerId,
          title: "Seat refunded — batch left",
          body: `${student.name} left “${batch.title}” — the ₹${refundInr} seat fee was refunded in full to your wallet.`,
          type: "payment",
        },
      });
    }
  }

  /* a confirmed batch that drops below the minimum reopens */
  let statusNow = batch.status;
  let reopened = false;
  if (batch.status === "confirmed" && seatsFilled < batch.minSeats) {
    statusNow = "open";
    reopened = true;
    await db.notification.create({
      data: {
        userId: batch.tutorId,
        title: "Batch reopened — below minimum",
        body: `A seat left ${batch.title} — the batch dropped below the minimum; it is open again and students can join.`,
        type: "booking",
      },
    });
  }

  await db.notification.create({
    data: {
      userId: batch.tutorId,
      title: "Seat vacated",
      body: `${student.name} left “${batch.title}” — ${seatsFilled}/${batch.maxSeats} seats filled.`,
      type: "booking",
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "batch.left",
    `Batch: ${id}`,
    `${student.name} left ${batch.title} · refund ₹${refundInr} · ${seatsFilled}/${batch.maxSeats} seats`,
    refundPaise > 0 ? "info" : "warning"
  );
  if (reopened) {
    await audit(
      { name: "Tutor Amma", role: "system" },
      "batch.reopened",
      `Batch: ${id}`,
      `${batch.title} dropped below the minimum (${seatsFilled}/${batch.minSeats}) — status back to open`
    );
  }

  /* ---- promote the earliest waitlist seat when a seat is free ---- */
  let promoted: { studentId: string; name: string } | null = null;
  let finalSeats = seatsFilled;
  if (seatsFilled < batch.maxSeats) {
    const nextInLine = await db.batchSeat.findFirst({
      where: { batchId: id, status: "waitlist" },
      orderBy: { joinedAt: "asc" },
    });
    if (nextInLine) {
      const promotedStudent = await db.user.findUnique({
        where: { id: nextInLine.studentId },
        select: { id: true, name: true },
      });
      await db.batchSeat.update({ where: { id: nextInLine.id }, data: { status: "joined" } });
      finalSeats = seatsFilled + 1;

      /* booking + payment + escrow ledger + invoice — mirrors the join flow (8% platform) */
      const { startAt, durationMin } = nextOccurrence(batch.dayPattern, batch.startDate);
      const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);
      const sessionFee = batch.pricePerSeat;
      const platformFee = Math.round(sessionFee * 0.08);
      const total = sessionFee + platformFee;

      const booking = await db.booking.create({
        data: {
          studentId: nextInLine.studentId,
          tutorId: batch.tutorId,
          mode: "group",
          subject: batch.subject,
          board: batch.board,
          grade: batch.grade,
          title: batch.title,
          startAt,
          endAt,
          state: "accepted",
          sessionFee,
          platformFee,
          total,
          batchId: id,
          policySnapshot: JSON.stringify({ freeCancelHours: 24, lateCancelSplit: "100% refund if batch unconfirmed" }),
        },
      });

      const payerId = await payerIdFor(nextInLine.studentId);
      await db.payment.create({
        data: {
          bookingId: booking.id,
          batchId: id,
          payerId,
          tutorId: batch.tutorId,
          purpose: "batch_seat",
          method: "upi",
          provider: "razorpay",
          sessionFee,
          platformFee,
          total,
          status: "held",
          ledgerEntries: {
            create: [
              { account: "payer_cash", debit: total, credit: 0, memo: `Batch seat — ${batch.title}` },
              { account: "escrow", debit: 0, credit: total, memo: "Seat payment held in escrow" },
            ],
          },
          invoice: { create: { number: `INV-${Date.now()}`, payerId, amount: total } },
        },
      });

      await db.notification.create({
        data: {
          userId: nextInLine.studentId,
          title: "A seat opened — you're in! 🎉",
          body: `A seat opened in ${batch.title} — you're in! Your seat fee was held in escrow.`,
          type: "booking",
        },
      });
      await db.notification.create({
        data: {
          userId: batch.tutorId,
          title: "Waitlist promotion",
          body: `${promotedStudent?.name ?? "A student"} moved up from the waitlist into “${batch.title}” — ${finalSeats}/${batch.maxSeats} seats filled.`,
          type: "booking",
        },
      });
      await audit(
        { name: "Tutor Amma", role: "system" },
        "batch.waitlist_promoted",
        `Batch: ${id}`,
        `${promotedStudent?.name ?? nextInLine.studentId} promoted from the waitlist into ${batch.title} (${finalSeats}/${batch.maxSeats})`
      );

      promoted = { studentId: nextInLine.studentId, name: promotedStudent?.name ?? "Student" };
    }
  }

  /* re-confirm when the minimum is met again */
  if (statusNow === "open" && finalSeats >= batch.minSeats) {
    statusNow = "confirmed";
  }

  const updatedBatch = await db.batch.update({
    where: { id },
    data: { seatsFilled: finalSeats, status: statusNow },
  });

  return Response.json({
    data: {
      left: "batch",
      refund: { amount: refundPaise },
      promoted,
      batch: updatedBatch,
    },
  });
}
