import { db } from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

/**
 * GET /api/notifications — only DUE notifications for the current user:
 * scheduledAt is null OR scheduledAt <= now (future-dated rows are spaced-
 * revision nudges that must not be delivered early). Ordered by
 * (scheduledAt ?? createdAt) desc.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const now = new Date();
  const due = await db.notification.findMany({
    where: { userId: auth.id, OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    take: 120,
  });
  const notes = due
    .sort((a, b) => {
      const at = (n: { scheduledAt: Date | null; createdAt: Date }) =>
        (n.scheduledAt ?? n.createdAt).getTime();
      return at(b) - at(a);
    })
    .slice(0, 30);

  return Response.json({ data: notes, meta: { unread: notes.filter((n) => !n.read).length } });
}

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id, all } = await req.json().catch(() => ({}));
  const dueFilter = {
    userId: auth.id,
    read: false,
    /* never silently mark a future-dated (undelivered) notification as read */
    OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
  };
  if (all) {
    await db.notification.updateMany({ where: dueFilter, data: { read: true } });
  } else if (id) {
    await db.notification.updateMany({ where: { id, userId: auth.id }, data: { read: true } });
  }
  return Response.json({ data: { ok: true } });
}
