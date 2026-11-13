import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

const parseArr = (s: string): string[] => {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const parseObj = (s: string): unknown => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

/** GET /api/studio/papers — the tutor's question paper library (incl. content + tutor-only answer key). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can access question papers.");

  const papers = await db.questionPaper.findMany({
    where: { tutorId: auth.id },
    orderBy: { createdAt: "desc" },
  });

  const data = papers.map((p) => ({
    id: p.id,
    lessonPlanId: p.lessonPlanId,
    title: p.title,
    kind: p.kind,
    sourceVersion: p.sourceVersion,
    board: p.board,
    grade: p.grade,
    subject: p.subject,
    chapters: parseArr(p.chapters),
    configJson: parseObj(p.configJson),
    contentJson: parseObj(p.contentJson),
    answerKeyJson: parseObj(p.answerKeyJson),
    allotmentJson: parseObj(p.allotmentJson ?? "{}"),
    headerJson: parseObj(p.headerJson ?? "{}"),
    status: p.status,
    provenance: p.provenance,
    sharedWith: parseArr(p.sharedWith),
    sharedAt: p.sharedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  return Response.json({ data });
}

/** POST /api/studio/papers — save a generated paper as a draft. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can save question papers.");

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
  if (!title) return badRequest("A paper title is required.");
  if (!board || !grade || !subject) return badRequest("Board, grade and subject are required.");
  if (!body.contentJson || typeof body.contentJson !== "object") return badRequest("contentJson is required.");

  const chapters = Array.isArray(body.chapters) ? body.chapters.map(String) : [];
  const configJson = body.configJson && typeof body.configJson === "object" ? body.configJson : {};
  const answerKeyJson = body.answerKeyJson && typeof body.answerKeyJson === "object" ? body.answerKeyJson : {};
  const allotmentJson = body.allotmentJson && typeof body.allotmentJson === "object" ? body.allotmentJson : {};
  const headerJson = body.headerJson && typeof body.headerJson === "object" ? body.headerJson : {};
  const provenance = String(body.provenance ?? "AI draft");
  const kind = ["paper", "worksheet", "assessment", "homework", "ppt"].includes(String(body.kind)) ? String(body.kind) : "paper";
  const sourceVersion = Number.isFinite(Number(body.sourceVersion)) && Number(body.sourceVersion) > 0 ? Math.round(Number(body.sourceVersion)) : null;

  const created = await db.questionPaper.create({
    data: {
      tutorId: auth.id,
      lessonPlanId: typeof body.lessonPlanId === "string" && body.lessonPlanId ? body.lessonPlanId : null,
      title,
      kind,
      sourceVersion,
      board,
      grade,
      subject,
      chapters: JSON.stringify(chapters),
      configJson: JSON.stringify(configJson),
      contentJson: JSON.stringify(body.contentJson),
      answerKeyJson: JSON.stringify(answerKeyJson),
      allotmentJson: JSON.stringify(allotmentJson),
      headerJson: JSON.stringify(headerJson),
      status: "draft",
      provenance,
    },
  });

  await audit({ name: auth.name, role: auth.role }, "studio.paper.created", "QuestionPaper", `${title} (${board} · ${grade} · ${subject})`);

  return Response.json({ data: { id: created.id, status: created.status } }, { status: 201 });
}
