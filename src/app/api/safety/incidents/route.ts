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

/** Safety incident workflow — list with session context + open new incidents (admin only). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const sdb = await safetyDb();
  const incidents = await sdb.incident.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  /* Incident.sessionId is HomeSession.id — join HomeSession + booking manually */
  const homeIds = [...new Set(incidents.map((i) => i.sessionId))];
  const homes = homeIds.length
    ? await sdb.homeSession.findMany({ where: { id: { in: homeIds } }, include: { booking: true } })
    : [];
  const hmap = new Map(homes.map((h) => [h.id, h]));

  const userIds = new Set<string>();
  for (const h of homes) {
    userIds.add(h.booking.tutorId);
    userIds.add(h.booking.studentId);
  }
  const users = userIds.size
    ? await sdb.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
    : [];
  const umap = new Map(users.map((u) => [u.id, u.name]));

  const data = incidents.map((i) => {
    const h = hmap.get(i.sessionId);
    return {
      id: i.id,
      sessionId: i.sessionId,
      bookingRef: i.bookingRef,
      tutorId: i.tutorId,
      tutorName: h ? (umap.get(h.booking.tutorId) ?? i.tutorName) : i.tutorName,
      studentName: h ? (umap.get(h.booking.studentId) ?? i.studentName) : i.studentName,
      area: h?.destArea || i.area,
      status: i.status,
      summary: i.summary,
      resolution: i.resolution,
      openedBy: i.openedBy,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      session: h
        ? {
            stage: h.stage,
            subject: h.booking.subject,
            title: h.booking.title,
            startAt: h.booking.startAt,
            state: h.booking.state,
          }
        : null,
    };
  });
  return Response.json({ data });
}

/** Open an incident on a home session (sessionId = bookingId of the HomeSession). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const sdb = await safetyDb();

  let body: { sessionId?: string; summary?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const sessionId = (body.sessionId || "").trim();
  const summary = (body.summary || "").trim();
  if (!sessionId) return badRequest("sessionId is required.");
  if (!summary) return badRequest("A summary is required to open an incident.");

  const hs = await sdb.homeSession.findUnique({ where: { bookingId: sessionId }, include: { booking: true } });
  if (!hs) return notFound("Home session not found.");

  const [tutor, student] = await Promise.all([
    sdb.user.findUnique({ where: { id: hs.booking.tutorId }, select: { name: true } }),
    sdb.user.findUnique({ where: { id: hs.booking.studentId }, select: { name: true } }),
  ]);

  const incident = await sdb.incident.create({
    data: {
      sessionId: hs.id,
      bookingRef: sessionId,
      tutorId: hs.booking.tutorId,
      tutorName: tutor?.name ?? "Tutor",
      studentName: student?.name ?? "Student",
      area: hs.destArea,
      status: "open",
      summary,
      openedBy: auth.name,
    },
  });

  await sdb.notification.create({
    data: {
      userId: hs.booking.tutorId,
      title: "Safety incident opened",
      body: `An incident was opened on your ${hs.booking.subject} session — please cooperate with the safety team review.`,
      type: "safety",
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "safety.incident_opened",
    `Incident:${incident.id}`,
    `${summary} — ${tutor?.name ?? "Tutor"} / ${hs.destArea} (booking ${sessionId})`,
    "warning"
  );

  return Response.json({ data: incident }, { status: 201 });
}
