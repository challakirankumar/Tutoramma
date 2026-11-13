import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";
import { inr } from "@/lib/format";

const METHODS = ["upi", "card", "applepay"];
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function refCode(provider: "razorpay" | "stripe"): string {
  let rnd = "";
  for (let i = 0; i < 10; i++) rnd += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  return `${provider === "razorpay" ? "RZP" : "STR"}-${rnd}`;
}

/**
 * POST /api/payments/intents
 * Create (or idempotently return) a payment intent for a booking or batch seat.
 * Amount is ALWAYS recomputed server-side — client figures are never trusted.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent" && auth.role !== "student" && auth.role !== "admin") {
    return forbidden("Only parents and students can start a payment.");
  }

  let body: { bookingId?: string; batchId?: string; method?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const { bookingId, batchId, method } = body ?? {};
  if (!METHODS.includes(method ?? "")) return badRequest("method must be one of upi, card or applepay.");
  if (!bookingId && !batchId) return badRequest("bookingId or batchId is required.");
  if (bookingId && batchId) return badRequest("Provide either bookingId or batchId, not both.");

  const provider: "razorpay" | "stripe" = method === "upi" ? "razorpay" : "stripe";

  /* ---------- booking payment ---------- */
  if (bookingId) {
    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return notFound("Booking not found.");

    // payer must be the student, the student's parent, or an admin
    if (auth.role === "parent") {
      const child = await db.studentProfile.findFirst({ where: { userId: booking.studentId, parentEmail: auth.email } });
      if (!child) return forbidden("This booking does not belong to your children.");
    } else if (auth.role === "student" && booking.studentId !== auth.id) {
      return forbidden("This booking does not belong to you.");
    }

    // SERVER-SIDE recompute — never trust client amounts
    const sessionFee = booking.sessionFee;
    const platformFee = Math.round(booking.sessionFee * 0.08);
    const total = sessionFee + platformFee;

    const existing = await db.payment.findUnique({ where: { bookingId: booking.id }, include: { invoice: true } });
    if (existing && ["held", "released"].includes(existing.status)) {
      // idempotent — this booking is already paid / in escrow
      return Response.json({
        data: {
          paymentId: existing.id,
          amount: existing.total,
          method: existing.method,
          provider: existing.provider,
          reference: existing.invoice?.number ?? "—",
          alreadyPaid: true,
        },
      });
    }
    if (existing) {
      // a "created" intent exists — refresh it with the latest method and reuse
      const refreshed = await db.payment.update({
        where: { id: existing.id },
        data: { method: method!, provider, status: "created" },
      });
      return Response.json({
        data: { paymentId: refreshed.id, amount: total, method: refreshed.method, provider, reference: refCode(provider) },
      });
    }

    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        payerId: auth.id,
        tutorId: booking.tutorId,
        purpose: "booking",
        method: method!,
        provider,
        sessionFee,
        platformFee,
        total,
        status: "created",
      },
    });
    await audit(
      { name: auth.name, role: auth.role },
      "payment.intent_created",
      `Payment: ${booking.title}`,
      `${inr(total)} via ${method?.toUpperCase()} for booking ${booking.id}`
    );
    return Response.json(
      { data: { paymentId: payment.id, amount: total, method: payment.method, provider, reference: refCode(provider) } },
      { status: 201 }
    );
  }

  /* ---------- batch seat payment ---------- */
  const batch = await db.batch.findUnique({ where: { id: batchId! } });
  if (!batch) return notFound("Batch not found.");

  const seatFee = batch.pricePerSeat;
  const platformFee = Math.round(batch.pricePerSeat * 0.08);
  const total = seatFee + platformFee;

  const existingBatch = await db.payment.findFirst({
    where: { batchId: batch.id, payerId: auth.id, status: { in: ["created", "held", "released"] } },
  });
  if (existingBatch && existingBatch.status !== "created") {
    return Response.json({
      data: {
        paymentId: existingBatch.id,
        amount: existingBatch.total,
        method: existingBatch.method,
        provider: existingBatch.provider,
        reference: "—",
        alreadyPaid: true,
      },
    });
  }
  if (existingBatch) {
    const refreshed = await db.payment.update({
      where: { id: existingBatch.id },
      data: { method: method!, provider, status: "created" },
    });
    return Response.json({
      data: { paymentId: refreshed.id, amount: total, method: refreshed.method, provider, reference: refCode(provider) },
    });
  }

  const payment = await db.payment.create({
    data: {
      batchId: batch.id,
      payerId: auth.id,
      tutorId: batch.tutorId,
      purpose: "batch_seat",
      method: method!,
      provider,
      sessionFee: seatFee,
      platformFee,
      total,
      status: "created",
    },
  });
  await audit(
    { name: auth.name, role: auth.role },
    "payment.intent_created",
    `Batch: ${batch.title}`,
    `${inr(total)} via ${method?.toUpperCase()} for a group seat`
  );
  return Response.json(
    { data: { paymentId: payment.id, amount: total, method: payment.method, provider, reference: refCode(provider) } },
    { status: 201 }
  );
}
