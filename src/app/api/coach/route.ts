import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound } from "@/lib/auth";
import { buildLearningProfile } from "@/lib/learning-profile";

/**
 * GET /api/coach                → the tutor's linked students
 * GET /api/coach?studentId=…    → that student's learning profile
 * Tutors only see students they are linked to (bookings or classrooms).
 */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("The Teaching Coach is for tutors.");

  const [bookings, members] = await Promise.all([
    db.booking.findMany({ where: { tutorId: auth.id }, select: { studentId: true, subject: true } }),
    db.classroomMember.findMany({ where: { status: "active", classroom: { tutorId: auth.id } }, select: { studentId: true, classroom: { select: { subject: true } } } }),
  ]);
  const subjects = new Map<string, string>();
  bookings.forEach((b) => subjects.set(b.studentId, b.subject));
  members.forEach((m) => !subjects.has(m.studentId) && subjects.set(m.studentId, m.classroom.subject));

  const studentId = new URL(req.url).searchParams.get("studentId");
  if (studentId) {
    if (!subjects.has(studentId)) return forbidden("You can only view students linked to you.");
    const p = await buildLearningProfile(studentId);
    if (!p) return notFound("Student not found.");
    return Response.json({ data: { ...p, subject: subjects.get(studentId) } });
  }

  const users = await db.user.findMany({ where: { id: { in: [...subjects.keys()] }, role: "student" }, select: { id: true, name: true, avatarColor: true } });
  const profiles = await db.studentProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { userId: true, grade: true, boardId: true } });
  const pm = new Map(profiles.map((p) => [p.userId, p]));
  return Response.json({
    data: users.map((u) => ({ id: u.id, name: u.name, color: u.avatarColor, subject: subjects.get(u.id), grade: pm.get(u.id)?.grade ?? "", board: pm.get(u.id)?.boardId ?? "" })),
  });
}
