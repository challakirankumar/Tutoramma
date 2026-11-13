import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/** Suspend / activate a user account (admin only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const { id } = await params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const action = body.action;
  if (!["suspend", "activate"].includes(action ?? "")) return badRequest("action must be suspend or activate.");
  if (id === auth.id) return badRequest("You cannot change your own account status.", "INVALID_STATE");

  const user = await db.user.findUnique({ where: { id } });
  if (!user) return notFound("User not found.");

  if (action === "suspend") {
    if (user.status === "suspended") return badRequest("This account is already suspended.", "INVALID_STATE");
    await db.user.update({ where: { id: user.id }, data: { status: "suspended" } });
    await db.notification.create({
      data: {
        userId: user.id,
        title: "Account suspended",
        body: "Your Tutor Amma account has been suspended by an administrator. Contact support if you believe this is a mistake.",
        type: "system",
      },
    });
    await audit({ name: auth.name, role: auth.role }, "user.suspended", `User: ${user.name} (${user.role})`, "Account access revoked", "warning");
    return Response.json({ data: { ok: true, status: "suspended" } });
  }

  if (user.status === "active") return badRequest("This account is already active.", "INVALID_STATE");
  await db.user.update({ where: { id: user.id }, data: { status: "active" } });
  await audit({ name: auth.name, role: auth.role }, "user.activated", `User: ${user.name} (${user.role})`, "Account access restored");
  return Response.json({ data: { ok: true, status: "active" } });
}
