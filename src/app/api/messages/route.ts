import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest, notFound, audit } from "@/lib/auth";

/**
 * /api/messages
 *  GET  — threads for the current user (student/parent side OR tutor side)
 *         with the other party's identity + last 50 messages (asc).
 *         Parents also see their minor children's threads when the
 *         `messageVisibility` consent is on (flagged with viewingChildName).
 *         Every message body is masked SERVER-SIDE (phones + emails) for all roles.
 *  POST — { threadId, body } to reply, or { tutorId, subject, body } to open a thread.
 *         Replies to a blocked thread → 422 THREAD_BLOCKED.
 */

/* ---------- helpers ---------- */

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseConsents(raw: string | null | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Masks emails: keep first char of the local part + first char of each domain label, TLD intact. e.g. "a•••@g•••.com" */
function maskEmails(text: string): string {
  return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (m) => {
    const at = m.lastIndexOf("@");
    const local = m.slice(0, at);
    const domain = m.slice(at + 1);
    const labels = domain.split(".");
    const maskedLabels = labels.map((l, i) => (i === labels.length - 1 ? l : `${l.slice(0, 1)}•••`));
    return `${local.slice(0, 1)}•••@${maskedLabels.join(".")}`;
  });
}

/** Masks phone-like runs (7+ digits possibly with +/spaces/dashes): keep first 3 + last 2 digits. e.g. "+91 •••••• 44" */
function maskPhones(text: string): string {
  return text.replace(/(\+?\d(?:[\s\-().]?\d){6,})/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) return match;
    const head = digits.slice(0, 3);
    const tail = digits.slice(-2);
    return `${match.startsWith("+") ? "+" : ""}${head} •••• ${tail}`;
  });
}

/** Server-side anti-leakage mask applied to every message body before it leaves the API. */
function maskBody(text: string): string {
  return maskPhones(maskEmails(text));
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  /* parents: resolve linked children (consent-gated) so their threads can be shown read-only */
  let childIds: string[] = [];
  const childNames = new Map<string, string>();
  if (auth.role === "parent") {
    const profile = await db.parentProfile.findUnique({ where: { userId: auth.id } });
    const consents = parseConsents(profile?.consents);
    if (consents.messageVisibility) {
      const emails = parseJsonArray(profile?.childrenEmails);
      if (emails.length) {
        const kids = await db.user.findMany({
          where: { email: { in: emails }, role: "student" },
          select: { id: true, name: true },
        });
        for (const k of kids) {
          childIds.push(k.id);
          childNames.set(k.id, k.name);
        }
      }
    }
  }

  const threads = await db.messageThread.findMany({
    where:
      auth.role === "tutor"
        ? { tutorId: auth.id }
        : {
            OR: [
              { studentId: auth.id },
              ...(childIds.length ? [{ studentId: { in: childIds } }] : []),
            ],
          },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 50 } },
    orderBy: { lastAt: "desc" },
  });

  /* resolve the other party for every thread */
  const otherIds = Array.from(new Set(threads.map((t) => (auth.role === "tutor" ? t.studentId : t.tutorId))));
  const users = otherIds.length
    ? await db.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true, avatarColor: true, role: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const data = threads.map((t) => {
    const other = userMap.get(auth.role === "tutor" ? t.studentId : t.tutorId);
    const viewingChildName =
      auth.role === "parent" && t.studentId !== auth.id ? (childNames.get(t.studentId) ?? null) : null;
    return {
      id: t.id,
      subject: t.subject,
      lastAt: t.lastAt,
      unread: t.unread,
      blocked: t.blocked,
      viewingChildName,
      other: other
        ? { id: other.id, name: other.name, color: other.avatarColor, role: other.role }
        : { id: "", name: "Unknown", color: "#7C88A8", role: "student" },
      messages: [...t.messages].reverse().map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderRole: m.senderRole,
        senderName: m.senderName,
        body: maskBody(m.body),
        createdAt: m.createdAt,
      })),
    };
  });

  return Response.json({ data });
}

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const text = (body?.body ?? "").toString().trim();
  if (!text) return badRequest("Message body is required.");
  if (text.length > 2000) return badRequest("Message is too long (max 2000 characters).");

  let threadId: string;

  if (body?.threadId) {
    const thread = await db.messageThread.findUnique({ where: { id: body.threadId } });
    if (!thread) return notFound("Thread not found.");
    const isParty =
      (auth.role === "tutor" && thread.tutorId === auth.id) ||
      (auth.role !== "tutor" && thread.studentId === auth.id);
    if (!isParty) return notFound("Thread not found.");
    if (thread.blocked) return badRequest("This conversation is blocked.", "THREAD_BLOCKED");
    threadId = thread.id;
    await db.messageThread.update({ where: { id: thread.id }, data: { lastAt: new Date(), unread: thread.unread + 1 } });
  } else {
    const tutorId = body?.tutorId;
    const subject = (body?.subject ?? "").toString().trim() || "New conversation";
    if (!tutorId) return badRequest("tutorId is required to start a new thread.");
    const tutor = await db.user.findUnique({ where: { id: tutorId }, select: { id: true, role: true } });
    if (!tutor || tutor.role !== "tutor") return badRequest("Tutor not found.");
    const thread = await db.messageThread.create({
      data: { studentId: auth.id, tutorId, subject, lastAt: new Date(), unread: 0 },
    });
    threadId = thread.id;
  }

  const message = await db.message.create({
    data: {
      threadId,
      senderId: auth.id,
      senderRole: auth.role,
      senderName: auth.name,
      body: text,
    },
  });

  return Response.json({ data: { message: { ...message, body: maskBody(message.body) }, threadId } }, { status: 201 });
}
