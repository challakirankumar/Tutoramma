import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, audit } from "@/lib/auth";

/**
 * POST /api/bookings/[id]/cancel — any party cancels a booking.
 * Refund policy from policySnapshot (freeCancelHours, default 12):
 *   ≥ freeCancelHours before start → 100% refund
 *   later                          → 50% (platform & tutor keep their halves)
 * Escrow debit + refunds credit ledger entries, wallet credit for the payer.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const { id } = await params;

  const booking = await db.booking.findUnique({ where: { id }, include: { payment: true } });
  if (!booking) return notFound("Booking not found.");

  /* who may cancel: student, their parent, the tutor, or admin */
  let allowed = auth.role === "admin" || booking.studentId === auth.id || booking.tutorId === auth.id;
  if (!allowed && auth.role === "parent") {
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
    allowed = kids.some((k) => k.userId === booking.studentId);
  }
  if (!allowed) return forbidden("You can only cancel your own bookings.");

  if (!["requested", "accepted", "in_progress"].includes(booking.state)) {
    return Response.json(
      { error: { code: "INVALID_STATE", message: `A ${booking.state} booking cannot be cancelled.` } },
      { status: 409 }
    );
  }

  /* ---- refund computation ---- */
  const policy: any = JSON.parse(booking.policySnapshot || "{}");
  const freeCancelHours: number = policy.freeCancelHours ?? 12;
  const hoursUntil = (booking.startAt.getTime() - Date.now()) / 3_600_000;
  const fullRefund = hoursUntil >= freeCancelHours;

  const payment = booking.payment;
  let refund = 0;
  let refundNote = "No payment was held for this booking.";

  if (payment && (payment.status === "held" || payment.status === "created")) {
    if (payment.status === "held") {
      refund = fullRefund ? payment.total : Math.round(payment.total / 2);
      refundNote = fullRefund
        ? `100% refund — cancelled more than ${freeCancelHours}h before start.`
        : `50% refund — cancelled within ${freeCancelHours}h of start (late-cancellation split).`;

      const platformShare = fullRefund ? 0 : Math.round(payment.platformFee / 2);
      const tutorShare = fullRefund ? 0 : Math.round(payment.sessionFee / 2);

      await db.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
      await db.ledgerEntry.createMany({
        data: [
          { paymentId: payment.id, account: "escrow", debit: payment.total, credit: 0, memo: `Escrow released on cancellation — booking ${booking.id}` },
          { paymentId: payment.id, account: "refunds", debit: 0, credit: refund, memo: refundNote },
          ...(platformShare > 0
            ? [{ paymentId: payment.id, account: "platform_revenue", debit: 0, credit: platformShare, memo: "Platform fee share — late cancellation" }]
            : []),
          ...(tutorShare > 0
            ? [{ paymentId: payment.id, account: "tutor_payable", debit: 0, credit: tutorShare, memo: "Tutor share — late cancellation" }]
            : []),
        ],
      });

      /* credit the payer's wallet */
      const wallet = await db.wallet.findUnique({ where: { userId: payment.payerId } });
      if (wallet) {
        await db.wallet.update({ where: { id: wallet.id }, data: { available: wallet.available + refund } });
      } else {
        await db.wallet.create({ data: { userId: payment.payerId, available: refund } });
      }
      if (payment.payerId !== auth.id && refund > 0) {
        await db.notification.create({
          data: {
            userId: payment.payerId,
            title: "Refund processed",
            body: `₹${(refund / 100).toFixed(2)} refunded to your wallet for “${booking.title}”. ${refundNote}`,
            type: "payment",
          },
        });
      }
    } else {
      refundNote = "Payment was never captured — nothing to refund.";
    }
  }

  const updated = await db.booking.update({ where: { id }, data: { state: "cancelled" } });

  /* notify the other party */
  const notifyUserId = auth.id === booking.tutorId ? booking.studentId : booking.tutorId;
  await db.notification.create({
    data: {
      userId: notifyUserId,
      title: "Booking cancelled",
      body: `${auth.name} cancelled “${booking.title}”. ${refundNote}`,
      type: "booking",
    },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "booking.cancelled",
    `Booking: ${id}`,
    `${booking.title} · refund ₹${(refund / 100).toFixed(2)} (${payment && payment.status === "held" ? (fullRefund ? "100%" : "50%") : "0%"})`,
    refund > 0 ? "info" : "warning"
  );

  return Response.json({
    data: {
      booking: updated,
      refund: {
        amount: refund,
        percent: payment && payment.status === "held" ? (fullRefund ? 100 : 50) : 0,
        freeCancelHours,
        note: refundNote,
      },
    },
  });
}
