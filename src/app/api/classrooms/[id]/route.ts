import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";
import { joinCode } from "@/lib/classroom-codes";

type Ctx = { params: Promise<{ id: string }> };

async function own(id: string, tutorId: string) {
  const room = await db.classroom.findUnique({ where: { id } });
  return room && room.tutorId === tutorId ? room : null;
}

/** GET /api/classrooms/:id — classroom + roster (tutor only). */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  const { id } = await params;
  const room = await own(id, auth.id);
  if (!room) return notFound("Classroom not found.");
  const members = await db.classroomMember.findMany({ where: { classroomId: id, status: { not: "removed" } }, orderBy: { joinedAt: "desc" } });
  const users = await db.user.findMany({ where: { id: { in: members.map((m) => m.studentId) } }, select: { id: true, name: true, avatarColor: true } });
  const profiles = await db.studentProfile.findMany({ where: { userId: { in: members.map((m) => m.studentId) } }, select: { userId: true, grade: true, boardId: true, school: true } });
  const umap = new Map(users.map((u) => [u.id, u]));
  const pmap = new Map(profiles.map((p) => [p.userId, p]));
  return Response.json({
    data: {
      ...room,
      roster: members.map((m) => ({
        id: m.id,
        studentId: m.studentId,
        name: umap.get(m.studentId)?.name ?? "Student",
        color: umap.get(m.studentId)?.avatarColor ?? "#315BE5",
        grade: pmap.get(m.studentId)?.grade ?? "",
        school: pmap.get(m.studentId)?.school ?? "",
        status: m.status,
        via: m.via,
        joinedAt: m.joinedAt,
        progressShare: m.progressShare,
      })),
    },
  });
}

/** PATCH /api/classrooms/:id — { status? , regenerateCode?, joinPolicy?, seats?, schedule? } */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  const { id } = await params;
  const room = await own(id, auth.id);
  if (!room) return notFound("Classroom not found.");
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const data: Record<string, unknown> = {};
  if (["forming", "active", "archived"].includes(String(b.status))) data.status = b.status;
  if (["instant", "approval", "paid"].includes(String(b.joinPolicy))) data.joinPolicy = b.joinPolicy;
  if (b.seats !== undefined) data.seats = Math.min(500, Math.max(1, Number(b.seats) || room.seats));
  if (typeof b.schedule === "string") data.schedule = b.schedule.slice(0, 80);
  if (b.regenerateCode === true) data.joinCode = joinCode();
  const updated = await db.classroom.update({ where: { id }, data });
  await audit({ name: auth.name, role: auth.role }, "classroom.updated", `Classroom: ${room.name}`, Object.keys(data).join(", "));
  return Response.json({ data: updated });
}
