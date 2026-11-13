import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** POST /api/studio/lesson-plans/[id]/share — share a plan with selected students (in-app + WhatsApp demo). */
export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can share lesson plans.");
  const { id } = await params;

  const plan = await db.lessonPlan.findUnique({ where: { id } });
  if (!plan) return notFound("Lesson plan not found.");
  if (plan.tutorId !== auth.id) return forbidden("This lesson plan belongs to another tutor.");

  let body: { studentIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.map(String))] : [];
  if (studentIds.length === 0) return badRequest("Select at least one student to share with.");

  // Verify every selected student shares a booking history with this tutor.
  const bookings = await db.booking.findMany({
    where: { tutorId: auth.id, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const known = new Set(bookings.map((b) => b.studentId));
  const unknown = studentIds.filter((sid) => !known.has(sid));
  if (unknown.length > 0) return badRequest("Some selected students are not in your student list.", "VALIDATION_ERROR");

  const updated = await db.lessonPlan.update({
    where: { id },
    data: { status: "shared", sharedWith: JSON.stringify(studentIds) },
  });

  for (const sid of studentIds) {
    await db.notification.create({
      data: {
        userId: sid,
        title: "Your tutor shared a lesson plan",
        body: `${auth.name} shared the lesson plan “${plan.title}” (${plan.subject}, ${plan.grade}) with you. Open your lessons to review it.`,
        type: "studio",
      },
    });
  }

  await audit({ name: auth.name, role: auth.role }, "studio.lesson_plan.shared", "LessonPlan", `${plan.title} → ${studentIds.length} student(s)`);

  return Response.json({
    data: { id: updated.id, status: updated.status, sharedWith: studentIds, sharedCount: studentIds.length },
  });
}
