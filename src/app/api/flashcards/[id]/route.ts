import { db } from "@/lib/db";
import { getAuthUser, unauthorized, notFound } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/flashcards/:id[?mode=all] — deck with its review queue (due cards first, then new). */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const deck = await db.flashDeck.findFirst({ where: { id, ownerId: auth.id }, include: { cards: { orderBy: { dueAt: "asc" } } } });
  if (!deck) return notFound("Deck not found.");
  const all = new URL(req.url).searchParams.get("mode") === "all";
  const now = new Date();
  const queue = all ? deck.cards : deck.cards.filter((c) => c.dueAt <= now);
  return Response.json({
    data: {
      id: deck.id,
      title: deck.title,
      subject: deck.subject,
      topic: deck.topic,
      color: deck.color,
      source: deck.source,
      total: deck.cards.length,
      queue: queue.map((c) => ({ id: c.id, front: c.front, back: c.back, hint: c.hint, ease: c.ease, interval: c.interval, reps: c.reps, lapses: c.lapses, dueAt: c.dueAt })),
    },
  });
}

/** DELETE /api/flashcards/:id */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const deck = await db.flashDeck.findFirst({ where: { id, ownerId: auth.id }, select: { id: true } });
  if (!deck) return notFound("Deck not found.");
  await db.flashcard.deleteMany({ where: { deckId: id } });
  await db.flashDeck.delete({ where: { id } });
  return Response.json({ data: { ok: true } });
}
