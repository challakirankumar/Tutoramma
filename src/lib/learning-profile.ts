import { db } from "@/lib/db";

/**
 * Learning Profile (spec §15 — "learning levels instead of IQ").
 * Built only from diagnostics, quiz results, homework and tutor-side data.
 * Advisory: used to adapt explanations; never ranks children.
 */
export interface LearningProfile {
  studentId: string;
  name: string;
  grade: string;
  board: string;
  bars: { label: string; value: number }[];
  pace: "slow" | "medium" | "fast";
  attentionMin: number;
  prefers: string[];
  language: string;
  misconceptions: string[];
  weakTopics: string[];
  goals: string[];
  quizAvg: number | null;
  sources: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function buildLearningProfile(studentId: string): Promise<LearningProfile | null> {
  const [user, profile, tests, passport, homework] = await Promise.all([
    db.user.findUnique({ where: { id: studentId }, select: { name: true, locale: true } }),
    db.studentProfile.findUnique({ where: { userId: studentId } }),
    db.testResult.findMany({ where: { studentId }, orderBy: { takenAt: "desc" }, take: 12 }),
    db.passportTopic.findMany({ where: { studentId } }),
    db.homework.findMany({ where: { studentId }, take: 20, orderBy: { dueAt: "desc" } }),
  ]);
  if (!user) return null;
  const parse = (s?: string | null) => {
    try {
      return JSON.parse(s ?? "[]") as string[];
    } catch {
      return [];
    }
  };
  const weak = [...new Set([...parse(profile?.weakTopics), ...tests.flatMap((t) => parse(t.weakTopics))])].slice(0, 6);
  const quizAvg = tests.length ? tests.reduce((a, t) => a + (t.total ? t.score / t.total : 0), 0) / tests.length : null;
  const mastery = passport.length ? passport.reduce((a, p) => a + p.mastery, 0) / passport.length : 60;
  const graded = homework.filter((h) => h.score != null);
  const hwAvg = graded.length ? graded.reduce((a, h) => a + (h.score ?? 0), 0) / graded.length : 65;
  const onTime = homework.length ? homework.filter((h) => h.status !== "assigned").length / homework.length : 0.7;
  const weakest = [...passport].sort((a, b) => a.mastery - b.mastery)[0];
  const strongest = [...passport].sort((a, b) => b.mastery - a.mastery)[0];

  const bars = [
    { label: `Prior knowledge: ${weakest?.topic ?? "core topics"}`, value: clamp(weakest?.mastery ?? mastery - 10) },
    { label: `${strongest?.topic ?? "Strongest area"} fluency`, value: clamp(strongest?.mastery ?? mastery + 15) },
    { label: "Word-problem reading", value: clamp((quizAvg ?? 0.6) * 100 - 18) },
    { label: "Confidence", value: clamp(onTime * 60 + (quizAvg ?? 0.6) * 40) },
  ];
  const pace: LearningProfile["pace"] = (quizAvg ?? 0.6) > 0.8 ? "fast" : (quizAvg ?? 0.6) < 0.55 ? "slow" : "medium";
  return {
    studentId,
    name: user.name,
    grade: profile?.grade ?? "",
    board: profile?.boardId ?? "",
    bars,
    pace,
    attentionMin: pace === "fast" ? 18 : pace === "slow" ? 10 : 12,
    prefers: hwAvg < 70 ? ["diagrams", "worked examples"] : ["examples", "short challenges"],
    language: user.locale === "hi" ? "Hindi + English" : "English + Hindi",
    misconceptions: weak.slice(0, 2).map((w) => `Slips on ${w}`),
    weakTopics: weak,
    goals: parse(profile?.goals),
    quizAvg: quizAvg == null ? null : Math.round(quizAvg * 100),
    sources: [`${tests.length} quizzes`, `${passport.length} passport topics`, `${homework.length} homework items`],
  };
}
