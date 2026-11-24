import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/public/portfolio/:tutorId — Verified Teaching Portfolio (spec §29).
 * Public and shareable for APPROVED tutors only. Shows what was verified and
 * when — never the documents, contact details or student data.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, avatarColor: true, city: true, role: true, status: true } });
  const p = user ? await db.tutorProfile.findUnique({ where: { userId: id } }) : null;
  if (!user || !p || user.role !== "tutor" || user.status !== "active" || p.status !== "approved") {
    return Response.json({ error: { code: "NOT_FOUND", message: "This portfolio isn't public." } }, { status: 404 });
  }
  const parse = <T,>(s: string, d: T): T => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return d;
    }
  };
  const [docs, reviews, subjects] = await Promise.all([
    db.tutorDocument.findMany({ where: { tutorId: p.id, status: "verified" }, select: { type: true, name: true, issuer: true, uploadedAt: true } }),
    db.booking.findMany({ where: { tutorId: id, rating: { not: null }, reviewComment: { not: null } }, orderBy: { startAt: "desc" }, take: 4, select: { rating: true, reviewComment: true, subject: true, startAt: true } }),
    db.booking.findMany({ where: { tutorId: id }, select: { subject: true, board: true, grade: true }, distinct: ["subject", "board"] }),
  ]);
  const LABEL: Record<string, string> = { civil_id: "Identity verified", degree: "Qualification verified", teaching_cert: "Teaching certificate verified", background_check: "Police verification", conduct: "Code of conduct signed" };
  return Response.json({
    data: {
      id,
      name: user.name,
      color: user.avatarColor,
      city: user.city,
      headline: p.headline,
      bio: p.bio,
      years: p.yearsExperience,
      rating: p.rating,
      reviewCount: p.reviewCount,
      sessionsDone: p.sessionsDone,
      trustScore: p.trustScore,
      badges: parse<string[]>(p.badges, []),
      languages: parse<string[]>(p.languages, []),
      modes: parse<string[]>(p.modes, []),
      qualifications: parse<{ title: string; issuer: string; year: number; status: string }[]>(p.qualifications, []).map((q) => ({ title: q.title, issuer: q.issuer, year: q.year, verified: q.status === "verified" })),
      experience: parse<{ role: string; org: string; from?: string; to?: string; verified?: boolean }[]>(p.experience, []).map((e) => ({ role: e.role, org: e.org, from: e.from, to: e.to, confirmed: !!e.verified })),
      verifications: docs.map((d) => ({ label: LABEL[d.type] ?? d.name, issuer: d.issuer, at: d.uploadedAt })),
      teaches: subjects.map((s) => ({ subject: s.subject, board: s.board, grade: s.grade })),
      reviews: reviews.map((r) => ({ rating: r.rating, text: r.reviewComment, subject: r.subject, at: r.startAt })),
    },
  });
}
