import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest, notFound } from "@/lib/auth";
import { scheduleReview, type Rating } from "@/lib/learning";
import { awardXp } from "@/lib/xp";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

/** POST /api/flashcards/review — { cardId, rating } -> SM-2 reschedule + 2 XP per review. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let body: { cardId?: string; rating?: Rating };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  if (!body.cardId || !RATINGS.includes(body.rating as Rating)) return badRequest("cardId and a valid rating are required.");
  const card = await db.flashcard.findUnique({ where: { id: body.cardId }, include: { deck: { select: { ownerId: true } } } });
  if (!card || card.deck.ownerId !== auth.id) return notFound("Card not found.");
  const next = scheduleReview(card, body.rating as Rating);
  await db.flashcard.update({
    where: { id: card.id },
    data: { ease: next.ease, interval: next.interval, reps: next.reps, lapses: next.lapses, dueAt: next.dueAt, lastReviewedAt: new Date() },
  });
  const xp = await awardXp(auth.id, body.rating === "again" ? 1 : 2);
  return Response.json({ data: { ...next, xp } });
}
