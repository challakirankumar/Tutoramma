import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";

/** Tutor profile: verification state, trust score breakdown, growth coach, editable fields. */

function parseArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const profile = await db.tutorProfile.findFirst({ where: { userId: auth.id } });
  if (!profile) return notFound("Tutor profile not found.");
  const user = await db.user.findUnique({
    where: { id: auth.id },
    select: { id: true, name: true, email: true, avatarColor: true, phone: true, city: true },
  });

  const documents = await db.tutorDocument.findMany({
    where: { tutorId: profile.id },
    orderBy: { uploadedAt: "asc" },
  });
  const offeringCount = await db.offering.count({ where: { tutorId: profile.id } });
  const bookings = await db.booking.findMany({ where: { tutorId: auth.id }, select: { id: true, state: true } });
  const bookingIds = new Set(bookings.map((b) => b.id));

  const openDisputes = (
    await db.dispute.findMany({ where: { status: { in: ["open", "investigating"] } }, select: { bookingId: true } })
  ).filter((d) => bookingIds.has(d.bookingId)).length;

  /* ---- trust score breakdown (weights → /100) ---- */
  const verifiedTypes = new Set(documents.filter((d) => d.status === "verified").map((d) => d.type));
  const verificationScore = clamp((Math.min(verifiedTypes.size, 5) / 5) * 35, 0, 35);
  const ratingScore = clamp((profile.rating / 5) * 25, 0, 25);
  const ended = bookings.filter((b) =>
    ["completed", "released", "cancelled", "no_show", "disputed"].includes(b.state)
  );
  const completed = ended.filter((b) => ["completed", "released"].includes(b.state));
  const completionScore = ended.length === 0 ? 20 : clamp((completed.length / ended.length) * 20, 0, 20);
  const responseScore = clamp((10 * (60 - profile.responseMins)) / 45, 0, 10);
  const disputesScore = clamp(10 * (1 - openDisputes / 3), 0, 10);
  const trustTotal = Math.round(verificationScore + ratingScore + completionScore + responseScore + disputesScore);

  /* ---- profile completeness ---- */
  const qualifications = parseArray(profile.qualifications);
  const experience = parseArray(profile.experience);
  const languages = parseArray(profile.languages).filter((x) => typeof x === "string") as string[];
  const modes = parseArray(profile.modes).filter((x) => typeof x === "string") as string[];
  const badges = parseArray(profile.badges).filter((x) => typeof x === "string") as string[];

  const completenessFields = [
    { key: "headline", label: "Headline", filled: profile.headline.trim().length > 0 },
    { key: "bio", label: "Bio (100+ chars)", filled: profile.bio.trim().length >= 100 },
    { key: "languages", label: "Languages", filled: languages.length > 0 },
    { key: "modes", label: "Teaching modes", filled: modes.length > 0 },
    { key: "rateOnline", label: "Online rate", filled: profile.rateOnline > 0 },
    { key: "rateHome", label: "Home-visit rate", filled: profile.rateHome > 0 },
    { key: "travelRadiusKm", label: "Travel radius", filled: profile.travelRadiusKm > 0 },
    { key: "qualifications", label: "Qualifications", filled: qualifications.length > 0 },
    { key: "experience", label: "Experience", filled: experience.length > 0 },
    { key: "badges", label: "Verification badges", filled: badges.length > 0 },
  ];
  const completeness = Math.round((completenessFields.filter((f) => f.filled).length / completenessFields.length) * 100);

  /* ---- verification stepper ---- */
  const steps = [
    { key: "identity", label: "Identity", done: verifiedTypes.has("civil_id") },
    { key: "qualifications", label: "Qualifications", done: verifiedTypes.has("degree") || verifiedTypes.has("teaching_cert") },
    { key: "experience", label: "Experience", done: experience.some((e) => (e as { verified?: boolean })?.verified === true) },
    { key: "scope", label: "Teaching scope", done: offeringCount > 0 },
    { key: "profile", label: "Profile", done: completeness >= 80 },
    {
      key: "safety",
      label: "Safety",
      done: verifiedTypes.has("background_check") && verifiedTypes.has("conduct"),
    },
  ];

  /* ---- re-verification watchlist ---- */
  const now = Date.now();
  const docAge = (d: { uploadedAt: Date }) => Math.floor((now - d.uploadedAt.getTime()) / 86400000);
  const staleDocs = documents
    .filter((d) => docAge(d) > 300)
    .map((d) => ({ id: d.id, name: d.name, daysOld: docAge(d), uploadedAt: d.uploadedAt }));

  /* ---- growth coach tips (rule-based, advisory only) ---- */
  type Tip = { key: string; tone: "tip" | "praise" | "warn"; title: string; body: string };
  const tips: Tip[] = [];
  if (completeness < 100) {
    tips.push({
      key: "completeness",
      tone: "tip",
      title: `Profile is ${completeness}% complete`,
      body: "Complete profiles get up to 3× more booking requests from parents.",
    });
  }
  if (profile.bio.trim().length <= 200) {
    tips.push({
      key: "bio",
      tone: "tip",
      title: "Lengthen your bio",
      body: `Your bio is ${profile.bio.trim().length} characters — the most-booked tutors write 200+ characters about their method.`,
    });
  }
  if (offeringCount === 0) {
    tips.push({
      key: "offerings",
      tone: "tip",
      title: "Add an intro offering",
      body: "Publish at least one board × grade × subject offering so parents can book you directly.",
    });
  } else {
    tips.push({
      key: "offerings",
      tone: "praise",
      title: `${offeringCount} live offerings`,
      body: "Your teaching scope is published — parents can find and book you for these combinations.",
    });
  }
  if (profile.responseMins <= 30) {
    tips.push({
      key: "response",
      tone: "praise",
      title: `Parents love your ${profile.responseMins}-min responses`,
      body: "Fast replies are one of the strongest booking signals on Tutor Amma. Keep it up!",
    });
  } else {
    tips.push({
      key: "response",
      tone: "tip",
      title: "Reply within 30 minutes",
      body: `Your median response is ${profile.responseMins} min — requests answered in under 30 min convert far better.`,
    });
  }
  if (staleDocs.length) {
    tips.push({
      key: "reverify",
      tone: "warn",
      title: `${staleDocs.length} document(s) due for re-verification`,
      body: "Documents older than 300 days should be re-uploaded to keep your verification badges active.",
    });
  }

  return Response.json({
    data: {
      user,
      profile: {
        id: profile.id,
        headline: profile.headline,
        bio: profile.bio,
        status: profile.status,
        yearsExperience: profile.yearsExperience,
        rating: profile.rating,
        reviewCount: profile.reviewCount,
        sessionsDone: profile.sessionsDone,
        trustScore: profile.trustScore,
        badges,
        languages,
        modes,
        rateOnline: profile.rateOnline,
        rateHome: profile.rateHome,
        travelRadiusKm: profile.travelRadiusKm,
        responseMins: profile.responseMins,
        qualifications,
        experience,
      },
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        name: d.name,
        issuer: d.issuer,
        status: d.status,
        uploadedAt: d.uploadedAt,
        reviewedBy: d.reviewedBy,
      })),
      offerings: offeringCount,
      trust: {
        total: trustTotal,
        breakdown: [
          { key: "verification", label: "Verification depth", score: Math.round(verificationScore), max: 35 },
          { key: "rating", label: "Parent rating", score: Math.round(ratingScore), max: 25 },
          { key: "completion", label: "Session completion", score: Math.round(completionScore), max: 20 },
          { key: "response", label: "Response time", score: Math.round(responseScore), max: 10 },
          { key: "disputes", label: "Dispute record", score: Math.round(disputesScore), max: 10 },
        ],
      },
      completeness: { pct: completeness, fields: completenessFields },
      steps,
      tips,
      reverify: { needed: staleDocs.length > 0, docs: staleDocs },
    },
  });
}

