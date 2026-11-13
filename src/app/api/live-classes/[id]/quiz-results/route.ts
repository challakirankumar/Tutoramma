import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest } from "@/lib/auth";

/**
 * POST /api/live-classes/[id]/quiz-results — host-only.
 * Persists a finished live quiz's leaderboard to student progress:
 * for every result that matches a student user by name (case-insensitive;
 * guests are skipped) we create a TestResult (`Quiz — {class title}`),
 * award 10 + score XP (level = 1 + floor(xp/400)) and notify the student.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return notFound("Live class not found.");
  if (c.tutorId !== auth.id) return forbidden("Only the class host can save quiz results.");

  const body = (await req.json().catch(() => null)) as { results?: { name?: string; score?: number; total?: number }[] } | null;
  const results = (body?.results ?? [])
    .map((r) => ({
      name: String(r?.name ?? "").trim(),
      score: Math.max(0, Math.min(200, Number(r?.score) || 0)),
      total: Math.max(1, Math.min(200, Number(r?.total) || 1)),
    }))
    .filter((r) => r.name)
    .slice(0, 60);
  if (!results.length) return badRequest("No quiz results to save.");

  /* case-insensitive name → student map (guests simply won't match) */
  const students = await db.user.findMany({ where: { role: "student" }, select: { id: true, name: true } });
  const byName = new Map<string, { id: string; name: string }>();
  for (const s of students) byName.set(s.name.trim().toLowerCase(), s);

  let saved = 0;
  for (const r of results) {
    const student = byName.get(r.name.toLowerCase());
    if (!student) continue; // guest / unmatched — skipped

    await db.testResult.create({
      data: {
        studentId: student.id,
        title: `Quiz — ${c.title}`,
        subject: c.subject,
        score: r.score,
        total: r.total,
        xp: 10 + r.score,
      },
    });

    const profile = await db.studentProfile.findUnique({ where: { userId: student.id }, select: { xp: true } });
    if (profile) {
      const xp = profile.xp + 10 + r.score;
      await db.studentProfile.update({ where: { userId: student.id }, data: { xp, level: 1 + Math.floor(xp / 400) } });
    }

    await db.notification.create({
      data: {
        userId: student.id,
        title: `Quiz score saved: ${r.score}/${r.total}`,
        body: `Your live quiz result from "${c.title}" was added to your progress (+${10 + r.score} XP).`,
        type: "system",
      },
    });

    saved += 1;
  }

  return Response.json({ data: { saved } });
}
