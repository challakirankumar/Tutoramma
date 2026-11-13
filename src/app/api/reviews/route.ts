import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * POST /api/reviews — review a completed/released booking.
 * { bookingId, rating (1-5), comment? } → updates booking.rating + reviewComment,
 * notifies the tutor.
 */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const { bookingId, rating, comment } = body || {};
  if (!bookingId) return badRequest("bookingId is required.");
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return badRequest("rating must be an integer 1–5.");

  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return notFound("Booking not found.");
  const tutorUser = await db.user.findUnique({
    where: { id: booking.tutorId },
    select: { id: true, name: true },
  });

  /* only the student (or their parent) can review */
  let allowed = booking.studentId === auth.id;
  if (!allowed && auth.role === "parent") {
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
    allowed = kids.some((k) => k.userId === booking.studentId);
  }
  if (!allowed) return forbidden("Only the student who attended this session can review it.");

  if (!["completed", "released"].includes(booking.state)) {
    return Response.json(
      { error: { code: "INVALID_STATE", message: "You can review a session once it is completed." } },
      { status: 409 }
    );
  }
  if (booking.rating != null) {
    return Response.json(
      { error: { code: "ALREADY_REVIEWED", message: "You already reviewed this session." } },
      { status: 409 }
    );
  }

  const updated = await db.booking.update({
    where: { id: bookingId },
    data: { rating: stars, reviewComment: (comment ?? "").toString().trim() || null },
  });

  await db.notification.create({
    data: {
      userId: booking.tutorId,
      title: "New review received ⭐",
      body: `${auth.name} rated “${booking.title}” ${stars}/5.${comment ? ` “${(comment ?? "").toString().trim()}”` : ""}`,
      type: "system",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "booking.reviewed", `Booking: ${bookingId}`, `${stars}/5 for ${tutorUser?.name ?? booking.tutorId}`);

  return Response.json({ data: updated }, { status: 201 });
}
