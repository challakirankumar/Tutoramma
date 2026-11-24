import { getAuthUser, unauthorized, forbidden, badRequest, notFound } from "@/lib/auth";
import ZAI from "@/lib/ai";
import { buildLearningProfile } from "@/lib/learning-profile";
import { withTimeout } from "@/lib/xp";

interface Step {
  title: string;
  detail: string;
  minutes?: number;
}

/** Deterministic strategy planner used when AI is unavailable (labelled as such). */
function fallbackPlan(topic: string, pace: string, prefers: string[]): { steps: Step[]; why: string } {
  const concrete = prefers.includes("diagrams") ? "a picture or table" : "a real-life story";
  return {
    steps: [
      { title: `Open with ${concrete} (5 min)`, detail: `Anchor “${topic}” in something familiar before any symbols.`, minutes: 5 },
      { title: "Model one example aloud", detail: "Think out loud; name each step and why you take it.", minutes: 8 },
      { title: pace === "slow" ? "Two guided examples, then one solo (12 min)" : "One guided example, then two solo (12 min)", detail: "Fade the support step by step; let the student lead the last step.", minutes: 12 },
      { title: "Check with a 2-question exit ticket", detail: "One straightforward and one twisted question on the same idea.", minutes: 5 },
      { title: "Reteach trigger", detail: "If 1 of 2 is wrong, re-explain with a different representation and retry.", minutes: 5 },
    ],
    why: `Pace is ${pace}; the learner prefers ${prefers.join(" and ")}. Concrete-first, short steps and frequent checks keep attention and expose slips early.`,
  };
}

/** POST /api/coach/plan — { studentId, topic } → 5-step teaching approach for this learner. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  let b: { studentId?: string; topic?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const topic = String(b.topic ?? "").trim().slice(0, 120);
  if (!b.studentId || !topic) return badRequest("Choose a student and a topic.");
  const p = await buildLearningProfile(b.studentId);
  if (!p) return notFound("Student not found.");

  try {
    const zai = await ZAI.create();
    const res = await withTimeout(
      zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              'You are an expert teaching coach for Indian school tutors. Return STRICT JSON: {"steps":[{"title":string (max 9 words, include minutes in brackets),"detail":string (max 16 words)}] (exactly 5 steps: open, model, guided-to-independent practice, exit check, reteach trigger),"why":string (max 45 words, explain how the plan fits this learner)}. Concrete, specific to the topic, no generic filler.',
          },
          {
            role: "user",
            content: `Topic: ${topic}\nLearner: ${p.grade} ${p.board}; pace ${p.pace}; attention about ${p.attentionMin} min; prefers ${p.prefers.join(", ")}; language ${p.language}; weak topics: ${p.weakTopics.join(", ") || "none recorded"}; common slips: ${p.misconceptions.join("; ") || "none"}.`,
          },
        ],
        temperature: 0.5,
        max_tokens: 700,
      }),
      20000
    );
    const raw = res.choices[0]?.message?.content ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (parsed?.steps?.length >= 3) {
      return Response.json({ data: { steps: parsed.steps.slice(0, 5).map((s: Step) => ({ title: String(s.title).slice(0, 90), detail: String(s.detail ?? "").slice(0, 160) })), why: String(parsed.why ?? "").slice(0, 400), source: "ai" } });
    }
  } catch {
    /* fall through */
  }
  return Response.json({ data: { ...fallbackPlan(topic, p.pace, p.prefers), source: "template" } });
}
