import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

const SECRET = process.env.INTERNAL_SECRET || "amma-livehub-2026";

/**
 * The long-running dev server keeps a PrismaClient singleton that was created
 * before the LocationPing model was generated (and its require-cached module
 * is equally stale). Bust the cache, load the regenerated client straight
 * from disk and validate it — so ping persistence works without a dev-server
 * restart. Becomes a no-op once the server restarts on the fresh client.
 */
async function pingDb(): Promise<PrismaClient> {
  if ((db as unknown as { locationPing?: unknown }).locationPing) return db;
  const g = globalThis as unknown as { __ammaSafetyPrisma?: PrismaClient };
  const cached = g.__ammaSafetyPrisma;
  if (cached && (cached as unknown as { locationPing?: unknown }).locationPing) return cached;
  try {
    const req = createRequire(`${process.cwd()}/package.json`);
    const target = `${process.cwd()}/node_modules/.prisma/client/index.js`;
    for (const key of Object.keys(req.cache)) {
      if (key.includes("/node_modules/.prisma/") || key.includes("/node_modules/@prisma/client/")) delete req.cache[key];
    }
    const mod: any = req(target);
    const Ctor: new () => PrismaClient = mod.PrismaClient ?? mod.default?.PrismaClient;
    const inst = new Ctor();
    if (!(inst as unknown as { locationPing?: unknown }).locationPing) throw new Error("regenerated client has no locationPing model");
    g.__ammaSafetyPrisma = inst;
    return inst;
  } catch (e) {
    throw new Error(`pingDb could not load the regenerated Prisma client: ${(e as Error).message}`);
  }
}

function authorized(req: NextRequest) {
  return req.headers.get("x-amma-internal") === SECRET;
}

