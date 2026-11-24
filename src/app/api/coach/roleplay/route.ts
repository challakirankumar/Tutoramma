import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";
import { withTimeout } from "@/lib/xp";

const PERSONAS: Record<string, string> = {
  shy: "a shy Grade 8 student with low prior knowledge who answers in very few words and rarely asks questions",
  careless: "a fast but careless Grade 8 student who rushes, skips steps and makes arithmetic slips while sounding confident",
  anxious: "a Grade 8 student who is anxious about maths, says things like 'I'm bad at this' and needs reassurance",
};

interface Turn {
  role: "tutor" | "student";
  text: string;
}

/** Heuristic feedback on tutor turns — clarity, pacing, questioning, wait time (0-100). */
function heuristicFeedback(turns: Turn[]) {
  const mine = turns.filter((t) => t.role === "tutor").map((t) => t.text);
  if (!mine.length) return { clarity: 0, pacing: 0, questioning: 0, waitTime: 0, tip: "Start by asking the student what they already know." };
  const avgWords = mine.reduce((a, t) => a + t.split(/\s+/).length, 0) / mine.length;
  const questions = mine.filter((t) => t.includes("?")).length / mine.length;
  const openQ = mine.filter((t) => /\b(why|how|what do you notice|explain|tell me)\b/i.test(t)).length / mine.length;
  const praise = mine.filter((t) => /\b(good|nice|great|well done|exactly|right)\b/i.test(t)).length / mine.length;
  const clamp = (n: number) => Math.max(5, Math.min(98, Math.round(n)));
  const clarity = clamp(100 - Math.abs(avgWords - 22) * 2.2);
  const pacing = clamp(avgWords > 45 ? 40 : avgWords < 6 ? 50 : 78);
  const questioning = clamp(30 + questions * 40 + openQ * 30);
  const waitTime = clamp(35 + openQ * 40 + praise * 20 - (avgWords > 40 ? 15 : 0));
  const tip =
    waitTime < 55
      ? "Pause about 3 seconds after a question. Ask “what do you notice?” before explaining."
      : questioning < 60
        ? "Turn statements into questions — let the student find the next step."
        : clarity < 60
          ? "Shorten your turns: one idea, one example, one check."
          : "Strong turn-taking. Try a reteach with a different representation next.";
  return { clarity, pacing, questioning, waitTime, tip };
}

/** POST /api/coach/roleplay — { persona, topic, turns } → simulated student reply + coach feedback. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  let b: { persona?: string; topic?: string; turns?: Turn[] };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const persona = PERSONAS[b.persona ?? ""] ?? PERSONAS.shy;
  const topic = String(b.topic ?? "the topic").slice(0, 120);
  const turns = (b.turns ?? []).slice(-14).map((t) => ({ role: t.role === "tutor" ? "tutor" : "student", text: String(t.text).slice(0, 600) })) as Turn[];
  const feedback = heuristicFeedback(turns);

  let reply = "";
  try {
    const zai = await ZAI.create();
    const res = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: "system", content: `Role-play ${persona}, learning "${topic}". Stay in character. Reply as the student only, in 1-2 short sentences, sometimes with a realistic misconception. Never act as the teacher. Plain text.` },
          ...turns.map((t) => ({ role: (t.role === "tutor" ? "user" : "assistant") as "user" | "assistant", content: t.text })),
        ],
        temperature: 0.8,
        max_tokens: 120,
      }),
      15000
    );
    reply = res.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") ?? "";
  } catch {
    /* fallback below */
  }
  if (!reply) {
    const canned: Record<string, string[]> = {
      shy: ["Umm… I don't know.", "Is it… multiply?", "Okay.", "I think I get it a little."],
      careless: ["Easy, it's 60! Wait… or 75?", "I just divided, done.", "Can we skip to the hard ones?", "Oh, I forgot to carry the one."],
      anxious: ["I'm really bad at this…", "What if I get it wrong again?", "Can you show me one more time?", "Oh. That's actually not that scary."],
    };
    const list = canned[b.persona ?? "shy"] ?? canned.shy;
    reply = list[turns.filter((t) => t.role === "tutor").length % list.length];
  }
  return Response.json({ data: { reply, feedback } });
}
