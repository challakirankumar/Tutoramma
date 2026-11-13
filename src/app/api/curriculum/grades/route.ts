import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";

/** GET /api/curriculum/grades?boardId=CBSE — grades offered by a board (boardId = code or DB id). */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId")?.trim();
  if (!boardId) return badRequest("boardId query parameter is required.");

  const board = await db.curriculumBoard.findFirst({
    where: { OR: [{ code: boardId }, { id: boardId }] },
    include: { grades: true },
  });
  if (!board) return badRequest(`Board "${boardId}" was not found in the curriculum registry.`, "CURRICULUM_MISMATCH");

  // Natural sort: "Grade 6" < "Grade 7" < … < "Grade 10".
  const num = (n: string) => Number(n.replace(/[^0-9]/g, "")) || 0;
  const grades = board.grades
    .map((g) => ({ id: g.id, name: g.name, boardCode: board.code }))
    .sort((a, b) => num(a.name) - num(b.name) || a.name.localeCompare(b.name));
  return Response.json({ data: { board: { code: board.code, name: board.name }, grades } });
}
