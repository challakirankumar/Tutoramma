import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound } from "@/lib/auth";

const gradeSort = (a: { name: string }, b: { name: string }) => {
  const na = parseInt(a.name.replace(/\D+/g, ""), 10);
  const nb = parseInt(b.name.replace(/\D+/g, ""), 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.name.localeCompare(b.name);
  return na - nb;
};

/**
 * Curriculum registry browser.
 *  - no params            → all boards + totals
 *  - ?boardId=            → board detail + grades (with subjects + chapter counts)
 *  - ?boardId=&gradeId=   → subjects of a grade
 *  - ?subjectId=          → chapters of a subject
 */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId") || "";
  const gradeId = searchParams.get("gradeId") || "";
  const subjectId = searchParams.get("subjectId") || "";

  if (subjectId) {
    const subject = await db.curriculumSubject.findUnique({
      where: { id: subjectId },
      include: { grade: true, board: true, chapters: { orderBy: { number: "asc" } } },
    });
    if (!subject) return notFound("Subject not found.");
    return Response.json({
      data: {
        subject: { id: subject.id, name: subject.name, gradeName: subject.grade.name, boardName: subject.board.name },
        chapters: subject.chapters.map((c) => ({
          id: c.id,
          number: c.number,
          name: c.name,
          status: c.status,
          source: c.source,
          verifiedAt: c.verifiedAt,
          marks: c.marks,
        })),
      },
    });
  }

  if (boardId) {
    /* boardId may be the row id or the board code (e.g. "CBSE") */
    const board = (await db.curriculumBoard.findUnique({
      where: { id: boardId },
      include: { grades: { include: { subjects: { include: { _count: { select: { chapters: true } } } } } } },
    })) ??
    (await db.curriculumBoard.findUnique({
      where: { code: boardId },
      include: { grades: { include: { subjects: { include: { _count: { select: { chapters: true } } } } } } },
    }));
    if (!board) return notFound("Board not found.");

    const grades = board.grades
      .slice()
      .sort(gradeSort)
      .map((g) => {
        const subjects = g.subjects.map((s) => ({ id: s.id, name: s.name, chapterCount: s._count.chapters }));
        return {
          id: g.id,
          name: g.name,
          subjectCount: subjects.length,
          chapterCount: subjects.reduce((sum, s) => sum + s.chapterCount, 0),
          subjects,
        };
      });

    if (gradeId) {
      const grade = grades.find((g) => g.id === gradeId);
      if (!grade) return notFound("Grade not found on this board.");
      return Response.json({ data: { grade, subjects: grade.subjects } });
    }

    return Response.json({
      data: {
        board: {
          id: board.id,
          code: board.code,
          name: board.name,
          country: board.country,
          region: board.region,
          status: board.status,
          verifyState: board.verifyState,
          lastExam: board.lastExam,
          bodies: board.bodies,
          levels: board.levels,
          verifiedAt: board.verifiedAt,
        },
        grades,
      },
    });
  }

  /* full registry summary */
  const [boards, subjects] = await Promise.all([
    db.curriculumBoard.findMany({ include: { grades: { select: { id: true } } } }),
    db.curriculumSubject.findMany({ select: { id: true, boardId: true, gradeId: true, name: true, _count: { select: { chapters: true } } } }),
  ]);

  const boardRows = boards.map((b) => {
    const subj = subjects.filter((s) => s.boardId === b.id);
    return {
      id: b.id,
      code: b.code,
      name: b.name,
      country: b.country,
      region: b.region,
      status: b.status,
      verifyState: b.verifyState,
      lastExam: b.lastExam,
      bodies: b.bodies,
      levels: b.levels,
      gradeCount: b.grades.length,
      subjectCount: subj.length,
      chapterCount: subj.reduce((sum, s) => sum + s._count.chapters, 0),
    };
  });

  const totals = {
    boards: boardRows.length,
    grades: boardRows.reduce((s, b) => s + b.gradeCount, 0),
    subjects: subjects.length,
    chapters: subjects.reduce((s, x) => s + x._count.chapters, 0),
  };
  return Response.json({ data: { boards: boardRows, totals } });
}
