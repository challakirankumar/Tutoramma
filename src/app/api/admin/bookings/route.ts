import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** All bookings with parties + payment status. Filters: ?state=&mode=&q= (q searches names). */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") || "";
  const mode = searchParams.get("mode") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const bookings = await db.booking.findMany({
    where: {
      ...(state ? { state } : {}),
      ...(mode ? { mode } : {}),
    },
    include: { payment: { include: { invoice: true } } },
    orderBy: { startAt: "desc" },
    take: 200,
  });

  /* manual joins: tutor/student users + addresses (no relations in schema) */
  const userIds = new Set<string>();
  const addressIds = new Set<string>();
  for (const b of bookings) {
    userIds.add(b.tutorId);
    userIds.add(b.studentId);
    if (b.addressId) addressIds.add(b.addressId);
  }
  const [users, addresses] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, avatarColor: true } }),
    db.address.findMany({ where: { id: { in: [...addressIds] } }, select: { id: true, area: true } }),
  ]);
  const umap = new Map(users.map((u) => [u.id, u]));
  const amap = new Map(addresses.map((a) => [a.id, a.area]));

  const rows = bookings
    .filter((b) => {
      if (!q) return true;
      const tutorName = umap.get(b.tutorId)?.name ?? "";
      const studentName = umap.get(b.studentId)?.name ?? "";
      return (
        tutorName.toLowerCase().includes(q) ||
        studentName.toLowerCase().includes(q) ||
        b.title.toLowerCase().includes(q)
      );
    })
    .map((b) => ({
      id: b.id,
      title: b.title,
      subject: b.subject,
      board: b.board,
      grade: b.grade,
      mode: b.mode,
      state: b.state,
      startAt: b.startAt,
      endAt: b.endAt,
      sessionFee: b.sessionFee,
      platformFee: b.platformFee,
      total: b.total,
      rating: b.rating,
      reviewComment: b.reviewComment,
      topics: b.topics,
      policySnapshot: b.policySnapshot,
      addressArea: b.addressId ? amap.get(b.addressId) ?? null : null,
      tutor: { name: umap.get(b.tutorId)?.name ?? "—", color: umap.get(b.tutorId)?.avatarColor ?? "#315BE5" },
      student: { name: umap.get(b.studentId)?.name ?? "—", color: umap.get(b.studentId)?.avatarColor ?? "#315BE5" },
      paymentStatus: b.payment?.status ?? null,
      paymentMethod: b.payment?.method ?? null,
      invoiceNo: b.payment?.invoice?.number ?? null,
      createdAt: b.createdAt,
    }));
  return Response.json({ data: rows });
}
