import { db } from "@/lib/db";
import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";
import { awardXp } from "@/lib/xp";
import { isoDay } from "@/lib/learning";

const DAY = 86400000;

/** GET /api/focus — focus stats: today, week, streak, 16-week heatmap, subject split, recent sessions. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const since = new Date(Date.now() - 16 * 7 * DAY);
  const sessions = await db.focusSession.findMany({ where: { userId: auth.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });

  const byDay: Record<string, number> = {};
  const bySubject: Record<string, number> = {};
  for (const s of sessions) {
    const k = isoDay(s.createdAt);
    byDay[k] = (byDay[k] ?? 0) + s.minutes;
    const subj = s.subject || "General";
    bySubject[subj] = (bySubject[subj] ?? 0) + s.minutes;
  }
  const today = isoDay(new Date());
  let streak = 0;
  for (let d = 0; d < 112; d++) {
    const k = isoDay(new Date(Date.now() - d * DAY));
    if (byDay[k]) streak++;
    else if (d > 0 || k !== today) break; // today without a session doesn't break the streak yet
  }
  const weekStart = Date.now() - 6 * DAY;
  const week = sessions.filter((s) => s.createdAt.getTime() >= new Date(isoDay(new Date(weekStart))).getTime()).reduce((a, s) => a + s.minutes, 0);

  return Response.json({
    data: {
      todayMinutes: byDay[today] ?? 0,
      weekMinutes: week,
      totalMinutes: sessions.reduce((a, s) => a + s.minutes, 0),
      sessionsCount: sessions.length,
      streak,
      heatmap: byDay,
      subjects: Object.entries(bySubject)
        .map(([name, minutes]) => ({ name, minutes }))
        .sort((a, b) => b.minutes - a.minutes),
      recent: sessions.slice(0, 8).map((s) => ({ id: s.id, minutes: s.minutes, label: s.label, subject: s.subject, createdAt: s.createdAt })),
    },
  });
}

/** POST /api/focus — log a completed focus block { minutes, label?, subject? }. 1 XP per focused minute (max 120). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let body: { minutes?: number; label?: string; subject?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const minutes = Math.round(Number(body.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) return badRequest("minutes must be between 1 and 180.");
  const session = await db.focusSession.create({
    data: { userId: auth.id, minutes, label: String(body.label ?? "").slice(0, 80), subject: String(body.subject ?? "").slice(0, 40) },
  });
  const xp = await awardXp(auth.id, Math.min(120, minutes));
  return Response.json({ data: { id: session.id, xp } }, { status: 201 });
}
