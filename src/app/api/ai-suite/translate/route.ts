import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";
import { aiJson } from "@/lib/ai-json";

const TO: Record<string, string> = { hi: "Hindi (Devanagari)", hinglish: "Hinglish (Roman script)", kn: "Kannada", ta: "Tamil", te: "Telugu", ml: "Malayalam", mr: "Marathi", bn: "Bengali", en: "simple English" };

/** POST /api/ai-suite/translate — Language Buddy: { text, to } → explanation in the chosen language. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let b: { text?: string; to?: string; simplify?: boolean };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const text = String(b.text ?? "").trim().slice(0, 3000);
  const to = TO[b.to ?? ""] ? (b.to as string) : "hi";
  if (!text) return badRequest("Paste some text to translate.");
  const out = await aiJson<{ text: string; glossary: { term: string; meaning: string }[] }>(
    `Translate study material for an Indian school student into ${TO[to]}. Keep maths, formulas, numbers and subject terms accurate; ${b.simplify ? "simplify the language for a younger reader; " : ""}keep the original meaning. Return STRICT JSON {"text": string, "glossary": [{"term": string (original), "meaning": string (in ${TO[to]})}] (max 6 key terms)}.`,
    text,
    { temperature: 0.2, max_tokens: 1600, timeoutMs: 25000 }
  );
  if (!out?.text) return Response.json({ error: { code: "AI_UNAVAILABLE", message: "Translation is unavailable right now — please try again shortly." } }, { status: 503 });
  return Response.json({ data: { text: out.text, glossary: (out.glossary ?? []).slice(0, 6), to } });
}
