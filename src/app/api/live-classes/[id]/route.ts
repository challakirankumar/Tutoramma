import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound } from "@/lib/auth";

/**
 * GET /api/live-classes/[id] — class details.
 * The owner (host tutor) additionally receives the hostKey.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return notFound("Live class not found.");

  const tutor = await db.user.findUnique({ where: { id: c.tutorId }, select: { id: true, name: true, avatarColor: true } });
  const batch = c.batchId ? await db.batch.findUnique({ where: { id: c.batchId } }) : null;

  const isOwner = c.tutorId === auth.id;
  if (!isOwner && auth.role !== "admin") {
    /* participants may only see public fields */
    return Response.json({
      data: {
        id: c.id,
        title: c.title,
        subject: c.subject,
        board: c.board,
        grade: c.grade,
        agenda: c.agenda,
        batchTitle: batch?.title ?? null,
        scheduledAt: c.scheduledAt,
        durationMin: c.durationMin,
        code: c.code,
        slug: c.slug,
        status: c.status,
        waitingRoom: c.waitingRoom,
        allowChat: c.allowChat,
        tutor: tutor ? { id: tutor.id, name: tutor.name, color: tutor.avatarColor } : { id: c.tutorId, name: "Tutor", color: "#315BE5" },
        isOwner: false,
      },
    });
  }

  return Response.json({
    data: {
      id: c.id,
      title: c.title,
      subject: c.subject,
      board: c.board,
      grade: c.grade,
      agenda: c.agenda,
      batchId: c.batchId,
      batchTitle: batch?.title ?? null,
      scheduledAt: c.scheduledAt,
      durationMin: c.durationMin,
      code: c.code,
      slug: c.slug,
      hostKey: isOwner ? c.hostKey : undefined,
      status: c.status,
      waitingRoom: c.waitingRoom,
      allowChat: c.allowChat,
      attendance: JSON.parse(c.attendanceJson || "{}"),
      notifiedCount: c.notifiedCount,
      createdAt: c.createdAt,
      endedAt: c.endedAt,
      tutor: tutor ? { id: tutor.id, name: tutor.name, color: tutor.avatarColor } : { id: c.tutorId, name: "Tutor", color: "#315BE5" },
      isOwner,
    },
  });
}

/**
 * PATCH /api/live-classes/[id] — owner updates status (start/end),
 * persists the attendance report when the class ends, and stores the
 * recording metadata / edited class notes (spec Part J).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return notFound("Live class not found.");
  if (c.tutorId !== auth.id) return forbidden("Only the class owner can update it.");

  const body = (await req.json().catch(() => null)) as {
    status?: "scheduled" | "live" | "ended";
    attendance?: { attendees: { name: string; role: string; joinedAt: string; leftAt: string | null; durationMin: number; status: string }[] };
    agenda?: string;
    scheduledAt?: string;
    durationMin?: number;
    recorded?: boolean;
    recordingSec?: number;
    notesJson?: Record<string, unknown>;
  } | null;
  if (!body) return badRequestEmpty();

  const patch: Record<string, unknown> = {};
  if (body.agenda !== undefined) patch.agenda = String(body.agenda).slice(0, 600);
  if (body.scheduledAt) {
    const d = new Date(body.scheduledAt);
    if (!isNaN(d.getTime())) patch.scheduledAt = d;
  }
  if (body.durationMin !== undefined) patch.durationMin = Math.min(300, Math.max(15, body.durationMin | 0));
  if (body.status === "live") {
    patch.status = "live";
    patch.startedAt = new Date();
  } else if (body.status === "ended") {
    patch.status = "ended";
    patch.endedAt = new Date();
  }
  if (body.attendance?.attendees) {
    patch.attendanceJson = JSON.stringify({ attendees: body.attendance.attendees.slice(0, 100) });
  }
  /* signature round 2 — recording metadata + edited class notes */
  if (typeof body.recorded === "boolean") patch.recorded = body.recorded;
  if (body.recordingSec !== undefined) patch.recordingSec = Math.min(86400, Math.max(0, body.recordingSec | 0));
  if (body.notesJson && typeof body.notesJson === "object") {
    /* merge on top of whatever is already stored (edits may be partial) */
    let notes: Record<string, unknown> = {};
    try {
      notes = JSON.parse(c.notesJson || "{}");
    } catch {}
    patch.notesJson = JSON.stringify({ ...notes, ...body.notesJson });
  }

  const updated = await db.liveClass.update({ where: { id }, data: patch });
  return Response.json({ data: { id: updated.id, status: updated.status, slug: updated.slug } });
}

function badRequestEmpty() {
  return Response.json({ error: { code: "VALIDATION_ERROR", message: "Nothing to update." } }, { status: 422 });
}
