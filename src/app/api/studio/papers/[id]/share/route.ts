import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** POST /api/studio/papers/[id]/share — share the paper (NOT the answer key) with selected students. */
export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can share question papers.");
  const { id } = await params;

  const paper = await db.questionPaper.findUnique({ where: { id } });
  if (!paper) return notFound("Question paper not found.");
  if (paper.tutorId !== auth.id) return forbidden("This paper belongs to another tutor.");

  let body: { studentIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.map(String))] : [];
  if (studentIds.length === 0) return badRequest("Select at least one student to share with.");

  const bookings = await db.booking.findMany({
    where: { tutorId: auth.id, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const known = new Set(bookings.map((b) => b.studentId));
  if (studentIds.some((sid) => !known.has(sid))) {
    return badRequest("Some selected students are not in your student list.", "VALIDATION_ERROR");
  }

  const updated = await db.questionPaper.update({
    where: { id },
    data: { status: "shared", sharedWith: JSON.stringify(studentIds), sharedAt: new Date() },
  });

  for (const sid of studentIds) {
    await db.notification.create({
      data: {
        userId: sid,
        title: "Your tutor shared a question paper",
        body: `${auth.name} shared the question paper “${paper.title}” (${paper.subject}, ${paper.grade}) with you. The answer key stays with your tutor — attempt it honestly!`,
        type: "studio",
      },
    });
  }

  await audit({ name: auth.name, role: auth.role }, "studio.paper.shared", "QuestionPaper", `${paper.title} → ${studentIds.length} student(s)`);

  return Response.json({
    data: { id: updated.id, status: updated.status, sharedWith: studentIds, sharedCount: studentIds.length },
  });
}
