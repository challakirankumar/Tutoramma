import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";

/**
 * POST /api/live-classes/[id]/captions — host-only.
 * Batch-translates caption lines (English original) to Hindi or Tamil for the
 * simulated live captions. 15s guard, STRICT JSON array response, per-batch
 * module cache, and a labelled fallback that keeps the original lines.
 */

const cache = new Map<string, string[]>();

function hashKey(lines: string[], lang: string) {
  const raw = `${lang}\u0001${lines.join("\u0001")}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return notFound("Live class not found.");
  if (c.tutorId !== auth.id) return forbidden("Only the class host can run live captions.");

  const body = (await req.json().catch(() => ({}))) as { lines?: unknown; lang?: unknown };
  const lang = body.lang === "hi" || body.lang === "ta" ? (body.lang as "hi" | "ta") : null;
  if (!lang) return badRequest('Captions support lang "hi" or "ta".');
  const lines = (Array.isArray(body.lines) ? body.lines : []).map((l) => String(l ?? "").slice(0, 300)).filter(Boolean).slice(0, 40);
  if (!lines.length) return badRequest("Nothing to translate.");

  const key = hashKey(lines, lang);
  const hit = cache.get(key);
  if (hit) return Response.json({ data: { lines: hit, cached: true } });

  const label = lang === "hi" ? "Hindi" : "Tamil";
  let translated: string[] | null = null;
  try {
    const zai = await ZAI.create();
    const res = await Promise.race([
      zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content: `Translate each line to ${label}. Return STRICT JSON: an array of strings, same length and order as the input, nothing else.`,
          },
          { role: "user", content: JSON.stringify(lines) },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        thinking: { type: "disabled" },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    const raw = (res.choices[0]?.message?.content ?? "").trim();
    let arr: unknown = null;
    try {
      arr = JSON.parse(raw);
    } catch {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          arr = JSON.parse(m[0]);
        } catch {}
      }
    }
    if (Array.isArray(arr) && arr.length === lines.length && arr.every((x) => typeof x === "string" && x.trim())) {
      translated = (arr as string[]).map((s) => s.slice(0, 300));
    }
  } catch {
    translated = null;
  }

  if (translated) {
    if (cache.size > 400) cache.clear(); // keep the module cache bounded
    cache.set(key, translated);
    return Response.json({ data: { lines: translated } });
  }

  /* deterministic fallback — original lines with a clear label */
  return Response.json({ data: { lines: lines.map((l) => `${l} (translation unavailable)`), fallback: true } });
}
