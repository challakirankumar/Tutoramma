import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, audit } from "@/lib/auth";

/** POST /api/bookings/[id]/accept — tutor accepts a requested booking.
 *  The tutor's slot is re-checked against their other accepted/in_progress
 *  bookings first (mirrors the SLOT_TAKEN flow of POST /api/bookings). */

const SESSION_MIN = 45;

function buildSlotGrid(now: Date, days = 7): Date[] {
  const slots: Date[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    for (let h = 15; h <= 19; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day);
        s.setHours(h, m, 0, 0);
        if (s.getTime() > now.getTime() + 30 * 60 * 1000) slots.push(s);
      }
    }
  }
  return slots;
}
function slotLabel(d: Date): string {
  const wd = d.toLocaleDateString("en-IN", { weekday: "short" });
  const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${wd} ${t}`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only the tutor can accept a booking.");
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

  /* re-check the tutor's slot against other accepted/in_progress bookings */
  const clash = await db.booking.findFirst({
    where: {
      tutorId: booking.tutorId,
      id: { not: booking.id },
      state: { in: ["accepted", "in_progress"] },
      startAt: { lt: booking.endAt },
      endAt: { gt: booking.startAt },
    },
  });
  if (clash) {
    const now = new Date();
    const durationMin = Math.max(15, Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000));
    const busy = await db.booking.findMany({
      where: { tutorId: booking.tutorId, state: { notIn: ["cancelled", "declined"] }, startAt: { gte: now } },
      select: { startAt: true, endAt: true },
    });
    const nextSlots = buildSlotGrid(now)
      .filter((s) => {
        const e = new Date(s.getTime() + durationMin * 60 * 1000);
        return !busy.some((b) => s < b.endAt && b.startAt < e) && s > booking.startAt;
      })
      .slice(0, 3)
      .map((s) => ({ startAt: s.toISOString(), label: slotLabel(s) }));
    return Response.json(
      {
        error: {
          code: "SLOT_TAKEN",
          message: "That slot was just taken — here are the next free times with this tutor.",
          fields: { nextSlots },
        },
      },
      { status: 409 }
    );
  }

  const updated = await db.booking.update({
    where: { id },
    data: {
      state: "accepted",
      meetUrl:
        booking.mode === "online" && !booking.meetUrl
          ? `https://class.tutoramma.test/join/mt-${Math.floor(1000 + Math.random() * 9000)}`
          : booking.meetUrl,
    },
  });

  const student = await db.user.findUnique({ where: { id: booking.studentId }, select: { name: true } });
  await db.notification.create({
    data: {
      userId: booking.studentId,
      title: "Booking accepted 🎉",
      body: `${auth.name} accepted your ${booking.subject} session — ${booking.title}. ${booking.mode === "online" ? "The join link is ready in My Bookings." : "See you soon!"}`,
      type: "booking",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "booking.accepted", `Booking: ${id}`, `${booking.title} for ${student?.name ?? booking.studentId}`);

  return Response.json({ data: updated });
}
