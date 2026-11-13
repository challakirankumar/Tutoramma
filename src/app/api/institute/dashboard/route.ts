import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** GET /api/institute/dashboard — everything the academy dashboard needs in one call. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  const profile = await db.instituteProfile.findFirst({ where: { userId: auth.id } });
  const me = await db.user.findUnique({ where: { id: auth.id }, select: { createdAt: true } });

  /* the academy's tutors (linked via TutorProfile.instituteEmail) */
  const tutorProfiles = await db.tutorProfile.findMany({ where: { instituteEmail: auth.email } });
  const tutorIds = tutorProfiles.map((t) => t.userId);
  const tutorUsers = tutorIds.length
    ? await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const userMap = new Map(tutorUsers.map((u) => [u.id, u]));
  const profileMap = new Map(tutorProfiles.map((p) => [p.userId, p]));

  const batches = await db.batch.findMany({ where: { instituteEmail: auth.email } });

  const payments = await db.payment.findMany({
    where: { tutorId: { in: tutorIds }, status: { in: ["released", "held"] } },
    select: { total: true, platformFee: true, status: true, createdAt: true },
  });
  const payouts = await db.payout.findMany({ where: { tutorId: auth.id }, select: { amount: true, status: true } });
  const notifications = await db.notification.findMany({
    where: { userId: auth.id },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  /* revenue by month — last 6 calendar months, most recent last */
  const now = new Date();
  const months: { key: string; label: string; gross: number; net: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: MONTHS[d.getMonth()], gross: 0, net: 0 });
  }
  const monthMap = new Map(months.map((m) => [m.key, m]));
  let revenueTotal = 0; // net (total − platform fee) of released payments only
  for (const p of payments) {
    const m = monthMap.get(monthKey(new Date(p.createdAt)));
    if (!m) continue;
    m.gross += p.total;
    m.net += p.total - p.platformFee;
    if (p.status === "released") revenueTotal += p.total - p.platformFee;
  }

  /* rolling 7-day window for tutor utilisation: accepted 1:1 sessions + confirmed batch slots */
  const ws = now;
  const we = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekBookings = await db.booking.findMany({
    where: { tutorId: { in: tutorIds }, state: { in: ["accepted", "in_progress"] }, startAt: { gte: ws, lt: we } },
    select: { tutorId: true },
  });
  const weeklyCount = new Map<string, number>();
  for (const b of weekBookings) weeklyCount.set(b.tutorId, (weeklyCount.get(b.tutorId) ?? 0) + 1);
  const batchWeekly = new Map<string, number>();
  for (const b of batches) {
    if (b.status !== "confirmed") continue;
    const perWeek = (JSON.parse(b.dayPattern || "[]") as unknown[]).length || 1;
    batchWeekly.set(b.tutorId, (batchWeekly.get(b.tutorId) ?? 0) + perWeek);
  }

  const tutorUtilisation = tutorIds
    .map((id) => {
      const u = userMap.get(id);
      const p = profileMap.get(id);
      const sessions = (weeklyCount.get(id) ?? 0) + (batchWeekly.get(id) ?? 0);
      return {
        id,
        name: u?.name ?? "Tutor",
        color: u?.avatarColor ?? "#315BE5",
        sessions,
        utilisation: Math.min(100, Math.round((sessions / 10) * 100)),
        verified: p?.status === "approved",
        rating: p?.rating ?? 0,
      };
    })
    .sort((a, b) => b.utilisation - a.utilisation);

  return Response.json({
    data: {
      academy: {
        name: profile?.academyName ?? auth.name,
        city: profile?.city ?? "Chennai",
        about: profile?.about ?? "",
        verified: profile?.verified ?? false,
        since: me?.createdAt ?? now.toISOString(),
      },
      kpis: {
        tutors: tutorIds.length,
        batches: batches.length,
        seatsFilled: batches.reduce((s, b) => s + b.seatsFilled, 0),
        seatsTotal: batches.reduce((s, b) => s + b.maxSeats, 0),
        revenueTotal,
        pendingPayout: payouts.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0),
      },
      revenueSeries: months.map(({ label, gross, net }) => ({ label, gross, net })),
      batchFill: batches
        .map((b) => ({
          id: b.id,
          title: b.title,
          subject: b.subject,
          filled: b.seatsFilled,
          max: b.maxSeats,
          percent: b.maxSeats ? Math.round((b.seatsFilled / b.maxSeats) * 100) : 0,
          status: b.status,
        }))
        .sort((a, b) => b.percent - a.percent),
      tutorUtilisation,
      alerts: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, type: n.type, createdAt: n.createdAt })),
    },
  });
}
