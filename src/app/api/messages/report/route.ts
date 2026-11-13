import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest, notFound, audit } from "@/lib/auth";

/**
 * POST /api/messages/report — { threadId, reason }
 *
 * Any party to a thread can report it to the safety team. Creates a
 * MessageReport row, notifies every admin and writes a warning-severity
 * audit event.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  let body: { threadId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const threadId = (body?.threadId ?? "").toString().trim();
  const reason = (body?.reason ?? "").toString().trim();
  if (!threadId) return badRequest("threadId is required.");
  if (!reason) return badRequest("Please pick a reason for the report.");
  if (reason.length > 600) return badRequest("Report reason is too long (max 600 characters).");

  const thread = await db.messageThread.findUnique({ where: { id: threadId } });
  if (!thread) return notFound("Thread not found.");
  const isParty =
    (auth.role === "tutor" && thread.tutorId === auth.id) ||
    (auth.role !== "tutor" && thread.studentId === auth.id);
  if (!isParty) return notFound("Thread not found.");

  const report = await db.messageReport.create({
    data: { threadId, reporterId: auth.id, reporterName: auth.name, reason },
  });

  /* every admin gets pinged */
  const admins = await db.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
  if (admins.length) {
    await db.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: "Message thread reported",
        body: `Message reported: ${reason} — review in the audit log.`,
        type: "safety",
      })),
    });
  }

  await audit(
    { name: auth.name, role: auth.role },
    "message.reported",
    `Thread: ${threadId}`,
    `${reason} (report ${report.id})`,
    "warning"
  );

  return Response.json({ data: { ok: true, reportId: report.id } }, { status: 201 });
}
