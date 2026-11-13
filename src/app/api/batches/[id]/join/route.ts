import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * POST /api/batches/[id]/join — take a seat in a group batch.
 * Creates BatchSeat + group Booking (accepted) + Payment (held) + ledger + invoice.
 * Batch auto-confirms when minSeats is reached. When the batch is full the
 * student joins the WAITLIST instead (no booking, no payment) and is notified
 * with their position.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student" && auth.role !== "parent") {
    return forbidden("Only students (or parents on their behalf) can join a batch.");
  }
  const { id } = await params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  /* resolve the student taking the seat */
  let stuId: string | null = auth.role === "student" ? auth.id : null;
  if (auth.role === "parent") {
    if (!body?.studentId) return badRequest("studentId is required when a parent joins for a child.");
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
    if (!kids.some((k) => k.userId === body.studentId)) return forbidden("You can only join for your own children.");
    stuId = body.studentId;
  }
  const student = await db.user.findUnique({ where: { id: stuId! }, select: { id: true, name: true } });
  if (!student) return badRequest("Student not found.");

  const batch = await db.batch.findUnique({ where: { id } });
  if (!batch) return notFound("Batch not found.");
  if (batch.status === "closed") {
    return Response.json({ error: { code: "INVALID_STATE", message: "This batch is closed." } }, { status: 409 });
  }
  if (batch.status === "cancelled") {
    return Response.json(
      {
        error: {
          code: "INVALID_STATE",
          message: "This batch was cancelled — it didn't reach the minimum number of students and held fees were refunded.",
        },
      },
      { status: 409 }
    );
  }
  const existingSeat = await db.batchSeat.findFirst({ where: { batchId: id, studentId: student.id } });
  if (existingSeat) {
    return Response.json({ error: { code: "ALREADY_JOINED", message: "You already hold a seat in this batch." } }, { status: 409 });
  }

  /* ---- batch full → waitlist (no booking, no payment, nothing incremented) ---- */
  if (batch.seatsFilled >= batch.maxSeats) {
    const seat = await db.batchSeat.create({ data: { batchId: id, studentId: student.id, status: "waitlist" } });
    const waitlist = await db.batchSeat.findMany({
      where: { batchId: id, status: "waitlist" },
      orderBy: { joinedAt: "asc" },
      select: { id: true },
    });
    const position = waitlist.findIndex((s) => s.id === seat.id) + 1;

    await db.notification.create({
      data: {
        userId: student.id,
        title: `You're on the waitlist — #${position}`,
        body: `You're #${position} on the waitlist for “${batch.title}” — we'll move you in automatically if a seat opens.`,
        type: "booking",
      },
    });
    await audit(
      { name: auth.name, role: auth.role },
      "batch.waitlisted",
      `Batch: ${id}`,
      `${student.name} joined the waitlist for ${batch.title} at position ${position}`
    );

    return Response.json({ data: { waitlisted: true, position, batchId: id } }, { status: 201 });
  }

  /* next occurrence of the weekly pattern */
  const pattern: { day: number; start: number; end: number }[] = JSON.parse(batch.dayPattern || "[]");
  let startAt = new Date(batch.startDate);
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
  const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);

  /* seat + booking + payment (server-authoritative fees, 8% platform) */
  const sessionFee = batch.pricePerSeat;
  const platformFee = Math.round(sessionFee * 0.08);
  const total = sessionFee + platformFee;

  await db.batchSeat.create({ data: { batchId: id, studentId: student.id, status: "joined" } });
  const seatsFilled = batch.seatsFilled + 1;
  const statusNow = batch.status === "open" && seatsFilled >= batch.minSeats ? "confirmed" : batch.status;

  const booking = await db.booking.create({
    data: {
      studentId: student.id,
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

  /* payer = parent when linked, else the joining user */
  const profile = await db.studentProfile.findUnique({ where: { userId: student.id }, select: { parentEmail: true } });
  let payerId = student.id;
  if (profile?.parentEmail) {
    const payer = await db.user.findUnique({ where: { email: profile.parentEmail }, select: { id: true } });
    if (payer) payerId = payer.id;
  }

  const payment = await db.payment.create({
    data: {
      bookingId: booking.id,
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

  const updatedBatch = await db.batch.update({ where: { id }, data: { seatsFilled, status: statusNow } });

  await db.notification.create({
    data: {
      userId: student.id,
      title: "Seat confirmed 🎉",
      body: `You're in! “${batch.title}” — ${batch.schedule}${statusNow === "confirmed" ? " (batch confirmed)" : ` · needs ${Math.max(0, batch.minSeats - seatsFilled)} more seat(s) to confirm`}. Payment held in escrow until the batch is confirmed.`,
      type: "booking",
    },
  });
  await db.notification.create({
    data: {
      userId: batch.tutorId,
      title: "New seat in your batch",
      body: `${student.name} joined “${batch.title}” — ${seatsFilled}/${batch.maxSeats} seats filled.`,
      type: "booking",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "batch.joined", `Batch: ${id}`, `${student.name} → ${batch.title} (${seatsFilled}/${batch.maxSeats})`);

  return Response.json({ data: { batch: updatedBatch, booking, paymentId: payment.id } }, { status: 201 });
}
