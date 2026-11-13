import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/** Approve / hold a tutor payout (admin only). */
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
  if (!["approve", "hold"].includes(action ?? "")) return badRequest("action must be approve or hold.");

  const payout = await db.payout.findUnique({ where: { id } });
  if (!payout) return notFound("Payout not found.");
  const tutorUser = await db.user.findUnique({ where: { id: payout.tutorId }, select: { name: true } });
  const tutorName = tutorUser?.name ?? "tutor";
  if (payout.status === "paid") return badRequest("This payout has already been paid.", "INVALID_STATE");

  if (action === "hold") {
    await db.payout.update({ where: { id: payout.id }, data: { status: "pending" } });
    await audit({ name: auth.name, role: auth.role }, "payout.held", `Payout: ${tutorName}`, `₹${(payout.amount / 100).toFixed(2)} kept pending`, "warning");
    return Response.json({ data: { ok: true, status: "pending" } });
  }

  /* approve — mark paid, deduct tutor wallet available balance */
  await db.payout.update({ where: { id: payout.id }, data: { status: "paid", paidAt: new Date() } });
  const wallet = await db.wallet.findUnique({ where: { userId: payout.tutorId } });
  if (wallet) {
    await db.wallet.update({ where: { id: wallet.id }, data: { available: Math.max(0, wallet.available - payout.amount) } });
  }
  await db.notification.create({
    data: {
      userId: payout.tutorId,
      title: "Payout approved",
      body: `₹${(payout.amount / 100).toFixed(2)} is on its way to ${payout.bankMask}. It should reach your account within 1–2 working days.`,
      type: "payment",
    },
  });
  await audit(
    { name: auth.name, role: auth.role },
    "payout.approved",
    `Payout: ${tutorName}`,
    `₹${(payout.amount / 100).toFixed(2)} to ${payout.bankMask}`
  );

  return Response.json({ data: { ok: true, status: "paid" } });
}
