import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * POST /api/messages/block — { threadId, action: "block" | "unblock" }
 *
 * Students and parents can block a thread; tutors can block AND unblock.
 * Blocking freezes the conversation for both sides (sends → 422 THREAD_BLOCKED)
 * and notifies the other party. Every action is audited.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  let body: { threadId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const threadId = (body?.threadId ?? "").toString().trim();
  const action = (body?.action ?? "").toString().trim();
  if (!threadId) return badRequest("threadId is required.");
  if (action !== "block" && action !== "unblock") return badRequest('action must be "block" or "unblock".');

  const thread = await db.messageThread.findUnique({ where: { id: threadId } });
  if (!thread) return notFound("Thread not found.");

  const isTutor = auth.role === "tutor" && thread.tutorId === auth.id;
  const isStudentSide = auth.role !== "tutor" && thread.studentId === auth.id;
  if (!isTutor && !isStudentSide) return notFound("Thread not found.");

  if (action === "unblock" && auth.role !== "tutor") {
    return forbidden("Only the tutor can unblock a conversation.");
  }

  const otherId = isTutor ? thread.studentId : thread.tutorId;

  if (action === "block") {
    await db.messageThread.update({ where: { id: thread.id }, data: { blocked: true } });
    await db.notification.create({
      data: {
        userId: otherId,
        title: "Conversation blocked",
        body: "This conversation was blocked. Messages can no longer be sent.",
        type: "safety",
      },
    });
    await audit(
      { name: auth.name, role: auth.role },
      "message.blocked",
      `Thread: ${thread.id}`,
      `${auth.role} blocked the conversation`
    );
    return Response.json({ data: { ok: true, blocked: true } });
  }

  await db.messageThread.update({ where: { id: thread.id }, data: { blocked: false } });
  await db.notification.create({
    data: {
      userId: otherId,
      title: "Conversation unblocked",
      body: "The tutor unblocked this conversation — messages can continue.",
      type: "safety",
    },
  });
  await audit(
    { name: auth.name, role: auth.role },
    "message.unblocked",
    `Thread: ${thread.id}`,
    "Tutor unblocked the conversation"
  );
  return Response.json({ data: { ok: true, blocked: false } });
}
