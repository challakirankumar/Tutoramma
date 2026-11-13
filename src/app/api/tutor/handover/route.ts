import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * /api/tutor/handover — substitute handover pack.
 *
 *  GET ?bookingId=  → lesson plan, class notes and student needs compiled for
 *                     a substitute tutor (booking must belong to the caller).
 *  POST {bookingId, substituteTutorId} → notify the substitute + audit.
 */

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Latest saved/shared lesson plan — subject match first, then any subject. */
async function findLessonPlan(tutorId: string, subject: string) {
  const saved = { tutorId, status: { in: ["saved", "shared"] } };
  const plan =
    (await db.lessonPlan.findFirst({
      where: { ...saved, subject: { equals: subject } },
      orderBy: { createdAt: "desc" },
    })) ??
    (await db.lessonPlan.findFirst({ where: saved, orderBy: { createdAt: "desc" } })) ??
    (await db.lessonPlan.findFirst({ where: { tutorId }, orderBy: { createdAt: "desc" } }));
  if (!plan) return null;

  let objectives: string[] = [];
  let stages: { name: string; title: string }[] = [];
  try {
    const c = JSON.parse(plan.contentJson);
    objectives = Array.isArray(c.learningObjectives)
      ? c.learningObjectives.filter((x: unknown) => typeof x === "string").slice(0, 6)
      : [];
    stages = Array.isArray(c.stages)
      ? c.stages
          .map((s: { stage?: string; title?: string }) => ({
            name: typeof s?.stage === "string" ? s.stage : "",
            title: typeof s?.title === "string" ? s.title : "",
          }))
          .filter((s: { name: string }) => !!s.name)
      : [];
  } catch {
    /* unparseable plan content — still return title/meta */
  }

  return {
    id: plan.id,
    title: plan.title,
    subject: plan.subject,
    grade: plan.grade,
    board: plan.board,
    periods: plan.periods,
    periodMinutes: plan.periodMinutes,
    provenance: plan.provenance,
    objectives,
    stages,
  };
}

/** Latest ended live class of this tutor with non-empty AI notes. */
async function findLastClassNotes(tutorId: string) {
  const classes = await db.liveClass.findMany({
    where: { tutorId, status: "ended" },
    orderBy: { endedAt: "desc" },
  });
  for (const c of classes) {
    if (!c.notesJson || c.notesJson === "{}") continue;
    try {
      const n = JSON.parse(c.notesJson);
      const summary = typeof n.summary === "string" ? n.summary : "";
      const homeworkRaw = n.homework;
      const homework = Array.isArray(homeworkRaw)
        ? homeworkRaw.filter((x: unknown) => typeof x === "string").join("; ")
        : typeof homeworkRaw === "string"
          ? homeworkRaw
          : "";
      if (!summary && !homework) continue;
      return {
        classTitle: c.title,
        subject: c.subject,
        endedAt: c.endedAt ?? c.createdAt,
        summary,
        homework,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Handover packs are a tutor tool.");

  const bookingId = new URL(req.url).searchParams.get("bookingId") ?? "";
  if (!bookingId) return badRequest("bookingId query parameter is required.");

  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.tutorId !== auth.id) return notFound("Booking not found.");

  const [studentUser, profile, lessonPlan, lastClassNotes, homeworkDue] = await Promise.all([
    db.user.findUnique({ where: { id: booking.studentId }, select: { name: true } }),
    db.studentProfile.findUnique({ where: { userId: booking.studentId } }),
    findLessonPlan(auth.id, booking.subject),
    findLastClassNotes(auth.id),
    db.homework.findFirst({
      where: { studentId: booking.studentId, status: "assigned" },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  return Response.json({
    data: {
      booking: {
        id: booking.id,
        title: booking.title,
        subject: booking.subject,
        grade: booking.grade,
        board: booking.board,
        startAt: booking.startAt,
        mode: booking.mode,
      },
      student: {
        name: studentUser?.name ?? "Student",
        grade: profile?.grade ?? booking.grade,
        weakTopics: parseJsonArray(profile?.weakTopics),
        goals: parseJsonArray(profile?.goals),
      },
      lessonPlan,
      lastClassNotes,
      homeworkDue: homeworkDue
        ? { id: homeworkDue.id, title: homeworkDue.title, subject: homeworkDue.subject, dueAt: homeworkDue.dueAt }
        : null,
    },
  });
}

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Handover packs are a tutor tool.");

  let body: { bookingId?: string; substituteTutorId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const bookingId = (body?.bookingId ?? "").toString().trim();
  const substituteTutorId = (body?.substituteTutorId ?? "").toString().trim();
  if (!bookingId) return badRequest("bookingId is required.");
  if (!substituteTutorId) return badRequest("substituteTutorId is required.");

  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.tutorId !== auth.id) return notFound("Booking not found.");

  const substitute = await db.user.findUnique({
    where: { id: substituteTutorId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!substitute || substitute.role !== "tutor" || substitute.status !== "active") {
    return badRequest("Substitute tutor not found.");
  }

  const [studentUser] = await Promise.all([
    db.user.findUnique({ where: { id: booking.studentId }, select: { name: true } }),
  ]);
  const studentName = studentUser?.name ?? "the student";
  const dateLabel = booking.startAt.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  await db.notification.create({
    data: {
      userId: substitute.id,
      title: "Handover pack received",
      body: `📩 Handover pack: ${studentName}'s ${booking.subject} session on ${dateLabel} — open Tutor dashboard to review.`,
      type: "booking",
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "session.handover_sent",
    `Booking: ${booking.id}`,
    `Handover pack for ${studentName}'s ${booking.subject} session on ${dateLabel} sent to ${substitute.name}`
  );

  return Response.json({ data: { ok: true } }, { status: 201 });
}