/** Durable persistence of live-session transitions raised by the LiveHub service. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body?.type || !body?.sessionId) return Response.json({ error: "bad request" }, { status: 400 });
  const { type, sessionId, payload = {} } = body;

  const hs = await db.homeSession.findUnique({
    where: { bookingId: sessionId },
    include: { booking: true },
  });
  if (!hs) return Response.json({ ok: false, message: "session not found" }, { status: 404 });
  const booking = hs.booking;

  /* LearnX: location pings are high-frequency + fire-and-forget — short-circuit
     before the user resolution below to keep them cheap (no notifications) */
  if (type === "ping") {
    const pdb = await pingDb();
    await pdb.locationPing.create({
      data: {
        sessionId,
        stage: String(payload.stage ?? "enroute"),
        lat: Number(payload.lat ?? 0),
        lng: Number(payload.lng ?? 0),
        accuracy: 15,
        speed: Number(payload.speed ?? 0),
        battery: Math.round(Number(payload.battery ?? 88)),
        ts: new Date(),
      },
    });
    return Response.json({ ok: true });
  }
  /* Booking stores plain tutorId/studentId — resolve users manually */
  const [tutorUser, studentUser, studentProfile] = await Promise.all([
    db.user.findUnique({ where: { id: booking.tutorId }, select: { id: true, name: true, phone: true } }),
    db.user.findUnique({ where: { id: booking.studentId }, select: { id: true, name: true } }),
    db.studentProfile.findUnique({ where: { userId: booking.studentId } }),
  ]);
  const tutorName = tutorUser?.name ?? "Tutor";
  const studentName = studentUser?.name ?? "Student";
  const parentEmail = studentProfile?.parentEmail;
  const parent = parentEmail ? await db.user.findUnique({ where: { email: parentEmail } }) : null;

  const audit = (action: string, detail: string, severity = "info", actorName = "LiveHub", actorRole = "system") =>
    db.auditEvent.create({ data: { actorName, actorRole, action, resource: `HomeSession:${sessionId}`, detail, severity } });

  switch (type) {
    case "on_my_way": {
      await db.homeSession.update({ where: { bookingId: sessionId }, data: { stage: "enroute", onMyWayAt: new Date() } });
      if (parent)
        await db.notification.create({
          data: {
            userId: parent.id,
            title: `${tutorName} is on the way`,
            body: `Live tracking started for ${studentName}'s ${booking.subject} session. ETA ${payload.etaMinutes ?? 12} min.`,
            type: "safety",
          },
        });
      const admins = await db.user.findMany({ where: { role: "admin" } });
      for (const a of admins)
        await db.notification.create({
          data: { userId: a.id, title: "Home session en route", body: `${tutorName} → ${hs.destArea} (${studentName})`, type: "safety" },
        });
      await audit("session.on_my_way", `Tracking started — ETA ${payload.etaMinutes ?? 12} min`);
      break;
    }
    case "otp_rotated": {
      await db.homeSession.update({ where: { bookingId: sessionId }, data: { otp: payload.otp, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpAttempts: 0 } });
      break;
    }
    case "otp_attempt": {
      await db.homeSession.update({ where: { bookingId: sessionId }, data: { otpAttempts: payload.attempt ?? 1 } });
      await audit("otp.attempt_failed", `Attempt ${payload.attempt}/5 — wrong OTP entered`, "warning", tutorName, "tutor");
      break;
    }
    case "checkin": {
      await db.homeSession.update({ where: { bookingId: sessionId }, data: { stage: "in_progress", checkedInAt: new Date(), otpAttempts: 0 } });
      await db.booking.update({ where: { id: sessionId }, data: { state: "in_progress" } });
      if (parent)
        await db.notification.create({
          data: { userId: parent.id, title: "Checked in ✓", body: `${tutorName} verified with OTP — session in progress at your home.`, type: "safety" },
        });
      await audit("otp.checkin", `OTP verified inside geofence — session started`, "info", tutorName, "tutor");
      break;
    }
    case "checkout": {
      const elapsedMin = Math.round((payload.elapsedSec as number || 0) / 60);
      await db.homeSession.update({
        where: { bookingId: sessionId },
        data: { stage: "done", checkedOutAt: new Date(), summaryJson: JSON.stringify({ topics: payload.topics, homework: payload.homework, notes: payload.notes }) },
      });
      await db.booking.update({
        where: { id: sessionId },
        data: { state: "completed", topics: JSON.stringify(payload.topics || []) },
      });
      /* escrow release after check-out */
      const payment = await db.payment.findUnique({ where: { bookingId: sessionId } });
      if (payment && payment.status === "held") {
        await db.payment.update({ where: { id: payment.id }, data: { status: "released", escrowReleasedAt: new Date() } });
        await db.ledgerEntry.createMany({
          data: [
            { paymentId: payment.id, account: "escrow", debit: payment.total, credit: 0, memo: "Released after check-out + dispute window" },
            { paymentId: payment.id, account: "platform_revenue", debit: 0, credit: payment.platformFee, memo: "Platform commission 8%" },
            { paymentId: payment.id, account: "tutor_payable", debit: 0, credit: payment.sessionFee, memo: "Tutor earnings" },
          ],
        });
        const wallet = await db.wallet.findUnique({ where: { userId: booking.tutorId } });
        if (wallet) {
          await db.wallet.update({
            where: { userId: booking.tutorId },
            data: { escrow: Math.max(0, wallet.escrow - payment.total), available: wallet.available + payment.sessionFee },
          });
        }
        if (parent)
          await db.notification.create({
            data: { userId: parent.id, title: "Session completed", body: `${tutorName} checked out. ₹${(payment.total / 100).toFixed(2)} released from escrow to the tutor.`, type: "payment" },
          });
      }
      await db.notification.create({
        data: { userId: booking.tutorId, title: "Session completed ✓", body: `Check-out recorded for ${studentName}. Earnings added to your wallet.`, type: "payment" },
      });
      await audit("session.checkout", `Check-out done (${elapsedMin} min) — escrow released`, "info", tutorName, "tutor");
      break;
    }
    case "sos": {
      await db.homeSession.update({ where: { bookingId: sessionId }, data: { sosActive: true, sosAt: new Date() } });
      await db.alertEvent.create({
        data: {
          sessionId: hs.id,
          bookingRef: sessionId,
          type: "sos",
          severity: "critical",
          message: `SOS raised by ${payload.by} during ${studentName}'s session with ${tutorName} — live location shared with safety team + emergency contacts.`,
        },
      });
      const admins = await db.user.findMany({ where: { role: "admin" } });
      for (const a of admins)
        await db.notification.create({
          data: { userId: a.id, title: "🚨 SOS ALERT", body: `${payload.by} raised SOS on ${tutorName}'s session (${hs.destArea}). Open the safety console NOW.`, type: "safety" },
        });
      if (parent && payload.by !== "parent")
        await db.notification.create({ data: { userId: parent.id, title: "🚨 SOS raised", body: `SOS activated on ${studentName}'s session. Safety team is responding.`, type: "safety" } });
      await audit("sos.raised", `SOS by ${payload.by} — critical response`, "critical", payload.by as string, "parent");
      break;
    }
    case "clear_sos": {
      await db.homeSession.update({ where: { bookingId: sessionId }, data: { sosActive: false } });
      await db.alertEvent.updateMany({ where: { bookingRef: sessionId, type: "sos", acknowledged: false }, data: { acknowledged: true } });
      await audit("sos.stood_down", `SOS stood down by ${payload.by}`, "warning", payload.by as string, "admin");
      break;
    }
    case "alert": {
      /* LearnX rule-engine alert — durable AlertEvent + notifications + audit */
      const severity = ["info", "warning", "critical"].includes(String(payload.severity)) ? String(payload.severity) : "warning";
      const type = String(payload.type ?? "unknown");
      const message = String(payload.message ?? "");
      await db.alertEvent.create({
        data: { sessionId: payload.homeSessionId || hs.id, bookingRef: sessionId, type, severity, message },
      });
      if (severity === "warning" || severity === "critical") {
        const title = `⚠️ Safety alert — ${type.replace("_", " ")}`;
        const admins = await db.user.findMany({ where: { role: "admin" } });
        for (const a of admins)
          await db.notification.create({ data: { userId: a.id, title, body: message, type: "safety" } });
        if (parent)
          await db.notification.create({ data: { userId: parent.id, title, body: message, type: "safety" } });
      }
      await audit("safety.alert", `${type}: ${message}`, severity === "critical" ? "critical" : "warning");
      break;
    }
    case "silent_not_ok": {
      await db.alertEvent.create({
        data: { sessionId: hs.id, bookingRef: sessionId, type: "silent", severity: "warning", message: `Parent pressed "Not OK" during the session — safety follow-up required.` },
      });
      await audit("silent_check.not_ok", "Parent silent check — NOT OK", "warning");
      break;
    }
    case "reset": {
      await db.homeSession.update({
        where: { bookingId: sessionId },
        data: { stage: "scheduled", onMyWayAt: null, checkedInAt: null, checkedOutAt: null, sosActive: false, sosAt: null, otpAttempts: 0, silentCheckStatus: null, summaryJson: null },
      });
      if (booking.state === "in_progress" || booking.state === "completed") {
        await db.booking.update({ where: { id: sessionId }, data: { state: "accepted" } });
      }
      await audit("session.demo_reset", "Live demo session reset", "info");
      break;
    }
    default:
      return Response.json({ ok: false, message: "unknown type" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
