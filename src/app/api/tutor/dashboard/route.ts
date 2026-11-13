import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound } from "@/lib/auth";

/** Today-focused dashboard for the tutor: schedule, KPIs, rescue, earnings mini. */

const ACTIVE_STATES = ["requested", "accepted", "in_progress", "completed", "released"];
const MISSED_STATES = ["cancelled", "no_show"];

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Suggest 2 verified substitute tutors that offer the same subject. */
async function findSubstitutes(subject: string, excludeUserId: string) {
  /* offerings store either a CurriculumSubject id or a logical key "BOARD|Grade|Subject" */
  const subjects = await db.curriculumSubject.findMany({ where: { name: subject }, select: { id: true } });
  const offerings = await db.offering.findMany({
    where: {
      OR: [
        { subjectId: { in: subjects.map((s) => s.id) } },
        { subjectId: { endsWith: `|${subject}` } },
      ],
    },
    select: { tutorId: true },
  });
  const profileIds = [...new Set(offerings.map((o) => o.tutorId))];
  if (!profileIds.length) return [];
  const profiles = await db.tutorProfile.findMany({
    where: { id: { in: profileIds }, status: "approved" },
    select: { userId: true, headline: true, rating: true, trustScore: true, reviewCount: true },
  });
  const users = await db.user.findMany({
    where: { id: { in: profiles.map((p) => p.userId) } },
    select: { id: true, name: true, avatarColor: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  return profiles
    .filter((p) => p.userId !== excludeUserId && userMap.has(p.userId))
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, 2)
    .map((p) => {
      const u = userMap.get(p.userId)!;
      return {
        id: u.id,
        name: u.name,
        color: u.avatarColor,
        headline: p.headline,
        rating: p.rating,
        reviews: p.reviewCount,
        trustScore: p.trustScore,
      };
    });
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const profile = await db.tutorProfile.findFirst({ where: { userId: auth.id } });
  if (!profile) return notFound("Tutor profile not found.");

  const now = new Date();
  const tStart = dayStart(now);
  const tEnd = new Date(tStart);
  tEnd.setDate(tEnd.getDate() + 1);
  const wStart = new Date(tStart);
  wStart.setDate(tStart.getDate() - tStart.getDay()); // week starts Sunday
  const wEnd = new Date(wStart);
  wEnd.setDate(wStart.getDate() + 7);

  const bookings = await db.booking.findMany({
    where: { tutorId: auth.id },
    include: { homeSession: true },
  });
  const studentIds = [...new Set(bookings.map((b) => b.studentId))];
  const studentUsers = await db.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, name: true, avatarColor: true },
  });
  const studentMap = new Map(studentUsers.map((s) => [s.id, s]));

  const mapStudent = (id: string) =>
    studentMap.get(id) ?? { id, name: "Student", avatarColor: "#315BE5" };

  const mapBooking = (b: (typeof bookings)[number]) => ({
    id: b.id,
    title: b.title,
    subject: b.subject,
    board: b.board,
    grade: b.grade,
    mode: b.mode,
    startAt: b.startAt,
    endAt: b.endAt,
    state: b.state,
    meetUrl: b.meetUrl,
    sessionFee: b.sessionFee,
    platformFee: b.platformFee,
    total: b.total,
    student: mapStudent(b.studentId),
    homeStage: b.homeSession?.stage ?? null,
    destArea: b.homeSession?.destArea ?? null,
  });

  const today = bookings
    .filter((b) => b.startAt >= tStart && b.startAt < tEnd && ACTIVE_STATES.includes(b.state))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const requested = bookings
    .filter((b) => b.state === "requested")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const wallet = await db.wallet.findUnique({ where: { userId: auth.id } });

  const weekCompleted = bookings.filter(
    (b) => ["completed", "released"].includes(b.state) && b.startAt >= wStart && b.startAt < wEnd
  ).length;

  /* ---- missed-class rescue: cancelled / no-show sessions this week, or requests expiring soon ---- */
  const missed = bookings
    .filter((b) => MISSED_STATES.includes(b.state) && b.startAt >= wStart && b.startAt < wEnd)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  let rescue: {
    kind: "cancelled" | "expiring";
    booking: ReturnType<typeof mapBooking>;
    substitutes: Awaited<ReturnType<typeof findSubstitutes>>;
  } | null = null;
  if (missed.length) {
    const m = missed[0];
    rescue = {
      kind: "cancelled",
      booking: mapBooking(m),
      substitutes: await findSubstitutes(m.subject, auth.id),
    };
  } else {
    /* requests that start within 24h and are still unanswered — the response window is expiring */
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiring = bookings
      .filter((b) => b.state === "requested" && b.startAt <= soon && b.startAt > now)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    if (expiring) {
      rescue = {
        kind: "expiring",
        booking: mapBooking(expiring),
        substitutes: await findSubstitutes(expiring.subject, auth.id),
      };
    }
  }

  /* ---- earnings mini: last 7 days vs previous 7 days ---- */
  const releasedPayments = await db.payment.findMany({
    where: { tutorId: auth.id, status: "released" },
    select: { sessionFee: true, escrowReleasedAt: true, createdAt: true },
  });
  const payAt = (p: (typeof releasedPayments)[number]) => p.escrowReleasedAt ?? p.createdAt;
  const sumBetween = (from: Date, to: Date) =>
    releasedPayments.filter((p) => payAt(p) >= from && payAt(p) < to).reduce((s, p) => s + p.sessionFee, 0);

  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(tStart);
    d.setDate(d.getDate() - (6 - i));
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return { date: d.toISOString(), amount: sumBetween(d, next) };
  });
  const last7 = daily.reduce((s, x) => s + x.amount, 0);
  const prevStart = new Date(tStart);
  prevStart.setDate(prevStart.getDate() - 13);
  const prevEnd = new Date(tStart);
  prevEnd.setDate(prevEnd.getDate() - 6);
  const prev7 = sumBetween(prevStart, prevEnd);

  /* ---- today's home visit for the quick-control card ---- */
  const homeToday = today.find((b) => b.mode === "home" && b.homeSession) ?? null;

  return Response.json({
    data: {
      date: now.toISOString(),
      today: today.map(mapBooking),
      requests: requested.map(mapBooking),
      kpis: {
        todayCount: today.length,
        pendingRequests: requested.length,
        walletAvailable: wallet?.available ?? 0,
        rating: profile.rating,
        reviewCount: profile.reviewCount,
        weekCompleted,
      },
      homeVisitToday: homeToday
        ? {
            sessionId: homeToday.id,
            stage: homeToday.homeSession!.stage,
            title: homeToday.title,
            startAt: homeToday.startAt,
            endAt: homeToday.endAt,
            destArea: homeToday.homeSession!.destArea,
            student: mapStudent(homeToday.studentId),
          }
        : null,
      rescue,
      earnings: { last7, prev7, daily },
    },
  });
}
