import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";
import { inr } from "@/lib/format";

/** Deterministic, collision-safe invoice number: INV-<year>-<zero-padded seq>. */
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.invoice.count();
  let seq = count + 359; // continues above the seeded INV-xxxx-03xx range
  for (let i = 0; i < 100; i++) {
    const candidate = `INV-${year}-${String(seq + i).padStart(4, "0")}`;
    const taken = await db.invoice.findUnique({ where: { number: candidate } });
    if (!taken) return candidate;
  }
  return `INV-${year}-${Date.now()}`;
}

/**
 * POST /api/payments/confirm
 * Simulates the signed gateway webhook: moves the payment into escrow ("held"),
 * writes double-entry ledger rows, issues an invoice and updates the payer wallet.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const { paymentId } = body ?? {};
  if (!paymentId) return badRequest("paymentId is required.");

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true, invoice: true },
  });
  if (!payment) return notFound("Payment not found.");
  if (payment.payerId !== auth.id) return forbidden("Only the payer can confirm this payment.");

  // idempotent replay of the webhook
  if (payment.status === "held" || payment.status === "released") {
    return Response.json({ data: { ok: true, status: payment.status, invoiceNo: payment.invoice?.number ?? null } });
  }
  if (payment.status !== "created") {
    return badRequest(`Payment cannot be confirmed from status "${payment.status}".`, "INVALID_STATE");
  }

  const invoiceNo = await nextInvoiceNumber();
  const contextLabel = payment.booking ? payment.booking.title : "group class seat";
  const methodLabel = payment.method.toUpperCase();

  await db.payment.update({ where: { id: payment.id }, data: { status: "held" } });
  await db.ledgerEntry.createMany({
    data: [
      {
        paymentId: payment.id,
        account: "payer_cash",
        debit: payment.total,
        credit: 0,
        memo: `${methodLabel} payment — ${contextLabel}`,
      },
      {
        paymentId: payment.id,
        account: "escrow",
        debit: 0,
        credit: payment.total,
        memo: "Funds held in escrow until check-out + dispute window",
      },
    ],
  });
  await db.invoice.create({
    data: { number: invoiceNo, paymentId: payment.id, payerId: payment.payerId, amount: payment.total, status: "paid" },
  });
  await db.wallet.upsert({
    where: { userId: auth.id },
    update: { escrow: { increment: payment.total } },
    create: { userId: auth.id, available: 0, escrow: payment.total },
  });
  await db.notification.create({
    data: {
      userId: auth.id,
      title: "Payment held in escrow",
      body: `${inr(payment.total)} for "${contextLabel}" is safely held in escrow. It is released to the tutor only after session check-out and the dispute window closes. Invoice ${invoiceNo}.`,
      type: "payment",
    },
  });
  await audit(
    { name: auth.name, role: auth.role },
    "payment.held",
    `Payment: ${invoiceNo}`,
    `${inr(payment.total)} ${methodLabel} hold → escrow for ${contextLabel}`
  );

  return Response.json({ data: { ok: true, status: "held", invoiceNo } });
}
