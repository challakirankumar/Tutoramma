import { db } from "@/lib/db";
import { getAuthUser, unauthorized, audit } from "@/lib/auth";

/**
 * GET /api/batches — group batches with tutor info, live-class attendance stats
 * and the current user's seat status (student seat or a parent's children).
 * ?include=cancelled also returns auto-refunded batches (transparency).
 *
 * Before listing, stale OPEN batches (startDate already passed and the minimum
 * seats not met) are cancelled and every held seat payment is auto-refunded to
 * the payer's wallet. The evaluation only ever touches status "open" batches,
 * so it is idempotent and safe to run on every GET.
 */

/* ---------------- attendance ---------------- */

interface AttendanceAttendee {
  status?: string;
}

/** Share of attendees marked present|late in one ended class (0–100). */
function classAttendancePercent(attendanceJson: string): number {
  try {
    const parsed = JSON.parse(attendanceJson || "{}") as { attendees?: AttendanceAttendee[] };
    const attendees = Array.isArray(parsed?.attendees) ? parsed.attendees : [];
    const present = attendees.filter((a) => a?.status === "present" || a?.status === "late").length;
    return Math.round((100 * present) / Math.max(1, attendees.length));
  } catch {
    return 0;
  }
}

/* ---------------- stale-batch auto-refund ---------------- */

/** Resolve the payer for a student's seat payment (linked parent, else the student). */
async function payerIdFor(studentId: string): Promise<string> {
  const profile = await db.studentProfile.findUnique({ where: { userId: studentId }, select: { parentEmail: true } });
  if (profile?.parentEmail) {
    const payer = await db.user.findUnique({ where: { email: profile.parentEmail }, select: { id: true } });
    if (payer) return payer.id;
  }
  return studentId;
}

/**
 * Cancel stale open batches (startDate < now && seatsFilled < minSeats) and
 * auto-refund every joined seat: payment → refunded, balanced ledger entries
 * (escrow debit / refunds credit), payer wallet credit, seat booking cancelled,
 * seat marked refunded, notifications to student / payer / tutor.
 * Atomic claims (batch open→cancelled, payment held→refund_pending) make it
 * safe under concurrent GETs and re-runs.
 */
