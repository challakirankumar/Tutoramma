import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import { randomBytes } from "crypto";

/**
 * GET /api/live-classes — role-aware list of digital classrooms.
 *  · tutor:   own classes (with hostKey)
 *  · student: classes for batches they have joined
 *  · parent:  classes for their children's batches
 *  · admin:   everything
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const tutorFilter = auth.role === "tutor" ? { tutorId: auth.id } : undefined;

  /* batches relevant to this viewer */
  let batchIds: string[] | null = null; // null = no restriction
  if (auth.role === "student") {
    const seats = await db.batchSeat.findMany({ where: { studentId: auth.id }, select: { batchId: true } });
    batchIds = seats.map((s) => s.batchId);
  } else if (auth.role === "parent") {
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
    const seats = await db.batchSeat.findMany({
      where: { studentId: { in: kids.map((k) => k.userId) } },
      select: { batchId: true },
    });
    batchIds = seats.map((s) => s.batchId);
  }

  const classes = await db.liveClass.findMany({
    where: tutorFilter ?? (batchIds ? { batchId: { in: batchIds } } : undefined),
    orderBy: { scheduledAt: "desc" },
    take: 60,
  });

  const tutorIds = Array.from(new Set(classes.map((c) => c.tutorId)));
  const tutors = tutorIds.length
    ? await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const tutorMap = new Map(tutors.map((t) => [t.id, t]));

  const batchRefs = Array.from(new Set(classes.map((c) => c.batchId).filter(Boolean) as string[]));
  const batches = batchRefs.length ? await db.batch.findMany({ where: { id: { in: batchRefs } } }) : [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  const data = classes.map((c) => {
    const t = tutorMap.get(c.tutorId);
    const b = c.batchId ? batchMap.get(c.batchId) : null;
    return {
      id: c.id,
      title: c.title,
      subject: c.subject,
      board: c.board,
      grade: c.grade,
      agenda: c.agenda,
      batchId: c.batchId,
      batchTitle: b?.title ?? null,
      scheduledAt: c.scheduledAt,
      durationMin: c.durationMin,
      code: c.code,
      slug: c.slug,
      waitingRoom: c.waitingRoom,
      allowChat: c.allowChat,
      status: c.status,
      notifiedCount: c.notifiedCount,
      attendance: JSON.parse(c.attendanceJson || "{}"),
      createdAt: c.createdAt,
      endedAt: c.endedAt,
      tutor: t ? { id: t.id, name: t.name, color: t.avatarColor } : { id: c.tutorId, name: "Tutor", color: "#315BE5" },
      isOwner: c.tutorId === auth.id,
      hostKey: c.tutorId === auth.id ? c.hostKey : undefined,
    };
  });

  return Response.json({ data });
}

/**
 * POST /api/live-classes — tutor schedules a digital classroom and the join
 * link is delivered to every student (and their parents) of the batch.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can schedule live classes.");

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    subject?: string;
    batchId?: string;
    board?: string;
    grade?: string;
    agenda?: string;
    scheduledAt?: string;
    durationMin?: number;
    waitingRoom?: boolean;
    allowChat?: boolean;
    notify?: boolean;
  } | null;

  if (!body?.title?.trim() || !body.subject?.trim() || !body.scheduledAt) {
    return badRequest("Title, subject and a schedule time are required.");
  }
  const when = new Date(body.scheduledAt);
  if (isNaN(when.getTime())) return badRequest("The schedule time is invalid.");

  /* verify batch ownership when linked */
  let batch: { id: string; title: string; subject: string; board: string; grade: string } | null = null;
  if (body.batchId) {
    const b = await db.batch.findFirst({ where: { id: body.batchId, tutorId: auth.id } });
    if (!b) return badRequest("That class / section was not found among your batches.");
    batch = { id: b.id, title: b.title, subject: b.subject, board: b.board, grade: b.grade };
  }

  const code = `TA-${randomBytes(3).toString("hex").toUpperCase()}`;
  const created = await db.liveClass.create({
    data: {
      tutorId: auth.id,
      batchId: batch?.id ?? null,
      title: body.title.trim().slice(0, 90),
      subject: body.subject.trim().slice(0, 40),
      board: body.board?.slice(0, 40) ?? batch?.board ?? null,
      grade: body.grade?.slice(0, 20) ?? batch?.grade ?? null,
      agenda: (body.agenda ?? "").slice(0, 600),
      scheduledAt: when,
      durationMin: Math.min(300, Math.max(15, body.durationMin ?? 60)),
      code,
      hostKey: randomBytes(12).toString("hex"),
      waitingRoom: body.waitingRoom ?? true,
      allowChat: body.allowChat ?? true,
    },
  });

  /* deliver the link to the batch's students + their parents */
  let notified = 0;
  if (batch && body.notify !== false) {
    const seats = await db.batchSeat.findMany({ where: { batchId: batch.id, status: "joined" }, select: { studentId: true } });
    const students = seats.length
      ? await db.user.findMany({ where: { id: { in: seats.map((s) => s.studentId) } }, select: { id: true, name: true, role: true } })
      : [];
    const studentProfiles = seats.length
      ? await db.studentProfile.findMany({ where: { userId: { in: seats.map((s) => s.studentId) } }, select: { userId: true, parentEmail: true } })
      : [];

    const whenLabel = when.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const notes: { userId: string; title: string; body: string; type: string }[] = [];
    for (const s of students) {
      notes.push({
        userId: s.id,
        title: `Live class scheduled: ${created.title}`,
        body: `${auth.name} scheduled a live class for ${batch.title} · ${whenLabel}. Open "Live Classes" to join with code ${created.code}.`,
        type: "system",
      });
    }
    /* parents of those students */
    const parentEmails = Array.from(new Set(studentProfiles.map((p) => p.parentEmail).filter(Boolean) as string[]));
    const parents = parentEmails.length
      ? await db.user.findMany({ where: { email: { in: parentEmails }, role: "parent" }, select: { id: true } })
      : [];
    for (const p of parents) {
      notes.push({
        userId: p.id,
        title: `Live class scheduled: ${created.title}`,
        body: `${auth.name} scheduled a live class for ${batch.title} · ${whenLabel} (code ${created.code}).`,
        type: "system",
      });
    }
    if (notes.length) {
      await db.notification.createMany({ data: notes });
      notified = notes.length;
    }
    await db.liveClass.update({ where: { id: created.id }, data: { notifiedCount: notified } });
  }

  return Response.json({
    data: {
      id: created.id,
      title: created.title,
      code: created.code,
      slug: created.slug,
      hostKey: created.hostKey,
      notifiedCount: notified,
    },
  });
}
