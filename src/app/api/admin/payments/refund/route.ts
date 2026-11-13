import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/** Admin-initiated refund — capped at captured total minus prior refunds. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  let body: { paymentId?: string; amount?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const { paymentId, reason } = body;
  const amount = Number(body.amount);
  if (!paymentId) return badRequest("paymentId is required.");
  if (!Number.isInteger(amount) || amount <= 0) return badRequest("amount must be a positive integer number of paise.");
  if (!reason || !reason.trim()) return badRequest("A refund reason is required.");

  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { booking: true, invoice: true } });
  if (!payment) return notFound("Payment not found.");

  /* cap = captured total − prior refunds (tracked via the refunds ledger account) */
  const refundEntries = await db.ledgerEntry.findMany({ where: { paymentId, account: "refunds" }, select: { credit: true } });
  const priorRefunds = refundEntries.reduce((s, e) => s + e.credit, 0);
  const cap = payment.total - priorRefunds;
  if (amount > cap) {
    return badRequest(
      `Refund of ₹${(amount / 100).toFixed(2)} exceeds the refundable balance of ₹${(cap / 100).toFixed(2)} on this payment.`,
      "REFUND_EXCEEDS_CAPTURE"
    );
  }

  const newStatus = priorRefunds + amount >= payment.total ? "refunded" : "partially_refunded";
  const wasReleased = payment.status === "released";
  await db.payment.update({ where: { id: payment.id }, data: { status: newStatus } });

  /* escrow out + refunds in; for previously-released payments also reverse the
     recognised platform commission and tutor earnings proportionally */
  const ledgerData = [
    { paymentId: payment.id, account: "escrow", debit: amount, credit: 0, memo: `Refund issued — ${reason.trim()}` },
    { paymentId: payment.id, account: "refunds", debit: 0, credit: amount, memo: `Refunded to payer — ${reason.trim()}` },
  ];
  if (wasReleased && payment.total > 0) {
    const propPlatform = Math.min(payment.platformFee, Math.round((amount * payment.platformFee) / payment.total));
    const propTutor = Math.min(payment.sessionFee, amount - propPlatform);
    if (propPlatform > 0) {
      ledgerData.push({
        paymentId: payment.id,
        account: "platform_revenue",
        debit: propPlatform,
        credit: 0,
        memo: `Refund reversal — platform commission ₹${(propPlatform / 100).toFixed(2)}`,
      });
    }
    if (propTutor > 0) {
      ledgerData.push({
        paymentId: payment.id,
        account: "tutor_payable",
        debit: propTutor,
        credit: 0,
        memo: `Refund reversal — tutor share ₹${(propTutor / 100).toFixed(2)}`,
      });
    }
  }
  await db.ledgerEntry.createMany({ data: ledgerData });

  /* credit the payer's wallet */
  const wallet = await db.wallet.findUnique({ where: { userId: payment.payerId } });
  if (wallet) {
    await db.wallet.update({ where: { id: wallet.id }, data: { available: { increment: amount } } });
  } else {
    await db.wallet.create({ data: { userId: payment.payerId, available: amount } });
  }

  const payer = await db.user.findUnique({ where: { id: payment.payerId }, select: { name: true } });
  await db.notification.create({
    data: {
      userId: payment.payerId,
      title: `Refund issued — ₹${(amount / 100).toFixed(2)}`,
      body: `${reason.trim()} The amount has been credited to your Tutor Amma wallet.${
        payment.invoice ? ` Invoice ${payment.invoice.number}.` : ""
      }`,
      type: "payment",
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "payment.refunded",
    `Payment: ${payment.invoice?.number ?? payment.id.slice(0, 10)}`,
    `₹${(amount / 100).toFixed(2)} refunded to ${payer?.name ?? "payer"} — ${reason.trim()}`,
    "warning"
  );

  return Response.json({ data: { ok: true, status: newStatus, refunded: priorRefunds + amount } });
}
