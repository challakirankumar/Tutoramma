import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest } from "@/lib/auth";

/**
 * POST /api/classrooms/join — { code } (6-character join code or share token).
 * Sign-in is required (spec §10: a marketplace with children does not allow
 * anonymous joining). The student becomes a linked student of the tutor.
 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!code) return badRequest("Join code is required.");
  const room = await db.classroom.findFirst({ where: { OR: [{ joinCode: code }, { shareToken: code.toLowerCase() }] } });
  if (!room || room.status === "archived") return notFound("That classroom link is not valid any more.");
  const tutor = await db.user.findUnique({ where: { id: room.tutorId }, select: { name: true } });
  return Response.json({ data: { name: room.name, subject: room.subject, grade: room.grade, board: room.board, joinPolicy: room.joinPolicy, tutorName: tutor?.name ?? "Tutor", schedule: room.schedule } });
}

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("Students join classrooms; parents can join on a child's account.");
  let b: { code?: string; via?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const code = String(b.code ?? "").trim();
  if (!code) return badRequest("Enter the 6-character join code.");
  const room = await db.classroom.findFirst({ where: { OR: [{ joinCode: code.toUpperCase() }, { shareToken: code.toLowerCase() }] } });
  if (!room || room.status === "archived") return notFound("No classroom matches that code.");

  const existing = await db.classroomMember.findUnique({ where: { classroomId_studentId: { classroomId: room.id, studentId: auth.id } } });
  if (existing && existing.status !== "removed") return Response.json({ data: { status: existing.status, name: room.name, already: true } });

  const active = await db.classroomMember.count({ where: { classroomId: room.id, status: "active" } });
  const full = active >= room.seats;
  if (full && !room.waitlist) return badRequest("This classroom is full.", "INVALID_STATE");
  const status = full ? "waitlisted" : room.joinPolicy === "instant" ? "active" : "pending";
  const via = ["link", "code", "qr", "invite"].includes(String(b.via)) ? String(b.via) : "code";

  if (existing) await db.classroomMember.update({ where: { id: existing.id }, data: { status, via, joinedAt: new Date() } });
  else await db.classroomMember.create({ data: { classroomId: room.id, studentId: auth.id, status, via } });

  await db.notification.create({
    data: {
      userId: room.tutorId,
      title: status === "pending" ? `Join request · ${room.name}` : `New student · ${room.name}`,
      body: `${auth.name} ${status === "pending" ? "asked to join" : status === "waitlisted" ? "joined the waitlist of" : "joined"} ${room.name}.`,
      type: "booking",
    },
  });
  return Response.json({ data: { status, name: room.name } }, { status: 201 });
}
