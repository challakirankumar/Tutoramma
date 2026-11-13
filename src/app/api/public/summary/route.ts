import { db } from "@/lib/db";

/** Public landing stats + featured verified tutors (no auth). */
export async function GET() {
  const [tutors, students, bookings, reviews, topTutors] = await Promise.all([
    db.tutorProfile.count({ where: { status: "approved" } }),
    db.studentProfile.count(),
    db.booking.count(),
    db.tutorProfile.aggregate({ _avg: { rating: true }, where: { rating: { gt: 0 } } }),
    db.tutorProfile.findMany({
      where: { status: "approved" },
      orderBy: [{ trustScore: "desc" }],
      take: 4,
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    }),
  ]);
  return Response.json({
    data: {
      stats: {
        tutors,
        students,
        sessions: bookings,
        avgRating: Math.round((reviews._avg.rating ?? 4.7) * 10) / 10,
      },
      featured: topTutors.map((t) => ({
        id: t.userId,
        name: t.user.name,
        color: t.user.avatarColor,
        headline: t.headline,
        rating: t.rating,
        reviews: t.reviewCount,
        badges: JSON.parse(t.badges || "[]") as string[],
        modes: JSON.parse(t.modes || "[]") as string[],
        trustScore: t.trustScore,
        years: t.yearsExperience,
        languages: JSON.parse(t.languages || "[]") as string[],
        rateOnline: t.rateOnline,
        rateHome: t.rateHome,
      })),
    },
  });
}
