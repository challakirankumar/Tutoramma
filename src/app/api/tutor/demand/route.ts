import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BANDS = [
  { id: "morning", label: "6–10 AM", from: 6, to: 10 },
  { id: "day", label: "10 AM–3 PM", from: 10, to: 15 },
  { id: "evening", label: "3–7 PM", from: 15, to: 19 },
  { id: "night", label: "7–10 PM", from: 19, to: 22 },
];

/**
 * GET /api/tutor/demand — Tutor Demand Heatmap (spec §30): which subjects,
 * modes and time slots families book, against how many tutors offer them.
 * Aggregated across the marketplace; no family's personal data is exposed.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor" && auth.role !== "institute" && auth.role !== "admin") return forbidden();
  const since = new Date(Date.now() - 120 * 86400000);
  const [bookings, offerings, leads, mine] = await Promise.all([
    db.booking.findMany({ where: { createdAt: { gte: since } }, select: { subject: true, mode: true, startAt: true, tutorId: true } }),
    db.offering.findMany({ select: { subjectId: true, tutorId: true, mode: true } }),
    db.lead.findMany({ where: { createdAt: { gte: since } }, select: { message: true, grade: true, board: true } }),
    db.booking.findMany({ where: { tutorId: auth.id }, select: { startAt: true } }),
  ]);
  /* time heatmap in IST */
  const grid = DAYS.map(() => BANDS.map(() => 0));
  const myGrid = DAYS.map(() => BANDS.map(() => 0));
  const place = (d: Date, g: number[][]) => {
    const ist = new Date(d.getTime() + 330 * 60000);
    const h = ist.getUTCHours();
    const bi = BANDS.findIndex((b) => h >= b.from && h < b.to);
    if (bi >= 0) g[ist.getUTCDay()][bi]++;
  };
  bookings.forEach((b) => place(b.startAt, grid));
  mine.forEach((b) => place(b.startAt, myGrid));

  /* subject demand vs supply */
  const subj = new Map<string, { demand: number; tutors: Set<string>; home: number }>();
  bookings.forEach((b) => {
    const e = subj.get(b.subject) ?? { demand: 0, tutors: new Set<string>(), home: 0 };
    e.demand++;
    e.tutors.add(b.tutorId);
    if (b.mode === "home") e.home++;
    subj.set(b.subject, e);
  });
  const subjectNames = new Map((await db.curriculumSubject.findMany({ where: { id: { in: [...new Set(offerings.map((o) => o.subjectId))] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  offerings.forEach((o) => {
    const name = subjectNames.get(o.subjectId);
    if (!name) return;
    const e = subj.get(name) ?? { demand: 0, tutors: new Set<string>(), home: 0 };
    e.tutors.add(o.tutorId);
    subj.set(name, e);
  });
  leads.forEach((l) => {
    const m = l.message.toLowerCase();
    for (const [name, e] of subj) if (m.includes(name.toLowerCase())) e.demand++;
  });
  const subjects = [...subj.entries()]
    .map(([name, e]) => ({ name, demand: e.demand, tutors: e.tutors.size, homeShare: e.demand ? Math.round((e.home / e.demand) * 100) : 0, ratio: Math.round((e.demand / Math.max(1, e.tutors.size)) * 10) / 10 }))
    .filter((s) => s.demand > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 10);
  const max = Math.max(1, ...grid.flat());
  const hot: { day: string; band: string; count: number }[] = [];
  grid.forEach((row, d) => row.forEach((c, b) => c && hot.push({ day: DAYS[d], band: BANDS[b].label, count: c })));
  hot.sort((a, b) => b.count - a.count);
  /* open slots: high marketplace demand where this tutor has nothing booked */
  const open = hot.filter((h) => myGrid[DAYS.indexOf(h.day)][BANDS.findIndex((b) => b.label === h.band)] === 0).slice(0, 4);
  return Response.json({ data: { days: DAYS, bands: BANDS.map((b) => b.label), grid, myGrid, max, subjects, hot: hot.slice(0, 5), open, bookings: bookings.length } });
}
