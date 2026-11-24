import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import { buildDiagnostic, DIAG_TOPICS } from "@/lib/diagnostic";

/** GET /api/diagnostic — past attempts (student: own; parent: children). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let ids: string[] = [];
  if (auth.role === "student") ids = [auth.id];
  else if (auth.role === "parent") ids = (await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } })).map((k) => k.userId);
  else return forbidden();
  const list = await db.diagnosticAttempt.findMany({ where: { studentId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 10 });
  return Response.json({ data: list.map((a) => ({ ...a, result: JSON.parse(a.result), sharedWith: JSON.parse(a.sharedWith) })) });
}

/**
 * POST /api/diagnostic
 *  { action: "start" }                     → { seed, questions (no answers) }
 *  { action: "submit", seed, answers[] }   → graded per topic, saved, shared with the student's tutors
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("The diagnostic is taken by the student.");
  let b: { action?: string; seed?: number; answers?: number[] };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  if (b.action === "start") {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 2_000_000_000;
    return Response.json({ data: { seed, questions: buildDiagnostic(seed).map(({ topic, q, options }) => ({ topic, q, options })) } });
  }
  if (b.action !== "submit" || !Number.isFinite(Number(b.seed)) || !Array.isArray(b.answers)) return badRequest("Submit the seed and your answers.");
  const qs = buildDiagnostic(Number(b.seed));
  const per = new Map<string, { correct: number; total: number }>();
  let score = 0;
  const review = qs.map((q, i) => {
    const ok = b.answers![i] === q.answer;
    if (ok) score++;
    const e = per.get(q.topic) ?? { correct: 0, total: 0 };
    e.total++;
    if (ok) e.correct++;
    per.set(q.topic, e);
    return { topic: q.topic, q: q.q, picked: b.answers![i] ?? null, answer: q.answer, options: q.options, explanation: q.explanation, ok };
  });
  const topics = DIAG_TOPICS.map((t) => ({ topic: t, ...(per.get(t) ?? { correct: 0, total: 0 }) }));
  const gaps = topics.filter((t) => t.total && t.correct / t.total < 0.5).map((t) => t.topic);
  const strengths = topics.filter((t) => t.total && t.correct === t.total).map((t) => t.topic);
  const profile = await db.studentProfile.findUnique({ where: { userId: auth.id } });
  const tutors = [...new Set((await db.booking.findMany({ where: { studentId: auth.id }, select: { tutorId: true } })).map((x) => x.tutorId))];
  const attempt = await db.diagnosticAttempt.create({
    data: { studentId: auth.id, subject: "Mathematics", grade: profile?.grade ?? "", score, total: qs.length, result: JSON.stringify({ topics, gaps, strengths }), sharedWith: JSON.stringify(tutors) },
  });
  /* keep the learning profile current: merge gaps into weak topics */
  if (profile && gaps.length) {
    let weak: string[] = [];
    try {
      weak = JSON.parse(profile.weakTopics);
    } catch {}
    await db.studentProfile.update({ where: { id: profile.id }, data: { weakTopics: JSON.stringify([...new Set([...gaps, ...weak])].slice(0, 8)) } });
  }
  if (tutors.length) {
    await db.notification.createMany({
      data: tutors.map((t) => ({ userId: t, title: `Diagnostic results · ${auth.name}`, body: `${score}/${qs.length}. Gaps: ${gaps.join(", ") || "none"}. Strengths: ${strengths.join(", ") || "—"}.`, type: "system" })),
    });
  }
  return Response.json({ data: { id: attempt.id, score, total: qs.length, topics, gaps, strengths, review, sharedWith: tutors.length } });
}
