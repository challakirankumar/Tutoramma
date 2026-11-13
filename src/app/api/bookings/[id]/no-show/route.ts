import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, audit } from "@/lib/auth";

/**
 * POST /api/bookings/[id]/no-show — the tutor marks a student as a no-show
 * (booking must be accepted or in_progress and belong to the caller).
 * A held escrow payment is released to the tutor per the no-show policy:
 * payment → released, escrow debit / platform_revenue credit (platform fee) /
 * tutor_payable credit (session fee), tutor wallet updated, payer notified.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only the tutor can mark a no-show.");
  const { id } = await params;

  const booking = await db.booking.findUnique({ where: { id }, include: { payment: true } });
  if (!booking) return notFound("Booking not found.");
  if (booking.tutorId !== auth.id) return forbidden("This booking belongs to another tutor.");
  if (!["accepted", "in_progress"].includes(booking.state)) {
    return Response.json(
      { error: { code: "INVALID_STATE", message: `A ${booking.state} booking cannot be marked as a no-show.` } },
      { status: 409 }
    );
  }

  const updated = await db.booking.update({ where: { id }, data: { state: "no_show" } });

  /* release held escrow to the tutor per no-show policy */
  const payment = booking.payment;
  let released = 0;
  if (payment && payment.status === "held") {
    released = payment.total;
    await db.payment.update({ where: { id: payment.id }, data: { status: "released", escrowReleasedAt: new Date() } });
    await db.ledgerEntry.createMany({
      data: [
        { paymentId: payment.id, account: "escrow", debit: payment.total, credit: 0, memo: "Escrow released — student no-show" },
        { paymentId: payment.id, account: "platform_revenue", debit: 0, credit: payment.platformFee, memo: "Platform commission 8%" },
        { paymentId: payment.id, account: "tutor_payable", debit: 0, credit: payment.sessionFee, memo: "Tutor earnings — no-show policy" },
      ],
    });
    const wallet = await db.wallet.findUnique({ where: { userId: booking.tutorId } });
    if (wallet) {
      await db.wallet.update({
        where: { userId: booking.tutorId },
        data: { escrow: Math.max(0, wallet.escrow - payment.total), available: wallet.available + payment.sessionFee },
      });
    } else {
      await db.wallet.create({ data: { userId: booking.tutorId, available: payment.sessionFee } });
    }
  }

  /* payer notification (parent when linked, else the student) */
  if (payment) {
    await db.notification.create({
      data: {
        userId: payment.payerId,
        title: "Session marked as no-show",
        body:
          released > 0
            ? `The tutor marked ${booking.title} as a no-show; per policy the escrow was released to the tutor.`
            : `The tutor marked ${booking.title} as a no-show. If you were present, open a dispute and our team will review it.`,
        type: "payment",
      },
    });
  }

  /* student notification */
  await db.notification.create({
    data: {
      userId: booking.studentId,
      title: "Marked as no-show",
      body: `${auth.name} marked “${booking.title}” as a no-show. If you were there, open a dispute from the booking and our team will review it within 24 hours.`,
      type: "booking",
    },
  });

  /* tutor confirmation */
  await db.notification.create({
    data: {
      userId: auth.id,
      title: "No-show recorded",
      body: `“${booking.title}” was marked as a no-show${released > 0 ? ` — ₹${(released / 100).toFixed(2)} escrow was released to your wallet` : ""}.`,
      type: "payment",
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "booking.no_show",
    `Booking: ${id}`,
    `${booking.title} · escrow released ₹${(released / 100).toFixed(2)} to ${auth.name}`,
    "warning"
  );

  return Response.json({ data: { booking: updated, released } });
}
