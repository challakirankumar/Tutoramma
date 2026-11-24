import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/classrooms/:id/members — { memberId, action: approve | remove | waitlist } (tutor only). */
export async function POST(req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  const { id } = await params;
  const room = await db.classroom.findUnique({ where: { id } });
  if (!room || room.tutorId !== auth.id) return notFound("Classroom not found.");
  let b: { memberId?: string; action?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const m = await db.classroomMember.findUnique({ where: { id: b.memberId ?? "" } });
  if (!m || m.classroomId !== id) return notFound("Member not found.");
  const status = b.action === "approve" ? "active" : b.action === "remove" ? "removed" : b.action === "waitlist" ? "waitlisted" : null;
  if (!status) return badRequest("Unknown action.");
  if (status === "active") {
    const active = await db.classroomMember.count({ where: { classroomId: id, status: "active" } });
    if (active >= room.seats) return badRequest("All seats are full — increase seats or waitlist this student.", "INVALID_STATE");
  }
  await db.classroomMember.update({ where: { id: m.id }, data: { status } });
  if (status === "active") {
    await db.notification.create({ data: { userId: m.studentId, title: `You're in: ${room.name}`, body: `${auth.name} approved your request. Classes appear in your timetable.`, type: "system" } });
  }
  await audit({ name: auth.name, role: auth.role }, `classroom.member_${b.action}`, `Classroom: ${room.name}`, `Student ${m.studentId}`);
  return Response.json({ data: { id: m.id, status } });
}
