import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

/** GET /api/studio/lesson-plans — the signed-in tutor's lesson plan library. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can access the Teaching Studio.");

  const plans = await db.lessonPlan.findMany({
    where: { tutorId: auth.id },
    orderBy: { createdAt: "desc" },
  });

  const data = plans.map((p) => {
    let sharedWith: string[] = [];
    try {
      sharedWith = JSON.parse(p.sharedWith || "[]");
    } catch {
      sharedWith = [];
    }
    let chapterNames: string[] = [];
    try {
      chapterNames = JSON.parse(p.chapterNames || "[]");
    } catch {
      chapterNames = [];
    }
    return {
      id: p.id,
      title: p.title,
      board: p.board,
      grade: p.grade,
      subject: p.subject,
      chapterNames,
      difficulty: p.difficulty,
      periods: p.periods,
      periodMinutes: p.periodMinutes,
      slideCount: p.slideCount,
      provenance: p.provenance,
      version: p.version,
      status: p.status,
      sharedCount: sharedWith.length,
      linkedSlotId: p.linkedSlotId,
      createdAt: p.createdAt.toISOString(),
    };
  });

  return Response.json({ data });
}

/** POST /api/studio/lesson-plans — save a generated plan as a v1 draft. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can save lesson plans.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const title = String(body.title ?? "").trim();
  const board = String(body.board ?? "").trim();
  const grade = String(body.grade ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const contentJson = body.contentJson;

  if (!title) return badRequest("A lesson plan title is required.");
  if (!board || !grade || !subject) return badRequest("Board, grade and subject are required.");
  if (!contentJson || typeof contentJson !== "object") {
    return badRequest("contentJson (the 5E lesson structure) is required.");
  }

  const chapterNames = Array.isArray(body.chapterNames) ? body.chapterNames.map(String) : [];
  const difficulty = ["Easy", "Medium", "Hard"].includes(String(body.difficulty)) ? String(body.difficulty) : "Medium";
  const periods = Math.min(3, Math.max(1, Number(body.periods) || 1));
  const periodMinutes = [40, 45, 50].includes(Number(body.periodMinutes)) ? Number(body.periodMinutes) : 45;
  const slideCount = [6, 8, 10].includes(Number(body.slideCount)) ? Number(body.slideCount) : 8;
  const provenance = String(body.provenance ?? "AI draft");

  const created = await db.lessonPlan.create({
    data: {
      tutorId: auth.id,
      title,
      board,
      grade,
      subject,
      chapterNames: JSON.stringify(chapterNames),
      difficulty,
      periods,
      periodMinutes,
      slideCount,
      contentJson: JSON.stringify(contentJson),
      provenance,
      version: 1,
      status: "draft",
    },
  });

  await audit({ name: auth.name, role: auth.role }, "studio.lesson_plan.created", "LessonPlan", `${title} (${board} · ${grade} · ${subject})`);

  return Response.json({ data: { id: created.id, version: created.version, status: created.status } }, { status: 201 });
}

