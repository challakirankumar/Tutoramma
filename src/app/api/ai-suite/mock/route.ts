import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** GET /api/ai-suite/mock — Mock Test Analyzer: topic gaps, trend and recovery plan from test results. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden();
  const [tests, passport] = await Promise.all([
    db.testResult.findMany({ where: { studentId: auth.id }, orderBy: { takenAt: "asc" } }),
    db.passportTopic.findMany({ where: { studentId: auth.id }, orderBy: { mastery: "asc" } }),
  ]);
  const parse = (s: string) => {
    try {
      return JSON.parse(s) as string[];
    } catch {
      return [];
    }
  };
  const gapCount = new Map<string, number>();
  tests.forEach((t) => parse(t.weakTopics).forEach((w) => gapCount.set(w, (gapCount.get(w) ?? 0) + 1)));
  passport.filter((p) => p.mastery < 60).forEach((p) => gapCount.set(p.topic, (gapCount.get(p.topic) ?? 0) + 1));
  const gaps = [...gapCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([topic, count]) => ({ topic, count, mastery: passport.find((p) => p.topic === topic)?.mastery ?? null }));
  const bySubject = new Map<string, { pct: number[] }>();
  tests.forEach((t) => {
    const s = bySubject.get(t.subject) ?? { pct: [] };
    s.pct.push(t.total ? Math.round((t.score / t.total) * 100) : 0);
    bySubject.set(t.subject, s);
  });
  const subjects = [...bySubject.entries()].map(([name, v]) => ({ name, avg: Math.round(v.pct.reduce((a, b) => a + b, 0) / v.pct.length), last: v.pct[v.pct.length - 1], tests: v.pct.length }));
  const plan = gaps.slice(0, 4).map((g, i) => ({
    day: i + 1,
    task: `${i === 0 ? "Re-learn" : "Practise"} ${g.topic}: 2 worked examples, then 8 questions; note every mistake in your error log`,
    minutes: i === 0 ? 40 : 30,
  }));
  return Response.json({
    data: {
      tests: tests.map((t) => ({ title: t.title, subject: t.subject, pct: t.total ? Math.round((t.score / t.total) * 100) : 0, takenAt: t.takenAt })),
      subjects,
      gaps,
      plan,
      careless: tests.filter((t) => t.total && t.score / t.total >= 0.7 && t.score / t.total < 0.9).length,
    },
  });
}
