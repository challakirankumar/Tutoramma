import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Earnings centre: 8-week net series, totals, escrow, payout history. */

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const now = new Date();
  const weekStart = dayStart(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

  const payments = await db.payment.findMany({
    where: { tutorId: auth.id },
    select: { sessionFee: true, status: true, escrowReleasedAt: true, createdAt: true },
  });
  const payAt = (p: (typeof payments)[number]) => p.escrowReleasedAt ?? p.createdAt;
  const released = payments.filter((p) => p.status === "released");

  /* 8-week net series (weeks start Sunday, oldest first) */
  const series = Array.from({ length: 8 }, (_, i) => {
    const ws = new Date(weekStart);
    ws.setDate(ws.getDate() - (7 - i) * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 7);
    const amount = released
      .filter((p) => payAt(p) >= ws && payAt(p) < we)
      .reduce((s, p) => s + p.sessionFee, 0);
    return {
      weekStart: ws.toISOString(),
      label: i === 7 ? "This week" : `W-${7 - i}`,
      amount,
    };
  });

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lifetime = released.reduce((s, p) => s + p.sessionFee, 0);
  const thisMonth = released.filter((p) => payAt(p) >= monthStart).reduce((s, p) => s + p.sessionFee, 0);

  const heldPayments = payments.filter((p) => p.status === "held").reduce((s, p) => s + p.sessionFee, 0);
  const wallet = await db.wallet.findUnique({ where: { userId: auth.id } });
  const payouts = await db.payout.findMany({
    where: { tutorId: auth.id },
    orderBy: { createdAt: "desc" },
  });
  const pendingPayouts = payouts
    .filter((p) => p.status !== "paid")
    .reduce((s, p) => s + p.amount, 0);

  return Response.json({
    data: {
      series,
      totals: {
        lifetime,
        thisMonth,
        escrowHeld: heldPayments,
        pendingPayouts,
        walletAvailable: wallet?.available ?? 0,
      },
      payouts: payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        bankMask: p.bankMask,
        requestedAt: p.createdAt,
        paidAt: p.paidAt,
      })),
    },
  });
}
