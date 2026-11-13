import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";
import { cardsFromCurriculum, cardsFromNotes, parseCardJson, type CardDraft } from "@/lib/learning";
import { withTimeout } from "@/lib/xp";

const DECK_COLORS = ["#315BE5", "#F47B20", "#1F9D68", "#8B5CF6", "#E8A20C", "#C03342", "#14246B", "#0EA5E9"];

/** GET /api/flashcards — the caller's decks with due / new / mastered counts. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const now = new Date();
  const decks = await db.flashDeck.findMany({
    where: { ownerId: auth.id },
    orderBy: { createdAt: "desc" },
    include: { cards: { select: { dueAt: true, reps: true, interval: true, lastReviewedAt: true } } },
  });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  let reviewedToday = 0;
  const data = decks.map((d) => {
    const due = d.cards.filter((c) => c.dueAt <= now).length;
    const fresh = d.cards.filter((c) => c.reps === 0).length;
    const mastered = d.cards.filter((c) => c.interval >= 21).length;
    reviewedToday += d.cards.filter((c) => c.lastReviewedAt && c.lastReviewedAt >= startOfDay).length;
    return {
      id: d.id,
      title: d.title,
      subject: d.subject,
      topic: d.topic,
      source: d.source,
      color: d.color,
      createdAt: d.createdAt,
      total: d.cards.length,
      due,
      fresh,
      mastered,
    };
  });
  const totals = data.reduce(
    (a, d) => ({ cards: a.cards + d.total, due: a.due + d.due, mastered: a.mastered + d.mastered }),
    { cards: 0, due: 0, mastered: 0 }
  );
  return Response.json({ data: { decks: data, totals: { ...totals, reviewedToday } } });
}

/**
 * POST /api/flashcards — create a deck.
 * { subject, topic, notes?, count?, cards? }  ->  AI (Workers AI) generates
 * cards; falls back to notes-based cloze cards or curriculum recall cards.
 * Passing `cards` creates a manual deck.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let body: { subject?: string; topic?: string; notes?: string; count?: number; cards?: CardDraft[]; title?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const subject = String(body.subject ?? "").trim().slice(0, 60);
  const topic = String(body.topic ?? "").trim().slice(0, 120);
  const notes = String(body.notes ?? "").trim().slice(0, 6000);
  const count = Math.min(20, Math.max(4, Number(body.count) || 10));
  if (!topic && !notes && !body.cards?.length) return badRequest("Add a topic, paste some notes or write your own cards.", "VALIDATION_ERROR", { topic: "Required" });

  const profile = await db.studentProfile.findUnique({ where: { userId: auth.id }, select: { grade: true, boardId: true } });
  const grade = profile?.grade ?? "Grade 8";

  let cards: CardDraft[] = [];
  let source = "manual";

  if (body.cards?.length) {
    cards = body.cards
      .map((c) => ({ front: String(c.front ?? "").trim().slice(0, 300), back: String(c.back ?? "").trim().slice(0, 600), hint: String(c.hint ?? "").slice(0, 140) }))
      .filter((c) => c.front && c.back)
      .slice(0, 60);
  } else {
    try {
      const zai = await ZAI.create();
      const res = await withTimeout(
        zai.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are an expert teacher who writes high-quality study flashcards for school students. Return STRICT JSON only: an array of objects {\"front\": string, \"back\": string, \"hint\": string}. Fronts are crisp questions (definitions, why/how, formulas, worked mini-problems, common mistakes). Backs are accurate, concise answers (max 2 sentences, include the formula or key fact). Hints are a tiny nudge (max 8 words). No markdown, no numbering, no commentary.",
            },
            {
              role: "user",
              content: `Create exactly ${count} flashcards for a ${grade}${profile?.boardId ? ` ${profile.boardId}` : ""} student.\nSubject: ${subject || "General"}\nTopic: ${topic || "from the notes"}${notes ? `\nBase the cards ONLY on these notes:\n"""${notes}"""` : ""}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 2200,
        }),
        25000
      );
      cards = parseCardJson(res.choices[0]?.message?.content ?? "").slice(0, count);
      if (cards.length >= 3) source = "ai";
    } catch {
      cards = [];
    }
    if (cards.length < 3) {
      cards = notes ? cardsFromNotes(notes, count) : [];
      source = "notes";
      if (cards.length < 3) {
        cards = cardsFromCurriculum(subject, grade, topic, count);
        source = "curriculum";
      }
    }
  }
  if (!cards.length) return badRequest("Couldn't build cards from that input — try a clearer topic or longer notes.");

  const existing = await db.flashDeck.count({ where: { ownerId: auth.id } });
  const deck = await db.flashDeck.create({
    data: {
      ownerId: auth.id,
      title: (body.title?.trim() || topic || notes.split(/[.\n]/)[0] || "My deck").slice(0, 80),
      subject: subject || "General",
      topic,
      source,
      color: DECK_COLORS[existing % DECK_COLORS.length],
    },
  });
  await db.flashcard.createMany({ data: cards.map((c) => ({ deckId: deck.id, front: c.front, back: c.back, hint: c.hint ?? "" })) });
  return Response.json({ data: { id: deck.id, cards: cards.length, source } }, { status: 201 });
}
