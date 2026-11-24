import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";
import { aiJson } from "@/lib/ai-json";

/**
 * Parent-teacher meetings (spec §29, Screen 44).
 * 10-minute slots on the two PTM days (next Thursday and Friday, 4:00-5:20 PM IST),
 * online or at school, with an AI meeting brief drawn from the child's progress passport.
 */
const SLOT_MIN = 10;
const START_H = 16; // 4:00 PM IST
const SLOTS_PER_DAY = 8;

function ptmDays(): Date[] {
  const out: Date[] = [];
  const d = new Date();
  for (let i = 1; out.length < 2 && i < 14; i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i));
    if (x.getUTCDay() === 4 || (out.length === 1 && x.getUTCDay() === 5)) out.push(x);
  }
  return out;
}
/** IST wall-clock slot → UTC instant. */
const slotAt = (day: Date, i: number) => new Date(day.getTime() + ((START_H * 60 + i * SLOT_MIN) - 330) * 60000);

async function childrenOf(email: string) {
  const profiles = await db.studentProfile.findMany({ where: { parentEmail: email } });
  const users = await db.user.findMany({ where: { id: { in: profiles.map((p) => p.userId) } }, select: { id: true, name: true } });
  return profiles.map((p) => ({ id: p.userId, name: users.find((u) => u.id === p.userId)?.name ?? "Child", grade: p.grade, board: p.boardId }));
}

async function brief(childId: string, subject: string): Promise<string> {
  const passport = await db.passportTopic.findMany({ where: { studentId: childId } });
  const subj = passport.filter((p) => p.subject.toLowerCase().includes(subject.toLowerCase().slice(0, 4)));
  const pool = subj.length ? subj : passport;
  if (!pool.length) return `First meeting — ask how ${subject} is going and what to practise at home.`;
  const best = [...pool].sort((a, b) => b.mastery - a.mastery)[0];
  const worst = [...pool].sort((a, b) => a.mastery - b.mastery)[0];
  const fallback = `Strength: ${best.topic} (${best.mastery}%). Focus: ${worst.topic} (${worst.mastery}%). Suggested question: how can we practise ${worst.topic.toLowerCase()} at home for 15 minutes a day?`;
  const ai = await aiJson<{ brief: string }>(
    'Write a parent-teacher meeting brief for a parent in max 40 words: one strength, one focus area with the percentage, and one suggested question to ask the teacher. Plain, warm language. Return STRICT JSON {"brief": string}.',
    `Subject: ${subject}. Topic mastery: ${pool.map((p) => `${p.topic} ${p.mastery}%`).join(", ")}.`,
    { max_tokens: 200, timeoutMs: 10000 }
  );
  return ai?.brief?.slice(0, 300) || fallback;
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden("PTM booking is for parents.");
  const url = new URL(req.url);
  const kids = await childrenOf(auth.email);
  const childId = url.searchParams.get("childId") ?? kids[0]?.id;
  if (!childId || !kids.some((k) => k.id === childId)) return Response.json({ data: { children: kids, teachers: [], days: [], bookings: [] } });

  const bookings = await db.booking.findMany({ where: { studentId: childId }, select: { tutorId: true, subject: true }, orderBy: { startAt: "desc" } });
  const tmap = new Map<string, string>();
  bookings.forEach((b) => !tmap.has(b.tutorId) && tmap.set(b.tutorId, b.subject));
  const tutors = await db.user.findMany({ where: { id: { in: [...tmap.keys()] } }, select: { id: true, name: true, avatarColor: true } });

  const days = ptmDays();
  const from = slotAt(days[0], 0);
  const to = slotAt(days[days.length - 1], SLOTS_PER_DAY);
  const taken = await db.ptmBooking.findMany({ where: { tutorId: { in: tutors.map((t) => t.id) }, status: "booked", startAt: { gte: from, lte: to } } });
  const mine = await db.ptmBooking.findMany({ where: { parentId: auth.id, childId, status: { not: "cancelled" } }, orderBy: { startAt: "asc" } });

  return Response.json({
    data: {
      children: kids,
      childId,
      teachers: tutors.map((t) => ({ id: t.id, name: t.name, color: t.avatarColor, subject: tmap.get(t.id) })),
      days: days.map((d) => ({
        date: d.toISOString().slice(0, 10),
        slots: tutors.map((t) => ({
          tutorId: t.id,
          times: Array.from({ length: SLOTS_PER_DAY }, (_, i) => {
            const at = slotAt(d, i);
            const b = taken.find((x) => x.tutorId === t.id && x.startAt.getTime() === at.getTime());
            return { at: at.toISOString(), status: b ? (b.parentId === auth.id ? "mine" : "booked") : "free" };
          }),
        })),
      })),
      bookings: mine.map((m) => ({ ...m, tutorName: tutors.find((t) => t.id === m.tutorId)?.name ?? "Teacher", subject: tmap.get(m.tutorId) ?? "" })),
    },
  });
}

/** POST /api/ptm — { childId, tutorId, startAt, mode } books one 10-minute slot (conflict-checked). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden();
  let b: { childId?: string; tutorId?: string; startAt?: string; mode?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const kids = await childrenOf(auth.email);
  if (!kids.some((k) => k.id === b.childId)) return forbidden("That child is not on your family profile.");
  const startAt = new Date(String(b.startAt));
  if (isNaN(startAt.getTime()) || startAt.getTime() < Date.now()) return badRequest("Pick an upcoming slot.");
  const linked = await db.booking.findFirst({ where: { studentId: b.childId, tutorId: b.tutorId }, select: { subject: true } });
  if (!linked) return forbidden("You can book PTMs only with your child's teachers.");

  const clash = await db.ptmBooking.findFirst({ where: { status: "booked", OR: [{ tutorId: b.tutorId, startAt }, { parentId: auth.id, startAt }] } });
  if (clash) return Response.json({ error: { code: "SLOT_TAKEN", message: "That slot was just taken — please choose another." } }, { status: 409 });
  const dup = await db.ptmBooking.findFirst({ where: { parentId: auth.id, childId: b.childId, tutorId: b.tutorId, status: "booked", startAt: { gte: new Date() } } });
  if (dup) return badRequest("You already have a meeting with this teacher — cancel it first to change the time.", "INVALID_STATE");

  const meeting = await db.ptmBooking.create({
    data: { parentId: auth.id, childId: b.childId!, tutorId: b.tutorId!, startAt, mode: b.mode === "school" ? "school" : "online", brief: await brief(b.childId!, linked.subject) },
  });
  const when = startAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  await db.notification.create({ data: { userId: b.tutorId!, title: "Parent-teacher meeting booked", body: `${auth.name} booked ${when} (${meeting.mode === "school" ? "at school" : "online"}) about ${kids.find((k) => k.id === b.childId)?.name}.`, type: "booking" } });
  await audit({ name: auth.name, role: auth.role }, "ptm.booked", `PtmBooking: ${meeting.id}`, when);
  return Response.json({ data: meeting }, { status: 201 });
}

/** DELETE /api/ptm?id= — cancel a meeting. */
export async function DELETE(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const m = await db.ptmBooking.findUnique({ where: { id } });
  if (!m || m.parentId !== auth.id) return notFound("Meeting not found.");
  await db.ptmBooking.update({ where: { id }, data: { status: "cancelled" } });
  return Response.json({ data: { ok: true } });
}
