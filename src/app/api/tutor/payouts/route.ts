import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

/** Request a payout from the tutor wallet. Held during open disputes.
 *  Requires a VERIFIED bank account on the wallet (POST /api/wallet/verify-bank). */

const MIN_PAYOUT_PAISE = 50000; // ₹500

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  let body: { amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Enter a payout amount.");
  }
  if (amount < MIN_PAYOUT_PAISE) {
    return badRequest("Minimum payout is ₹500.00.");
  }

  const wallet = await db.wallet.findUnique({ where: { userId: auth.id } });

  /* payouts can only go to a verified bank account. bankVerified is a recent
     schema addition — read it with raw SQL so the gate also works while a
     long-lived dev server holds a stale generated Prisma client. */
  const bankRows = await db.$queryRaw<Array<{ bankMask: string | null; bankVerified: number | null }>>`SELECT bankMask, bankVerified FROM Wallet WHERE userId = ${auth.id}`;
  const bankVerified = !!bankRows[0]?.bankVerified; /* boolean column — Prisma maps it to true/false (or 1 on raw drivers) */
  const bankMask = bankRows[0]?.bankMask ?? "";
  if (!bankVerified) {
    return Response.json(
      {
        error: {
          code: "BANK_NOT_VERIFIED",
          message: "Add and verify a bank account before requesting a payout.",
        },
      },
      { status: 422 }
    );
  }

  const available = wallet?.available ?? 0;
  if (amount > available) {
    return badRequest(`Amount exceeds your available balance of ₹${(available / 100).toFixed(2)}.`);
  }

  /* payouts are frozen while a dispute is open on any of this tutor's bookings */
  const myBookings = await db.booking.findMany({ where: { tutorId: auth.id }, select: { id: true } });
  const bookingIds = new Set(myBookings.map((b) => b.id));
  const openDisputes = await db.dispute.findMany({
    where: { status: { in: ["open", "investigating"] } },
    select: { bookingId: true },
  });
  if (openDisputes.some((d) => bookingIds.has(d.bookingId))) {
    return Response.json(
      { error: { code: "PAYOUT_HOLD", message: "Payouts are on hold while a dispute is open — our team is reviewing the case on one of your bookings." } },
      { status: 422 }
    );
  }

  const payout = await db.payout.create({
    data: { tutorId: auth.id, amount, status: "pending", bankMask: bankMask || "Verified bank account" },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "payout.requested",
    `Payout: ${auth.name}`,
    `₹${(amount / 100).toFixed(2)} to ${payout.bankMask}`
  );
  await db.notification.create({
    data: {
      userId: auth.id,
      title: "Payout requested",
      body: `₹${(amount / 100).toFixed(2)} is on its way to ${payout.bankMask} — transfers land within 2 business days.`,
      type: "payment",
    },
  });

  return Response.json({ data: { id: payout.id, amount: payout.amount, status: payout.status, bankMask: payout.bankMask, requestedAt: payout.createdAt } }, { status: 201 });
}
