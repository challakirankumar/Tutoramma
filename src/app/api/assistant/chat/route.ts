import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";

/**
 * POST /api/assistant/chat — AI Study Buddy (students only).
 *
 * A Socratic, curriculum-aware study companion: it guides with hints and
 * questions instead of dumping answers, adapts to the student's grade and
 * board, and keeps replies short and exam-focused.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("The Study Buddy is a student companion.");

  const body = (await req.json().catch(() => null)) as {
    messages?: { role: "user" | "assistant"; content: string }[];
  } | null;

  const history = (body?.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()
  );
  if (!history.length) return badRequest("Say something to your Study Buddy first.");
  if (history.length > 24) history.splice(0, history.length - 24);

  /* personalise with the student's curriculum */
  const profile = await db.studentProfile.findUnique({
    where: { userId: auth.id },
    select: { grade: true, boardId: true, weakTopics: true },
  });
  let boardName = "";
  if (profile?.boardId) {
    const board = await db.curriculumBoard.findFirst({
      where: { OR: [{ id: profile.boardId }, { code: profile.boardId }] },
      select: { name: true },
    });
    boardName = board?.name ?? "";
  }
  let weakTopics: string[] = [];
  try {
    weakTopics = JSON.parse(profile?.weakTopics || "[]");
  } catch {}

  const persona = [
    "You are \"Amma\", the AI Study Buddy inside the Tutor Amma learning platform.",
    "You help school students (ages 8–18) understand their school subjects deeply.",
    "Teaching style — always follow these rules:",
    "1. Be Socratic: guide with small hints and questions before revealing any final answer. If a student asks for a direct homework answer, first help them attempt it, then confirm/correct.",
    "2. Keep replies SHORT (under 180 words), warm and encouraging. Use simple language, tiny analogies and worked steps.",
    "3. Format with short paragraphs and dashes; use **bold** for key terms. End with one quick check-question to test understanding.",
    "4. Never tutor content that is not educational. Politely redirect anything unrelated to studying.",
    profile ? `The student is in ${profile.grade}${boardName ? ` following the ${boardName} board` : ""}.` : "",
    weakTopics.length ? `Their known weak topics: ${weakTopics.slice(0, 6).join(", ")} — weave in gentle practice when relevant.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: persona },
        ...history.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
      ],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error("empty");
    return Response.json({ data: { reply } });
  } catch {
    return Response.json(
      { error: { code: "AI_UNAVAILABLE", message: "Amma is catching her breath — please try again in a moment." } },
      { status: 503 }
    );
  }
}