async function autoRefundStaleBatches(): Promise<void> {
  const now = new Date();
  const stale = await db.batch.findMany({
    where: { status: "open", startDate: { lt: now } },
    select: { id: true, title: true, tutorId: true },
  });

  for (const batch of stale) {
    const detail = await db.batch.findUnique({
      where: { id: batch.id },
      select: { seatsFilled: true, minSeats: true },
    });
    if (!detail || detail.seatsFilled >= detail.minSeats) continue;

    /* claim the batch atomically so concurrent requests can't double-refund */
    const claimed = await db.batch.updateMany({
      where: { id: batch.id, status: "open" },
      data: { status: "cancelled" },
    });
    if (claimed.count === 0) continue;

    const seats = await db.batchSeat.findMany({
      where: { batchId: batch.id, status: "joined" },
      orderBy: { joinedAt: "asc" },
    });
    const bookings = await db.booking.findMany({
      where: { batchId: batch.id },
      select: { id: true, studentId: true },
    });

    let refundedSeats = 0;
    let refundedPaise = 0;

    for (const seat of seats) {
      const payerId = await payerIdFor(seat.studentId);
      const seatBookingIds = bookings.filter((b) => b.studentId === seat.studentId).map((b) => b.id);
      /* join links the payment via the seat booking; legacy rows may link straight to the batch */
      const payment = await db.payment.findFirst({
        where: { OR: [{ bookingId: { in: seatBookingIds } }, { AND: [{ batchId: batch.id }, { payerId }] }] },
        orderBy: { createdAt: "desc" },
      });

      let amountPaise = 0;
      if (payment && ["held", "created"].includes(payment.status)) {
        const claimedPayment = await db.payment.updateMany({
          where: { id: payment.id, status: { in: ["held", "created"] } },
          data: { status: "refund_pending" },
        });
        if (claimedPayment.count === 1) {
          amountPaise = payment.total;
          await db.ledgerEntry.createMany({
            data: [
              { paymentId: payment.id, account: "escrow", debit: payment.total, credit: 0, memo: `Escrow reversed — ${batch.title} cancelled (minimum not met)` },
              { paymentId: payment.id, account: "refunds", debit: 0, credit: payment.total, memo: `Seat fee auto-refund — ${batch.title}` },
            ],
          });
          const wallet = await db.wallet.findUnique({ where: { userId: payment.payerId } });
          if (wallet) {
            await db.wallet.update({ where: { id: wallet.id }, data: { available: wallet.available + payment.total } });
          } else {
            await db.wallet.create({ data: { userId: payment.payerId, available: payment.total } });
          }
          await db.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
          refundedPaise += payment.total;
        }
      }
      if (seatBookingIds.length) {
        await db.booking.updateMany({
          where: { id: { in: seatBookingIds }, state: { not: "cancelled" } },
          data: { state: "cancelled" },
        });
      }

      await db.batchSeat.update({ where: { id: seat.id }, data: { status: "refunded" } });
      refundedSeats += 1;

      const amountInr = (amountPaise / 100).toFixed(2);
      const refundBody = `${batch.title} did not reach the minimum of ${detail.minSeats} students — your ₹${amountInr} seat fee was automatically refunded to your wallet.`;
      await db.notification.create({
        data: { userId: seat.studentId, title: "Batch cancelled — seat auto-refunded", body: refundBody, type: "payment" },
      });
      if (payment && payment.payerId !== seat.studentId) {
        await db.notification.create({
          data: { userId: payment.payerId, title: "Batch cancelled — seat auto-refunded", body: refundBody, type: "payment" },
        });
      }
    }

    await db.notification.create({
      data: {
        userId: batch.tutorId,
        title: "Batch cancelled — minimum not met",
        body: `${batch.title} was cancelled — minimum seats not met; held payments were refunded.`,
        type: "booking",
      },
    });
    await audit(
      { name: "Tutor Amma", role: "system" },
      "batch.auto_refund",
      `Batch: ${batch.id}`,
      `${batch.title} cancelled — ${refundedSeats} seat(s) refunded, ${(refundedPaise / 100).toFixed(2)} ₹ returned to wallets`,
      "warning"
    );
  }
}

