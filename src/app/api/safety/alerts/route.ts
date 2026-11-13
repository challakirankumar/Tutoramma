import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";
import { NextRequest } from "next/server";

/** Recent safety alert events for the admin console (optionally only unacknowledged). */
export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const unacknowledged = req.nextUrl.searchParams.get("unacknowledged") === "1";
  const alerts = await db.alertEvent.findMany({
    where: unacknowledged ? { acknowledged: false } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({ data: alerts });
}

/** Acknowledge a safety alert (admin only). */
export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  if (!body.id) return badRequest("id is required.");

  const alert = await db.alertEvent.findUnique({ where: { id: body.id } });
  if (!alert) return notFound("Alert not found.");

  if (!alert.acknowledged) {
    await db.alertEvent.update({ where: { id: alert.id }, data: { acknowledged: true } });
    await audit(
      { name: auth.name, role: auth.role },
      "safety.alert_ack",
      `AlertEvent:${alert.id}`,
      `${alert.type}: ${alert.message}`,
      "info"
    );
  }
  return Response.json({ data: { ok: true } });
}
