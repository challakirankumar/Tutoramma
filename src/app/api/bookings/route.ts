import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * /api/bookings
 *  GET  — role-scoped list (student own, parent children, tutor own). ?state= filter.
 *  POST — create a booking request (server computes fees from the Offering).
 * NOTE: Booking has no Prisma relations to User/Address — names joined manually.
 */

const SESSION_MIN = 45;
const PLATFORM_FEE_PCT = 0.08;

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

async function childIdsOf(email: string): Promise<string[]> {
  const kids = await db.studentProfile.findMany({ where: { parentEmail: email }, select: { userId: true } });
  return kids.map((k) => k.userId);
}

/* ---------------- GET ---------------- */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const state = new URL(req.url).searchParams.get("state")?.trim() || "";

  let where: any = {};
  if (auth.role === "student") {
    where = { studentId: auth.id };
  } else if (auth.role === "parent") {
    const ids = await childIdsOf(auth.email);
    where = { studentId: { in: ids } };
  } else if (auth.role === "tutor") {
    where = { tutorId: auth.id };
  } else if (auth.role === "admin") {
    where = {};
  } else {
    return forbidden();
  }
  if (state) where.state = state;

  const bookings = await db.booking.findMany({ where, orderBy: { startAt: "desc" } });
  const payments = await db.payment.findMany({
    where: { bookingId: { in: bookings.map((b) => b.id) } },
    include: { invoice: true },
  });
  const paymentByBooking = new Map(payments.map((p) => [p.bookingId!, p]));

  const userIds = Array.from(new Set(bookings.flatMap((b) => [b.studentId, b.tutorId])));
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarColor: true, phone: true, role: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const addressIds = bookings.map((b) => b.addressId).filter((x): x is string => !!x);
  const addresses = addressIds.length ? await db.address.findMany({ where: { id: { in: addressIds } } }) : [];
  const addressMap = new Map(addresses.map((a) => [a.id, a]));

  const data = bookings.map((b) => {
    const t = userMap.get(b.tutorId);
    const s = userMap.get(b.studentId);
    const p = paymentByBooking.get(b.id);
    return {
      ...b,
      tutor: t ? { id: t.id, name: t.name, color: t.avatarColor, phone: t.phone } : null,
      student: s ? { id: s.id, name: s.name, color: s.avatarColor } : null,
      address: b.addressId ? addressMap.get(b.addressId) ?? null : null,
      payment: p
        ? {
            id: p.id,
            status: p.status,
            method: p.method,
            purpose: p.purpose,
            sessionFee: p.sessionFee,
            platformFee: p.platformFee,
            total: p.total,
            payerId: p.payerId,
            createdAt: p.createdAt,
            invoiceNo: p.invoice?.number ?? null,
            invoiceIssuedAt: p.invoice?.issuedAt ?? null,
          }
        : null,
    };
  });

  return Response.json({ data });
}

