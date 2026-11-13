import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/**
 * GET /api/parent/dashboard
 * Family overview: children with progress, family KPIs,
 * upcoming home sessions and the latest safety alerts.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden("This area is for parents.");

  const children = await db.studentProfile.findMany({
    where: { parentEmail: auth.email },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });
  const childIds = children.map((c) => c.userId);
  const now = new Date();

  const childCards = await Promise.all(
    children.map(async (c) => {
      const [nextBooking, homeworkDue, lastTest, passport] = await Promise.all([
        db.booking.findFirst({
          where: { studentId: c.userId, state: { in: ["accepted", "in_progress"] }, startAt: { gte: now } },
          orderBy: { startAt: "asc" },
        }),
        db.homework.count({ where: { studentId: c.userId, status: "assigned" } }),
        db.testResult.findFirst({ where: { studentId: c.userId }, orderBy: { takenAt: "desc" } }),
        db.passportTopic.findMany({ where: { studentId: c.userId } }),
      ]);
      const nextTutor = nextBooking
        ? await db.user.findUnique({
            where: { id: nextBooking.tutorId },
            select: { id: true, name: true, avatarColor: true },
          })
        : null;
      const masteryAvg = passport.length
        ? Math.round(passport.reduce((s, t) => s + t.mastery, 0) / passport.length)
        : null;
      return {
        id: c.userId,
        name: c.user.name,
        color: c.user.avatarColor,
        grade: c.grade,
        board: c.boardId,
        school: c.school,
        xp: c.xp,
        level: c.level,
        streak: c.streak,
        masteryAvg,
        topicCount: passport.length,
        homeworkDue,
        lastTest: lastTest
          ? {
              id: lastTest.id,
              title: lastTest.title,
              subject: lastTest.subject,
              score: lastTest.score,
              total: lastTest.total,
              takenAt: lastTest.takenAt,
            }
          : null,
        nextBooking: nextBooking && nextTutor
          ? {
              id: nextBooking.id,
              title: nextBooking.title,
              subject: nextBooking.subject,
              mode: nextBooking.mode,
              startAt: nextBooking.startAt,
              endAt: nextBooking.endAt,
              tutor: nextTutor,
            }
          : null,
      };
    })
  );

  /* ---------- family KPIs ---------- */
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [activeBookings, wallet, monthPayments] = await Promise.all([
    db.booking.count({
      where: { studentId: { in: childIds }, state: { in: ["requested", "accepted", "in_progress"] } },
    }),
    db.wallet.findUnique({ where: { userId: auth.id } }),
    db.payment.findMany({
      where: { payerId: auth.id, status: { in: ["held", "released", "succeeded"] }, createdAt: { gte: monthStart } },
      select: { total: true },
    }),
  ]);
  const monthSpend = monthPayments.reduce((s, p) => s + p.total, 0);

  /* ---------- upcoming home sessions (not yet done) ---------- */
  const homeSessions = await db.homeSession.findMany({
    where: {
      stage: { not: "done" },
      booking: { studentId: { in: childIds }, state: { in: ["accepted", "in_progress"] } },
    },
    include: { booking: true },
    orderBy: { booking: { startAt: "asc" } },
  });
  const partyIds = Array.from(
    new Set(homeSessions.flatMap((s) => [s.booking.tutorId, s.booking.studentId]))
  );
  const parties = await db.user.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true, avatarColor: true, phone: true } });
  const partyOf = new Map(parties.map((u) => [u.id, u]));

  /* ---------- recent alerts, scoped to this family ---------- */
  const familyBookings = await db.booking.findMany({ where: { studentId: { in: childIds } }, select: { id: true } });
  const familyIds = familyBookings.map((b) => b.id);
  const alertPool = await db.alertEvent.findMany({ orderBy: { createdAt: "desc" }, take: 40 });
  const alerts = alertPool
    .filter((a) => !a.bookingRef || familyIds.some((id) => (a.bookingRef ?? "").startsWith(id)))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      at: a.createdAt,
      bookingRef: a.bookingRef,
    }));

  return Response.json({
    data: {
      children: childCards,
      kpis: {
        activeBookings,
        escrowHeld: wallet?.escrow ?? 0,
        monthSpend,
        homeSessionsThisWeek: homeSessions.length,
      },
      homeSessions: homeSessions.map((s) => ({
        sessionId: s.bookingId,
        stage: s.stage,
        startAt: s.booking.startAt,
        endAt: s.booking.endAt,
        subject: s.booking.subject,
        title: s.booking.title,
        tutor: partyOf.get(s.booking.tutorId) ?? null,
        student: partyOf.get(s.booking.studentId) ?? null,
        destArea: s.destArea,
      })),
      alerts,
    },
  });
}
