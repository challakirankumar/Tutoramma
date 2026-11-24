import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/**
 * GET /api/parent/digest?childId=&weeks=1 — Weekly Parent Digest / Progress Reel (spec §30):
 * attended sessions, topics covered, homework, quiz scores, study habits and the next class.
 */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden();
  const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email } });
  const users = await db.user.findMany({ where: { id: { in: kids.map((k) => k.userId) } }, select: { id: true, name: true } });
  const url = new URL(req.url);
  const childId = url.searchParams.get("childId") ?? kids[0]?.userId;
  const weeks = Math.min(4, Math.max(1, Number(url.searchParams.get("weeks")) || 1));
  const child = kids.find((k) => k.userId === childId);
  const children = kids.map((k) => ({ id: k.userId, name: users.find((u) => u.id === k.userId)?.name ?? "Child", grade: k.grade }));
  if (!child) return Response.json({ data: { children, digest: null } });

  const to = new Date();
  const from = new Date(to.getTime() - weeks * 7 * 86400000);
  const [bookings, upcoming, homework, tests, focus, cards, maya] = await Promise.all([
    db.booking.findMany({ where: { studentId: childId, startAt: { gte: from, lte: to } }, orderBy: { startAt: "asc" } }),
    db.booking.findFirst({ where: { studentId: childId, startAt: { gt: to }, state: { in: ["accepted", "requested"] } }, orderBy: { startAt: "asc" } }),
    db.homework.findMany({ where: { studentId: childId, dueAt: { gte: from, lte: new Date(to.getTime() + 7 * 86400000) } } }),
    db.testResult.findMany({ where: { studentId: childId, takenAt: { gte: from } }, orderBy: { takenAt: "asc" } }),
    db.focusSession.findMany({ where: { userId: childId, createdAt: { gte: from } } }),
    db.flashcard.count({ where: { deck: { ownerId: childId }, lastReviewedAt: { gte: from } } }),
    db.aiTutorSession.count({ where: { studentId: childId, updatedAt: { gte: from } } }),
  ]);
  const tutorIds = [...new Set([...bookings.map((b) => b.tutorId), upcoming?.tutorId].filter(Boolean) as string[])];
  const tutors = await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true } });
  const tn = (id: string) => tutors.find((t) => t.id === id)?.name ?? "Tutor";
  const attended = bookings.filter((b) => ["completed", "released", "in_progress"].includes(b.state));
  const topics = [...new Set(attended.flatMap((b) => {
    try {
      return JSON.parse(b.topics ?? "[]") as string[];
    } catch {
      return [];
    }
  }).concat(attended.map((b) => b.title.split("—")[1]?.trim() ?? "").filter(Boolean)))].slice(0, 8);
  const quizAvg = tests.length ? Math.round(tests.reduce((a, t) => a + (t.total ? (t.score / t.total) * 100 : 0), 0) / tests.length) : null;
  const focusMin = focus.reduce((a, f) => a + f.minutes, 0);
  const name = users.find((u) => u.id === childId)?.name.split(" ")[0] ?? "Your child";
  const hwDone = homework.filter((h) => h.status !== "assigned").length;
  const highlights: string[] = [];
  if (attended.length) highlights.push(`Attended ${attended.length} session${attended.length > 1 ? "s" : ""}`);
  if (quizAvg != null) highlights.push(`Quiz average ${quizAvg}%`);
  if (focusMin) highlights.push(`${focusMin} focused minutes`);
  if (cards) highlights.push(`${cards} flashcards revised`);
  const nextStep = homework.find((h) => h.status === "assigned") ? `Finish “${homework.find((h) => h.status === "assigned")!.title}” before it's due.` : topics[0] ? `Revise ${topics[0]} for 15 minutes before the next class.` : "Book the next class to keep momentum.";
  const share = [
    `📘 ${name}'s week on Tutor Amma`,
    ...highlights.map((h) => `• ${h}`),
    topics.length ? `• Covered: ${topics.slice(0, 4).join(", ")}` : "",
    `• Homework: ${hwDone}/${homework.length} done`,
    upcoming ? `• Next: ${upcoming.subject} with ${tn(upcoming.tutorId)} on ${upcoming.startAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "",
    `👉 Next step: ${nextStep}`,
  ].filter(Boolean).join("\n");

  return Response.json({
    data: {
      children,
      digest: {
        childId,
        name: users.find((u) => u.id === childId)?.name,
        grade: child.grade,
        from,
        to,
        sessions: bookings.map((b) => ({ id: b.id, subject: b.subject, title: b.title, tutor: tn(b.tutorId), at: b.startAt, state: b.state, mode: b.mode })),
        attended: attended.length,
        topics,
        homework: { total: homework.length, done: hwDone, items: homework.map((h) => ({ title: h.title, subject: h.subject, status: h.status, score: h.score, dueAt: h.dueAt })) },
        tests: tests.map((t) => ({ title: t.title, pct: t.total ? Math.round((t.score / t.total) * 100) : 0, at: t.takenAt })),
        quizAvg,
        focusMin,
        cards,
        maya,
        next: upcoming ? { subject: upcoming.subject, tutor: tn(upcoming.tutorId), at: upcoming.startAt, mode: upcoming.mode } : null,
        highlights,
        nextStep,
        share,
      },
    },
  });
}