export async function PUT(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const profile = await db.tutorProfile.findFirst({ where: { userId: auth.id } });
  if (!profile) return notFound("Tutor profile not found.");

  let body: {
    headline?: unknown;
    bio?: unknown;
    languages?: unknown;
    modes?: unknown;
    rateOnline?: unknown;
    rateHome?: unknown;
    travelRadiusKm?: unknown;
    responseMins?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const data: Record<string, string | number> = {};
  const editableStatus = ["approved", "draft"].includes(profile.status);

  if (body.headline !== undefined) {
    if (!editableStatus) return badRequest("Headline can only be edited while your profile is approved or in draft.");
    const headline = String(body.headline).trim();
    if (headline.length < 4 || headline.length > 120) return badRequest("Headline must be 4–120 characters.");
    data.headline = headline;
  }
  if (body.bio !== undefined) {
    if (!editableStatus) return badRequest("Bio can only be edited while your profile is approved or in draft.");
    const bio = String(body.bio).trim();
    if (bio.length > 1200) return badRequest("Bio must be under 1200 characters.");
    data.bio = bio;
  }
  if (body.languages !== undefined) {
    const langs = (Array.isArray(body.languages) ? body.languages : [])
      .map((l) => String(l).trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!langs.length) return badRequest("Add at least one teaching language.");
    data.languages = JSON.stringify(langs);
  }
  if (body.modes !== undefined) {
    const modes = (Array.isArray(body.modes) ? body.modes : [])
      .map((m) => String(m))
      .filter((m) => ["online", "home", "group"].includes(m));
    if (!modes.length) return badRequest("Select at least one teaching mode.");
    data.modes = JSON.stringify([...new Set(modes)]);
  }
  if (body.rateOnline !== undefined) {
    const rate = Math.round(Number(body.rateOnline));
    if (!Number.isFinite(rate) || rate < 0 || rate > 500000) return badRequest("Online rate must be between ₹0 and ₹5,000.");
    data.rateOnline = rate;
  }
  if (body.rateHome !== undefined) {
    const rate = Math.round(Number(body.rateHome));
    if (!Number.isFinite(rate) || rate < 0 || rate > 500000) return badRequest("Home-visit rate must be between ₹0 and ₹5,000.");
    data.rateHome = rate;
  }
  if (body.travelRadiusKm !== undefined) {
    const km = Math.round(Number(body.travelRadiusKm));
    if (!Number.isFinite(km) || km < 0 || km > 50) return badRequest("Travel radius must be between 0 and 50 km.");
    data.travelRadiusKm = km;
  }
  if (body.responseMins !== undefined) {
    const mins = Math.round(Number(body.responseMins));
    if (!Number.isFinite(mins) || mins < 1 || mins > 480) return badRequest("Response time must be 1–480 minutes.");
    data.responseMins = mins;
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update.");

  await db.tutorProfile.update({ where: { id: profile.id }, data });
  await audit(
    { name: auth.name, role: auth.role },
    "profile.updated",
    `TutorProfile: ${auth.name}`,
    `Updated: ${Object.keys(data).join(", ")}`
  );

  return Response.json({ data: { ok: true, updated: Object.keys(data) } });
}
