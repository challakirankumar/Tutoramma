import { db } from "@/lib/db";
import { getAuthUser, unauthorized, notFound } from "@/lib/auth";

/**
 * GET /api/tutors/[id] — full profile (id = userId)
 * card fields + bio, qualifications, experience, resolved offerings,
 * reviews (from rated bookings) and availableSlots for the next 7 days.
 * NOTE: Offering has no Prisma relations — names resolved manually.
 */

const SESSION_MIN = 45; // 45-minute sessions

/** Slot grid: next 7 days, 15:00–20:00, starts every 30 minutes (17:00, 18:30 …). */
function buildSlotGrid(now: Date, days = 7): Date[] {
  const slots: Date[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    for (let h = 15; h <= 19; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day);
        s.setHours(h, m, 0, 0);
        if (s.getTime() > now.getTime() + 30 * 60 * 1000) slots.push(s);
      }
    }
  }
  return slots;
}

function slotLabel(d: Date): string {
  const wd = d.toLocaleDateString("en-IN", { weekday: "short" });
  const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${wd} ${t}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const profile = await db.tutorProfile.findFirst({
    where: { userId: id, status: "approved" },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });
  if (!profile) return notFound("Tutor not found or not verified yet.");

  /* resolve offering names (offerings may store cuids or logical keys) */
  const [rawOfferings, boards, grades, subjects] = await Promise.all([
    db.offering.findMany({ where: { tutorId: profile.id } }),
    db.curriculumBoard.findMany({ select: { id: true, code: true, name: true } }),
    db.curriculumGrade.findMany({ select: { id: true, name: true } }),
    db.curriculumSubject.findMany({ select: { id: true, name: true } }),
  ]);
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const boardByCode = new Map(boards.map((b) => [b.code, b]));
  const gradeMap = new Map(grades.map((g) => [g.id, g.name]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const resolveGrade = (key: string) => gradeMap.get(key) ?? (key.includes("|") ? key.split("|").slice(1).join("|") : key);
  const resolveSubject = (key: string) => subjectMap.get(key) ?? (key.includes("|") ? key.split("|").pop()! : key);
  const offerings = rawOfferings.map((o) => {
    const b = boardById.get(o.boardId) ?? boardByCode.get(o.boardId);
    return {
      id: o.id,
      mode: o.mode,
      board: b?.name ?? o.boardId,
      boardCode: b?.code ?? o.boardId,
      grade: resolveGrade(o.gradeId),
      subject: resolveSubject(o.subjectId),
      price: o.price,
    };
  });

  /* reviews from rated bookings (student names joined manually) */
  const rated = await db.booking.findMany({
    where: { tutorId: id, rating: { not: null } },
    orderBy: { startAt: "desc" },
    take: 12,
  });
  const studentIds = Array.from(new Set(rated.map((b) => b.studentId)));
  const students = studentIds.length
    ? await db.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s.name]));
  const reviews = rated.map((b) => ({
    name: studentMap.get(b.studentId) ?? "Student",
    rating: b.rating ?? 0,
    comment: b.reviewComment ?? "",
    at: b.startAt,
  }));

  /* slot availability — exclude conflicts with existing bookings */
  const now = new Date();
  const grid = buildSlotGrid(now);
  const busy = await db.booking.findMany({
    where: {
      tutorId: id,
      state: { notIn: ["cancelled", "declined"] },
      startAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      endAt: { lte: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000) },
    },
    select: { startAt: true, endAt: true },
  });
  const availableSlots = grid
    .filter((s) => {
      const e = new Date(s.getTime() + SESSION_MIN * 60 * 1000);
      return !busy.some((b) => s < b.endAt && b.startAt < e);
    })
    .map((s) => ({ startAt: s.toISOString(), label: slotLabel(s) }));

  const badges: string[] = JSON.parse(profile.badges || "[]");
  const modes: string[] = JSON.parse(profile.modes || "[]");
  const languages: string[] = JSON.parse(profile.languages || "[]");

  return Response.json({
    data: {
      id: profile.user.id,
      name: profile.user.name,
      color: profile.user.avatarColor,
      headline: profile.headline,
      rating: profile.rating,
      reviews, // full review list (profile contract) — count kept separately below
      reviewCount: profile.reviewCount,
      trustScore: profile.trustScore,
      years: profile.yearsExperience,
      badges,
      modes,
      languages,
      rateOnline: profile.rateOnline,
      rateHome: profile.rateHome,
      responseMins: profile.responseMins,
      sessionsDone: profile.sessionsDone,
      whyMatched: badges.slice(0, 4),
      subjects: Array.from(new Set(offerings.map((o) => o.subject))),
      boards: Array.from(new Set(offerings.map((o) => o.board))),
      bio: profile.bio,
      qualifications: JSON.parse(profile.qualifications || "[]"),
      experience: JSON.parse(profile.experience || "[]"),
      offerings,
      availableSlots,
    },
  });
}
