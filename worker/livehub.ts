/**
 * Tutor Amma — LiveHub (Cloudflare Durable Object)
 * Real-time engine for home-tuition safety: live tracking simulation,
 * OTP check-in/out, SOS, silent checks + the LearnX safety rule engine
 * (late start, ETA slip, geofence exit, silent tracker, no check-in,
 * overrun), geofence-enforced check-in, minimum-duration check-out and
 * ~10s location-ping persistence. Ephemeral state lives here; durable
 * transitions are persisted to the main app via internal HTTP API.
 */
import type { MiniIO } from "./mini-io";

export function attachLiveHub(
  io: MiniIO,
  appFetch: (path: string, init?: RequestInit) => Promise<Response>,
  INTERNAL_SECRET: string,
) {



type Stage = "scheduled" | "enroute" | "arrived" | "in_progress" | "done";
type Pt = { lat: number; lng: number };

interface LiveAlert {
  type: string;
  severity: string;
  message: string;
  at: string;
}

interface LiveSession {
  sessionId: string;
  stage: Stage;
  progress: number;
  route: Pt[];
  marker: Pt;
  dest: Pt;
  destArea: string;
  etaMinutes: number;
  battery: number;
  sosActive: boolean;
  alerts: LiveAlert[];
  otp: string;
  otpExpiresAt: number;
  otpAttempts: number;
  startedAt?: number;
  checkedInAt?: number;
  checkedOutAt?: number;
  sessionElapsedSec: number;
  lastPingAt?: number;
  silentCheck?: { status: "ok" | "not_ok"; at: number };
  tutorName: string;
  tutorPhone: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  subject: string;
  title: string;
  summary?: { topics: string[]; homework: string; notes: string };
  /* LearnX safety spec */
  startAt: number; /* booking.startAt (epoch ms) — real session window */
  endAt: number; /* booking.endAt (epoch ms) */
  geofenceMeters: number; /* HomeSession.geofenceMeters */
  homeSessionId: string; /* HomeSession.id — durable FK for alerts/incidents */
  baselineEta: number; /* ETA captured when the tutor taps "On my way" */
  firedAlerts: Set<string>; /* rule dedupe — each rule fires once, cleared on reset */
  lastPingPersistAt?: number; /* throttle: persist a LocationPing every ~10 s */
  lastPingPersistPt?: Pt; /* previous persisted marker — used to derive speed */
  loadedAt: number;
}

const sessions = new Map<string, LiveSession>();

function genOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function interpRoute(route: Pt[], t: number): Pt {
  if (route.length === 0) return { lat: 0, lng: 0 };
  if (route.length === 1) return route[0];
  const clamped = Math.max(0, Math.min(100, t)) / 100;
  const segs = route.length - 1;
  const pos = clamped * segs;
  const i = Math.min(Math.floor(pos), segs - 1);
  const f = pos - i;
  return {
    lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f,
    lng: route[i].lng + (route[i + 1].lng - route[i].lng) * f,
  };
}

/** Great-circle distance between two coordinates, in meters. */
function haversineMeters(a: Pt, b: Pt): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- persistence into the main app ---------- */
async function persist(type: string, sessionId: string, payload: Record<string, unknown> = {}) {
  try {
    const res = await appFetch(`/api/internal/live/event`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-amma-internal": INTERNAL_SECRET },
      body: JSON.stringify({ type, sessionId, payload }),
    });
    /* the session was deleted (e.g. demo reset) — evict it so the ticker
       stops persisting pings/alerts for a row that no longer exists */
    if (res.status === 404) {
      sessions.delete(sessionId);
      console.log(`persist(${type}): session ${sessionId} no longer exists — evicted from memory`);
    }
  } catch (e) {
    console.error(`persist(${type}) failed:`, (e as Error).message);
  }
}

