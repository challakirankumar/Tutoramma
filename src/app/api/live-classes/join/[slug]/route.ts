import { db } from "@/lib/db";
import { notFound } from "@/lib/auth";

/**
 * GET /api/live-classes/join/[slug] — PUBLIC.
 * Anyone holding the join link sees the class card (title, teacher, time,
 * status) without any personal data — this powers guest joining.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  /* accept either the secret link slug or the human-friendly code (TA-XXXXXX) */
  const c = await db.liveClass.findUnique({ where: { slug } }).catch(() => null)
    ?? (slug.toUpperCase().startsWith("TA-") ? await db.liveClass.findUnique({ where: { code: slug.toUpperCase() } }) : null);
  if (!c) return notFound("This class link is not valid — ask your teacher for a fresh link.");

  const tutor = await db.user.findUnique({ where: { id: c.tutorId }, select: { name: true, avatarColor: true } });
  const batch = c.batchId ? await db.batch.findUnique({ where: { id: c.batchId }, select: { title: true } }) : null;

  return Response.json({
    data: {
      id: c.id,
      slug: c.slug, // canonical room key — guests arriving via TA-code must join the host's room
      title: c.title,
      subject: c.subject,
      board: c.board,
      grade: c.grade,
      agenda: c.agenda,
      batchTitle: batch?.title ?? null,
      scheduledAt: c.scheduledAt,
      durationMin: c.durationMin,
      code: c.code,
      status: c.status,
      waitingRoom: c.waitingRoom,
      allowChat: c.allowChat,
      tutorName: tutor?.name ?? "Teacher",
      tutorColor: tutor?.avatarColor ?? "#315BE5",
    },
  });
}
