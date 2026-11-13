import { db } from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

const LEDGER_ACCOUNT_LABEL: Record<string, string> = {
  payer_cash: "Your account",
  escrow: "Escrow",
  platform_revenue: "Platform",
  tutor_payable: "Tutor payable",
  refunds: "Refunds",
};

/**
 * GET /api/wallet
 * Wallet balances + ledger + invoices + totals for the signed-in user
 * (works for parents and tutors; payouts included for tutor role).
 * Includes bank verification state (bankMask / bankVerified) and the total
 * payout amount currently in transit (pending | processing).
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const wallet = await db.wallet.findUnique({ where: { userId: auth.id } });
  const pendingPayoutAgg = await db.payout.aggregate({
    _sum: { amount: true },
    where: { tutorId: auth.id, status: { in: ["pending", "processing"] } },
  });
  const pendingPayout = pendingPayoutAgg._sum.amount ?? 0;
  /* bankMask/bankVerified are recent schema additions — read them with raw SQL so
     the response stays correct even if the dev server holds a stale generated
     Prisma client (typed reads silently omit unknown columns). */
  const bankRows = await db.$queryRaw<Array<{ bankMask: string | null; bankVerified: number | null }>>`SELECT bankMask, bankVerified FROM Wallet WHERE userId = ${auth.id}`;
  const bankMask = bankRows[0]?.bankMask ?? "";
  const bankVerified = !!bankRows[0]?.bankVerified; /* boolean column — Prisma maps it to true/false (or 1 on raw drivers) */

  const payments = await db.payment.findMany({
    where: { payerId: auth.id },
    include: { booking: true, invoice: { select: { number: true } }, ledgerEntries: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  // Booking has no tutor/student relations — resolve names manually
  const userIds = Array.from(
    new Set(payments.flatMap((p) => (p.booking ? [p.booking.studentId, p.booking.tutorId] : [])))
  );
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const ledger = payments
    .flatMap((p) =>
      p.ledgerEntries.map((e) => ({
        id: e.id,
        account: e.account,
        accountLabel: LEDGER_ACCOUNT_LABEL[e.account] ?? e.account,
        debit: e.debit,
        credit: e.credit,
        memo: e.memo,
        at: e.createdAt,
        method: p.method,
        status: p.status,
        context: p.booking
          ? `${p.booking.subject} · ${p.booking.title}`
          : "Group class seat",
        studentName: p.booking ? nameOf.get(p.booking.studentId) ?? null : null,
        invoiceNo: p.invoice?.number ?? null,
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 50);

  const invoices = await db.invoice.findMany({
    where: { payerId: auth.id },
    include: { payment: { include: { booking: true } } },
    orderBy: { issuedAt: "desc" },
    take: 30,
  });

  const settled = payments.filter((p) => ["held", "released", "succeeded"].includes(p.status));
  const totalSpent = settled.reduce((sum, p) => sum + p.total, 0);

  const payouts =
    auth.role === "tutor"
      ? await db.payout.findMany({ where: { tutorId: auth.id }, orderBy: { createdAt: "desc" }, take: 20 })
      : [];

  return Response.json({
    data: {
      wallet: {
        available: wallet?.available ?? 0,
        escrow: wallet?.escrow ?? 0,
        currency: wallet?.currency ?? "INR",
        bankMask,
        bankVerified,
        pendingPayout,
      },
      ledger,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        amount: inv.amount,
        status: inv.status,
        issuedAt: inv.issuedAt,
        context: inv.payment?.booking
          ? `${nameOf.get(inv.payment.booking.studentId) ?? "Student"} · ${inv.payment.booking.title}`
          : "Group class seat",
        method: inv.payment?.method ?? "upi",
        mode: inv.payment?.booking?.mode ?? null,
        paymentStatus: inv.payment?.status ?? "paid",
        sessionFee: inv.payment?.sessionFee ?? inv.amount,
        platformFee: inv.payment?.platformFee ?? 0,
      })),
      totals: {
        totalSpent,
        escrowHeld: wallet?.escrow ?? 0,
        payments: settled.length,
      },
      payouts,
    },
  });
}
