import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";

const CUID_RE = /^c[a-z0-9]{20,}$/;

/** GET /api/curriculum/chapters?boardId=&gradeId=&subjectId= — verified chapter list; enforces board→grade→subject integrity. */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId")?.trim();
  const gradeId = url.searchParams.get("gradeId")?.trim();
  const subjectId = url.searchParams.get("subjectId")?.trim();
  if (!boardId) return badRequest("boardId query parameter is required.");
  if (!gradeId) return badRequest("gradeId query parameter is required.");
  if (!subjectId) return badRequest("subjectId query parameter is required.");

  const board = await db.curriculumBoard.findFirst({
    where: { OR: [{ code: boardId }, { id: boardId }] },
    include: { grades: true },
  });
  if (!board) return badRequest(`Board "${boardId}" was not found in the curriculum registry.`, "CURRICULUM_MISMATCH");

  const grade = CUID_RE.test(gradeId)
    ? board.grades.find((g) => g.id === gradeId)
    : board.grades.find((g) => g.name.toLowerCase() === gradeId.toLowerCase());
  if (!grade) {
    return badRequest(`Grade "${gradeId}" does not belong to board ${board.code}.`, "CURRICULUM_MISMATCH");
  }

  // Integrity: the subject must belong to this exact board + grade. (SQLite has no
  // case-insensitive mode filter, so fetch candidates and match in JS.)
  const candidates = await db.curriculumSubject.findMany({
    where: { boardId: board.id, gradeId: grade.id },
  });
  const subject = CUID_RE.test(subjectId)
    ? candidates.find((s) => s.id === subjectId)
    : candidates.find((s) => s.name.toLowerCase() === subjectId.toLowerCase());

  if (!subject || subject.boardId !== board.id || subject.gradeId !== grade.id) {
    return badRequest(
      `Subject does not match the selected board + grade chain (${board.code} · ${grade.name}). Re-select the subject.`,
      "CURRICULUM_MISMATCH",
    );
  }

  const chapters = await db.curriculumChapter.findMany({
    where: { subjectId: subject.id },
    orderBy: { number: "asc" },
    select: {
      id: true,
      name: true,
      number: true,
      status: true,
      source: true,
      verifiedAt: true,
      marks: true,
      topics: { orderBy: { number: "asc" }, select: { id: true, name: true, number: true, marks: true, subTopics: true } },
    },
  });

  const data = chapters.map((c) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    status: c.status,
    source: c.source,
    verifiedAt: c.verifiedAt?.toISOString() ?? null,
    marks: c.marks,
    topics: c.topics.map((t) => ({
      id: t.id,
      name: t.name,
      number: t.number,
      marks: t.marks,
      subTopics: (() => {
        try {
          const v = JSON.parse(t.subTopics);
          return Array.isArray(v) ? v : [];
        } catch {
          return [];
        }
      })(),
    })),
  }));
  return Response.json({
    data: { subject: { id: subject.id, name: subject.name }, chapters: data },
  });
}
