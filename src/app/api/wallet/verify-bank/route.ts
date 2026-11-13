import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest, audit } from "@/lib/auth";

/**
 * POST /api/wallet/verify-bank — verify a bank account for payouts.
 * Body: { iban, bankName? }. The IBAN is loosely validated (2 letters then
 * 13–30 alphanumeric characters, no spaces) and only a masked form is stored:
 * Wallet.bankMask = "{bankName|Bank} •••• {last4}", bankVerified = true.
 */

const IBAN_RE = /^[A-Za-z]{2}[A-Za-z0-9]{13,30}$/;

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const body = (await req.json().catch(() => null)) as { iban?: unknown; bankName?: unknown } | null;
  const iban = typeof body?.iban === "string" ? body.iban.trim() : "";
  const bankName = typeof body?.bankName === "string" ? body.bankName.trim().slice(0, 40) : "";

  if (!iban) return badRequest("Enter your IBAN to verify a bank account.", "BANK_INVALID");
  if (/\s/.test(iban) || !IBAN_RE.test(iban)) {
    return badRequest(
      "That IBAN doesn't look right — it should start with 2 letters followed by 13–30 letters or digits, with no spaces.",
      "BANK_INVALID"
    );
  }

  const last4 = iban.slice(-4);
  const bankMask = `${bankName || "Bank"} •••• ${last4}`;

  /* bankMask/bankVerified are recent schema additions — write them with raw SQL
     so verification also works while a long-lived dev server still holds a
     stale generated Prisma client (typed writes of new fields would throw). */
  const wallet = await db.wallet.findUnique({ where: { userId: auth.id }, select: { id: true } });
  if (wallet) {
    await db.$executeRaw`UPDATE Wallet SET bankMask = ${bankMask}, bankVerified = 1 WHERE userId = ${auth.id}`;
  } else {
    const id = `w-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    await db.$executeRaw`INSERT INTO Wallet (id, userId, bankMask, bankVerified) VALUES (${id}, ${auth.id}, ${bankMask}, 1)`;
  }

  await audit(
    { name: auth.name, role: auth.role },
    "wallet.bank_verified",
    `Wallet: ${auth.id}`,
    `${bankMask} · IBAN ending ${last4}`
  );

  return Response.json({ data: { bankMask, bankVerified: true } });
}
