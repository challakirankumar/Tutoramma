import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * /api/tutor/reports — weekly parent progress reports (tutor approval flow).
 *
 *  GET              → drafts for the current week: for each student with an
 *                     accepted/completed booking by this tutor, generate an
 *                     awaiting ParentReport if none exists yet (LLM draft with
 *                     20s timeout, deterministic labelled fallback). Returns
 *                     all awaiting + recently approved reports.
 *  PATCH {id, content?, approve?} → edit (partial JSON merge) and/or approve.
 *                     Approving notifies the parent and audits report.approved.
 *  DELETE ?id=      → discard an awaiting draft.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LLM_TIMEOUT_MS = 20_000;
const LLM_CONCURRENCY = 2; // the AI gateway 429s on bursts — draft a couple at a time
const DRAFT_DEADLINE_MS = 35_000; // global budget for this GET; the rest fall back deterministically

interface DraftContent {
  summary: string;
  highlights: string[];
  focus: string[];
  score: number | null;
  attendance: string;
  label: string;
  fallback?: boolean;
}

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

/** Monday 00:00 (local) of the week containing `d`. */
function weekStartOf(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sunday
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseContent(raw: string): DraftContent {
  try {
    const v = JSON.parse(raw);
    return {
      summary: typeof v.summary === "string" ? v.summary : "",
      highlights: Array.isArray(v.highlights) ? v.highlights : [],
      focus: Array.isArray(v.focus) ? v.focus : [],
      score: typeof v.score === "number" ? v.score : null,
      attendance: typeof v.attendance === "string" ? v.attendance : "",
      label: typeof v.label === "string" ? v.label : "Draft",
      fallback: v.fallback === true,
    };
  } catch {
    return { summary: "", highlights: [], focus: [], score: null, attendance: "", label: "Draft" };
  }
}

/** Strict JSON extraction from the LLM reply — null when the shape is unusable. */
function parseDraftFromLlm(text: string): DraftContent | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const summary = typeof v.summary === "string" ? v.summary.trim() : "";
  const highlights = Array.isArray(v.highlights)
    ? v.highlights.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3)
    : [];
  const focus = Array.isArray(v.focus)
    ? v.focus.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 2)
    : [];
  if (!summary || summary.length < 20 || highlights.length < 1) return null;
  const score =
    typeof v.score === "number" && v.score >= 0 && v.score <= 100 ? Math.round(v.score) : null;
  const attendance = typeof v.attendance === "string" ? v.attendance.trim() : "";
  return { summary, highlights, focus, score, attendance, label: "AI draft" };
}

/** Deterministic, clearly-labelled fallback draft built from real records. */
function fallbackDraft(
  firstName: string,
  sessions: { subject: string; topic: string; when: string }[],
  tests: { title: string; score: number; total: number }[],
  attendance: string
): DraftContent {
  const lines: string[] = [`Weekly draft (offline fallback) for ${firstName} — assembled from session records while the writing assistant was unavailable.`];
  if (sessions.length) {
    lines.push(
      `${firstName} completed ${sessions.length} session${sessions.length > 1 ? "s" : ""} in the last 14 days: ${sessions
        .map((s) => `${s.subject} — ${s.topic} (${s.when})`)
        .join("; ")}.`
    );
  } else {
    lines.push(`${firstName} had no completed sessions in the last 14 days — a good week to get one back on the calendar.`);
  }
  if (tests.length) {
    lines.push(`Recent assessments: ${tests.map((t) => `${t.title} — ${t.score}/${t.total}`).join("; ")}.`);
  }
  const avg = tests.length ? Math.round(tests.reduce((s, t) => s + (t.score / t.total) * 100, 0) / tests.length) : null;
  return {
    summary: lines.join(" "),
    highlights: tests.length
      ? tests.slice(0, 2).map((t) => `${t.title} — scored ${t.score}/${t.total}`)
      : sessions.length
        ? sessions.slice(0, 2).map((s) => `Attended ${s.subject} — ${s.topic}`)
        : [`Steady attendance and a positive attitude in ${firstName}'s sessions`],
    focus: ["Short daily revision of this fortnight's covered topics"],
    score: avg,
    attendance,
    label: "Offline fallback",
    fallback: true,
  };
}

