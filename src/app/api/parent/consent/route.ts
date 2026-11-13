import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

const DEFAULT_CONSENTS = {
  location: true,
  recording: false,
  messageVisibility: true,
  whatsapp: true,
  adultPresent: true,
};

function parseConsents(raw: string | null): Record<string, boolean> {
  if (!raw) return { ...DEFAULT_CONSENTS };
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? { ...DEFAULT_CONSENTS, ...v } : { ...DEFAULT_CONSENTS };
  } catch {
    return { ...DEFAULT_CONSENTS };
  }
}

async function loadProfile(userId: string) {
  let profile = await db.parentProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await db.parentProfile.create({
      data: { userId, consents: JSON.stringify(DEFAULT_CONSENTS) },
    });
  }
  return profile;
}

/** GET /api/parent/consent — current consent set + emergency contact. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden("This area is for parents.");

  const profile = await loadProfile(auth.id);
  return Response.json({
    data: {
      consents: parseConsents(profile.consents),
      emergencyName: profile.emergencyName,
      emergencyPhone: profile.emergencyPhone,
    },
  });
}

/** PUT /api/parent/consent — update consents and/or emergency contact. */
export async function PUT(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden("This area is for parents.");

  let body: { consents?: Record<string, unknown>; emergencyName?: string; emergencyPhone?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const profile = await loadProfile(auth.id);
  const current = parseConsents(profile.consents);

  let consents = current;
  if (body.consents !== undefined) {
    if (typeof body.consents !== "object" || body.consents === null || Array.isArray(body.consents)) {
      return badRequest("consents must be an object of booleans.");
    }
    const next: Record<string, boolean> = { ...current };
    for (const key of Object.keys(DEFAULT_CONSENTS)) {
      if (body.consents[key] !== undefined) {
        if (typeof body.consents[key] !== "boolean") return badRequest(`consents.${key} must be true or false.`);
        next[key] = body.consents[key] as boolean;
      }
    }
    consents = next;
  }

  const emergencyName = body.emergencyName !== undefined ? String(body.emergencyName).slice(0, 80) : profile.emergencyName;
  const emergencyPhone = body.emergencyPhone !== undefined ? String(body.emergencyPhone).slice(0, 30) : profile.emergencyPhone;

  await db.parentProfile.update({
    where: { id: profile.id },
    data: { consents: JSON.stringify(consents), emergencyName, emergencyPhone },
  });

  const changed = Object.keys(DEFAULT_CONSENTS).filter((k) => current[k] !== consents[k]);
  await audit(
    { name: auth.name, role: auth.role },
    "consent.updated",
    "ParentProfile",
    changed.length
      ? `Consents changed: ${changed.join(", ")} · emergency contact ${emergencyName || "—"} ${emergencyPhone || ""}`.trim()
      : `Emergency contact updated: ${emergencyName || "—"} ${emergencyPhone || ""}`.trim()
  );

  return Response.json({ data: { consents, emergencyName, emergencyPhone } });
}
