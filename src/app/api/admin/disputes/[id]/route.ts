import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/** Resolve a dispute — plain resolution or resolution + 30% refund of the booking payment. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const { id } = await params;
  let body: { action?: string; resolution?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const action = body.action;
  const resolution = (body.resolution || "").trim();
  if (!["resolve", "refund"].includes(action ?? "")) return badRequest("action must be resolve or refund.");
  if (!resolution) return badRequest("A resolution note is required.");

  const dispute = await db.dispute.findUnique({ where: { id } });
  if (!dispute) return notFound("Dispute not found.");
  if (dispute.status === "resolved") return badRequest("This dispute is already resolved.", "INVALID_STATE");

  /* Dispute → Booking joined manually (no relation in schema) */
  const booking = dispute.bookingId ? await db.booking.findUnique({ where: { id: dispute.bookingId } }) : null;
  const payment = booking ? await db.payment.findUnique({ where: { bookingId: booking.id }, include: { invoice: true } }) : null;
  let refundAmount = 0;

  if (action === "refund") {
    if (!booking || !payment) {
      return badRequest("This booking has no captured payment to refund — use Resolve only.", "INVALID_STATE");
    }
    const refundEntries = await db.ledgerEntry.findMany({ where: { paymentId: payment.id, account: "refunds" }, select: { credit: true } });
    const priorRefunds = refundEntries.reduce((s, e) => s + e.credit, 0);
    refundAmount = Math.min(Math.round(payment.total * 0.3), Math.max(0, payment.total - priorRefunds));
    if (refundAmount > 0) {
      const newStatus = priorRefunds + refundAmount >= payment.total ? "refunded" : "partially_refunded";
      const wasReleased = payment.status === "released";
      await db.payment.update({ where: { id: payment.id }, data: { status: newStatus } });
      const ledgerData = [
        { paymentId: payment.id, account: "escrow", debit: refundAmount, credit: 0, memo: `Dispute refund 30% — dispute ${id.slice(0, 8)}` },
        { paymentId: payment.id, account: "refunds", debit: 0, credit: refundAmount, memo: `Dispute refund to payer — dispute ${id.slice(0, 8)}` },
      ];
      /* reverse recognised commission/earnings proportionally for released payments */
      if (wasReleased && payment.total > 0) {
        const propPlatform = Math.min(payment.platformFee, Math.round((refundAmount * payment.platformFee) / payment.total));
        const propTutor = Math.min(payment.sessionFee, refundAmount - propPlatform);
        if (propPlatform > 0) {
          ledgerData.push({ paymentId: payment.id, account: "platform_revenue", debit: propPlatform, credit: 0, memo: `Dispute reversal — commission ₹${(propPlatform / 100).toFixed(2)}` });
        }
        if (propTutor > 0) {
          ledgerData.push({ paymentId: payment.id, account: "tutor_payable", debit: propTutor, credit: 0, memo: `Dispute reversal — tutor share ₹${(propTutor / 100).toFixed(2)}` });
        }
      }
      await db.ledgerEntry.createMany({ data: ledgerData });
      const wallet = await db.wallet.findUnique({ where: { userId: payment.payerId } });
      if (wallet) {
        await db.wallet.update({ where: { id: wallet.id }, data: { available: { increment: refundAmount } } });
      } else {
        await db.wallet.create({ data: { userId: payment.payerId, available: refundAmount } });
      }
      await db.notification.create({
        data: {
          userId: payment.payerId,
          title: `Dispute resolved — ₹${(refundAmount / 100).toFixed(2)} refunded`,
          body: `${resolution} The 30% refund has been credited to your wallet.`,
          type: "payment",
        },
      });
      await db.notification.create({
        data: {
          userId: booking.tutorId,
          title: "Dispute resolved — 30% refund applied",
          body: `${resolution} A 30% refund (₹${(refundAmount / 100).toFixed(2)}) was returned to the payer.`,
          type: "payment",
        },
      });
    }
    await db.booking.update({ where: { id: booking.id }, data: { state: "refunded" } });
  }

  await db.dispute.update({ where: { id: dispute.id }, data: { status: "resolved", resolution } });

  await audit(
    { name: auth.name, role: auth.role },
    action === "refund" ? "dispute.resolved_refund" : "dispute.resolved",
    `Dispute: ${booking?.title ?? id.slice(0, 8)}`,
    refundAmount > 0
      ? `${resolution} — 30% refund (₹${(refundAmount / 100).toFixed(2)}) issued`
      : resolution,
    "warning"
  );

  return Response.json({ data: { ok: true, status: "resolved", refundAmount } });
}
