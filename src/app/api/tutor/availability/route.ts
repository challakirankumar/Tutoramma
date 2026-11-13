import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";

/** Weekly availability editor backend — parses & persists TutorProfile.availabilityJson. */

interface Block {
  start: number;
  end: number;
}
interface DayRule {
  day: number;
  blocks: Block[];
}
interface Availability {
  weekly: DayRule[];
  exceptions: unknown[];
}

const DEFAULT_AVAILABILITY: Availability = {
  weekly: [
    { day: 0, blocks: [{ start: 960, end: 1200 }] }, // Sun 16:00–20:00
    { day: 2, blocks: [{ start: 1020, end: 1200 }] }, // Tue 17:00–20:00
    { day: 4, blocks: [{ start: 1020, end: 1200 }] }, // Thu 17:00–20:00
  ],
  exceptions: [],
};

function defaultAvailability(): Availability {
  return {
    weekly: DEFAULT_AVAILABILITY.weekly.map((w) => ({ ...w, blocks: w.blocks.map((b) => ({ ...b })) })),
    exceptions: [],
  };
}

function parseAvailability(raw: string | null | undefined): Availability {
  /* untouched / empty store → sensible Sun/Tue/Thu default per product spec */
  if (!raw || !raw.trim() || raw.trim() === "{}") return defaultAvailability();
  try {
    const v = JSON.parse(raw) as Partial<Availability>;
    if (!Array.isArray(v.weekly)) return defaultAvailability();
    const weekly = v.weekly
      .filter((w) => w && typeof w.day === "number" && w.day >= 0 && w.day <= 6 && Array.isArray(w.blocks))
      .map((w) => ({
        day: w.day,
        blocks: w.blocks
          .filter((b) => b && typeof b.start === "number" && typeof b.end === "number" && b.end > b.start && b.start >= 0 && b.end <= 1440)
          .map((b) => ({ start: Math.round(b.start), end: Math.round(b.end) })),
      }))
      .filter((w) => w.blocks.length > 0);
    const exceptions = Array.isArray(v.exceptions) ? v.exceptions : [];
    return { weekly, exceptions };
  } catch {
    return defaultAvailability();
  }
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const profile = await db.tutorProfile.findFirst({ where: { userId: auth.id } });
  if (!profile) return notFound("Tutor profile not found.");

  const availability = parseAvailability(profile.availabilityJson);
  let languages: string[] = [];
  let modes: string[] = [];
  try {
    languages = JSON.parse(profile.languages) as string[];
    modes = JSON.parse(profile.modes) as string[];
  } catch {
    /* keep defaults */
  }

  return Response.json({
    data: {
      weekly: availability.weekly,
      exceptions: availability.exceptions,
      travelBufferMin: profile.travelBufferMin,
      travelRadiusKm: profile.travelRadiusKm,
      modes,
      languages,
    },
  });
}

export async function PUT(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden();

  const profile = await db.tutorProfile.findFirst({ where: { userId: auth.id } });
  if (!profile) return notFound("Tutor profile not found.");

  let body: { weekly?: unknown; travelBufferMin?: unknown; travelRadiusKm?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  // validate weekly schedule
  if (!Array.isArray(body.weekly)) return badRequest("weekly must be an array of day rules.");
  const weekly: DayRule[] = [];
  for (const w of body.weekly) {
    if (!w || typeof (w as DayRule).day !== "number" || (w as DayRule).day < 0 || (w as DayRule).day > 6) {
      return badRequest("Each day rule needs a day between 0 (Sun) and 6 (Sat).");
    }
    const blocksIn = (w as DayRule).blocks;
    if (!Array.isArray(blocksIn) || blocksIn.length === 0) continue; // closed day
    const blocks: Block[] = [];
    for (const b of blocksIn) {
      const start = Math.round(Number(b?.start));
      const end = Math.round(Number(b?.end));
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1440 || start >= end) {
        return badRequest("Time blocks must be between 00:00 and 24:00 with start before end.");
      }
      blocks.push({ start, end });
    }
    if (blocks.length) weekly.push({ day: (w as DayRule).day, blocks });
  }

  const travelBufferMin = Math.min(60, Math.max(5, Math.round(Number(body.travelBufferMin ?? profile.travelBufferMin) || 0)));
  const travelRadiusKm = Math.min(50, Math.max(0, Math.round(Number(body.travelRadiusKm ?? profile.travelRadiusKm) || 0)));
  if (!Number.isFinite(travelBufferMin) || !Number.isFinite(travelRadiusKm)) {
    return badRequest("Travel buffer and radius must be numbers.");
  }

  const existing = parseAvailability(profile.availabilityJson);
  await db.tutorProfile.update({
    where: { id: profile.id },
    data: {
      availabilityJson: JSON.stringify({ weekly, exceptions: existing.exceptions }),
      travelBufferMin,
      travelRadiusKm,
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "availability.updated",
    `TutorProfile: ${auth.name}`,
    `${weekly.length} teaching day(s), buffer ${travelBufferMin} min, radius ${travelRadiusKm} km`
  );

  return Response.json({ data: { weekly, travelBufferMin, travelRadiusKm } });
}
