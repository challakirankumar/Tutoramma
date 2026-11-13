import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Operations overview — KPIs, series, live sessions, recent activity (admin only). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const [
    students,
    tutors,
    pendingVerifications,
    activeBookings,
    openDisputes,
    openAlerts,
    gmvAgg,
    liveCount,
    weekBookings,
    modeGroups,
    gmvPayments,
    liveSessions,
    recentAudit,
    alerts,
    recentBookings,
  ] = await Promise.all([
    db.user.count({ where: { role: "student" } }),
    db.user.count({ where: { role: "tutor" } }),
    db.tutorProfile.count({ where: { status: { in: ["in_review", "submitted", "needs_info"] } } }),
    db.booking.count({ where: { state: { in: ["accepted", "in_progress"] } } }),
    db.dispute.count({ where: { status: { not: "resolved" } } }),
    db.alertEvent.count({ where: { acknowledged: false } }),
    db.payment.aggregate({ _sum: { total: true }, where: { status: { in: ["held", "released"] } } }),
    db.homeSession.count({ where: { stage: { notIn: ["scheduled", "done"] } } }),
    db.booking.findMany({
      where: { startAt: { gte: startOfWeek, lt: endOfWeek }, state: { notIn: ["declined", "cancelled"] } },
      select: { startAt: true },
    }),
    db.booking.groupBy({ by: ["mode"], _count: true }),
    db.payment.findMany({
      where: { status: { in: ["held", "released"] }, createdAt: { gte: new Date(startOfWeek.getTime() - 5 * 7 * 86400000) } },
      select: { total: true, createdAt: true },
    }),
    db.homeSession.findMany({
      where: { stage: { notIn: ["scheduled", "done"] } },
      include: { booking: true },
      orderBy: { booking: { startAt: "asc" } },
    }),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.alertEvent.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    db.booking.findMany({ orderBy: [{ createdAt: "desc" }, { startAt: "desc" }], take: 5 }),
  ]);

  /* manual join for names/colors (Booking has no tutor/student relations in the schema) */
  const partyIds = new Set<string>();
  for (const s of liveSessions) {
    partyIds.add(s.booking.tutorId);
    partyIds.add(s.booking.studentId);
  }
  for (const b of recentBookings) {
    partyIds.add(b.tutorId);
    partyIds.add(b.studentId);
  }
  const users = await db.user.findMany({
    where: { id: { in: [...partyIds] } },
    select: { id: true, name: true, avatarColor: true },
  });
  const umap = new Map(users.map((u) => [u.id, u]));

  /* bookings per weekday this week (Sun..Sat) */
  const weeklyBookings = Array.from({ length: 7 }, (_, i) => ({ day: i, count: 0 }));
  for (const b of weekBookings) weeklyBookings[new Date(b.startAt).getDay()].count += 1;

  /* GMV per week, last 6 weeks (oldest → newest) */
  const gmvTrend = Array.from({ length: 6 }, (_, i) => ({
    label: i === 5 ? "This week" : `${5 - i}w ago`,
    value: 0,
  }));
  for (const p of gmvPayments) {
    const d = new Date(p.createdAt);
    const weeksBack = Math.floor((startOfWeek.getTime() - d.getTime()) / (7 * 86400000));
    const idx = 5 - weeksBack;
    if (idx >= 0 && idx < 6) gmvTrend[idx].value += p.total;
  }

  const data = {
    kpis: {
      students,
      tutors,
      pendingVerifications,
      activeBookings,
      liveHomeSessions: liveCount,
      gmv: gmvAgg._sum.total ?? 0,
      openDisputes,
      openAlerts,
    },
    weeklyBookings,
    gmvTrend,
    modeSplit: modeGroups.map((g) => ({ mode: g.mode, count: g._count })),
    liveSessions: liveSessions.map((s) => ({
      bookingId: s.bookingId,
      stage: s.stage,
      sosActive: s.sosActive,
      startAt: s.booking.startAt,
      subject: s.booking.subject,
      tutorName: umap.get(s.booking.tutorId)?.name ?? "—",
      tutorColor: umap.get(s.booking.tutorId)?.avatarColor ?? "#315BE5",
      studentName: umap.get(s.booking.studentId)?.name ?? "—",
      studentColor: umap.get(s.booking.studentId)?.avatarColor ?? "#315BE5",
      destArea: s.destArea,
    })),
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      actorName: a.actorName,
      actorRole: a.actorRole,
      action: a.action,
      resource: a.resource,
      detail: a.detail,
      severity: a.severity,
      createdAt: a.createdAt,
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
    recentBookings: recentBookings.map((b) => ({
      id: b.id,
      title: b.title,
      subject: b.subject,
      mode: b.mode,
      state: b.state,
      startAt: b.startAt,
      total: b.total,
      tutorName: umap.get(b.tutorId)?.name ?? "—",
      tutorColor: umap.get(b.tutorId)?.avatarColor ?? "#315BE5",
      studentName: umap.get(b.studentId)?.name ?? "—",
      studentColor: umap.get(b.studentId)?.avatarColor ?? "#315BE5",
    })),
  };
  return Response.json({ data });
}