async function loadSession(sessionId: string): Promise<LiveSession | null> {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  try {
    const res = await appFetch(`/api/internal/live/snapshot?sessionId=${encodeURIComponent(sessionId)}`, {
      headers: { "x-amma-internal": INTERNAL_SECRET },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: any };
    const d = json.data;
    if (!d) return null;
    const route: Pt[] = Array.isArray(d.route) && d.route.length ? d.route : [d.dest];
    const s: LiveSession = {
      sessionId,
      stage: (d.stage as Stage) || "scheduled",
      progress: d.stage === "enroute" ? 42 : 0,
      route,
      marker: interpRoute(route, d.stage === "enroute" ? 42 : 0),
      dest: d.dest,
      destArea: d.destArea || "",
      etaMinutes: 12,
      battery: d.battery ?? 88,
      sosActive: false,
      alerts: [],
      otp: genOtp(),
      otpExpiresAt: Date.now() + 10 * 60 * 1000,
      otpAttempts: 0,
      sessionElapsedSec: 0,
      startAt: d.startAt ? new Date(d.startAt).getTime() : 0,
      endAt: d.endAt ? new Date(d.endAt).getTime() : 0,
      geofenceMeters: typeof d.geofenceMeters === "number" && d.geofenceMeters > 0 ? d.geofenceMeters : 150,
      homeSessionId: d.homeSessionId ?? "",
      baselineEta: 12, /* LearnX: default baseline ETA until "On my way" captures the real one */
      firedAlerts: new Set<string>(),
      lastPingPersistAt: 0,
      lastPingPersistPt: undefined,
      tutorName: d.tutorName,
      tutorPhone: d.tutorPhone,
      studentName: d.studentName,
      parentName: d.parentName,
      parentPhone: d.parentPhone,
      subject: d.subject,
      title: d.title,
      loadedAt: Date.now(),
    };
    sessions.set(sessionId, s);
    return s;
  } catch (e) {
    console.error("loadSession failed:", (e as Error).message);
    return null;
  }
}

function publicState(s: LiveSession, includeOtp: boolean) {
  return {
    sessionId: s.sessionId,
    stage: s.stage,
    progress: Math.round(s.progress),
    marker: s.marker,
    dest: s.dest,
    destArea: s.destArea,
    etaMinutes: s.etaMinutes,
    battery: s.battery,
    sosActive: s.sosActive,
    alerts: s.alerts,
    checkedInAt: s.checkedInAt,
    checkedOutAt: s.checkedOutAt,
    sessionElapsedSec: Math.round(s.sessionElapsedSec),
    lastPingAt: s.lastPingAt,
    silentCheck: s.silentCheck,
    tutorName: s.tutorName,
    studentName: s.studentName,
    subject: s.subject,
    title: s.title,
    summary: s.summary,
    startedAt: s.startedAt,
    ...(includeOtp ? { otp: s.otp, otpExpiresAt: s.otpExpiresAt } : {}),
  };
}

function pushAlert(s: LiveSession, type: string, severity: string, message: string) {
  s.alerts.unshift({ type, severity, message, at: new Date().toISOString() });
  if (s.alerts.length > 20) s.alerts.pop();
}

/* ---------- LearnX safety alert-rule engine ---------- */
/** Fire a rule alert at most once per session: live feed + durable persistence. */
function fireAlert(s: LiveSession, type: string, severity: string, message: string) {
  if (s.stage === "done" || s.firedAlerts.has(type)) return;
  s.firedAlerts.add(type);
  pushAlert(s, type, severity, message);
  io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
  void persist("alert", s.sessionId, { type, severity, message, homeSessionId: s.homeSessionId });
}

/** Rule set evaluated against REAL times for every loaded session. */
function evaluateSafetyRules(s: LiveSession, now: number) {
  if (s.stage === "done") return;
  const { startAt, endAt } = s;

  /* late_start — tutor still hasn't started travelling 15 min before the window */
  if (s.stage === "scheduled" && startAt && now > startAt - 15 * 60 * 1000) {
    const minsLate = Math.round((now - startAt) / 60000);
    fireAlert(
      s,
      "late_start",
      "warning",
      minsLate > 0
        ? `Late start — the session was scheduled for ${new Date(startAt).toLocaleTimeString()} and ${s.tutorName} hasn't tapped "On my way" (${minsLate} min past).`
        : `Late-start warning — the session starts in ${Math.max(1, Math.ceil((startAt - now) / 60000))} min and ${s.tutorName} hasn't started travelling yet.`
    );
  }

  /* eta_slip — current ETA more than 10 min over the baseline captured at on_my_way */
  if (s.stage === "enroute" && s.baselineEta > 0 && s.etaMinutes > s.baselineEta + 10) {
    fireAlert(s, "eta_slip", "warning", `ETA slipped to ${s.etaMinutes} min (baseline ${s.baselineEta} min) — ${s.tutorName} is running more than 10 minutes late.`);
  }

  /* geofence_exit — marker outside the home geofence while on site / session live */
  if ((s.stage === "arrived" || s.stage === "in_progress") && s.geofenceMeters > 0) {
    const dist = haversineMeters(s.marker, s.dest);
    if (dist > s.geofenceMeters) {
      fireAlert(
        s,
        "geofence_exit",
        "warning",
        `Geofence exit — ${s.tutorName}'s marker is ${Math.round(dist)} m from the home (limit ${s.geofenceMeters} m) while ${s.stage === "arrived" ? "on site" : "the session is live"}.`
      );
    }
  }

  /* silent — no location ping for 3+ min while en route / session live */
  if ((s.stage === "enroute" || s.stage === "in_progress") && s.lastPingAt && now - s.lastPingAt > 3 * 60 * 1000) {
    fireAlert(s, "silent", "warning", `Silent tracker — no location ping for ${Math.round((now - s.lastPingAt) / 60000)} min while ${s.stage === "enroute" ? "en route" : "the session is live"}.`);
  }

  /* no_checkin — no OTP check-in 10+ min past the booked start */
  if ((s.stage === "scheduled" || s.stage === "enroute" || s.stage === "arrived") && startAt && now > startAt + 10 * 60 * 1000) {
    fireAlert(
      s,
      "no_checkin",
      "warning",
      `No check-in — the session was scheduled to start at ${new Date(startAt).toLocaleTimeString()} (${Math.round((now - startAt) / 60000)} min ago) and no OTP check-in has been recorded.`
    );
  }

  /* overrun — session still live 20+ min past the booked end */
  if (s.stage === "in_progress" && endAt && now > endAt + 20 * 60 * 1000) {
    fireAlert(s, "overrun", "warning", `Session overrun — the booked window ended at ${new Date(endAt).toLocaleTimeString()} (over by ${Math.round((now - endAt) / 60000)} min) and ${s.tutorName} hasn't checked out.`);
  }
}

/** Persist a location ping to the main app roughly every 10 s per active session. */
function persistPing(s: LiveSession, now: number) {
  if (now - (s.lastPingPersistAt ?? 0) < 10000) return;
  const speed =
    s.lastPingPersistPt && s.lastPingPersistAt
      ? haversineMeters(s.lastPingPersistPt, s.marker) / Math.max(1, (now - s.lastPingPersistAt) / 1000)
      : 0;
  s.lastPingPersistAt = now;
  s.lastPingPersistPt = { ...s.marker };
  void persist("ping", s.sessionId, {
    stage: s.stage,
    lat: Number(s.marker.lat.toFixed(6)),
    lng: Number(s.marker.lng.toFixed(6)),
    speed: Math.round(speed * 10) / 10,
    battery: Math.round(s.battery),
  });
}

io.on("connection", (socket) => {
  let joinedRole = "guest";

  socket.on("join", async (data: { sessionId: string; role: string }) => {
    try {
      const { sessionId, role } = data || ({} as any);
      if (!sessionId) return;
      joinedRole = role || "guest";
      const s = await loadSession(sessionId);
      if (!s) {
        socket.emit("error_msg", { message: "Session not found" });
        return;
      }
      socket.join(`sess:${sessionId}`);
      socket.emit("state", publicState(s, joinedRole === "parent" || joinedRole === "admin"));
    } catch (e) {
      console.error("join error", e);
    }
  });

  socket.on("get_state", async (data: { sessionId: string; role: string }) => {
    const { sessionId, role } = data || ({} as any);
    const s = sessionId ? sessions.get(sessionId) : null;
    if (s) socket.emit("state", publicState(s, role === "parent" || role === "admin"));
  });

  socket.on("on_my_way", async (data: { sessionId: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    if (s.stage !== "scheduled") {
      socket.emit("action_result", { action: "on_my_way", ok: false, message: "Session already started." });
      return;
    }
    s.stage = "enroute";
    s.progress = 4;
    s.startedAt = Date.now();
    s.marker = interpRoute(s.route, s.progress);
    s.etaMinutes = 12;
    s.baselineEta = 12; /* LearnX: baseline ETA for slip detection */
    s.lastPingAt = Date.now();
    s.lastPingPersistAt = 0; /* persist the first location ping immediately */
    s.lastPingPersistPt = undefined;
    pushAlert(s, "enroute", "info", `${s.tutorName} started — ETA ${s.etaMinutes} min`);
    io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    socket.emit("action_result", { action: "on_my_way", ok: true });
    await persist("on_my_way", s.sessionId, { etaMinutes: s.etaMinutes });
  });

  socket.on("request_otp", async (data: { sessionId: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    if (joinedRole !== "parent" && joinedRole !== "admin") return;
    // rotate OTP if expired
    if (Date.now() > s.otpExpiresAt) {
      s.otp = genOtp();
      s.otpExpiresAt = Date.now() + 10 * 60 * 1000;
      s.otpAttempts = 0;
      io.to(`sess:${s.sessionId}`).emit("otp_rotated", { sessionId: s.sessionId, expiresAt: s.otpExpiresAt });
      await persist("otp_rotated", s.sessionId, { otp: s.otp });
    }
    socket.emit("otp", { sessionId: s.sessionId, otp: s.otp, expiresAt: s.otpExpiresAt });
  });

  socket.on("checkin", async (data: { sessionId: string; otp: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    if (s.stage !== "enroute" && s.stage !== "arrived") {
      socket.emit("checkin_result", { ok: false, reason: "INVALID_STATE", message: "Start travel before checking in." });
      return;
    }
    /* LearnX: geofence-enforced check-in — the tutor must be within
       HomeSession.geofenceMeters of the home before the OTP is considered.
       Tapping "Check in" while still en route is rejected here. */
    const distance = haversineMeters(s.marker, s.dest);
    if (s.geofenceMeters > 0 && distance > s.geofenceMeters) {
      socket.emit("checkin_result", {
        ok: false,
        reason: "OUTSIDE_GEOFENCE",
        message: `You are ${Math.round(distance)} m from the address — check-in unlocks within ${s.geofenceMeters} m of the home.`,
      });
      return;
    }
    if (s.otpAttempts >= 5) {
      socket.emit("checkin_result", { ok: false, reason: "RATE_LIMIT", message: "Too many attempts. Ask the parent for a fresh OTP." });
      return;
    }
    if (String(data.otp || "").trim() !== s.otp) {
      s.otpAttempts += 1;
      await persist("otp_attempt", s.sessionId, { ok: false, attempt: s.otpAttempts });
      socket.emit("checkin_result", {
        ok: false,
        reason: "OTP_INVALID",
        message: `Incorrect OTP (${s.otpAttempts}/5 attempts used)`,
      });
      return;
    }
    s.otpAttempts = 0;
    s.stage = "in_progress";
    s.checkedInAt = Date.now();
    s.sessionElapsedSec = 0;
    s.battery = Math.max(20, s.battery - 2);
    pushAlert(s, "checkin", "success", `OTP verified — session started at ${new Date().toLocaleTimeString()}`);
    io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    socket.emit("checkin_result", { ok: true });
    await persist("checkin", s.sessionId, {});
  });

  socket.on("checkout", async (data: { sessionId: string; topics?: string[]; homework?: string; notes?: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    if (s.stage !== "in_progress") {
      socket.emit("action_result", { action: "checkout", ok: false, message: "No active session." });
      return;
    }
    /* LearnX: minimum-duration check-out — demo policy requires 90 s of
       teaching time before the summary can be recorded and escrow released. */
    if (s.sessionElapsedSec < 90) {
      socket.emit("action_result", {
        action: "checkout",
        ok: false,
        message: "Minimum session duration is 90 seconds (demo policy) — please finish the session before checking out.",
      });
      return;
    }
    s.stage = "done";
    s.checkedOutAt = Date.now();
    s.summary = { topics: data.topics || [], homework: data.homework || "", notes: data.notes || "" };
    io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    socket.emit("action_result", { action: "checkout", ok: true });
    await persist("checkout", s.sessionId, { topics: s.summary.topics, homework: s.summary.homework, notes: s.summary.notes, elapsedSec: Math.round(s.sessionElapsedSec) });
  });

  socket.on("sos", async (data: { sessionId: string; by?: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    if (s.sosActive) {
      socket.emit("action_result", { action: "sos", ok: true, message: "SOS already active" });
      return;
    }
    s.sosActive = true;
    pushAlert(s, "sos", "critical", `SOS raised by ${data.by || "user"} — safety team + emergency contacts notified with live location`);
    io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    socket.emit("action_result", { action: "sos", ok: true });
    await persist("sos", s.sessionId, { by: data.by || "user", location: s.marker });
  });

  socket.on("clear_sos", async (data: { sessionId: string; by?: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    s.sosActive = false;
    pushAlert(s, "sos_cleared", "success", `SOS stood down by ${data.by || "admin"} — logged for review`);
    io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    await persist("clear_sos", s.sessionId, { by: data.by || "admin" });
  });

  socket.on("silent_check", async (data: { sessionId: string; status: "ok" | "not_ok" }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    s.silentCheck = { status: data.status, at: Date.now() };
    if (data.status === "not_ok") {
      pushAlert(s, "silent", "warning", "Parent marked 'Everything is NOT OK' — safety team notified");
      await persist("silent_not_ok", s.sessionId, {});
    } else {
      pushAlert(s, "silent", "info", "Parent confirmed — everything is OK");
    }
    io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
  });

  socket.on("reset", async (data: { sessionId: string }) => {
    const s = data?.sessionId ? sessions.get(data.sessionId) : null;
    if (!s) return;
    const fresh: LiveSession = {
      ...s,
      stage: "scheduled",
      progress: 0,
      marker: interpRoute(s.route, 0),
      etaMinutes: 12,
      sosActive: false,
      alerts: [],
      sessionElapsedSec: 0,
      checkedInAt: undefined,
      checkedOutAt: undefined,
      startedAt: undefined,
      summary: undefined,
      otp: genOtp(),
      otpExpiresAt: Date.now() + 10 * 60 * 1000,
      otpAttempts: 0,
      silentCheck: undefined,
      /* LearnX: clear the rule engine so the demo flow can replay cleanly */
      baselineEta: 12,
      firedAlerts: new Set<string>(),
      lastPingAt: undefined,
      lastPingPersistAt: 0,
      lastPingPersistPt: undefined,
    };
    sessions.set(s.sessionId, fresh);
    io.to(`sess:${s.sessionId}`).emit("state", publicState(fresh, false));
    socket.emit("action_result", { action: "reset", ok: true });
    await persist("reset", s.sessionId, {});
  });

  socket.on("disconnect", () => {
    /* nothing to clean per-socket; rooms auto-managed */
  });
});

/* ---------- simulation ticker (1.5 s) ---------- */
setInterval(() => {
  if (io.connectionCount === 0) return; /* idle — let the Durable Object hibernate */
  const now = Date.now();
  for (const s of sessions.values()) {
    /* LearnX alert rules run against REAL times for every loaded session */
    evaluateSafetyRules(s, now);

    if (s.stage === "enroute") {
      s.progress = Math.min(100, s.progress + 1.6);
      s.marker = interpRoute(s.route, s.progress);
      s.etaMinutes = Math.max(1, Math.ceil(((100 - s.progress) / 100) * 12));
      s.battery = Math.max(15, s.battery - 0.05);
      s.lastPingAt = now;
      if (s.progress >= 100) {
        s.stage = "arrived";
        s.etaMinutes = 0;
        pushAlert(s, "arrived", "info", `${s.tutorName} reached the geofence (within ${s.geofenceMeters} m) — waiting for OTP check-in`);
      }
      persistPing(s, now);
      io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    } else if (s.stage === "in_progress") {
      s.sessionElapsedSec += 1.5;
      s.battery = Math.max(15, s.battery - 0.02);
      s.lastPingAt = now;
      persistPing(s, now);
      io.to(`sess:${s.sessionId}`).emit("state", publicState(s, false));
    }
  }
}, 1500);


}
