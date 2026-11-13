import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/parent/children
 * Full per-child progress pack (profile, attendance, mastery, tests,
 * upcoming sessions, goals & badges) + the family's saved addresses.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden("This area is for parents.");

  const children = await db.studentProfile.findMany({
    where: { parentEmail: auth.email },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });
  const now = new Date();

  const childPacks = await Promise.all(
    children.map(async (c) => {
      const [bookings, passport, recentTests, upcoming] = await Promise.all([
        db.booking.findMany({
          where: { studentId: c.userId },
          select: { state: true, startAt: true },
        }),
        db.passportTopic.findMany({ where: { studentId: c.userId }, orderBy: { mastery: "asc" } }),
        db.testResult.findMany({ where: { studentId: c.userId }, orderBy: { takenAt: "desc" }, take: 3 }),
        db.booking.findMany({
          where: { studentId: c.userId, state: { in: ["accepted", "in_progress"] }, startAt: { gte: now } },
          orderBy: { startAt: "asc" },
          take: 3,
        }),
      ]);

      const tutorIds = Array.from(new Set(upcoming.map((b) => b.tutorId)));
      const tutors = await db.user.findMany({
        where: { id: { in: tutorIds } },
        select: { id: true, name: true, avatarColor: true },
      });
      const tutorOf = new Map(tutors.map((t) => [t.id, t]));

      const completed = bookings.filter((b) => ["released", "completed"].includes(b.state)).length;
      const missed = bookings.filter((b) => b.state === "no_show").length;
      const attendancePct = completed + missed > 0 ? Math.round((completed / (completed + missed)) * 100) : null;

      // group mastery by subject
      const bySubject = new Map<string, { topic: string; mastery: number }[]>();
      for (const t of passport) {
        const list = bySubject.get(t.subject) ?? [];
        list.push({ topic: t.topic, mastery: t.mastery });
        bySubject.set(t.subject, list);
      }
      const mastery = Array.from(bySubject.entries()).map(([subject, topics]) => ({
        subject,
        avg: Math.round(topics.reduce((s, t) => s + t.mastery, 0) / topics.length),
        topics: topics.slice().sort((a, b) => b.mastery - a.mastery),
      }));

      return {
        id: c.userId,
        name: c.user.name,
        color: c.user.avatarColor,
        profile: { grade: c.grade, board: c.boardId, school: c.school },
        xp: c.xp,
        level: c.level,
        streak: c.streak,
        attendancePct,
        completedSessions: completed,
        missedSessions: missed,
        mastery,
        masteryAvg: passport.length ? Math.round(passport.reduce((s, t) => s + t.mastery, 0) / passport.length) : null,
        recentTests: recentTests.map((t) => ({
          id: t.id,
          title: t.title,
          subject: t.subject,
          score: t.score,
          total: t.total,
          takenAt: t.takenAt,
        })),
        upcoming: upcoming.map((b) => ({
          id: b.id,
          title: b.title,
          subject: b.subject,
          mode: b.mode,
          startAt: b.startAt,
          endAt: b.endAt,
          tutor: tutorOf.get(b.tutorId) ?? null,
        })),
        goals: parseJsonArray(c.goals),
        badges: parseJsonArray(c.badges),
        weakTopics: parseJsonArray(c.weakTopics),
        examDate: c.examDate,
      };
    })
  );

  const addresses = await db.address.findMany({ where: { ownerId: auth.id } });

  return Response.json({ data: { children: childPacks, addresses } });
}