/* ---------------- POST ---------------- */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student" && auth.role !== "parent") {
    return forbidden("Only students and parents can request sessions.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const { tutorId, studentId, mode, subject, board, grade, startAt, addressId, topic } = body || {};

  if (!tutorId || !mode || !subject || !board || !grade || !startAt) {
    return badRequest("tutorId, studentId, mode, subject, board, grade and startAt are required.");
  }
  if (!["online", "home", "group"].includes(mode)) return badRequest("mode must be online, home or group.");

  /* resolve student */
  let stuId: string | null = null;
  if (auth.role === "student") {
    stuId = auth.id;
  } else {
    if (!studentId) return badRequest("studentId is required when a parent books for a child.");
    const kids = await childIdsOf(auth.email);
    if (!kids.includes(studentId)) return forbidden("You can only book for your own children.");
    stuId = studentId;
  }
  const student = await db.user.findUnique({ where: { id: stuId! }, select: { id: true, name: true, avatarColor: true } });
  if (!student) return badRequest("Student not found.");

  /* tutor must be approved */
  const profile = await db.tutorProfile.findFirst({ where: { userId: tutorId } });
  if (!profile) return notFound("Tutor not found.");
  if (profile.status !== "approved") return badRequest("This tutor is not verified yet.", "TUTOR_NOT_APPROVED");
  const tutorUser = await db.user.findUnique({
    where: { id: tutorId },
    select: { id: true, name: true, avatarColor: true, phone: true },
  });

  /* resolve tutor offerings (offerings store logical keys or cuids — resolve manually) */
  const [rawOfferings, boards, grades, subjects] = await Promise.all([
    db.offering.findMany({ where: { tutorId: profile.id } }),
    db.curriculumBoard.findMany({ select: { id: true, code: true, name: true } }),
    db.curriculumGrade.findMany({ select: { id: true, name: true } }),
    db.curriculumSubject.findMany({ select: { id: true, name: true } }),
  ]);
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const boardByCode = new Map(boards.map((b) => [b.code, b]));
  const gradeMap = new Map(grades.map((g) => [g.id, g.name]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const resolveGrade = (key: string) => gradeMap.get(key) ?? (key.includes("|") ? key.split("|").slice(1).join("|") : key);
  const resolveSubject = (key: string) => subjectMap.get(key) ?? (key.includes("|") ? key.split("|").pop()! : key);
  const offerings = rawOfferings.map((o) => {
    const b = boardById.get(o.boardId) ?? boardByCode.get(o.boardId);
    return {
      mode: o.mode,
      price: o.price,
      boardCode: b?.code ?? o.boardId,
      boardName: b?.name ?? o.boardId,
      gradeName: resolveGrade(o.gradeId),
      subjectName: resolveSubject(o.subjectId),
    };
  });

  const modes: string[] = JSON.parse(profile.modes || "[]");
  if (!modes.includes(mode)) return badRequest(`This tutor does not offer ${mode} sessions.`, "MODE_NOT_OFFERED");

  /* time */
  const start = new Date(startAt);
  if (isNaN(start.getTime())) return badRequest("startAt must be a valid date.");
  if (start.getTime() < Date.now() - 5 * 60 * 1000) return badRequest("startAt must be in the future.");
  const end = new Date(start.getTime() + SESSION_MIN * 60 * 1000);

  /* home mode requires an address */
  if (mode === "home") {
    if (!addressId) return badRequest("A home address is required for home visits.", "ADDRESS_REQUIRED");
    const addr = await db.address.findUnique({ where: { id: addressId } });
    if (!addr) return badRequest("Selected address was not found.", "ADDRESS_REQUIRED");
  }

  /* slot conflict check (tutor side) */
  const clash = await db.booking.findFirst({
    where: {
      tutorId,
      state: { notIn: ["cancelled", "declined"] },
      startAt: { lt: end },
      endAt: { gt: start },
    },
  });
  if (clash) {
    const now = new Date();
    const busy = await db.booking.findMany({
      where: { tutorId, state: { notIn: ["cancelled", "declined"] }, startAt: { gte: now } },
      select: { startAt: true, endAt: true },
    });
    const nextSlots = buildSlotGrid(now)
      .filter((s) => {
        const e = new Date(s.getTime() + SESSION_MIN * 60 * 1000);
        return !busy.some((b) => s < b.endAt && b.startAt < e) && s > start;
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

  /* student-side conflict — the student already has a class at this time */
  const studentClash = await db.booking.findFirst({
    where: {
      studentId: student.id,
      state: { in: ["accepted", "in_progress"] },
      startAt: { lt: end },
      endAt: { gt: start },
    },
  });
  if (studentClash) {
    return Response.json(
      {
        error: {
          code: "STUDENT_CONFLICT",
          message: "You already have a class at this time.",
        },
      },
      { status: 422 }
    );
  }

  /* server-authoritative pricing from the matching Offering */
  const exact = offerings.find(
    (o) =>
      o.mode === mode &&
      (o.boardCode === board || o.boardName === board) &&
      o.gradeName === grade &&
      o.subjectName === subject
  );
  const modeMatch = exact ?? offerings.find((o) => o.mode === mode);
  const fallback = mode === "home" ? profile.rateHome : profile.rateOnline || profile.rateHome;
  const sessionFee = exact?.price ?? modeMatch?.price ?? fallback ?? 0;
  const platformFee = Math.round(sessionFee * PLATFORM_FEE_PCT);
  const total = sessionFee + platformFee;

  const title = topic ? `${subject} — ${topic}` : `${subject} — 1:1 session`;

  const booking = await db.booking.create({
    data: {
      studentId: student.id,
      tutorId,
      mode,
      subject,
      board,
      grade,
      title,
      startAt: start,
      endAt: end,
      state: "requested",
      sessionFee,
      platformFee,
      total,
      addressId: mode === "home" ? addressId : null,
      meetUrl: mode === "online" ? `https://class.tutoramma.test/join/mt-${Math.floor(1000 + Math.random() * 9000)}` : null,
      policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50", otpRequired: mode === "home" }),
    },
  });

  await db.notification.create({
    data: {
      userId: tutorId,
      title: "New booking request",
      body: `${student.name} requested a ${mode === "home" ? "home visit" : mode === "group" ? "group class" : "online 1:1"} — ${title} · ${slotLabel(start)}. Please accept or decline.`,
      type: "booking",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "booking.requested", `Booking: ${booking.id}`, `${student.name} → ${tutorUser?.name ?? tutorId} · ${title} · ${slotLabel(start)}`);

  return Response.json(
    {
      data: {
        ...booking,
        tutor: tutorUser,
        student: { id: student.id, name: student.name, color: student.avatarColor },
        address: null,
        payment: null,
      },
    },
    { status: 201 }
  );
}
