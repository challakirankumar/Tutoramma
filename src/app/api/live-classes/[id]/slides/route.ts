import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest } from "@/lib/auth";

/**
 * /api/live-classes/[id]/slides — build a presentable slide deck from a
 * saved 5E lesson plan (spec Part J).
 *
 * GET  → the signed-in tutor's saved lesson plans (picker list).
 * POST {lessonPlanId} → deck: title slide, learning objectives, one slide
 *      per 5E stage (script excerpt / board work / worked example), a
 *      "Check your understanding" slide from the Evaluate stage and a
 *      wrap-up slide — capped at plan.slideCount + 2. Also links the plan
 *      to the LiveClass (lessonPlanId).
 */

interface DeckSlide {
  title: string;
  bullets: string[];
}

interface StageShape {
  stage?: string;
  title?: string;
  teacherScript?: string;
  boardWork?: string[];
  workedExamples?: { problem?: string }[];
  questions?: { q?: string }[];
}

function trimTo(s: string, n: number) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function buildDeck(plan: {
  title: string;
  subject: string;
  grade: string;
  board: string;
  chapterNames: string;
  slideCount: number;
  contentJson: string;
}): DeckSlide[] {
  let content: {
    learningObjectives?: string[];
    stages?: StageShape[];
  } = {};
  try {
    content = JSON.parse(plan.contentJson || "{}");
  } catch {}
  let chapters: string[] = [];
  try {
    chapters = JSON.parse(plan.chapterNames || "[]");
  } catch {}

  const stages = Array.isArray(content.stages) ? content.stages : [];
  const objectives = (content.learningObjectives ?? []).map((o) => trimTo(String(o), 110)).filter(Boolean);

  const deck: DeckSlide[] = [];

  /* 1. title slide */
  deck.push({
    title: plan.title,
    bullets: [trimTo([plan.subject, plan.grade, chapters.slice(0, 3).join(", ")].filter(Boolean).join(" · "), 130)],
  });

  /* 2. learning objectives */
  if (objectives.length) {
    deck.push({ title: "Learning objectives", bullets: objectives.slice(0, 4) });
  }

  /* 3. one slide per 5E stage */
  for (const st of stages) {
    const bullets: string[] = [];
    const script = String(st.teacherScript ?? "").trim();
    if (script) bullets.push(trimTo(script, 120));
    const bw = (st.boardWork ?? [])[0];
    if (bw) bullets.push(`Board: ${trimTo(bw, 90)}`);
    const we = (st.workedExamples ?? [])[0]?.problem;
    if (we) bullets.push(`Example: ${trimTo(we, 90)}`);
    if (!bullets.length) bullets.push(trimTo(st.title ?? st.stage ?? "Class activity", 100));
    deck.push({
      title: `${String(st.stage ?? "").toUpperCase().trim()}${st.title ? ` — ${trimTo(st.title, 60)}` : ""}`.trim() || "Stage",
      bullets: bullets.slice(0, 3),
    });
  }

  /* 4. check your understanding — Evaluate questions */
  const evaluate = stages.find((s) => /evaluate/i.test(String(s.stage ?? "")));
  const evalQuestions = (evaluate?.questions ?? []).map((q) => trimTo(String(q.q ?? ""), 100)).filter(Boolean);
  if (evalQuestions.length) {
    deck.push({ title: "Check your understanding", bullets: evalQuestions.slice(0, 4) });
  }

  /* 5. wrap-up */
  deck.push({ title: "Great work!", bullets: ["Homework", "Next class"] });

  return deck.slice(0, Math.max(4, plan.slideCount + 2));
}

/* ----------------------------- GET (picker list) ----------------------------- */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can load lesson-plan slides.");
  void params; // the picker lists the tutor's whole library

  const plans = await db.lessonPlan.findMany({
    where: { tutorId: auth.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, title: true, subject: true, grade: true },
  });

  return Response.json({ data: { plans } });
}

/* ----------------------------- POST (build deck) ----------------------------- */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return notFound("Live class not found.");
  if (c.tutorId !== auth.id) return forbidden("Only the class host can present lesson-plan slides.");

  const body = (await req.json().catch(() => ({}))) as { lessonPlanId?: string };
  const planId = String(body.lessonPlanId ?? "").trim();
  if (!planId) return badRequest("Pick a lesson plan to load.");

  const plan = await db.lessonPlan.findUnique({ where: { id: planId } });
  if (!plan) return notFound("That lesson plan no longer exists.");
  if (plan.tutorId !== auth.id) return forbidden("That lesson plan belongs to another tutor.");

  const slides = buildDeck(plan);

  /* remember which plan the deck came from */
  await db.liveClass.update({ where: { id: c.id }, data: { lessonPlanId: plan.id } });

  return Response.json({ data: { slides } });
}
