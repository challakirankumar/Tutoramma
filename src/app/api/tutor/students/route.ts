import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Roster view: every student the tutor has ever taught (or has pending), with progress context. */

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const bookings = await db.booking.findMany({
    where: { tutorId: auth.id, state: { notIn: ["declined", "cancelled"] } },
    orderBy: { startAt: "asc" },
  });

  const byStudent = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const list = byStudent.get(b.studentId) ?? [];
    list.push(b);
    byStudent.set(b.studentId, list);
  }
  const ids = [...byStudent.keys()];

  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, avatarColor: true },
  });
  const profiles = await db.studentProfile.findMany({ where: { userId: { in: ids } } });
  const passports = await db.passportTopic.findMany({ where: { studentId: { in: ids } } });

  const userMap = new Map(users.map((u) => [u.id, u]));
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));
  const now = new Date();

  const students = ids
    .map((id) => {
      const bs = byStudent.get(id)!;
      const user = userMap.get(id) ?? { id, name: "Student", avatarColor: "#315BE5" };
      const profile = profileMap.get(id);
      const done = bs.filter((b) => ["completed", "released"].includes(b.state));
      const upcoming = bs
        .filter((b) => ["requested", "accepted", "in_progress"].includes(b.state) && b.startAt > now)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

      // mastery = average passport mastery per subject (where available)
      const bySubject = new Map<string, { total: number; count: number }>();
      for (const p of passports.filter((x) => x.studentId === id)) {
        const agg = bySubject.get(p.subject) ?? { total: 0, count: 0 };
        agg.total += p.mastery;
        agg.count += 1;
        bySubject.set(p.subject, agg);
      }

      return {
        id,
        name: user.name,
        color: user.avatarColor,
        grade: profile?.grade ?? null,
        board: profile?.boardId ?? null,
        school: profile?.school ?? null,
        subjects: [...new Set(bs.map((b) => b.subject))],
        sessionsCompleted: done.length,
        lastSessionAt: done.length ? done[done.length - 1].startAt : null,
        nextSessionAt: upcoming[0]?.startAt ?? null,
        nextSessionMode: upcoming[0]?.mode ?? null,
        mastery: [...bySubject.entries()]
          .map(([subject, agg]) => ({ subject, avg: Math.round(agg.total / agg.count) }))
          .sort((a, b) => a.subject.localeCompare(b.subject)),
        weakTopics: parseJsonArray(profile?.weakTopics),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ data: { students, total: students.length } });
}
