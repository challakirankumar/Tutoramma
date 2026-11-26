import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/**
 * Tutor Route Planner (spec §29). For a day's home visits: travel legs, slack
 * between visits, tight-buffer warnings and the distance saved by any swap of
 * two visits (advisory — families' slots never move without their consent).
 */
type Pt = { lat: number; lng: number };
const R = 6371;
const km = (a: Pt, b: Pt) => {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.35; /* road factor */
};
const CITY_KMPH = 18;
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();
  const u = new URL(req.url);
  const from = new Date(Date.now() - 86400000);
  const to = new Date(Date.now() + 14 * 86400000);
  const visits = await db.booking.findMany({
    where: { tutorId: auth.id, mode: "home", state: { notIn: ["cancelled", "declined"] }, startAt: { gte: from, lte: to } },
    include: { homeSession: true },
    orderBy: { startAt: "asc" },
  });
  const days = new Map<string, number>();
  visits.forEach((v) => days.set(istDay(v.startAt), (days.get(istDay(v.startAt)) ?? 0) + 1));
  const busiest = [...days.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const date = u.searchParams.get("date") || (days.has(istDay(new Date())) ? istDay(new Date()) : busiest) || istDay(new Date());

  const students = await db.user.findMany({ where: { id: { in: visits.map((v) => v.studentId) } }, select: { id: true, name: true } });
  const stops = visits
    .filter((v) => istDay(v.startAt) === date && v.homeSession)
    .map((v) => ({
      bookingId: v.id,
      student: students.find((s) => s.id === v.studentId)?.name ?? "Student",
      subject: v.subject,
      area: v.homeSession!.destArea,
      start: v.startAt,
      end: v.endAt,
      at: { lat: v.homeSession!.destLat, lng: v.homeSession!.destLng },
      stage: v.homeSession!.stage,
    }));

  const sLat = Number(u.searchParams.get("lat"));
  const sLng = Number(u.searchParams.get("lng"));
  const home: Pt | null = Number.isFinite(sLat) && Number.isFinite(sLng) && sLat && sLng ? { lat: sLat, lng: sLng } : null;
  const origin = home ?? stops[0]?.at ?? null;

  const legs = stops.map((s, i) => {
    const prev = i === 0 ? origin : stops[i - 1].at;
    const dist = prev ? km(prev, s.at) : 0;
    const travelMin = Math.round((dist / CITY_KMPH) * 60) + (dist > 0 ? 5 : 0); /* +5 min parking */
    const slack = i === 0 ? null : Math.round((s.start.getTime() - stops[i - 1].end.getTime()) / 60000);
    return {
      ...s,
      legKm: Math.round(dist * 10) / 10,
      travelMin,
      slackMin: slack,
      leaveBy: new Date(s.start.getTime() - (travelMin + 10) * 60000),
      warning: slack != null && slack < travelMin + 10 ? (slack < travelMin ? "Unreachable on time — consider rescheduling" : "Tight buffer — leave the previous visit on time") : null,
    };
  });
  const totalKm = Math.round(legs.reduce((a, l) => a + l.legKm, 0) * 10) / 10;

  /* advisory swaps: any pair whose exchange shortens the day's route */
  const routeKm = (order: Pt[]) => order.reduce((a, p, i) => a + (i === 0 ? (origin ? km(origin, p) : 0) : km(order[i - 1], p)), 0);
  const base = routeKm(stops.map((s) => s.at));
  const swaps: { a: string; b: string; savedKm: number }[] = [];
  for (let i = 0; i < stops.length; i++)
    for (let j = i + 1; j < stops.length; j++) {
      const order = stops.map((s) => s.at);
      [order[i], order[j]] = [order[j], order[i]];
      const saved = base - routeKm(order);
      if (saved > 0.8) swaps.push({ a: `${stops[i].student} (${stops[i].area})`, b: `${stops[j].student} (${stops[j].area})`, savedKm: Math.round(saved * 10) / 10 });
    }
  swaps.sort((x, y) => y.savedKm - x.savedKm);
  return Response.json({
    data: {
      date,
      days: [...days.entries()].map(([d, n]) => ({ date: d, visits: n })).sort((a, b) => a.date.localeCompare(b.date)),
      origin,
      usingHome: !!home,
      legs,
      totalKm,
      driveMin: legs.reduce((a, l) => a + l.travelMin, 0),
      fuelLitres: Math.round((totalKm / 45) * 10) / 10 /* two-wheeler ~45 km/l */,
      swaps: swaps.slice(0, 3),
    },
  });
}
