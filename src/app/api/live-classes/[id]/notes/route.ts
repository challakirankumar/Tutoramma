import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";
import ZAI from "@/lib/ai";

/**
 * /api/live-classes/[id]/notes — AI class notes (spec Part J).
 *
 * POST   {action: "generate", qaCount?, slideTitles?}  → compile class context
 *        (title/subject/board/grade/agenda, attendance, Q&A count, slide
 *        titles) → LLM draft → STRICT JSON with a deterministic labelled
 *        fallback → saved to LiveClass.notesJson as status "draft" with the
 *        absentee list. Host (class owner) only.
 * GET    → the saved notesJson.
 * PATCH  {summary?, actionItems?, homework?, send?}   → edit + optionally
 *        send: attendees get "Class notes", absentees a catch-up pack, all
 *        enrolled students get 3 spaced revision nudges (+1d/+3d/+7d) and
 *        attendees earn +15 XP "Class participation".
 */

interface AttendanceRow {
  name: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
  durationMin: number;
  status: string;
}

interface NotesShape {
  summary: string;
  actionItems: string[];
  homework: string;
  status: "draft" | "sent";
  absentees: string[];
  generatedAt: string;
  aiDraft: boolean;
  sentAt?: string;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, label = "timeout") =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(label)), ms))]);

function parseJsonLoose<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as T;
    } catch {}
  }
  return null;
}

function parseAttendance(json: string): AttendanceRow[] {
  try {
    const parsed = JSON.parse(json || "{}");
    return Array.isArray(parsed?.attendees) ? (parsed.attendees as AttendanceRow[]) : [];
  } catch {
    return [];
  }
}

/* case-insensitive name → student user map (SQLite has no insensitive mode) */
async function studentNameMap() {
  const students = await db.user.findMany({ where: { role: "student" }, select: { id: true, name: true } });
  const map = new Map<string, { id: string; name: string }>();
  for (const s of students) map.set(s.name.trim().toLowerCase(), s);
  return map;
}

async function enrolledStudents(batchId: string | null) {
  if (!batchId) return [] as { id: string; name: string }[];
  const seats = await db.batchSeat.findMany({ where: { batchId, status: "joined" }, select: { studentId: true } });
  if (!seats.length) return [];
  return db.user.findMany({ where: { id: { in: seats.map((s) => s.studentId) } }, select: { id: true, name: true } });
}

async function loadOwnedClass(id: string, authId: string) {
  const c = await db.liveClass.findUnique({ where: { id } });
  if (!c) return { error: notFound("Live class not found.") } as const;
  if (c.tutorId !== authId) return { error: forbidden("Only the class host can manage class notes.") } as const;
  return { c } as const;
}

/* ----------------------------- GET ----------------------------- */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const owned = await loadOwnedClass(id, auth.id);
  if ("error" in owned) return owned.error;

  let notes: NotesShape | null = null;
  try {
    notes = JSON.parse(owned.c.notesJson || "{}");
  } catch {
    notes = null;
  }
  return Response.json({ data: { notes: notes && notes.summary ? notes : null } });
}

/* ----------------------------- POST (generate) ----------------------------- */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const owned = await loadOwnedClass(id, auth.id);
  if ("error" in owned) return owned.error;
  const c = owned.c;

  const body = (await req.json().catch(() => ({}))) as { action?: string; qaCount?: number; slideTitles?: string[] };
  if (body.action !== "generate") return badRequest('Use {action: "generate"} to draft class notes.');

  /* ---- compile context ---- */
  const attendees = parseAttendance(c.attendanceJson);
  const attendeeNames = attendees.map((a) => a.name);
  const qaCount = Math.max(0, Math.min(200, Number(body.qaCount) || 0));
  const slideTitles = (body.slideTitles ?? []).map(String).slice(0, 30);

  const context = [
    `Class: ${c.title}`,
    `Subject: ${c.subject}${c.board ? ` · Board: ${c.board}` : ""}${c.grade ? ` · Grade: ${c.grade}` : ""}`,
    c.agenda ? `Agenda: ${c.agenda}` : "Agenda: (none provided)",
    `Attendance: ${attendees.length} joined${attendeeNames.length ? ` (${attendeeNames.slice(0, 12).join(", ")})` : ""}`,
    `Questions asked in Q&A: ${qaCount}`,
    slideTitles.length ? `Slides presented: ${slideTitles.join(" · ")}` : "Slides presented: none",
  ].join("\n");

  /* ---- LLM draft (20s guard, strict JSON, labelled fallback) ---- */
  let summary = "";
  let actionItems: string[] = [];
  let homework = "";
  let aiDraft = false;
  try {
    const zai = await ZAI.create();
    const res = await withTimeout(
      zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content:
              "You write concise class notes for a tutoring platform. Return STRICT JSON {summary: string (2-3 sentences), actionItems: string[] (2-4), homework: string (1 sentence)}. No markdown, no commentary — JSON only.",
          },
          { role: "user", content: context },
        ],
        temperature: 0.4,
        max_tokens: 500,
        thinking: { type: "disabled" },
      }),
      20000
    );
    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonLoose<{ summary?: string; actionItems?: string[]; homework?: string }>(raw);
    if (parsed?.summary && typeof parsed.summary === "string") {
      summary = parsed.summary.slice(0, 600);
      actionItems = (Array.isArray(parsed.actionItems) ? parsed.actionItems : []).map((x) => String(x).slice(0, 140)).filter(Boolean).slice(0, 4);
      homework = String(parsed.homework ?? "").slice(0, 300);
      aiDraft = true;
    }
  } catch {
    /* fall through to the deterministic draft */
  }

  if (!summary) {
    summary = `Class notes draft (offline fallback) — covering ${c.agenda?.trim() || c.title}.`;
    actionItems = ["Review today's class notes and worked examples", "Practise two problems from the chapter", "Bring your doubts to the next class"];
    homework = "Revise today's topic and complete the practice exercises.";
    aiDraft = false;
  }
  if (!actionItems.length) actionItems = ["Review today's class notes"];
  if (!homework) homework = "Revise today's topic.";

  /* ---- absentees: enrolled students who never joined ---- */
  const enrolled = await enrolledStudents(c.batchId);
  const presentNames = new Set(attendeeNames.map((n) => n.trim().toLowerCase()));
  const absentees = enrolled.filter((s) => !presentNames.has(s.name.trim().toLowerCase())).map((s) => s.name);

  const notes: NotesShape = {
    summary,
    actionItems,
    homework,
    status: "draft",
    absentees,
    generatedAt: new Date().toISOString(),
    aiDraft,
  };
  await db.liveClass.update({ where: { id: c.id }, data: { notesJson: JSON.stringify(notes) } });

  return Response.json({ data: notes });
}

