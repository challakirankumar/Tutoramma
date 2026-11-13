import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** Verification queue — pending tutors with declared profile + documents (admin only). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const profiles = await db.tutorProfile.findMany({
    where: { status: { in: ["in_review", "submitted", "needs_info"] } },
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
    orderBy: { createdAt: "asc" },
  });

  /* TutorDocument has no relation on TutorProfile — join manually */
  const docs = await db.tutorDocument.findMany({
    where: { tutorId: { in: profiles.map((p) => p.id) } },
    orderBy: { uploadedAt: "asc" },
  });
  const docsBy = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = docsBy.get(d.tutorId) ?? [];
    list.push(d);
    docsBy.set(d.tutorId, list);
  }

  const data = profiles.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.user.name,
    email: p.user.email,
    color: p.user.avatarColor,
    headline: p.headline,
    bio: p.bio,
    status: p.status,
    years: p.yearsExperience,
    trustScore: p.trustScore,
    verificationNote: p.verificationNote,
    modes: JSON.parse(p.modes || "[]") as string[],
    languages: JSON.parse(p.languages || "[]") as string[],
    rateOnline: p.rateOnline,
    rateHome: p.rateHome,
    qualifications: JSON.parse(p.qualifications || "[]") as { title: string; issuer: string; year: number; status: string }[],
    experience: JSON.parse(p.experience || "[]") as { role: string; org: string; from: string; to: string; verified: boolean }[],
    documents: (docsBy.get(p.id) ?? []).map((d) => ({
      id: d.id,
      type: d.type,
      name: d.name,
      issuer: d.issuer,
      status: d.status,
      uploadedAt: d.uploadedAt,
    })),
    submittedAt: p.createdAt,
  }));
  return Response.json({ data });
}
