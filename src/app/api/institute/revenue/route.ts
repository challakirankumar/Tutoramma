import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

/** GET/POST /api/institute/revenue — academy money: collections, escrow and bulk payouts. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Shared money roll-up for the signed-in academy. */
async function academyMoney(tutorIds: string[], instituteUserId: string) {
  const payments = await db.payment.findMany({
    where: { tutorId: { in: tutorIds }, status: { in: ["released", "held"] } },
    select: { total: true, platformFee: true, status: true, createdAt: true },
  });
  const payouts = await db.payout.findMany({ where: { tutorId: instituteUserId } });

  const breakdown = { gross: 0, platformFee: 0, net: 0, released: 0, held: 0 };
  for (const p of payments) {
    breakdown.gross += p.total;
    breakdown.platformFee += p.platformFee;
    if (p.status === "released") breakdown.released += p.total;
    else breakdown.held += p.total;
  }
  breakdown.net = breakdown.gross - breakdown.platformFee;

  const byMonth: { key: string; label: string; gross: number; net: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    byMonth.push({ key: monthKey(d), label: MONTHS[d.getMonth()], gross: 0, net: 0 });
  }
  const monthMap = new Map(byMonth.map((m) => [m.key, m]));
  for (const p of payments) {
    const m = monthMap.get(monthKey(new Date(p.createdAt)));
    if (!m) continue;
    m.gross += p.total;
    m.net += p.total - p.platformFee;
  }

  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pending = payouts.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0);

  return {
    breakdown,
    byMonth,
    payouts: payouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    payoutSummary: {
      available: Math.max(0, breakdown.net - paidOut - pending),
      pending,
      paidOut,
    },
  };
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  const tutorProfiles = await db.tutorProfile.findMany({
    where: { instituteEmail: auth.email },
    select: { userId: true },
  });
  const money = await academyMoney(tutorProfiles.map((t) => t.userId), auth.id);

  return Response.json({
    data: {
      breakdown: money.breakdown,
      byMonth: money.byMonth.map(({ label, gross, net }) => ({ label, gross, net })),
      payouts: money.payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        bankMask: p.bankMask,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
      })),
      payoutSummary: money.payoutSummary,
      disputesHeld: 0,
    },
  });
}

/** POST /api/institute/revenue — request a bulk academy payout. Body: { amount (INR rupees) }.
 *  Requires a VERIFIED bank account on the academy wallet (see
 *  POST /api/wallet/verify-bank) — payouts are sent to the verified account. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("Invalid request body.");

  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount < 500) return badRequest("Minimum payout is ₹500.");

  /* payouts can only go to a verified bank account. bankVerified is a recent
     schema addition — read it with raw SQL so the gate also works while a
     long-lived dev server holds a stale generated Prisma client. */
  const bankRows = await db.$queryRaw<Array<{ bankMask: string | null; bankVerified: number | null }>>`SELECT bankMask, bankVerified FROM Wallet WHERE userId = ${auth.id}`;
  const bankVerified = !!bankRows[0]?.bankVerified; /* boolean column — Prisma maps it to true/false (or 1 on raw drivers) */
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
  const bankMask = bankRows[0]?.bankMask || "Verified bank account";

  const tutorProfiles = await db.tutorProfile.findMany({
    where: { instituteEmail: auth.email },
    select: { userId: true },
  });
  const money = await academyMoney(tutorProfiles.map((t) => t.userId), auth.id);
  const paise = Math.round(amount * 100);

  if (paise > money.payoutSummary.available) return badRequest("Payout amount exceeds available balance.");

  const payout = await db.payout.create({
    data: { tutorId: auth.id, amount: paise, status: "pending", bankMask },
  });

  await db.notification.create({
    data: {
      userId: auth.id,
      title: `Payout of ₹${(paise / 100).toFixed(2)} requested`,
      body: `Your bulk academy payout is being prepared for ${bankMask}. Transfers usually land within 2 business days.`,
      type: "payment",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "institute.payout.requested", `Payout: ${payout.id}`, `₹${(paise / 100).toFixed(2)} to ${bankMask}`);

  return Response.json({ data: { id: payout.id, amount: payout.amount, status: payout.status } }, { status: 201 });
}
