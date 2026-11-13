import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, audit } from "@/lib/auth";

/**
 * GET /api/institute/performance — REAL per-batch metrics for the academy:
 *  · fill rate      — seatsFilled / maxSeats
 *  · attendance     — averaged over the batch's ENDED live classes
 *                     (attendanceJson attendees with status present|late); null
 *                     when no classes have been held yet
 *  · rating         — real batch rating (0 = no reviews yet)
 *  · avg mastery    — learning-passport (PassportTopic) mastery of the students
 *                     currently holding joined seats; null when there is no data
 *
 * Before reporting, stale OPEN academy batches (startDate passed, minimum not
 * met) are cancelled and their held seat payments auto-refunded — same
 * idempotent evaluation as GET /api/batches, scoped to this academy.
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

/* ---------------- stale-batch auto-refund (academy-scoped) ---------------- */

/** Resolve the payer for a student's seat payment (linked parent, else the student). */
async function payerIdFor(studentId: string): Promise<string> {
  const profile = await db.studentProfile.findUnique({ where: { userId: studentId }, select: { parentEmail: true } });
  if (profile?.parentEmail) {
    const payer = await db.user.findUnique({ where: { email: profile.parentEmail }, select: { id: true } });
    if (payer) return payer.id;
  }
  return studentId;
}

/** Cancel the academy's stale open batches and auto-refund held seat payments (idempotent). */
async function autoRefundStaleAcademyBatches(instituteEmail: string): Promise<void> {
  const now = new Date();
  const stale = await db.batch.findMany({
    where: { status: "open", startDate: { lt: now }, instituteEmail },
    select: { id: true, title: true, tutorId: true },
  });

  for (const batch of stale) {
    const detail = await db.batch.findUnique({
      where: { id: batch.id },
      select: { seatsFilled: true, minSeats: true },
    });
    if (!detail || detail.seatsFilled >= detail.minSeats) continue;

    const claimed = await db.batch.updateMany({
      where: { id: batch.id, status: "open" },
      data: { status: "cancelled" },
    });
    if (claimed.count === 0) continue;

    const seats = await db.batchSeat.findMany({
      where: { batchId: batch.id, status: "joined" },
      orderBy: { joinedAt: "asc" },
    });
    const bookings = await db.booking.findMany({ where: { batchId: batch.id }, select: { id: true, studentId: true } });

    let refundedSeats = 0;
    let refundedPaise = 0;

    for (const seat of seats) {
      const payerId = await payerIdFor(seat.studentId);
      const seatBookingIds = bookings.filter((b) => b.studentId === seat.studentId).map((b) => b.id);
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

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  /* evaluate stale academy batches first — cancels + auto-refunds (idempotent) */
  await autoRefundStaleAcademyBatches(auth.email);

  const batches = await db.batch.findMany({ where: { instituteEmail: auth.email } });
  const now = new Date();
  const batchIds = batches.map((b) => b.id);

  /* attendance from ended live classes */
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

  /* joined seats + learning-passport mastery of those students */
  const seats = batchIds.length
    ? await db.batchSeat.findMany({
        where: { batchId: { in: batchIds }, status: "joined" },
        select: { batchId: true, studentId: true },
      })
    : [];
  const studentIds = Array.from(new Set(seats.map((s) => s.studentId)));
  const topics = studentIds.length
    ? await db.passportTopic.findMany({
        where: { studentId: { in: studentIds } },
        select: { studentId: true, subject: true, mastery: true },
      })
    : [];

  const rows = batches
    .map((b) => {
      const fillPercent = b.maxSeats ? Math.round((b.seatsFilled / b.maxSeats) * 100) : 0;
      const started = b.startDate.getTime() < now.getTime();
      const agg = attendanceAgg.get(b.id);

      /* mastery of this batch's joined students, in this batch's subject */
      const batchStudentIds = new Set(seats.filter((s) => s.batchId === b.id).map((s) => s.studentId));
      const batchTopics = topics.filter((t) => batchStudentIds.has(t.studentId) && t.subject === b.subject);
      const avgMastery = batchTopics.length
        ? Math.round(batchTopics.reduce((sum, t) => sum + t.mastery, 0) / batchTopics.length)
        : null;

      return {
        id: b.id,
        title: b.title,
        subject: b.subject,
        fillPercent,
        attendancePercent: agg && agg.sessions > 0 ? Math.round(agg.sum / agg.sessions) : null,
        rating: b.rating,
        sessionsHeld: agg?.sessions ?? 0,
        avgMastery,
        started,
      };
    })
    .sort((a, b) => b.fillPercent - a.fillPercent);

  /* honest summary: nulls when there is no underlying data */
  const attended = rows.filter((r) => r.attendancePercent !== null);
  const rated = rows.filter((r) => r.rating > 0);
  const summary = {
    avgFill: rows.length ? Math.round(rows.reduce((s, r) => s + r.fillPercent, 0) / rows.length) : 0,
    avgAttendance: attended.length
      ? Math.round(attended.reduce((s, r) => s + (r.attendancePercent ?? 0), 0) / attended.length)
      : null,
    avgRating: rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : 0,
    /* across every learning-passport topic of students holding joined seats */
    avgMastery: topics.length ? Math.round(topics.reduce((s, t) => s + t.mastery, 0) / topics.length) : null,
    totalStudents: batches.reduce((s, b) => s + b.seatsFilled, 0),
  };

  return Response.json({ data: rows, summary });
}
