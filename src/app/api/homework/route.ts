import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/**
 * GET /api/homework — the signed-in student's homework (own + joined batches)
 * with questionsJson parsed, plus quick-test results (TestResult) sorted desc.
 * NOTE: Homework has no Prisma relation to User — tutor joined manually.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("Only students can view their homework.");

  const seats = await db.batchSeat.findMany({ where: { studentId: auth.id }, select: { batchId: true } });
  const batchIds = seats.map((s) => s.batchId);

  const homework = await db.homework.findMany({
    where: { OR: [{ studentId: auth.id }, ...(batchIds.length ? [{ batchId: { in: batchIds } }] : [])] },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });

  const tutorIds = Array.from(new Set(homework.map((h) => h.tutorId)));
  const tutors = tutorIds.length
    ? await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const tutorMap = new Map(tutors.map((t) => [t.id, t]));

  const tests = await db.testResult.findMany({
    where: { studentId: auth.id },
    orderBy: { takenAt: "desc" },
  });

  return Response.json({
    data: {
      homework: homework.map((h) => {
        const t = tutorMap.get(h.tutorId);
        return {
          id: h.id,
          title: h.title,
          subject: h.subject,
          dueAt: h.dueAt,
          xp: h.xp,
          status: h.status,
          score: h.score,
          feedback: h.feedback,
          submission: h.submission ? JSON.parse(h.submission) : null,
          batchId: h.batchId,
          tutor: t ? { id: t.id, name: t.name, color: t.avatarColor } : null,
          questions: JSON.parse(h.questionsJson || "[]"),
        };
      }),
      tests: tests.map((t) => ({
        id: t.id,
        title: t.title,
        subject: t.subject,
        score: t.score,
        total: t.total,
        xp: t.xp,
        weakTopics: JSON.parse(t.weakTopics || "[]"),
        takenAt: t.takenAt,
      })),
    },
  });
}