async function draftViaLlm(context: unknown, deadline: number): Promise<DraftContent | null> {
  if (Date.now() >= deadline) return null; // out of budget — deterministic fallback
  try {
    const llmTask = (async () => {
      const { default: ZAI } = await import("@/lib/ai");
      const zai = await ZAI.create();
      return zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content:
              "You draft weekly progress updates for parents. Honest, warm, specific, 3-5 sentences. Return STRICT JSON {summary, highlights: string[2-3], focus: string[1-2], score: number 0-100 (confidence in mastery), attendance: string}",
          },
          { role: "user", content: JSON.stringify(context) },
        ],
        thinking: { type: "disabled" },
      });
    })();
    llmTask.catch(() => {}); // keep the losing promise from surfacing as unhandled
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM timeout")), LLM_TIMEOUT_MS)
    );
    timeout.catch(() => {});
    const completion = (await Promise.race([llmTask, timeout])) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
    return parseDraftFromLlm(text);
  } catch {
    return null;
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

const shape = (r: {
  id: string;
  studentId: string;
  tutorId: string;
  weekStart: Date;
  contentJson: string;
  status: string;
  approvedAt: Date | null;
  createdAt: Date;
}, studentName: string, studentColor: string) => ({
  id: r.id,
  studentId: r.studentId,
  studentName,
  studentColor,
  weekStart: r.weekStart,
  status: r.status,
  approvedAt: r.approvedAt,
  createdAt: r.createdAt,
  content: parseContent(r.contentJson),
});

/* ---------- GET: generate + list this week's drafts ---------- */

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Weekly reports are managed by tutors.");

  const now = new Date();
  const weekStart = weekStartOf(now);
  const since = new Date(now.getTime() - 14 * DAY_MS);

  /* every student this tutor has (or has had) an active booking with */
  const bookings = await db.booking.findMany({
    where: { tutorId: auth.id, state: { in: ["accepted", "in_progress", "completed", "released"] } },
    orderBy: { startAt: "desc" },
  });
  const studentIds = [...new Set(bookings.map((b) => b.studentId))];
  if (!studentIds.length) {
    return Response.json({ data: { weekStart, awaiting: [], approved: [] } });
  }

  const [students, existing] = await Promise.all([
    db.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, avatarColor: true } }),
    db.parentReport.findMany({ where: { tutorId: auth.id, weekStart } }),
  ]);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const existingIds = new Set(existing.map((r) => r.studentId));

  /* generate a draft for every student that has none yet — throttled LLM with a
     global budget, deterministic labelled fallback for anything the LLM misses */
  const missing = studentIds.filter((id) => !existingIds.has(id));
  const deadline = Date.now() + DRAFT_DEADLINE_MS;
  const drafts = await mapWithConcurrency(missing, LLM_CONCURRENCY, async (studentId) => {
      const user = studentMap.get(studentId);
      if (!user) return null;
      const firstName = user.name.split(" ")[0] || "your student";
      const mine = bookings.filter((b) => b.studentId === studentId);
      const subjects = [...new Set(mine.map((b) => b.subject))];

      const recent = mine.filter(
        (b) => ["completed", "released"].includes(b.state) && b.startAt >= since && b.startAt <= now
      );
      const sessionBits = recent.slice(0, 5).map((b) => ({
        subject: b.subject,
        topic: b.title.replace(/^[^—]+—\s*/, "") || b.title,
        when: b.startAt.toLocaleDateString("en-IN", { weekday: "long" }),
        coveredTopics: parseJsonArray(b.topics),
      }));

      const tests = await db.testResult.findMany({
        where: { studentId },
        orderBy: { takenAt: "desc" },
        take: 5,
      });

      const attended = mine.filter((b) => ["completed", "released"].includes(b.state)).length;
      const missed = mine.filter((b) => ["no_show", "cancelled"].includes(b.state)).length;
      const attendance =
        attended + missed > 0
          ? `Attended ${attended} of ${attended + missed} sessions`
          : "No completed sessions yet this term";

      /* privacy: first name only — never full identifiers */
      const context = {
        student: firstName,
        subjects,
        recentSessions: sessionBits,
        assessments: tests.map((t) => ({
          title: t.title,
          subject: t.subject,
          score: t.score,
          total: t.total,
          when: t.takenAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        })),
        attendance,
      };

      const content =
        (await draftViaLlm(context, deadline)) ??
        fallbackDraft(firstName, sessionBits, tests.map((t) => ({ title: t.title, score: t.score, total: t.total })), attendance);

      return { studentId, content };
  });

  for (const d of drafts) {
    if (!d) continue;
    try {
      await db.parentReport.create({
        data: {
          studentId: d.studentId,
          tutorId: auth.id,
          weekStart,
          contentJson: JSON.stringify(d.content),
          status: "awaiting",
        },
      });
    } catch {
      /* unique [studentId, tutorId, weekStart] — a parallel GET already created it */
    }
  }

  const [awaiting, approvedRows] = await Promise.all([
    db.parentReport.findMany({
      where: { tutorId: auth.id, weekStart, status: "awaiting" },
      orderBy: { createdAt: "asc" },
    }),
    db.parentReport.findMany({
      where: { tutorId: auth.id, status: "approved", approvedAt: { gte: new Date(now.getTime() - 14 * DAY_MS) } },
      orderBy: { approvedAt: "desc" },
    }),
  ]);

  return Response.json({
    data: {
      weekStart,
      awaiting: awaiting.map((r) => shape(r, studentMap.get(r.studentId)?.name ?? "Student", studentMap.get(r.studentId)?.avatarColor ?? "#315BE5")),
      approved: approvedRows.map((r) =>
        shape(r, studentMap.get(r.studentId)?.name ?? "Student", studentMap.get(r.studentId)?.avatarColor ?? "#315BE5")
      ),
    },
  });
}

