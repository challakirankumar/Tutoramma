import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";
import { aiJson } from "@/lib/ai-json";

interface Q {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
  level: number;
}

/** Procedural maths items so Adaptive Practice always works offline. Level 1 (easy) … 5 (hard). */
function procedural(level: number, seed: number): Q {
  const r = (n: number) => Math.floor(((Math.sin(seed++ * 9301 + 49297) + 1) / 2) * n);
  const pick = <T,>(arr: T[]) => arr[r(arr.length)];
  let q: string, ans: number, expl: string;
  if (level <= 1) {
    const a = 3 + r(9), b = 2 + r(8);
    q = `${a} notebooks cost ₹${a * b * 5}. What does 1 notebook cost?`;
    ans = b * 5;
    expl = `Unitary method: ${a * b * 5} ÷ ${a} = ₹${ans}.`;
  } else if (level === 2) {
    const s = 20 + r(40), t = 2 + r(4);
    q = `A cyclist covers ${s * t} km in ${t} hours. How far in ${t + 2} hours at the same speed?`;
    ans = s * (t + 2);
    expl = `Speed = ${s * t} ÷ ${t} = ${s} km/h; distance = ${s} × ${t + 2} = ${ans} km.`;
  } else if (level === 3) {
    const w = 4 + r(6), d = 6 + r(10);
    q = `${w} workers finish a wall in ${d * 2} days. How many days will ${w * 2} workers take?`;
    ans = d;
    expl = `Inverse proportion: ${w} × ${d * 2} = ${w * 2} × x ⇒ x = ${d} days.`;
  } else if (level === 4) {
    const a = 2 + r(6), b = 3 + r(6);
    q = `Factorise and find the sum of the constants: x² + ${a + b}x + ${a * b}`;
    ans = a + b;
    expl = `x² + ${a + b}x + ${a * b} = (x + ${a})(x + ${b}); ${a} + ${b} = ${ans}.`;
  } else {
    const p = 1000 * (2 + r(8)), rate = pick([5, 8, 10, 12]);
    q = `Find the compound interest on ₹${p} for 2 years at ${rate}% per annum (compounded yearly).`;
    ans = Math.round(p * ((1 + rate / 100) ** 2 - 1));
    expl = `A = ${p}(1 + ${rate}/100)² = ₹${p + ans}; CI = A − P = ₹${ans}.`;
  }
  const opts = [...new Set([ans, ans + 1 + r(5), Math.max(1, ans - 1 - r(5)), Math.round(ans * 1.5)])];
  while (opts.length < 4) opts.push(ans + opts.length * 7);
  const shuffled = opts.slice(0, 4).sort(() => r(3) - 1);
  return { q, options: shuffled.map(String), answer: shuffled.indexOf(ans), explanation: expl, level };
}

/** POST /api/ai-suite/practice — { subject, topic, level } → one question at the learner's level. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let b: { subject?: string; topic?: string; level?: number; seed?: number };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const level = Math.min(5, Math.max(1, Math.round(Number(b.level) || 2)));
  const subject = String(b.subject ?? "Mathematics").slice(0, 40);
  const topic = String(b.topic ?? "").slice(0, 80);
  const seed = Number(b.seed) || Date.now() % 100000;

  if (topic) {
    const ai = await aiJson<{ q: string; options: string[]; answer: number; explanation: string }>(
      'Write ONE multiple-choice question for an Indian school student. Return STRICT JSON {"q": string, "options": [4 strings], "answer": index 0-3, "explanation": string (one or two sentences with the worked step)}. Verify the answer is correct.',
      `Subject: ${subject}. Topic: ${topic}. Difficulty level ${level} of 5 (1 = basic recall, 5 = multi-step application). Vary the question (seed ${seed}).`,
      { temperature: 0.7, max_tokens: 400, timeoutMs: 15000 }
    );
    if (ai?.q && Array.isArray(ai.options) && ai.options.length === 4 && ai.answer >= 0 && ai.answer < 4) {
      return Response.json({ data: { q: ai.q, options: ai.options.map(String), answer: ai.answer, explanation: String(ai.explanation ?? ""), level, source: "ai" } });
    }
  }
  return Response.json({ data: { ...procedural(level, seed), source: "bank" } });
}
