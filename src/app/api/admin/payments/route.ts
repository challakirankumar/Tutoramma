import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Escrow summary + payments + ledger + payouts (admin only). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const [payments, ledger, payouts, heldAgg, releasedAgg, revenueAgg, pendingAgg, pendingCount] = await Promise.all([
    db.payment.findMany({
      include: {
        booking: { select: { title: true, subject: true } },
        invoice: true,
        ledgerEntries: { where: { account: "refunds" }, select: { credit: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.ledgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    db.payout.findMany({ orderBy: { createdAt: "desc" } }),
    db.payment.aggregate({ _sum: { total: true }, where: { status: "held" } }),
    db.payment.aggregate({ _sum: { total: true }, where: { status: "released" } }),
    db.payment.aggregate({ _sum: { platformFee: true }, where: { status: "released" } }),
    db.payout.aggregate({ _sum: { amount: true }, where: { status: "pending" } }),
    db.payout.count({ where: { status: "pending" } }),
  ]);

  /* manual joins for payer / tutor names */
  const userIds = new Set<string>();
  for (const p of payments) {
    userIds.add(p.payerId);
    if (p.tutorId) userIds.add(p.tutorId);
  }
  for (const p of payouts) userIds.add(p.tutorId);
  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, avatarColor: true },
  });
  const umap = new Map(users.map((u) => [u.id, u]));

  const paymentRows = payments.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    purpose: p.purpose,
    method: p.method,
    provider: p.provider,
    sessionFee: p.sessionFee,
    platformFee: p.platformFee,
    total: p.total,
    status: p.status,
    refunded: p.ledgerEntries.reduce((s, e) => s + e.credit, 0),
    bookingTitle: p.booking?.title ?? null,
    payerName: umap.get(p.payerId)?.name ?? "—",
    payerColor: umap.get(p.payerId)?.avatarColor ?? "#315BE5",
    tutorName: p.tutorId ? umap.get(p.tutorId)?.name ?? "—" : null,
    tutorColor: p.tutorId ? umap.get(p.tutorId)?.avatarColor ?? "#315BE5" : null,
    invoiceNo: p.invoice?.number ?? null,
  }));

  const ledgerRows = ledger.map((l) => ({
    id: l.id,
    account: l.account,
    debit: l.debit,
    credit: l.credit,
    memo: l.memo,
    createdAt: l.createdAt,
    paymentId: l.paymentId,
  }));

  const payoutRows = payouts.map((p) => ({
    id: p.id,
    tutorId: p.tutorId,
    tutorName: umap.get(p.tutorId)?.name ?? "—",
    tutorColor: umap.get(p.tutorId)?.avatarColor ?? "#315BE5",
    amount: p.amount,
    status: p.status,
    bankMask: p.bankMask,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
  }));

  return Response.json({
    data: {
      summary: {
        escrowHeld: heldAgg._sum.total ?? 0,
        released: releasedAgg._sum.total ?? 0,
        platformRevenue: revenueAgg._sum.platformFee ?? 0,
        pendingPayouts: pendingAgg._sum.amount ?? 0,
        pendingPayoutCount: pendingCount,
      },
      payments: paymentRows,
      ledger: ledgerRows,
      payouts: payoutRows,
    },
  });
}
