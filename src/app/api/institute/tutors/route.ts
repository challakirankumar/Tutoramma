import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** GET /api/institute/tutors — the academy's tutors with utilisation and reach. */

function parseBadges(json: string): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  const profiles = await db.tutorProfile.findMany({ where: { instituteEmail: auth.email } });
  const userIds = profiles.map((p) => p.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatarColor: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  /* subjects from offerings — subjectId is either a CurriculumSubject id or a logical "BOARD|Grade|Subject" key */
  const offerings = await db.offering.findMany({
    where: { tutorId: { in: profiles.map((p) => p.id) } },
    select: { tutorId: true, subjectId: true },
  });
  const subjectsByProfile = new Map<string, Set<string>>();
  const rawSubjectIds: string[] = [];
  for (const o of offerings) {
    const set = subjectsByProfile.get(o.tutorId) ?? new Set<string>();
    if (o.subjectId.includes("|")) {
      set.add(o.subjectId.split("|").pop()!);
    } else {
      rawSubjectIds.push(o.subjectId);
    }
    subjectsByProfile.set(o.tutorId, set);
  }
  if (rawSubjectIds.length) {
    const rows = await db.curriculumSubject.findMany({
      where: { id: { in: rawSubjectIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    for (const o of offerings) {
      if (!o.subjectId.includes("|")) {
        const name = nameById.get(o.subjectId);
        if (name) (subjectsByProfile.get(o.tutorId) ?? new Set<string>()).add(name);
      }
    }
  }

  const batches = await db.batch.findMany({
    where: { instituteEmail: auth.email },
    select: { tutorId: true, status: true, dayPattern: true },
  });

  /* utilisation: weekly sessions from accepted bookings + confirmed batch slots, /10 capped at 100 */
  const now = new Date();
  const ws = now;
  const we = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const bookings = await db.booking.findMany({
    where: { tutorId: { in: userIds } },
    select: { tutorId: true, studentId: true, startAt: true, state: true },
  });
  const weeklyCount = new Map<string, number>();
  const studentsByTutor = new Map<string, Set<string>>();
  for (const b of bookings) {
    const students = studentsByTutor.get(b.tutorId) ?? new Set<string>();
    students.add(b.studentId);
    studentsByTutor.set(b.tutorId, students);
    if (b.state === "accepted" || b.state === "in_progress") {
      const at = new Date(b.startAt);
      if (at >= ws && at < we) weeklyCount.set(b.tutorId, (weeklyCount.get(b.tutorId) ?? 0) + 1);
    }
  }
  const batchWeekly = new Map<string, number>();
  for (const b of batches) {
    if (b.status !== "confirmed") continue;
    const perWeek = (JSON.parse(b.dayPattern || "[]") as unknown[]).length || 1;
    batchWeekly.set(b.tutorId, (batchWeekly.get(b.tutorId) ?? 0) + perWeek);
  }

  const data = profiles
    .map((p) => {
      const u = userMap.get(p.userId);
      const weekly = (weeklyCount.get(p.userId) ?? 0) + (batchWeekly.get(p.userId) ?? 0);
      return {
        id: p.userId,
        name: u?.name ?? "Tutor",
        color: u?.avatarColor ?? "#315BE5",
        headline: p.headline,
        subjects: [...(subjectsByProfile.get(p.id) ?? new Set<string>())],
        rating: p.rating,
        sessionsDone: p.sessionsDone,
        trustScore: p.trustScore,
        verified: p.status === "approved",
        badges: parseBadges(p.badges),
        utilisation: Math.min(100, Math.round((weekly / 10) * 100)),
        batches: batches.filter((b) => b.tutorId === p.userId).length,
        studentsTaught: (studentsByTutor.get(p.userId) ?? new Set<string>()).size,
      };
    })
    .sort((a, b) => b.utilisation - a.utilisation || b.rating - a.rating);

  return Response.json({ data });
}
