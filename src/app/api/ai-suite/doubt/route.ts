import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";
import { aiJson } from "@/lib/ai-json";

/** POST /api/ai-suite/doubt — { image (data URL) , note? } → step-by-step help (Doubt Scanner, spec §16). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let b: { image?: string; note?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const image = String(b.image ?? "");
  const note = String(b.note ?? "").slice(0, 600);
  if (!image.startsWith("data:image/") && !note) return badRequest("Add a photo of the problem or type it.");
  if (image.length > 4_500_000) return badRequest("That photo is too large — please crop it to the problem.");

  const out = await aiJson<{ problem: string; topic: string; steps: string[]; check: string; confidence: string }>(
    `You are a careful school tutor. Read the student's problem${image ? " from the photo" : ""}. Return STRICT JSON {"problem": string (the problem restated), "topic": string, "steps": string[] (3-6 numbered teaching steps that lead the student to the method; for graded-looking homework stop before the final answer and say "Now finish the last step"), "check": string (one question to check understanding), "confidence": "high"|"medium"|"low"}. If the image is unreadable, set confidence "low" and ask for a clearer photo in "problem".`,
    note ? `Student note: ${note}` : "Help me with this problem.",
    { vision: image || undefined, max_tokens: 800, timeoutMs: 30000 }
  );
  if (!out?.steps?.length) {
    return Response.json(
      { error: { code: "AI_UNAVAILABLE", message: "Couldn't read that clearly — try a sharper, well-lit photo, or type the question. Your tutor can also help." } },
      { status: 503 }
    );
  }
  return Response.json({ data: { ...out, steps: out.steps.slice(0, 6).map(String) } });
}
