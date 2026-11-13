import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Reviews written by students/parents on this tutor's completed sessions. */

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const profile = await db.tutorProfile.findFirst({ where: { userId: auth.id } });
  if (!profile) {
    return Response.json(
      { data: { reviews: [], stats: { avg: 0, count: 0, distribution: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 } }, profile: { rating: 0, reviewCount: 0 } } }
    );
  }

  const reviewed = await db.booking.findMany({
    where: { tutorId: auth.id, rating: { not: null } },
    orderBy: { startAt: "desc" },
  });
  const studentIds = [...new Set(reviewed.map((b) => b.studentId))];
  const students = await db.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, name: true, avatarColor: true },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const distribution: Record<string, number> = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  let sum = 0;
  for (const b of reviewed) {
    const r = b.rating ?? 0;
    sum += r;
    const key = String(Math.min(5, Math.max(1, r)));
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  const reviews = reviewed.map((b) => {
    const s = studentMap.get(b.studentId);
    return {
      id: b.id,
      student: { id: b.studentId, name: s?.name ?? "Student", color: s?.avatarColor ?? "#315BE5" },
      rating: b.rating ?? 0,
      comment: b.reviewComment,
      subject: b.subject,
      title: b.title,
      at: b.startAt,
      mode: b.mode,
    };
  });

  return Response.json({
    data: {
      reviews,
      stats: {
        avg: reviewed.length ? Math.round((sum / reviewed.length) * 10) / 10 : profile.rating,
        count: reviewed.length,
        distribution,
      },
      profile: { rating: profile.rating, reviewCount: profile.reviewCount },
    },
  });
}
