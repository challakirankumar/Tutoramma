import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/resources/:id — full content for the author or anyone who got it. */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const r = await db.resource.findUnique({ where: { id } });
  if (!r || r.status === "removed") return notFound("Resource not found.");
  const owned = r.authorId === auth.id || !!(await db.resourcePurchase.findUnique({ where: { resourceId_userId: { resourceId: id, userId: auth.id } } }));
  if (!owned) return forbidden("Get this resource first.");
  const author = await db.user.findUnique({ where: { id: r.authorId }, select: { name: true } });
  return Response.json({ data: { ...r, authorName: author?.name ?? "Tutor" } });
}

/**
 * POST /api/resources/:id — { action: "get" } claims a free resource or buys a paid one
 * from the wallet (85% to the author, 15% platform); { action: "rate", rating } rates it;
 * { action: "remove" } (author) unpublishes it.
 */
export async function POST(req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  let b: { action?: string; rating?: number };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const r = await db.resource.findUnique({ where: { id } });
  if (!r || r.status === "removed") return notFound("Resource not found.");

  if (b.action === "remove") {
    if (r.authorId !== auth.id) return forbidden();
    await db.resource.update({ where: { id }, data: { status: "removed" } });
    return Response.json({ data: { ok: true } });
  }

  const existing = await db.resourcePurchase.findUnique({ where: { resourceId_userId: { resourceId: id, userId: auth.id } } });

  if (b.action === "rate") {
    const rating = Math.round(Number(b.rating));
    if (!existing) return forbidden("Only people who got this resource can rate it.");
    if (rating < 1 || rating > 5) return badRequest("Rating must be 1 to 5.");
    const prev = existing.rating;
    await db.resourcePurchase.update({ where: { id: existing.id }, data: { rating } });
    const count = r.ratings + (prev ? 0 : 1);
    const avg = (r.rating * r.ratings - (prev ?? 0) + rating) / Math.max(1, count);
    await db.resource.update({ where: { id }, data: { rating: Math.round(avg * 10) / 10, ratings: count } });
    return Response.json({ data: { rating: Math.round(avg * 10) / 10 } });
  }

  if (r.authorId === auth.id) return badRequest("You are the author of this resource.");
  if (existing) return Response.json({ data: { ok: true, already: true } });

  if (r.price > 0) {
    const w = await db.wallet.findUnique({ where: { userId: auth.id } });
    if (!w || w.available < r.price) {
      return Response.json({ error: { code: "INSUFFICIENT_FUNDS", message: `Add ₹${((r.price - (w?.available ?? 0)) / 100).toFixed(0)} to your wallet to get this resource.` } }, { status: 402 });
    }
    await db.wallet.update({ where: { userId: auth.id }, data: { available: w.available - r.price } });
    const share = Math.round(r.price * 0.85);
    const aw = await db.wallet.findUnique({ where: { userId: r.authorId } });
    if (aw) await db.wallet.update({ where: { userId: r.authorId }, data: { available: aw.available + share } });
    else await db.wallet.create({ data: { userId: r.authorId, available: share } });
  }
  await db.resourcePurchase.create({ data: { resourceId: id, userId: auth.id, price: r.price } });
  await db.resource.update({ where: { id }, data: { downloads: r.downloads + 1 } });
  if (r.price > 0) await db.notification.create({ data: { userId: r.authorId, title: `Resource sold · ${r.title}`, body: `${auth.name} bought it for ₹${(r.price / 100).toFixed(0)}. ₹${((r.price * 0.85) / 100).toFixed(0)} added to your wallet.`, type: "payment" } });
  return Response.json({ data: { ok: true } }, { status: 201 });
}
