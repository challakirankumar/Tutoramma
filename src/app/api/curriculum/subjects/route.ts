import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";

const CUID_RE = /^c[a-z0-9]{20,}$/;

/** GET /api/curriculum/subjects?boardId=&gradeId= — subjects for a board+grade (gradeId = DB id OR name like "Grade 8"). */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId")?.trim();
  const gradeId = url.searchParams.get("gradeId")?.trim();
  if (!boardId) return badRequest("boardId query parameter is required.");
  if (!gradeId) return badRequest("gradeId query parameter is required.");

  const board = await db.curriculumBoard.findFirst({
    where: { OR: [{ code: boardId }, { id: boardId }] },
    include: { grades: true },
  });
  if (!board) return badRequest(`Board "${boardId}" was not found in the curriculum registry.`, "CURRICULUM_MISMATCH");

  // gradeId may be a DB cuid or a display name like "Grade 8" — resolve both.
  const grade = CUID_RE.test(gradeId)
    ? board.grades.find((g) => g.id === gradeId)
    : board.grades.find((g) => g.name.toLowerCase() === gradeId.toLowerCase());
  if (!grade) {
    return badRequest(
      `Grade "${gradeId}" does not belong to board ${board.code}. Re-select the grade for this board.`,
      "CURRICULUM_MISMATCH",
    );
  }

  const subjects = await db.curriculumSubject.findMany({
    where: { boardId: board.id, gradeId: grade.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { chapters: true } } },
  });

  const data = subjects.map((s) => ({ id: s.id, name: s.name, chapterCount: s._count.chapters }));
  return Response.json({ data: { grade: { id: grade.id, name: grade.name }, subjects: data } });
}
