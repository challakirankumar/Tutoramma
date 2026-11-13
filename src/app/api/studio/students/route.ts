import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** GET /api/studio/students — distinct students from the tutor's bookings (for the share dialogs). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors have a studio student list.");

  const bookings = await db.booking.findMany({
    where: { tutorId: auth.id },
    select: { studentId: true },
  });
  const studentIds = [...new Set(bookings.map((b) => b.studentId))];
  if (studentIds.length === 0) return Response.json({ data: [] });

  const students = await db.user.findMany({
    where: { id: { in: studentIds }, role: "student", status: "active" },
    select: {
      id: true,
      name: true,
      avatarColor: true,
      studentProfile: { select: { grade: true, boardId: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = students.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.avatarColor,
    grade: s.studentProfile?.grade ?? "",
  }));

  return Response.json({ data });
}
