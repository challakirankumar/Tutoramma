import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound } from "@/lib/auth";

/**
 * GET /api/parent/reports[?childId=]
 *
 * Weekly progress reports the TUTOR HAS APPROVED — the parent never sees
 * awaiting drafts (they only flip a `preparing` flag for the current week).
 * Response: { weekStart, children: [{ childId, childName, firstName, grade,
 * board, color, report|null, preparing }] } where `report` is the latest
 * approved ParentReport with its full content.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

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

function parseContent(raw: string) {
  try {
    const v = JSON.parse(raw);
    return {
      summary: typeof v.summary === "string" ? v.summary : "",
      highlights: Array.isArray(v.highlights) ? v.highlights.filter((x) => typeof x === "string") : [],
      focus: Array.isArray(v.focus) ? v.focus.filter((x) => typeof x === "string") : [],
      score: typeof v.score === "number" ? v.score : null,
      attendance: typeof v.attendance === "string" ? v.attendance : "",
      label: typeof v.label === "string" ? v.label : "Tutor approved",
      fallback: v.fallback === true,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden("This area is for parents.");

  const now = new Date();
  const weekStart = weekStartOf(now);

  /* children: linked via StudentProfile.parentEmail OR ParentProfile.childrenEmails */
  const parentProfile = await db.parentProfile.findUnique({ where: { userId: auth.id } });
  const linkedEmails = parseJsonArray(parentProfile?.childrenEmails);
  const children = await db.studentProfile.findMany({
    where: { OR: [{ parentEmail: auth.email }, ...(linkedEmails.length ? [{ user: { email: { in: linkedEmails } } }] : [])] },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });

  const childId = new URL(req.url).searchParams.get("childId");
  if (childId) {
    const one = children.find((c) => c.userId === childId);
    if (!one) return notFound("Child not found in your family.");
  }
  const selected = childId ? children.filter((c) => c.userId === childId) : children;

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

  const packs = await Promise.all(
    selected.map(async (child) => {
      const [approvedReports, awaitingThisWeek, sessions, tests, homework] = await Promise.all([
        db.parentReport.findMany({
          where: { studentId: child.userId, status: "approved" },
          orderBy: { approvedAt: "desc" },
        }),
        db.parentReport.findFirst({
          where: { studentId: child.userId, weekStart, status: "awaiting" },
          select: { id: true },
        }),
        db.booking.count({
          where: { studentId: child.userId, state: { in: ["released", "completed"] }, startAt: { gte: weekAgo, lte: now } },
        }),
        db.testResult.count({ where: { studentId: child.userId, takenAt: { gte: twoWeeksAgo } } }),
        db.homework.count({ where: { studentId: child.userId, status: "graded" } }),
      ]);

      const latest = approvedReports[0] ?? null;
      let tutorName = "the tutor";
      if (latest) {
        const tutor = await db.user.findUnique({ where: { id: latest.tutorId }, select: { name: true } });
        tutorName = tutor?.name ?? tutorName;
      }

      return {
        childId: child.userId,
        childName: child.user.name,
        firstName: child.user.name.split(" ")[0] || "your child",
        grade: child.grade,
        board: child.boardId,
        color: child.user.avatarColor,
        report: latest
          ? {
              id: latest.id,
              weekStart: latest.weekStart,
              approvedAt: latest.approvedAt,
              tutorName,
              content: parseContent(latest.contentJson),
            }
          : null,
        preparing: !!awaitingThisWeek,
        stats: {
          sessionsCompleted: sessions,
          assessments: tests,
          homeworkGraded: homework,
        },
      };
    })
  );

  return Response.json({ data: { weekStart, children: packs } });
}