/* ----------------------------- PATCH (edit / send) ----------------------------- */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;
  const owned = await loadOwnedClass(id, auth.id);
  if ("error" in owned) return owned.error;
  const c = owned.c;

  const body = (await req.json().catch(() => null)) as {
    summary?: string;
    actionItems?: string[];
    homework?: string;
    send?: boolean;
  } | null;
  if (!body) return badRequest("Nothing to update.");

  let notes: NotesShape = {
    summary: "",
    actionItems: [],
    homework: "",
    status: "draft",
    absentees: [],
    generatedAt: new Date().toISOString(),
    aiDraft: false,
  };
  try {
    const parsed = JSON.parse(c.notesJson || "{}");
    if (parsed && typeof parsed === "object" && parsed.summary) notes = { ...notes, ...parsed };
  } catch {}

  if (typeof body.summary === "string" && body.summary.trim()) notes.summary = body.summary.trim().slice(0, 600);
  if (Array.isArray(body.actionItems)) notes.actionItems = body.actionItems.map((x) => String(x).slice(0, 140)).filter(Boolean).slice(0, 6);
  if (typeof body.homework === "string" && body.homework.trim()) notes.homework = body.homework.trim().slice(0, 300);

  const alreadySent = notes.status === "sent";
  const send = body.send === true;

  if (send && !alreadySent) {
    notes.status = "sent";
    notes.sentAt = new Date().toISOString();
  }

  await db.liveClass.update({ where: { id: c.id }, data: { notesJson: JSON.stringify(notes) } });

  let notified = 0;
  if (send && !alreadySent) {
    try {
      const attendees = parseAttendance(c.attendanceJson);
      const presentNames = new Set(attendees.map((a) => a.name.trim().toLowerCase()));
      const nameMap = await studentNameMap();

      /* matched student users among the attendees */
      const attendeeStudents = [...new Set(attendees.map((a) => nameMap.get(a.name.trim().toLowerCase())).filter(Boolean))] as { id: string; name: string }[];
      const enrolled = await enrolledStudents(c.batchId);
      const absentStudents = enrolled.filter((s) => !presentNames.has(s.name.trim().toLowerCase()));

      const actionBit = notes.actionItems.length ? ` Action items: ${notes.actionItems.join("; ")}.` : "";

      /* 1. attendees → class notes */
      for (const s of attendeeStudents) {
        await db.notification.create({
          data: {
            userId: s.id,
            title: `Class notes: ${c.title}`,
            body: `${notes.summary}${actionBit}`,
            type: "system",
          },
        });
        notified += 1;
      }

      /* 2. absentees → catch-up pack */
      for (const s of absentStudents) {
        await db.notification.create({
          data: {
            userId: s.id,
            title: `Catch-up pack — ${c.title}`,
            body: `${notes.summary} Homework: ${notes.homework} Your tutor attached a catch-up pack with what you missed.`,
            type: "system",
          },
        });
        notified += 1;
      }

      /* 3. spaced revision nudges — ALL enrolled students (fall back to
       * matched attendees for link-shared classes without a batch) */
      const nudgeTargets = enrolled.length ? enrolled : attendeeStudents;
      const now = Date.now();
      const nudgeBodies = [
        "Quick recall: rewrite today's key idea from memory, then check it against your notes.",
        "Spacing boost: redo one worked example from this class without looking at the solution.",
        "Almost there: explain today's topic to someone at home in 2 minutes — teaching locks it in.",
      ];
      for (const s of nudgeTargets) {
        for (let d = 0; d < 3; d++) {
          await db.notification.create({
            data: {
              userId: s.id,
              title: `Revision: ${c.subject} — ${c.title}`,
              body: nudgeBodies[d],
              type: "revision",
              scheduledAt: new Date(now + (d === 0 ? 1 : d === 1 ? 3 : 7) * 24 * 60 * 60 * 1000),
            },
          });
        }
      }

      /* 4. attendees earn +15 XP "Class participation" */
      for (const s of attendeeStudents) {
        const profile = await db.studentProfile.findUnique({ where: { userId: s.id }, select: { xp: true } });
        if (profile) {
          const xp = profile.xp + 15;
          await db.studentProfile.update({ where: { userId: s.id }, data: { xp, level: 1 + Math.floor(xp / 400) } });
        }
      }

      await audit({ name: auth.name, role: auth.role }, "class.notes_sent", "LiveClass", `${c.title} — ${notified} direct + ${nudgeTargets.length * 3} revision nudges`);
    } catch {
      /* notes are saved — never fail the whole request on a notification error */
    }
  }

  return Response.json({ data: { status: notes.status, notified } });
}
