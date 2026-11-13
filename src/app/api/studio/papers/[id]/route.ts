import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** Per-field ceiling for each stringified JSON blob (base64 images inside contentJson are expected, but bounded). */
const MAX_FIELD_CHARS = 1_500_000;
/** Ceiling for the whole stored paper (sum of the stringified JSON fields). */
const MAX_TOTAL_CHARS = 4_000_000;

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

async function ownedPaper(id: string, tutorId: string) {
  const paper = await db.questionPaper.findUnique({ where: { id } });
  if (!paper) return { error: notFound("Question paper not found.") } as const;
  if (paper.tutorId !== tutorId) return { error: forbidden("This paper belongs to another tutor.") } as const;
  return { paper } as const;
}

/** GET /api/studio/papers/[id] — one paper (incl. headerJson), mapped like the list route. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can access question papers.");
  const { id } = await params;

  const res = await ownedPaper(id, auth.id);
  if ("error" in res) return res.error;
  const p = res.paper;

  return Response.json({
    data: {
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
    },
  });
}

/** PATCH /api/studio/papers/[id] — edit title / content / answer key / config / header of a saved paper. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can edit question papers.");
  const { id } = await params;

  const res = await ownedPaper(id, auth.id);
  if ("error" in res) return res.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 160) return badRequest("Title must be a non-empty string of at most 160 characters.");
    data.title = title;
  }

  for (const field of ["contentJson", "answerKeyJson", "configJson", "headerJson", "allotmentJson"] as const) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return badRequest(`${field} must be a JSON object.`);
    }
    const s = JSON.stringify(value);
    if (s.length >= MAX_FIELD_CHARS) return badRequest(`${field} is too large — keep each part of the paper under 1.5 MB.`);
    data[field] = s;
  }

  if (Object.keys(data).length === 0) {
    return badRequest("Nothing to update — send title, contentJson, answerKeyJson, configJson, headerJson or allotmentJson.");
  }

  // Whole-paper ceiling: new values where provided, stored values otherwise.
  const totalChars =
    res.paper.chapters.length +
    (typeof data.configJson === "string" ? data.configJson.length : res.paper.configJson.length) +
    (typeof data.contentJson === "string" ? data.contentJson.length : res.paper.contentJson.length) +
    (typeof data.answerKeyJson === "string" ? data.answerKeyJson.length : res.paper.answerKeyJson.length) +
    (typeof data.headerJson === "string" ? data.headerJson.length : (res.paper.headerJson ?? "{}").length);
  if (totalChars >= MAX_TOTAL_CHARS) {
    return badRequest("The paper is too large to save — keep the total stored paper under 4 MB (compress or remove some images).");
  }

  // Real edits to the paper itself mark the provenance honestly.
  if (data.contentJson !== undefined || data.answerKeyJson !== undefined) {
    data.provenance = "AI draft + tutor edits";
  }

  const updated = await db.questionPaper.update({ where: { id }, data: data as never });

  await audit({ name: auth.name, role: auth.role }, "studio.paper.updated", "QuestionPaper", updated.title);

  return Response.json({ data: { id: updated.id, status: updated.status, provenance: updated.provenance } });
}
