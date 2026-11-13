import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/** Audit trail + safety alerts. GET ?severity= filters audit events. */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity") || "";

  const [events, alerts] = await Promise.all([
    db.auditEvent.findMany({
      where: { ...(severity ? { severity } : {}) },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    db.alertEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return Response.json({
    data: {
      events: events.map((e) => ({
        id: e.id,
        actorName: e.actorName,
        actorRole: e.actorRole,
        action: e.action,
        resource: e.resource,
        detail: e.detail,
        severity: e.severity,
        createdAt: e.createdAt,
      })),
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        acknowledged: a.acknowledged,
        bookingRef: a.bookingRef,
        createdAt: a.createdAt,
      })),
    },
  });
}

/** Acknowledge an alert. Body: { alertId } */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  let body: { alertId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  if (!body.alertId) return badRequest("alertId is required.");

  const alert = await db.alertEvent.findUnique({ where: { id: body.alertId } });
  if (!alert) return notFound("Alert not found.");

  await db.alertEvent.update({ where: { id: alert.id }, data: { acknowledged: true } });
  await audit({ name: auth.name, role: auth.role }, "alert.acknowledged", `AlertEvent: ${alert.type}`, alert.message.slice(0, 140));

  return Response.json({ data: { ok: true, id: alert.id, acknowledged: true } });
}
