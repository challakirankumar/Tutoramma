import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

interface CellSession {
  startMin: number;
  endMin: number;
  subject: string;
  board: string;
  studentName: string;
  mode: string;
  title: string;
  state: string;
}

/** Master weekly grid — approved tutors × weekdays, with per-tutor load + batch patterns. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const [tutorProfiles, weekBookings, batches] = await Promise.all([
    db.tutorProfile.findMany({
      where: { status: "approved" },
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    }),
    db.booking.findMany({
      where: { startAt: { gte: startOfWeek, lt: endOfWeek }, state: { in: ["accepted", "in_progress", "completed", "released"] } },
    }),
    db.batch.findMany({ where: { status: { in: ["open", "confirmed"] } } }),
  ]);

  /* student names for the week's bookings (manual join) */
  const studentIds = [...new Set(weekBookings.map((b) => b.studentId))];
  const students = await db.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, name: true },
  });
  const smap = new Map(students.map((s) => [s.id, s.name]));

  const grid = new Map<string, { userId: string; name: string; color: string; cells: { count: number; sessions: CellSession[] }[] }>();
  for (const t of tutorProfiles) {
    grid.set(t.userId, {
      userId: t.userId,
      name: t.user.name,
      color: t.user.avatarColor,
      cells: Array.from({ length: 7 }, () => ({ count: 0, sessions: [] })),
    });
  }

  const addSession = (tutorId: string, day: number, s: CellSession) => {
    const row = grid.get(tutorId);
    if (!row || day < 0 || day > 6) return;
    row.cells[day].sessions.push(s);
    row.cells[day].count += 1;
  };

  for (const b of weekBookings) {
    const d = new Date(b.startAt);
    const startMin = d.getHours() * 60 + d.getMinutes();
    addSession(b.tutorId, d.getDay(), {
      startMin,
      endMin: startMin + Math.round((new Date(b.endAt).getTime() - d.getTime()) / 60000),
      subject: b.subject,
      board: b.board,
      studentName: smap.get(b.studentId) ?? "—",
      mode: b.mode,
      title: b.title,
      state: b.state,
    });
  }

  for (const batch of batches) {
    const pattern = JSON.parse(batch.dayPattern || "[]") as { day: number; start: number; end: number }[];
    for (const slot of pattern) {
      addSession(batch.tutorId, slot.day, {
        startMin: slot.start,
        endMin: slot.end,
        subject: batch.subject,
        board: batch.board,
        studentName: `Group · ${batch.seatsFilled} seated`,
        mode: batch.mode,
        title: batch.title,
        state: batch.status,
      });
    }
  }

  const tutors = [...grid.values()].map((row) => ({
    userId: row.userId,
    name: row.name,
    color: row.color,
    load: row.cells.reduce((s, c) => s + c.count, 0),
    cells: row.cells.map((c) => ({
      count: c.count,
      sessions: c.sessions.sort((a, b) => a.startMin - b.startMin),
    })),
  }));
  tutors.sort((a, b) => b.load - a.load || a.name.localeCompare(b.name));

  const totalSessions = tutors.reduce((s, t) => s + t.load, 0);
  return Response.json({
    data: {
      weekStart: startOfWeek,
      weekEnd: endOfWeek,
      tutors,
      totals: { tutors: tutors.length, sessions: totalSessions },
    },
  });
}