/* ---------------- route ---------------- */

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  /* evaluate stale batches first — cancels + auto-refunds (idempotent) */
  await autoRefundStaleBatches();

  const includeCancelled = new URL(req.url).searchParams.get("include") === "cancelled";
  const batches = await db.batch.findMany({
    where: { status: { in: includeCancelled ? ["open", "confirmed", "cancelled"] : ["open", "confirmed"] } },
    orderBy: { createdAt: "desc" },
  });
  const batchIds = batches.map((b) => b.id);

  const tutorIds = Array.from(new Set(batches.map((b) => b.tutorId)));
  const tutors = tutorIds.length
    ? await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const tutorMap = new Map(tutors.map((t) => [t.id, t]));

  /* attendance from ended live classes of each batch */
  const endedClasses = batchIds.length
    ? await db.liveClass.findMany({
        where: { batchId: { in: batchIds }, status: "ended" },
        select: { batchId: true, attendanceJson: true },
      })
    : [];
  const attendanceAgg = new Map<string, { sessions: number; sum: number }>();
  for (const c of endedClasses) {
    if (!c.batchId) continue;
    const agg = attendanceAgg.get(c.batchId) ?? { sessions: 0, sum: 0 };
    agg.sessions += 1;
    agg.sum += classAttendancePercent(c.attendanceJson);
    attendanceAgg.set(c.batchId, agg);
  }

  /* seats relevant to the current user */
  let myStudentIds: string[] = [];
  if (auth.role === "student") {
    myStudentIds = [auth.id];
  } else if (auth.role === "parent") {
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
    myStudentIds = kids.map((k) => k.userId);
  }

  const mySeats = myStudentIds.length
    ? await db.batchSeat.findMany({
        where: { batchId: { in: batchIds }, studentId: { in: myStudentIds } },
        orderBy: { joinedAt: "asc" },
      })
    : [];

  /* waitlist positions (among ALL waitlist seats, ordered by joinedAt) */
  const waitlistSeats = batchIds.length
    ? await db.batchSeat.findMany({
        where: { batchId: { in: batchIds }, status: "waitlist" },
        orderBy: { joinedAt: "asc" },
        select: { batchId: true, studentId: true },
      })
    : [];
  const waitlistPos = new Map<string, number>();
  const waitlistCount = new Map<string, number>();
  for (const s of waitlistSeats) {
    const n = (waitlistCount.get(s.batchId) ?? 0) + 1;
    waitlistCount.set(s.batchId, n);
    waitlistPos.set(`${s.batchId}:${s.studentId}`, n);
  }

  /* my seat bookings + payments (refund-policy context for the leave dialog) */
  const myBookings = myStudentIds.length
    ? await db.booking.findMany({
        where: { batchId: { in: batchIds }, studentId: { in: myStudentIds } },
        select: { id: true, batchId: true, studentId: true, policySnapshot: true },
      })
    : [];
  const myPayments = myBookings.length
    ? await db.payment.findMany({
        where: { bookingId: { in: myBookings.map((b) => b.id) } },
        select: { bookingId: true, status: true, total: true },
      })
    : [];
  const paymentByBooking = new Map(myPayments.map((p) => [p.bookingId!, p]));

  /* one representative seat per batch (prefer joined > waitlist > refunded) */
  const seatRank: Record<string, number> = { joined: 0, waitlist: 1, refunded: 2, left: 3 };
  const seatByBatch = new Map<string, (typeof mySeats)[number]>();
  for (const seat of mySeats) {
    const existing = seatByBatch.get(seat.batchId);
    if (!existing || (seatRank[seat.status] ?? 9) < (seatRank[existing.status] ?? 9)) {
      seatByBatch.set(seat.batchId, seat);
    }
  }

  const data = batches.map((b) => {
    const t = tutorMap.get(b.tutorId);
    const agg = attendanceAgg.get(b.id);
    const seat = seatByBatch.get(b.id);

    let mySeat: {
      status: string;
      position: number | null;
      paymentHeld: boolean;
      amount: number | null;
      policyLabel: string | null;
    } | null = null;
    if (seat) {
      const booking = myBookings.find((bk) => bk.batchId === b.id && bk.studentId === seat.studentId);
      const payment = booking ? paymentByBooking.get(booking.id) : undefined;
      let policyLabel: string | null = null;
      if (booking) {
        try {
          const policy = JSON.parse(booking.policySnapshot || "{}");
          if (policy?.lateCancelSplit) policyLabel = String(policy.lateCancelSplit);
        } catch {
          policyLabel = null;
        }
      }
      mySeat = {
        status: seat.status,
        position: seat.status === "waitlist" ? waitlistPos.get(`${b.id}:${seat.studentId}`) ?? null : null,
        paymentHeld: payment?.status === "held",
        amount: payment ? payment.total : null,
        policyLabel,
      };
    }

    return {
      id: b.id,
      tutorId: b.tutorId,
      tutor: t ? { id: t.id, name: t.name, color: t.avatarColor } : { id: b.tutorId, name: "Tutor", color: "#315BE5" },
      subject: b.subject,
      board: b.board,
      grade: b.grade,
      title: b.title,
      schedule: b.schedule,
      dayPattern: JSON.parse(b.dayPattern || "[]"),
      minSeats: b.minSeats,
      maxSeats: b.maxSeats,
      seatsFilled: b.seatsFilled,
      pricePerSeat: b.pricePerSeat,
      mode: b.mode,
      venue: b.venue,
      status: b.status,
      startDate: b.startDate,
      rating: b.rating,
      joined: seat?.status === "joined",
      mySeat,
      waitlistCount: waitlistCount.get(b.id) ?? 0,
      sessionsHeld: agg?.sessions ?? 0,
      attendancePercent: agg && agg.sessions > 0 ? Math.round(agg.sum / agg.sessions) : null,
    };
  });

  return Response.json({ data });
}