/* ---------- PATCH: edit + approve ---------- */

export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Weekly reports are managed by tutors.");

  let body: { id?: string; content?: Record<string, unknown>; approve?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const id = (body?.id ?? "").toString().trim();
  if (!id) return badRequest("Report id is required.");
  if (body?.content !== undefined && (typeof body.content !== "object" || body.content === null || Array.isArray(body.content))) {
    return badRequest("content must be an object.");
  }

  const report = await db.parentReport.findUnique({ where: { id } });
  if (!report || report.tutorId !== auth.id) return notFound("Report not found.");

  let content = parseContent(report.contentJson);
  let saved = report;

  if (body?.content) {
    const patch = body.content as Record<string, unknown>;
    if (typeof patch.summary === "string" && patch.summary.trim()) content.summary = patch.summary.trim().slice(0, 1200);
    if (Array.isArray(patch.highlights))
      content.highlights = patch.highlights.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3);
    if (Array.isArray(patch.focus))
      content.focus = patch.focus.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 2);
    if (typeof patch.score === "number" && patch.score >= 0 && patch.score <= 100) content.score = Math.round(patch.score);
    if (typeof patch.attendance === "string" && patch.attendance.trim()) content.attendance = patch.attendance.trim().slice(0, 200);
    saved = await db.parentReport.update({
      where: { id: report.id },
      data: { contentJson: JSON.stringify(content) },
    });
  }

  if (body?.approve) {
    if (saved.status !== "approved") {
      saved = await db.parentReport.update({
        where: { id: report.id },
        data: { status: "approved", approvedAt: new Date() },
      });

      /* notify the parent user — resolved via StudentProfile.parentEmail */
      const [studentUser, profile] = await Promise.all([
        db.user.findUnique({ where: { id: saved.studentId }, select: { name: true } }),
        db.studentProfile.findUnique({ where: { userId: saved.studentId }, select: { parentEmail: true } }),
      ]);
      const parentEmail = profile?.parentEmail;
      const parentUser = parentEmail
        ? await db.user.findUnique({ where: { email: parentEmail }, select: { id: true } })
        : null;
      if (parentUser) {
        await db.notification.create({
          data: {
            userId: parentUser.id,
            title: "Weekly progress report ready",
            body: `Weekly progress report for ${studentUser?.name?.split(" ")[0] ?? "your child"} is ready — open Reports to read it.`,
            type: "system",
          },
        });
      }

      await audit(
        { name: auth.name, role: auth.role },
        "report.approved",
        `ParentReport: ${saved.id}`,
        `Week of ${weekStartOf(saved.weekStart).toLocaleDateString("en-IN")} · student ${saved.studentId}`
      );
    }
  }

  const student = await db.user.findUnique({ where: { id: saved.studentId }, select: { name: true, avatarColor: true } });
  return Response.json({ data: shape(saved, student?.name ?? "Student", student?.avatarColor ?? "#315BE5") });
}

/* ---------- DELETE: discard an awaiting draft ---------- */

export async function DELETE(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Weekly reports are managed by tutors.");

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return badRequest("Report id is required.");

  const report = await db.parentReport.findUnique({ where: { id } });
  if (!report || report.tutorId !== auth.id) return notFound("Report not found.");
  if (report.status !== "awaiting") return badRequest("Only awaiting drafts can be discarded.");

  await db.parentReport.delete({ where: { id: report.id } });
  await audit(
    { name: auth.name, role: auth.role },
    "report.discarded",
    `ParentReport: ${report.id}`,
    `Draft for week of ${weekStartOf(report.weekStart).toLocaleDateString("en-IN")} discarded`
  );
  return Response.json({ data: { ok: true } });
}
