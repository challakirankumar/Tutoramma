import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, audit } from "@/lib/auth";

/** POST /api/bookings/[id]/decline — tutor declines a requested booking. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only the tutor can decline a booking.");
  const { id } = await params;

  const booking = await db.booking.findUnique({ where: { id } });
  if (!booking) return notFound("Booking not found.");
  if (booking.tutorId !== auth.id) return forbidden("This booking belongs to another tutor.");
  if (booking.state !== "requested") {
    return Response.json(
      { error: { code: "INVALID_STATE", message: `Booking is already ${booking.state}.` } },
      { status: 409 }
    );
  }

  const updated = await db.booking.update({ where: { id }, data: { state: "declined" } });

  await db.notification.create({
    data: {
      userId: booking.studentId,
      title: "Booking declined",
      body: `${auth.name} can't make the ${booking.subject} session on ${booking.startAt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}. Any held payment will be refunded automatically — try another tutor or another slot.`,
      type: "booking",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "booking.declined", `Booking: ${id}`, booking.title, "warning");

  return Response.json({ data: updated });
}
