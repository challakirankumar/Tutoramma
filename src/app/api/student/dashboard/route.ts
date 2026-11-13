import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/**
 * GET /api/student/dashboard — aggregated data for the student home view:
 * next upcoming class, KPIs, learning passport, exam sprint, recent homework/tests,
 * saved tutors count and the opt-in class leaderboard (top XP).
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("Only students have a learning dashboard.");

  const profile = await db.studentProfile.findUnique({ where: { userId: auth.id } });
  if (!profile) return forbidden("Student profile not found.");

  const now = new Date();
  const recentWindow = new Date(now.getTime() - 45 * 60 * 1000); // a class that just started still counts

  /* next upcoming accepted booking + upcoming count (tutor joined manually) */
  const upcoming = await db.booking.findMany({
    where: { studentId: auth.id, state: "accepted", startAt: { gte: recentWindow } },
    orderBy: { startAt: "asc" },
  });
  const tutorIds = Array.from(new Set(upcoming.map((b) => b.tutorId)));
  const tutors = tutorIds.length
    ? await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true, phone: true } })
    : [];
  const tutorMap = new Map(
    tutors.map((t) => [t.id, { id: t.id, name: t.name, color: t.avatarColor, phone: t.phone }])
  );
  const nextBookingRaw = upcoming[0] ?? null;
  const nextBooking = nextBookingRaw
    ? {
        id: nextBookingRaw.id,
        title: nextBookingRaw.title,
        subject: nextBookingRaw.subject,
        mode: nextBookingRaw.mode,
        startAt: nextBookingRaw.startAt,
        endAt: nextBookingRaw.endAt,
        meetUrl: nextBookingRaw.meetUrl,
        addressId: nextBookingRaw.addressId,
        tutor: tutorMap.get(nextBookingRaw.tutorId) ?? null,
      }
    : null;

  /* homework */
  const seats = await db.batchSeat.findMany({ where: { studentId: auth.id }, select: { batchId: true } });
  const batchIds = seats.map((s) => s.batchId);
  const homeworkAll = await db.homework.findMany({
    where: { OR: [{ studentId: auth.id }, ...(batchIds.length ? [{ batchId: { in: batchIds } }] : [])] },
    orderBy: { dueAt: "desc" },
  });
  const homeworkDue = homeworkAll.filter((h) => h.status === "assigned").length;
  const recentHomework = homeworkAll.slice(0, 2);

  /* tests */
  const tests = await db.testResult.findMany({ where: { studentId: auth.id }, orderBy: { takenAt: "desc" } });
  const recentTests = tests.slice(0, 2);

  /* learning passport grouped by subject */
  const passportRows = await db.passportTopic.findMany({ where: { studentId: auth.id } });
  const passportMap = new Map<string, { topic: string; mastery: number }[]>();
  for (const row of passportRows) {
    const list = passportMap.get(row.subject) ?? [];
    list.push({ topic: row.topic, mastery: row.mastery });
    passportMap.set(row.subject, list);
  }
  const passport = Array.from(passportMap.entries()).map(([subject, topics]) => ({
    subject,
    topics: topics.sort((a, b) => a.mastery - b.mastery),
    avg: Math.round(topics.reduce((s, t) => s + t.mastery, 0) / topics.length),
  }));

  /* exam sprint */
  const weakTopics: string[] = JSON.parse(profile.weakTopics || "[]");
  const examDate = profile.examDate;
  const daysToExam = examDate ? Math.max(0, Math.ceil((examDate.getTime() - now.getTime()) / 86_400_000)) : null;
  const sprintTopics = weakTopics.slice(0, 3);
  const suggestedPlan = sprintTopics.length
    ? `Book 2 focused sessions a week on ${sprintTopics[0]}${sprintTopics[1] ? ` and ${sprintTopics[1]}` : ""}, then take a quick test after each — mastery target 80% before exam day.`
    : "Keep revising your strongest chapters with quick tests to lock in mastery.";

  /* saved tutors */
  const savedTutors = await db.savedTutor.count({ where: { studentId: auth.id } });

  /* leaderboard — OPT-IN ONLY (spec: no public ranking of minors by default).
     Students who haven't opted in are excluded entirely; the requesting student
     only sees their own row when they have opted in themselves. */
  const top = await db.studentProfile.findMany({
    where: { leaderboardOptIn: true },
    take: 8,
    orderBy: { xp: "desc" },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });
  const inTop = top.some((t) => t.userId === auth.id);
  let leaderboard = top.map((t, i) => ({
    rank: i + 1,
    id: t.userId,
    name: t.user.name,
    color: t.user.avatarColor,
    xp: t.xp,
    level: t.level,
    streak: t.streak,
    isMe: t.userId === auth.id,
  }));
  if (profile.leaderboardOptIn && !inTop) {
    const me = { rank: 0, id: auth.id, name: auth.name, color: auth.avatarColor, xp: profile.xp, level: profile.level, streak: profile.streak, isMe: true };
    const ahead =
      (await db.studentProfile.count({ where: { leaderboardOptIn: true, xp: { gt: profile.xp } } })) + 1;
    leaderboard = [...leaderboard, { ...me, rank: ahead }];
  }

  return Response.json({
    data: {
      student: { id: auth.id, name: auth.name, grade: profile.grade, board: profile.boardId, school: profile.school },
      xp: profile.xp,
      level: profile.level,
      streak: profile.streak,
      leaderboardOptIn: profile.leaderboardOptIn,
      badges: JSON.parse(profile.badges || "[]"),
      goals: JSON.parse(profile.goals || "[]"),
      weakTopics,
      examDate,
      daysToExam,
      sprintTopics,
      suggestedPlan,
      kpis: {
        upcomingSessions: upcoming.length,
        homeworkDue,
        xp: profile.xp,
        streak: profile.streak,
      },
      nextBooking,
      passport,
      recentHomework,
      recentTests,
      savedTutors,
      leaderboard,
    },
  });
}
