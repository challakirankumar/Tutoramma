import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest, notFound } from "@/lib/auth";
import ZAI from "@/lib/ai";
import { buildSmartPlan, isoDay, type PlanDay, type PlanTask } from "@/lib/learning";
import { awardXp, withTimeout } from "@/lib/xp";

function shape(p: { id: string; examName: string; examDate: Date; hoursPerDay: number; plan: string; source: string; updatedAt: Date }) {
  let days: PlanDay[] = [];
  try {
    days = JSON.parse(p.plan);
  } catch {}
  const all = days.flatMap((d) => d.tasks);
  return {
    id: p.id,
    examName: p.examName,
    examDate: p.examDate,
    hoursPerDay: p.hoursPerDay,
    source: p.source,
    updatedAt: p.updatedAt,
    days,
    progress: { done: all.filter((t) => t.done).length, total: all.length, minutesDone: all.filter((t) => t.done).reduce((a, t) => a + t.minutes, 0) },
  };
}

/** GET /api/planner — the active revision plan (or null) plus profile weak topics for prefill. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const [plan, profile] = await Promise.all([
    db.studyPlan.findUnique({ where: { userId: auth.id } }),
    db.studentProfile.findUnique({ where: { userId: auth.id }, select: { weakTopics: true, grade: true, examDate: true } }),
  ]);
  let weakTopics: string[] = [];
  try {
    weakTopics = JSON.parse(profile?.weakTopics ?? "[]");
  } catch {}
  return Response.json({ data: { plan: plan ? shape(plan) : null, weakTopics, grade: profile?.grade ?? null, examDate: profile?.examDate ?? null } });
}

/**
 * POST /api/planner — generate a plan.
 * { examName, examDate, hoursPerDay, subjects: [{name, topics[]}], weakTopics?, useAi? }
 * The smart scheduler always builds the skeleton (spaced revision, mocks, light days);
 * Workers AI optionally rewrites task titles into specific, motivating study actions.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let body: { examName?: string; examDate?: string; hoursPerDay?: number; subjects?: { name: string; topics: string[] }[]; weakTopics?: string[]; useAi?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const examName = String(body.examName ?? "").trim().slice(0, 80);
  const examDate = new Date(String(body.examDate ?? ""));
  const hoursPerDay = Math.min(10, Math.max(0.5, Number(body.hoursPerDay) || 2));
  const subjects = (body.subjects ?? [])
    .map((s) => ({ name: String(s.name ?? "").trim().slice(0, 40), topics: (s.topics ?? []).map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 25) }))
    .filter((s) => s.name && s.topics.length)
    .slice(0, 8);
  if (!examName) return badRequest("Give your exam a name.", "VALIDATION_ERROR", { examName: "Required" });
  if (isNaN(examDate.getTime()) || examDate.getTime() < Date.now()) return badRequest("Pick an exam date in the future.", "VALIDATION_ERROR", { examDate: "Future date" });
  if (!subjects.length) return badRequest("Add at least one subject with topics.", "VALIDATION_ERROR", { subjects: "Required" });

  const days = buildSmartPlan({ examDate, subjects, weakTopics: body.weakTopics ?? [], hoursPerDay });
  let source = "smart";

  if (body.useAi) {
    try {
      const learnTasks = days.flatMap((d) => d.tasks).filter((t) => t.kind === "learn" || t.kind === "practice").slice(0, 60);
      const zai = await ZAI.create();
      const res = await withTimeout(
        zai.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                'You are a study coach. Rewrite each study task title into a specific, actionable instruction (max 14 words) that names a concrete method (e.g. "Solve 10 NCERT-style problems", "Draw a mind map", "Teach-back in 2 minutes"). Return STRICT JSON: an object mapping task id to the new title. No commentary.',
            },
            { role: "user", content: JSON.stringify(learnTasks.map((t) => ({ id: t.id, subject: t.subject, title: t.title }))) },
          ],
          temperature: 0.5,
          max_tokens: 2500,
        }),
        25000
      );
      const raw = res.choices[0]?.message?.content ?? "";
      const m = raw.match(/\{[\s\S]*\}/);
      const map = m ? (JSON.parse(m[0]) as Record<string, string>) : {};
      let changed = 0;
      for (const d of days)
        for (const t of d.tasks)
          if (typeof map[t.id] === "string" && map[t.id].trim()) {
            t.title = map[t.id].trim().slice(0, 140);
            changed++;
          }
      if (changed > 0) source = "ai";
    } catch {
      /* keep the smart plan */
    }
  }

  const data = { examName, examDate, hoursPerDay, plan: JSON.stringify(days), source };
  const plan = await db.studyPlan.upsert({ where: { userId: auth.id }, update: data, create: { userId: auth.id, ...data } });
  await db.studentProfile.updateMany({ where: { userId: auth.id }, data: { examDate } });
  return Response.json({ data: shape(plan) }, { status: 201 });
}

/** PATCH /api/planner — { taskId, done } toggles a task (+10 XP when completed). */
export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let body: { taskId?: string; done?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const plan = await db.studyPlan.findUnique({ where: { userId: auth.id } });
  if (!plan) return notFound("No active plan.");
  const days: PlanDay[] = JSON.parse(plan.plan);
  let task: PlanTask | undefined;
  for (const d of days) task = task ?? d.tasks.find((t) => t.id === body.taskId);
  if (!task) return notFound("Task not found.");
  const wasDone = task.done;
  task.done = !!body.done;
  const updated = await db.studyPlan.update({ where: { id: plan.id }, data: { plan: JSON.stringify(days) } });
  const xp = !wasDone && task.done ? await awardXp(auth.id, 10) : null;
  return Response.json({ data: { ...shape(updated), xp } });
}

/** DELETE /api/planner — discard the plan. */
export async function DELETE() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  await db.studyPlan.deleteMany({ where: { userId: auth.id } });
  return Response.json({ data: { ok: true } });
}

