import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** All disputes with booking context (admin only). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const disputes = await db.dispute.findMany({ orderBy: { createdAt: "desc" } });

  /* Dispute has no booking relation — join manually */
  const bookingIds = [...new Set(disputes.map((d) => d.bookingId))];
  const bookings = await db.booking.findMany({
    where: { id: { in: bookingIds } },
    include: { payment: { select: { id: true, status: true, total: true } } },
  });
  const bmap = new Map(bookings.map((b) => [b.id, b]));

  /* tutor/student names for booking context */
  const userIds = new Set<string>();
  for (const b of bookings) {
    userIds.add(b.tutorId);
    userIds.add(b.studentId);
  }
  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, avatarColor: true },
  });
  const umap = new Map(users.map((u) => [u.id, u]));

  const data = disputes.map((d) => {
    const b = bmap.get(d.bookingId);
    return {
      id: d.id,
      reason: d.reason,
      status: d.status,
      resolution: d.resolution,
      raisedBy: d.raisedBy,
      createdAt: d.createdAt,
      booking: b
        ? {
            id: b.id,
            title: b.title,
            subject: b.subject,
            board: b.board,
            grade: b.grade,
            mode: b.mode,
            state: b.state,
            startAt: b.startAt,
            total: b.total,
            tutor: { name: umap.get(b.tutorId)?.name ?? "—", color: umap.get(b.tutorId)?.avatarColor ?? "#315BE5" },
            student: { name: umap.get(b.studentId)?.name ?? "—", color: umap.get(b.studentId)?.avatarColor ?? "#315BE5" },
            payment: b.payment,
          }
        : null,
    };
  });
  return Response.json({ data });
}
