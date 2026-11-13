import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

const BASE_BADGES = ["ID verified", "Qualification verified", "Experience verified", "Background checked"];
const ALL_BADGES = [...BASE_BADGES, "Top rated", "Responds fast"];

/** Admin decision on a pending tutor — approve / reject / needs_info. */
export async function POST(req: Request, { params }: { params: Promise<{ tutorId: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const { tutorId } = await params;
  let body: { action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const action = body.action;
  const note = (body.note || "").trim();
  if (!["approve", "reject", "needs_info"].includes(action ?? "")) {
    return badRequest("action must be approve, reject or needs_info.");
  }
  if (action !== "approve" && !note) {
    return badRequest("A note is required for reject / needs_info decisions.");
  }

  let profile = await db.tutorProfile.findUnique({ where: { id: tutorId }, include: { user: true } });
  if (!profile) profile = await db.tutorProfile.findUnique({ where: { userId: tutorId }, include: { user: true } });
  if (!profile) return notFound("Tutor profile not found.");

  const tutorName = profile.user.name;

  if (action === "approve") {
    const badges = profile.rating >= 4.8 ? ALL_BADGES : BASE_BADGES;
    await db.tutorProfile.update({
      where: { id: profile.id },
      data: { status: "approved", badges: JSON.stringify(badges), trustScore: 75, verificationNote: note || null },
    });
    await db.tutorDocument.updateMany({ where: { tutorId: profile.id }, data: { status: "verified", reviewedBy: auth.name } });
    await db.notification.create({
      data: {
        userId: profile.userId,
        title: "Verification approved — you're live on Tutor Amma!",
        body:
          note ||
          "All documents verified. Your profile is now visible to students and parents — badges granted, home tuition enabled.",
        type: "system",
      },
    });
    await audit({ name: auth.name, role: auth.role }, "verification.approved", `TutorProfile: ${tutorName}`, note || "All documents verified — badges granted, trust score 75");
    return Response.json({ data: { ok: true, status: "approved" } });
  }

  if (action === "reject") {
    await db.tutorProfile.update({ where: { id: profile.id }, data: { status: "rejected", verificationNote: note } });
    await db.notification.create({
      data: {
        userId: profile.userId,
        title: "Verification unsuccessful",
        body: `Your application was not approved. Reviewer note: ${note}`,
        type: "system",
      },
    });
    await audit({ name: auth.name, role: auth.role }, "verification.rejected", `TutorProfile: ${tutorName}`, note, "warning");
    return Response.json({ data: { ok: true, status: "rejected" } });
  }

  /* needs_info */
  await db.tutorProfile.update({ where: { id: profile.id }, data: { status: "needs_info", verificationNote: note } });
  await db.notification.create({
    data: {
      userId: profile.userId,
      title: "More information needed",
      body: `Before we can verify your profile, please provide: ${note}`,
      type: "system",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "verification.needs_info", `TutorProfile: ${tutorName}`, note, "warning");
  return Response.json({ data: { ok: true, status: "needs_info" } });
}
