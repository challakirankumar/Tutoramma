import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Group Auto-Fill (spec §24 / §30): suggest students with the same board,
 * grade and subject need so tutors fill a classroom faster. Suggestions are
 * anonymised (first name, grade, area); an invitation goes to the student and
 * their guardian, who decide — nobody is enrolled without joining.
 */
async function load(id: string, tutorId: string) {
  const room = await db.classroom.findUnique({ where: { id } });
  return room && room.tutorId === tutorId ? room : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  const { id } = await params;
  const room = await load(id, auth.id);
  if (!room) return notFound("Classroom not found.");
  const members = new Set((await db.classroomMember.findMany({ where: { classroomId: id }, select: { studentId: true } })).map((m) => m.studentId));
  const invited = new Set((await db.notification.findMany({ where: { title: `Class invitation · ${room.name}` }, select: { userId: true } })).map((n) => n.userId));
  const profiles = (await db.studentProfile.findMany({ where: { grade: room.grade } })).filter((p) => !invited.has(p.userId));
  const want = room.subject.toLowerCase().slice(0, 5);
  const subjectDemand = new Set((await db.booking.findMany({ where: { subject: { contains: room.subject.slice(0, 5) } }, select: { studentId: true } })).map((b) => b.studentId));
  const users = await db.user.findMany({ where: { id: { in: profiles.map((p) => p.userId) }, status: "active" }, select: { id: true, name: true, city: true } });
  const out = profiles
    .filter((p) => !members.has(p.userId) && users.some((u) => u.id === p.userId))
    .map((p) => {
      const u = users.find((x) => x.id === p.userId)!;
      let weak: string[] = [];
      try {
        weak = JSON.parse(p.weakTopics);
      } catch {}
      const reasons = [`${p.grade}`];
      let score = 1;
      if (p.boardId === room.board) {
        score += 2;
        reasons.push(`${p.boardId} board`);
      }
      if (subjectDemand.has(p.userId)) {
        score += 2;
        reasons.push(`learning ${room.subject}`);
      }
      if (weak.some((w) => w.toLowerCase().includes(want))) {
        score += 1;
        reasons.push("needs support in this subject");
      }
      if (u.city) reasons.push(u.city);
      return { studentId: p.userId, label: `${u.name.split(" ")[0]} ${u.name.split(" ").slice(-1)[0]?.[0] ?? ""}.`, reasons, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const active = [...members].length;
  return Response.json({ data: { seatsLeft: Math.max(0, room.seats - active), suggestions: out } });
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  const { id } = await params;
  const room = await load(id, auth.id);
  if (!room) return notFound("Classroom not found.");
  let b: { studentIds?: string[] };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const ids = (b.studentIds ?? []).slice(0, 20);
  if (!ids.length) return badRequest("Choose students to invite.");
  const profiles = await db.studentProfile.findMany({ where: { userId: { in: ids }, grade: room.grade }, select: { userId: true, parentEmail: true } });
  const parents = await db.user.findMany({ where: { email: { in: profiles.map((p) => p.parentEmail).filter(Boolean) as string[] } }, select: { id: true, email: true } });
  let sent = 0;
  for (const p of profiles) {
    const body = `${auth.name} invites you to “${room.name}” (${room.subject}, ${room.grade}${room.schedule ? `, ${room.schedule}` : ""}). Join with code ${room.joinCode} — or ignore this invitation.`;
    await db.notification.create({ data: { userId: p.userId, title: `Class invitation · ${room.name}`, body, type: "booking" } });
    const parent = parents.find((x) => x.email === p.parentEmail);
    if (parent) await db.notification.create({ data: { userId: parent.id, title: `Group class suggestion for your child`, body: `${body} Group seats cost less than 1:1 sessions.`, type: "booking" } });
    sent++;
  }
  await audit({ name: auth.name, role: auth.role }, "classroom.autofill_invited", `Classroom: ${room.name}`, `${sent} invitations`);
  return Response.json({ data: { sent } });
}
