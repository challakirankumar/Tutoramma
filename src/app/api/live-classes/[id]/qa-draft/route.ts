import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound } from "@/lib/auth";
import ZAI from "@/lib/ai";

/**
 * POST /api/live-classes/[id]/qa-draft — host-only.
 * Drafts a concise, exam-accurate answer to a live Q&A question.
 * 15s guard, plain-text output, labelled fallback — never throws.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return notFound("Live class not found.");
  if (c.tutorId !== auth.id) return forbidden("Only the class host can draft Q&A answers.");

  const body = (await req.json().catch(() => ({}))) as { question?: string; subject?: string; grade?: string; board?: string };
  const question = String(body.question ?? "").trim().slice(0, 400);
  if (!question) return Response.json({ data: { draft: "", aiDraft: true } });

  let draft = "";
  try {
    const zai = await ZAI.create();
    const res = await Promise.race([
      zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content:
              "You are an expert school tutor. Answer the student's question concisely and exam-accurately in 2-4 sentences. Use simple language. Return plain text only — no markdown, no JSON, no preamble.",
          },
          {
            role: "user",
            content: [
              `Subject: ${body.subject || c.subject}`,
              body.grade ? `Grade: ${body.grade}` : c.grade ? `Grade: ${c.grade}` : "",
              body.board || c.board ? `Board: ${body.board || c.board}` : "",
              `Question: ${question}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
        thinking: { type: "disabled" },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    draft = (res.choices[0]?.message?.content ?? "").trim().slice(0, 1200);
  } catch {
    draft = "";
  }

  if (!draft) draft = "AI draft unavailable right now — answer manually.";

  return Response.json({ data: { draft, aiDraft: true } });
}
