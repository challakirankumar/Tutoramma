import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Marketplace reports — GMV, mode split, top tutors, students by board, revenue split. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [gmvPayments, modeGroups, completedBookings, studentBoards, revenueAgg, earningsAgg, avgPriceAgg] = await Promise.all([
    db.payment.findMany({
      where: { status: { in: ["held", "released"] }, createdAt: { gte: new Date(startOfWeek.getTime() - 7 * 7 * 86400000) } },
      select: { total: true, createdAt: true },
    }),
    db.booking.groupBy({ by: ["mode"], _count: true }),
    db.booking.findMany({
      where: { state: { in: ["completed", "released"] } },
      select: { tutorId: true },
    }),
    db.studentProfile.groupBy({ by: ["boardId"], _count: true }),
    db.payment.aggregate({ _sum: { platformFee: true }, where: { status: "released" } }),
    db.payment.aggregate({ _sum: { sessionFee: true }, where: { status: "released" } }),
    db.booking.aggregate({ _avg: { total: true }, _count: true }),
  ]);

  /* GMV weekly, last 8 weeks (oldest → newest) */
  const gmvWeekly = Array.from({ length: 8 }, (_, i) => {
    const ws = new Date(startOfWeek.getTime() - (7 - i) * 7 * 86400000);
    return { label: ws.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: 0 };
  });
  for (const p of gmvPayments) {
    const weeksBack = Math.floor((startOfWeek.getTime() - new Date(p.createdAt).getTime()) / (7 * 86400000));
    const idx = 7 - weeksBack;
    if (idx >= 0 && idx < 8) gmvWeekly[idx].value += p.total;
  }

  /* top tutors by completed sessions */
  const counts = new Map<string, number>();
  for (const b of completedBookings) counts.set(b.tutorId, (counts.get(b.tutorId) ?? 0) + 1);
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTutors: { name: string; color: string; sessions: number; rating: number; trustScore: number }[] = [];
  for (const [tutorId, sessions] of topIds) {
    const [user, profile] = await Promise.all([
      db.user.findUnique({ where: { id: tutorId }, select: { name: true, avatarColor: true } }),
      db.tutorProfile.findUnique({ where: { userId: tutorId }, select: { rating: true, trustScore: true } }),
    ]);
    if (user) {
      topTutors.push({
        name: user.name,
        color: user.avatarColor,
        sessions,
        rating: profile?.rating ?? 0,
        trustScore: profile?.trustScore ?? 0,
      });
    }
  }

  const data = {
    gmvWeekly,
    modeSplit: modeGroups.map((g) => ({ mode: g.mode, count: g._count })),
    topTutors,
    studentsByBoard: studentBoards
      .map((s) => ({ board: s.boardId, count: s._count }))
      .sort((a, b) => b.count - a.count),
    revenueSplit: {
      platform: revenueAgg._sum.platformFee ?? 0,
      tutors: earningsAgg._sum.sessionFee ?? 0,
    },
    avgSessionPrice: Math.round(avgPriceAgg._avg.total ?? 0),
    totalBookings: avgPriceAgg._count,
  };
  return Response.json({ data });
}
