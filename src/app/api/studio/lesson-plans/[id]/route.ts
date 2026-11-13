import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

interface ReflectionInput {
  wentWell: string;
  improve: string;
  engagement: string;
  nextSteps: string;
}

const REFLECTION_FIELDS: (keyof ReflectionInput)[] = ["wentWell", "improve", "engagement", "nextSteps"];

function parseReflection(json: string, status: string, updatedAt: Date | null) {
  let v: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(json || "{}");
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {
    v = {};
  }
  return {
    status,
    updatedAt: updatedAt?.toISOString() ?? null,
    wentWell: String(v.wentWell ?? ""),
    improve: String(v.improve ?? ""),
    engagement: String(v.engagement ?? ""),
    nextSteps: String(v.nextSteps ?? ""),
    revision: Number(v.revision) || 0,
    submittedAt: typeof v.submittedAt === "string" ? v.submittedAt : null,
  };
}

async function ownedPlan(id: string, tutorId: string) {
  const plan = await db.lessonPlan.findUnique({ where: { id } });
  if (!plan) return { error: notFound("Lesson plan not found.") } as const;
  if (plan.tutorId !== tutorId) return { error: forbidden("This lesson plan belongs to another tutor.") } as const;
  return { plan } as const;
}

/** GET /api/studio/lesson-plans/[id] — full plan incl. contentJson. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can access the Teaching Studio.");
  const { id } = await params;

  const res = await ownedPlan(id, auth.id);
  if ("error" in res) return res.error;
  const p = res.plan;

  const parseArr = (s: string): string[] => {
    try {
      const v = JSON.parse(s || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  const sharedWith = parseArr(p.sharedWith);
  // Resolve student names for the shared-with display (ids alone are not friendly).
  const sharedUsers = sharedWith.length
    ? await db.user.findMany({ where: { id: { in: sharedWith } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(sharedUsers.map((u) => [u.id, u.name]));

  return Response.json({
    data: {
      id: p.id,
      title: p.title,
      board: p.board,
      grade: p.grade,
      subject: p.subject,
      chapterNames: parseArr(p.chapterNames),
      difficulty: p.difficulty,
      periods: p.periods,
      periodMinutes: p.periodMinutes,
      slideCount: p.slideCount,
      contentJson: JSON.parse(p.contentJson || "{}"),
      provenance: p.provenance,
      version: p.version,
      status: p.status,
      sharedWith,
      sharedWithNames: sharedWith.map((sid) => nameById.get(sid) ?? "Student"),
      linkedSlotId: p.linkedSlotId,
      reflection: parseReflection(p.reflectionJson, p.reflectionStatus, p.reflectionUpdatedAt),
      createdAt: p.createdAt.toISOString(),
    },
  });
}

/** PUT /api/studio/lesson-plans/[id] — edit contentJson (version++), set status, or link a timetable slot. */
export async function PUT(req: Request, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can edit lesson plans.");
  const { id } = await params;

  const res = await ownedPlan(id, auth.id);
  if ("error" in res) return res.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const data: Record<string, unknown> = {};
  let detail = "";

  if (body.contentJson && typeof body.contentJson === "object") {
    data.contentJson = JSON.stringify(body.contentJson);
    data.version = res.plan.version + 1;
    data.provenance = "AI draft + tutor edits";
    detail = `v${res.plan.version} → v${data.version}`;
  }
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
    detail = detail || "title updated";
  }
  if (typeof body.linkedSlotId === "string") {
    data.linkedSlotId = body.linkedSlotId || null;
    detail = `linked slot ${body.linkedSlotId || "cleared"}`;
  }
  if (body.status === "saved" || body.status === "draft") {
    data.status = body.status;
  }

  /* Post-class reflection — Save as Draft or Submit for review (LearnX lesson-plan spec §6). */
  if (body.reflection && typeof body.reflection === "object") {
    const r = body.reflection as Record<string, unknown>;
    const input: ReflectionInput = {
      wentWell: String(r.wentWell ?? "").trim(),
      improve: String(r.improve ?? "").trim(),
      engagement: String(r.engagement ?? "").trim(),
      nextSteps: String(r.nextSteps ?? "").trim(),
    };
    const submit = body.reflectionStatus === "submitted";
    const save = submit || body.reflectionStatus === "draft";
    if (!save) return badRequest("reflectionStatus must be 'draft' or 'submitted'.");
    if (submit && REFLECTION_FIELDS.some((f) => !input[f])) {
      return badRequest("Answer all four reflection prompts before submitting for review.");
    }
    if (REFLECTION_FIELDS.every((f) => !input[f])) {
      return badRequest("Write at least one reflection note before saving.");
    }
    const prev = parseReflection(res.plan.reflectionJson, res.plan.reflectionStatus, res.plan.reflectionUpdatedAt);
    const revision = submit ? (prev.revision || 0) + 1 : prev.revision || 0;
    data.reflectionJson = JSON.stringify({
      ...input,
      revision,
      ...(submit ? { submittedAt: new Date().toISOString() } : prev.submittedAt ? { submittedAt: prev.submittedAt } : {}),
    });
    data.reflectionStatus = submit ? "submitted" : "draft";
    data.reflectionUpdatedAt = new Date();
    detail = submit ? `reflection submitted (revision ${revision})` : "reflection draft saved";
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update — send contentJson, title, status or linkedSlotId.");

  const updated = await db.lessonPlan.update({ where: { id }, data: data as never });

  await audit({ name: auth.name, role: auth.role }, "studio.lesson_plan.updated", "LessonPlan", `${updated.title} — ${detail}`);

  return Response.json({
    data: { id: updated.id, version: updated.version, status: updated.status, provenance: updated.provenance, linkedSlotId: updated.linkedSlotId },
  });
}
