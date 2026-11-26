import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };
const LOST = ["cancelled", "declined", "no_show"];

async function ownBooking(id: string, auth: { id: string; role: string; email: string }) {
  const b = await db.booking.findUnique({ where: { id } });
  if (!b) return null;
  if (auth.role === "student" && b.studentId === auth.id) return b;
  if (auth.role === "parent") {
    const kid = await db.studentProfile.findFirst({ where: { userId: b.studentId, parentEmail: auth.email } });
    if (kid) return b;
  }
  return null;
}

/**
 * Backup Tutor Guarantee (spec §30). When a tutor cancels, declines or no-shows,
 * offer 2-3 verified alternatives free at the same slot, at the same price.
 * GET  → candidates (approved, same subject, mode offered, no clash at the slot)
 * POST { tutorId } → rebooks with the backup at the original price
 */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const b = await ownBooking(id, auth);
  if (!b) return notFound("Booking not found.");
  if (!LOST.includes(b.state)) return Response.json({ data: { eligible: false, candidates: [] } });
  if (await db.booking.findFirst({ where: { studentId: b.studentId, title: { contains: `[backup:${b.id}]` } }, select: { id: true } }))
    return Response.json({ data: { eligible: false, booked: true, candidates: [] } });

  /* the same slot if it is still ahead, otherwise the same weekday/time next week */
  let start = b.startAt;
  while (start.getTime() < Date.now() + 30 * 60000) start = new Date(start.getTime() + 7 * 86400000);
  const end = new Date(start.getTime() + (b.endAt.getTime() - b.startAt.getTime()));

  const taughtSubject = await db.booking.findMany({ where: { subject: b.subject, tutorId: { not: b.tutorId } }, select: { tutorId: true }, distinct: ["tutorId"] });
  const profiles = await db.tutorProfile.findMany({ where: { status: "approved", userId: { not: b.tutorId } }, include: { user: { select: { id: true, name: true, avatarColor: true, status: true } } } });
  const taught = new Set(taughtSubject.map((t) => t.tutorId));
  const candidates: { tutorId: string; name: string; color: string; headline: string; rating: number; reviews: number; trustScore: number; years: number; usualFee: number }[] = [];
  for (const p of profiles) {
    if (p.user.status !== "active") continue;
    const modes: string[] = JSON.parse(p.modes || "[]");
    if (!modes.includes(b.mode)) continue;
    const subjectFit = taught.has(p.userId) || p.headline.toLowerCase().includes(b.subject.toLowerCase().slice(0, 5));
    if (!subjectFit) continue;
    const clash = await db.booking.findFirst({ where: { tutorId: p.userId, state: { notIn: ["cancelled", "declined"] }, startAt: { lt: end }, endAt: { gt: start } } });
    if (clash) continue;
    candidates.push({
      tutorId: p.userId,
      name: p.user.name,
      color: p.user.avatarColor,
      headline: p.headline,
      rating: p.rating,
      reviews: p.reviewCount,
      trustScore: p.trustScore,
      years: p.yearsExperience,
      usualFee: b.mode === "home" ? p.rateHome : p.rateOnline,
    });
  }
  candidates.sort((x, y) => y.trustScore - x.trustScore || y.rating - x.rating);
  return Response.json({ data: { eligible: true, slot: start, price: b.sessionFee, subject: b.subject, mode: b.mode, candidates: candidates.slice(0, 3) } });
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent" && auth.role !== "student") return forbidden();
  const { id } = await params;
  const b = await ownBooking(id, auth);
  if (!b) return notFound("Booking not found.");
  if (!LOST.includes(b.state)) return badRequest("Backups are offered only when a session is cancelled by the tutor or missed.", "INVALID_STATE");
  let body: { tutorId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const already = await db.booking.findFirst({ where: { studentId: b.studentId, title: { contains: `[backup:${b.id}]` } } });
  if (already) return badRequest("A backup tutor was already booked for this session.", "DUPLICATE_REQUEST");
  const tutor = await db.tutorProfile.findFirst({ where: { userId: body.tutorId ?? "", status: "approved" } });
  if (!tutor) return badRequest("Choose one of the offered backup tutors.");
  let start = b.startAt;
  while (start.getTime() < Date.now() + 30 * 60000) start = new Date(start.getTime() + 7 * 86400000);
  const end = new Date(start.getTime() + (b.endAt.getTime() - b.startAt.getTime()));
  const clash = await db.booking.findFirst({ where: { tutorId: tutor.userId, state: { notIn: ["cancelled", "declined"] }, startAt: { lt: end }, endAt: { gt: start } } });
  if (clash) return Response.json({ error: { code: "SLOT_TAKEN", message: "That tutor was just booked — pick another backup." } }, { status: 409 });

  const nb = await db.booking.create({
    data: {
      studentId: b.studentId,
      tutorId: tutor.userId,
      mode: b.mode,
      subject: b.subject,
      board: b.board,
      grade: b.grade,
      title: `${b.title.replace(/ \[backup:[^\]]+\]$/, "")} [backup:${b.id}]`,
      startAt: start,
      endAt: end,
      state: "requested",
      /* Backup Tutor Guarantee: the original price is honoured */
      sessionFee: b.sessionFee,
      platformFee: b.platformFee,
      total: b.total,
      addressId: b.addressId,
      meetUrl: b.mode === "online" ? `https://class.tutoramma.test/join/mt-${Math.floor(1000 + Math.random() * 9000)}` : null,
      policySnapshot: b.policySnapshot,
    },
  });
  await db.notification.create({ data: { userId: tutor.userId, title: "Backup session request", body: `A family needs a backup tutor for ${b.subject} — the original tutor couldn't make it. Please accept or decline quickly.`, type: "booking" } });
  await audit({ name: auth.name, role: auth.role }, "booking.backup_rebooked", `Booking: ${nb.id}`, `Replaces ${b.id} at the original price`);
  return Response.json({ data: { id: nb.id, startAt: nb.startAt } }, { status: 201 });
}
