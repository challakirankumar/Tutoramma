import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * The long-running dev server keeps a PrismaClient singleton that was created
 * before the Incident model was generated (and its require-cached module is
 * equally stale). Bust the cache, load the regenerated client straight from
 * disk and validate it — so the incident workflow works without a dev-server
 * restart. Becomes a no-op once the server restarts on the fresh client.
 */
async function safetyDb(): Promise<PrismaClient> {
  if ((db as unknown as { incident?: unknown }).incident) return db;
  const g = globalThis as unknown as { __ammaSafetyPrisma?: PrismaClient };
  const cached = g.__ammaSafetyPrisma;
  if (cached && (cached as unknown as { incident?: unknown }).incident) return cached;
  try {
    const req = createRequire(`${process.cwd()}/package.json`);
    const target = `${process.cwd()}/node_modules/.prisma/client/index.js`;
    for (const key of Object.keys(req.cache)) {
      if (key.includes("/node_modules/.prisma/") || key.includes("/node_modules/@prisma/client/")) delete req.cache[key];
    }
    const mod: any = req(target);
    const Ctor: new () => PrismaClient = mod.PrismaClient ?? mod.default?.PrismaClient;
    const inst = new Ctor();
    if (!(inst as unknown as { incident?: unknown }).incident) throw new Error("regenerated client has no incident model");
    g.__ammaSafetyPrisma = inst;
    return inst;
  } catch (e) {
    throw new Error(`safetyDb could not load the regenerated Prisma client: ${(e as Error).message}`);
  }
}

/* open → investigating → resolved | escalated
   (open may also jump straight to escalated for serious safety concerns;
    open can never jump straight to resolved) */
const TRANSITIONS: Record<string, string[]> = {
  open: ["investigating", "escalated"],
  investigating: ["resolved", "escalated"],
  resolved: [],
  escalated: [],
};

/** Move an incident through the safety workflow (admin only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const sdb = await safetyDb();
  const { id } = await params;
  let body: { status?: string; resolution?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const status = (body.status || "").trim();
  const resolution = (body.resolution || "").trim();
  if (!["investigating", "resolved", "escalated"].includes(status))
    return badRequest("status must be investigating, resolved or escalated.");
  if (status === "resolved" && !resolution)
    return badRequest("A resolution note is required to close an incident.");

  const incident = await sdb.incident.findUnique({ where: { id } });
  if (!incident) return notFound("Incident not found.");

  const allowed = TRANSITIONS[incident.status] ?? [];
  if (!allowed.includes(status))
    return badRequest(
      `Illegal transition ${incident.status} → ${status}. An open incident must be investigated (or escalated) first — it cannot jump straight to resolved.`,
      "INVALID_STATE"
    );

  await sdb.incident.update({
    where: { id },
    data: { status, resolution: resolution || incident.resolution, updatedAt: new Date() },
  });

  if (status === "escalated") {
    /* suspend the tutor's account pending review + page every admin */
    if (incident.tutorId) {
      await sdb.user.update({ where: { id: incident.tutorId }, data: { status: "suspended" } });
    }
    const admins = await sdb.user.findMany({ where: { role: "admin" } });
    for (const a of admins)
      await sdb.notification.create({
        data: {
          userId: a.id,
          title: "Incident escalated — tutor suspended",
          body: `Incident on ${incident.tutorName}'s session (${incident.area || "home visit"}) was escalated by ${auth.name}. The tutor account is suspended pending review.`,
          type: "safety",
        },
      });
    await audit(
      { name: auth.name, role: auth.role },
      "safety.incident_escalated",
      `Incident:${id}`,
      `Incident escalated — tutor account suspended pending review (${incident.tutorName}, ${incident.area})${resolution ? ` — ${resolution}` : ""}`,
      "critical"
    );
  } else if (status === "resolved") {
    await audit(
      { name: auth.name, role: auth.role },
      "safety.incident_resolved",
      `Incident:${id}`,
      `${resolution} — ${incident.tutorName} / ${incident.area}`,
      "info"
    );
  } else {
    await audit(
      { name: auth.name, role: auth.role },
      "safety.incident_investigating",
      `Incident:${id}`,
      `Investigation started — ${incident.summary}`,
      "warning"
    );
  }

  return Response.json({ data: { ok: true, status } });
}
