import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, audit } from "@/lib/auth";
import { questionsForTopic, matchTopics, DIAG_TOPICS } from "@/lib/diagnostic";

/**
 * Auto-Differentiated Homework (spec §29). Each linked student gets a short
 * practice set aimed at their own gaps (latest diagnostic, quiz weak topics,
 * learning profile). { assign: false } previews; { assign: true } creates one
 * Homework per student and notifies them.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  let b: { assign?: boolean; studentIds?: string[]; perTopic?: number; dueDays?: number };
  try {
    b = await req.json();
  } catch {
    b = {};
  }
  const linked = [...new Set((await db.booking.findMany({ where: { tutorId: auth.id }, select: { studentId: true } })).map((x) => x.studentId))];
  const ids = (b.studentIds?.length ? b.studentIds.filter((x) => linked.includes(x)) : linked).slice(0, 40);
  const [users, profiles, diags, tests] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids }, role: "student" }, select: { id: true, name: true } }),
    db.studentProfile.findMany({ where: { userId: { in: ids } } }),
    db.diagnosticAttempt.findMany({ where: { studentId: { in: ids } }, orderBy: { createdAt: "desc" } }),
    db.testResult.findMany({ where: { studentId: { in: ids } }, orderBy: { takenAt: "desc" } }),
  ]);
  const perTopic = Math.min(4, Math.max(2, Number(b.perTopic) || 3));
  const plans = users.map((u, k) => {
    const parse = (s?: string) => {
      try {
        return JSON.parse(s ?? "[]") as string[];
      } catch {
        return [];
      }
    };
    const diag = diags.find((d) => d.studentId === u.id);
    const diagGaps: string[] = diag ? (JSON.parse(diag.result).gaps ?? []) : [];
    const weak = [...parse(profiles.find((p) => p.userId === u.id)?.weakTopics), ...tests.filter((t) => t.studentId === u.id).flatMap((t) => parse(t.weakTopics))];
    let topics = [...new Set([...diagGaps, ...matchTopics(weak)])].filter((t) => DIAG_TOPICS.includes(t)).slice(0, 2);
    const source = diagGaps.length ? "diagnostic" : topics.length ? "quiz & profile" : "mixed practice";
    if (!topics.length) topics = [DIAG_TOPICS[k % DIAG_TOPICS.length], DIAG_TOPICS[(k + 2) % DIAG_TOPICS.length]];
    const seed = (Date.now() + k * 7919) % 2_000_000_000;
    const questions = topics.flatMap((t, i) => questionsForTopic(t, perTopic, seed + i * 104729)).map((q) => ({ q: q.q, options: q.options, answer: String.fromCharCode(65 + q.answer), explanation: q.explanation, marks: 1, chapter: q.topic }));
    return { studentId: u.id, name: u.name, topics, source, questions };
  });

  if (!b.assign) return Response.json({ data: { plans: plans.map(({ questions, ...p }) => ({ ...p, count: questions.length, sample: questions[0]?.q ?? "" })) } });

  const due = new Date(Date.now() + Math.min(7, Math.max(1, Number(b.dueDays) || 3)) * 86400000);
  for (const p of plans) {
    await db.homework.create({
      data: { tutorId: auth.id, studentId: p.studentId, title: `Your practice set · ${p.topics.join(" + ")}`, subject: "Mathematics", dueAt: due, xp: 40, questionsJson: JSON.stringify(p.questions) },
    });
    await db.notification.create({ data: { userId: p.studentId, title: "New personalised practice set", body: `${auth.name} set ${p.questions.length} questions on ${p.topics.join(" and ")} — made for your gaps. Due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`, type: "system" } });
  }
  await audit({ name: auth.name, role: auth.role }, "homework.differentiated", `${plans.length} students`, plans.map((p) => `${p.name}: ${p.topics.join("+")}`).join("; "));
  return Response.json({ data: { assigned: plans.length } }, { status: 201 });
}
