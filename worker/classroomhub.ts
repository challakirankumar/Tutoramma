/**
 * Tutor Amma — ClassroomHub (Cloudflare Durable Object)
 *
 * Real-time engine for Digital Classrooms / Live Classes:
 *  · waiting room + host admission (Google-Meet style)
 *  · WebRTC mesh signaling (video / audio / screen share relay)
 *  · in-class chat, quick polls, Q&A with upvotes, live quizzes
 *  · concept pulse (Got it / Slightly lost / Lost live gauge)
 *  · host-only controls: admit/deny, mute one/all, remove, end class
 *  · slide deck broadcast + page turns
 *  · attendance tracking (joined/left/duration per participant)
 *
 * All state is ephemeral (a live meeting); durable records (attendance,
 * class status) are persisted by the main app through its own API.
 */
import type { MiniIO } from "./mini-io";

export function attachClassroomHub(io: MiniIO) {



/* ----------------------------- types ----------------------------- */
type Role = "host" | "cohost" | "participant" | "observer";

type WbPoint = { x: number; y: number }; // normalized 0-1 against the stage

interface WbStroke {
  id: string;
  points: WbPoint[];
  color: string;
  width: number;
}

interface Person {
  sid: string;
  id: string; // stable per-join id (uuid)
  name: string;
  color: string;
  role: Role;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  hand: boolean;
  allowShare?: boolean; // host granted this participant screen share
  lastSpeakAt: number; // active-speaker throttle
  lastSpeakDir: boolean;
  joinedAt: number;
}

interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}

interface Poll {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  votes: Record<string, number>; // personId -> optionIndex
}

interface QaItem {
  id: string;
  from: string;
  name: string;
  text: string;
  upvotes: Set<string>;
  answer?: string;
  dismissed?: boolean;
  at: number;
}

interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  seconds: number;
}

interface QuizState {
  open: boolean;
  qIndex: number;
  questions: QuizQuestion[];
  answers: Record<string, number[]>; // personId -> choices per question
  reveal: boolean; // showing correct answer for current question
  scores: Record<string, { name: string; correct: number; points: number }>;
}

type PulseChoice = "got" | "slight" | "lost";

interface Pulse {
  counts: { got: number; slight: number; lost: number };
  voters: Map<string, PulseChoice>; // sid -> choice (one vote per person, latest wins)
  updatedAt: number;
}

interface BreakoutState {
  rooms: { name: string; participants: string[] }[]; // person ids per room
  startedAt: number;
  durationSec: number;
}

interface ClassRoom {
  slug: string;
  hostKey: string;
  meta: { title: string; subject: string; hostName: string; allowChat: boolean };
  hostSid: string | null;
  people: Map<string, Person>; // sid -> person (admitted)
  waiting: Map<string, Person>; // sid -> person (waiting room)
  chat: ChatMsg[];
  polls: Poll[];
  qa: QaItem[];
  quiz: QuizState;
  pulse: Pulse;
  slides: string[];
  slideIndex: number;
  attendance: Map<string, { name: string; role: string; joinedAt: number; leftAt: number | null }>;
  /* signature round 2 */
  wb: WbStroke[]; // last N whiteboard strokes (late joiners replay)
  caption: { enabled: boolean; lang: string };
  recordingActive: boolean;
  recordingStartedAt: number | null;
  breakout: BreakoutState | null;
  roomLocked: boolean;
  bans: Map<string, { id: string; name: string }>; // keyed by personId AND lowercase name
}

const rooms = new Map<string, ClassRoom>();

/* ----------------------------- helpers ----------------------------- */
const uid = () => Math.random().toString(36).slice(2, 10);

function publicPerson(p: Person) {
  return { id: p.id, sid: p.sid, name: p.name, color: p.color, role: p.role, mic: p.mic, cam: p.cam, screen: p.screen, hand: p.hand, allowShare: !!p.allowShare };
}

function personSummary(list: Person[]) {
  return list.map(publicPerson);
}

function getOrCreateRoom(slug: string, hostKey: string, meta: ClassRoom["meta"]): ClassRoom {
  let r = rooms.get(slug);
  if (!r) {
    r = {
      slug,
      hostKey,
      meta: { title: meta?.title ?? "Live class", subject: meta?.subject ?? "", hostName: meta?.hostName ?? "Teacher", allowChat: meta?.allowChat ?? true },
      hostSid: null,
      people: new Map(),
      waiting: new Map(),
      chat: [],
      polls: [],
      qa: [],
      quiz: { open: false, qIndex: 0, questions: [], answers: {}, reveal: false, scores: {} },
      pulse: { counts: { got: 0, slight: 0, lost: 0 }, voters: new Map(), updatedAt: 0 },
      slides: [],
      slideIndex: 0,
      attendance: new Map(),
      wb: [],
      caption: { enabled: false, lang: "en" },
      recordingActive: false,
      recordingStartedAt: null,
      breakout: null,
      roomLocked: false,
      bans: new Map(),
    };
    rooms.set(slug, r);
  }
  return r;
}

function roomState(r: ClassRoom, forHost: boolean) {
  return {
    meta: r.meta,
    hostOnline: !!r.hostSid,
    participants: personSummary([...r.people.values()]),
    ...(forHost ? { waiting: personSummary([...r.waiting.values()]) } : {}),
    chat: r.chat.slice(-200),
    polls: r.polls.map((p) => ({
      id: p.id,
      question: p.question,
      options: p.options,
      open: p.open,
      votes: Object.values(p.votes).reduce<Record<number, number>>((acc, v) => {
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {}),
      total: Object.keys(p.votes).length,
    })),
    qa: r.qa
      .filter((x) => !x.dismissed)
      .map((x) => ({ id: x.id, from: x.from, name: x.name, text: x.text, upvotes: x.upvotes.size, answered: !!x.answer, answer: x.answer, at: x.at })),
    quiz: r.quiz.open
      ? {
          open: true,
          qIndex: r.quiz.qIndex,
          reveal: r.quiz.reveal,
          total: r.quiz.questions.length,
          current: r.quiz.questions[r.quiz.qIndex]
            ? { q: r.quiz.questions[r.quiz.qIndex].q, options: r.quiz.questions[r.quiz.qIndex].options, seconds: r.quiz.questions[r.quiz.qIndex].seconds }
            : null,
          answeredCount: Object.values(r.quiz.answers).filter((a) => a[r.quiz.qIndex] !== undefined).length,
          leaderboard: Object.values(r.quiz.scores)
            .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
            .slice(0, 10)
            .map((s, i) => ({ rank: i + 1, name: s.name, correct: s.correct, points: s.points })),
        }
      : { open: false },
    pulse: pulseSnapshot(r),
    slides: r.slides.length ? { count: r.slides.length, index: r.slideIndex, slide: r.slides[r.slideIndex] ?? null } : null,
    /* signature round 2 — snapshot for late joiners */
    wbSnapshot: r.wb.slice(-100),
    captionState: r.caption,
    recordingActive: r.recordingActive,
    recordingStartedAt: r.recordingStartedAt,
    breakout: r.breakout
      ? { action: "start" as const, rooms: r.breakout.rooms, startedAt: r.breakout.startedAt, durationSec: r.breakout.durationSec }
      : null,
    roomLocked: r.roomLocked,
  };
}

function broadcastState(r: ClassRoom, io: MiniIO) {
  for (const p of r.people.values()) {
    io.to(p.sid).emit("room_state", roomState(r, p.role === "host" || p.role === "cohost"));
  }
}

function trackAttendance(r: ClassRoom, p: Person) {
  const prev = r.attendance.get(p.id);
  if (prev) {
    prev.leftAt = null; // rejoined
  } else {
    r.attendance.set(p.id, { name: p.name, role: p.role, joinedAt: Date.now(), leftAt: null });
  }
}

function markLeft(r: ClassRoom, personId: string) {
  const a = r.attendance.get(personId);
  if (a && !a.leftAt) a.leftAt = Date.now();
}

function attendanceReport(r: ClassRoom) {
  return [...r.attendance.values()].map((a) => ({
    name: a.name,
    role: a.role,
    joinedAt: new Date(a.joinedAt).toISOString(),
    leftAt: a.leftAt ? new Date(a.leftAt).toISOString() : null,
    durationMin: Math.max(1, Math.round((((a.leftAt ?? Date.now()) - a.joinedAt) / 60000) * 10) / 10),
    status: a.leftAt ? "left" : "present",
  }));
}

function isHost(r: ClassRoom, socketId: string) {
  const p = r.people.get(socketId);
  return !!p && p.role === "host";
}

/* co-hosts act like the host for moderation events (but never for
 * end_class / recording_state / lock_room / ban / role_update) */
function isMod(r: ClassRoom, socketId: string) {
  const p = r.people.get(socketId);
  return !!p && (p.role === "host" || p.role === "cohost");
}

/* concept pulse — recompute counts from the voter map */
function recomputePulse(r: ClassRoom) {
  const counts = { got: 0, slight: 0, lost: 0 };
  for (const choice of r.pulse.voters.values()) counts[choice] += 1;
  r.pulse.counts = counts;
  r.pulse.updatedAt = Date.now();
}

function pulseSnapshot(r: ClassRoom) {
  return { counts: r.pulse.counts, total: r.pulse.voters.size, updatedAt: r.pulse.updatedAt };
}

function broadcastPulse(r: ClassRoom, io: MiniIO) {
  io.to(`class:${r.slug}`).emit("pulse_state", pulseSnapshot(r));
}

/* ----------------------------- server ----------------------------- */
io.on("connection", (socket) => {
  let room: ClassRoom | null = null;
  let me: Person | null = null;
  let inWaiting = false;

  /* ---------- join ---------- */
  socket.on(
    "join",
    (data: {
      slug: string;
      name: string;
      role?: Role;
      hostKey?: string;
      color?: string;
      userId?: string;
      meta?: { title?: string; subject?: string; hostName?: string; allowChat?: boolean };
    }) => {
      try {
        const { slug, name } = data || ({} as any);
        if (!slug || !name || !name.trim()) {
          socket.emit("error_msg", { message: "Class link or name is missing." });
          return;
        }
        const wantsHost = data.role === "host";
        const wantsObserver = data.role === "observer";
        room = getOrCreateRoom(slug, data.hostKey ?? uid(), {
          title: data.meta?.title ?? "Live class",
          subject: data.meta?.subject ?? "",
          hostName: data.meta?.hostName ?? name,
          allowChat: data.meta?.allowChat ?? true,
        });

        // host must present the correct hostKey; only one host at a time
        if (wantsHost && (!data.hostKey || data.hostKey !== room.hostKey)) {
          socket.emit("error_msg", { message: "Host key rejected — only the class owner can host." });
          return;
        }
        if (wantsHost && room.hostSid && room.hostSid !== socket.id) {
          socket.emit("error_msg", { message: "This class already has an active host." });
          return;
        }

        /* banned tickets cannot rejoin (matched by user/person id or name) */
        if (!wantsHost) {
          const nameKey = name.trim().toLowerCase();
          if (room.bans.has(nameKey) || (data.userId && room.bans.has(`${data.userId}`))) {
            socket.emit("join_denied", { reason: "banned" });
            return;
          }
          /* locked rooms auto-deny lobby requests */
          if (room.roomLocked) {
            socket.emit("join_denied", { reason: "locked" });
            return;
          }
        }

        const person: Person = {
          sid: socket.id,
          id: data.userId ? `${data.userId}` : uid(),
          name: name.trim().slice(0, 40),
          color: data.color || "#315BE5",
          role: wantsHost ? "host" : wantsObserver ? "observer" : "participant",
          mic: false,
          cam: false,
          screen: false,
          hand: false,
          lastSpeakAt: 0,
          lastSpeakDir: false,
          joinedAt: Date.now(),
        };

        if (wantsHost) {
          room.hostSid = socket.id;
          room.people.set(socket.id, person);
          me = person;
          socket.join(`class:${slug}`);
          trackAttendance(room, person);
          socket.emit("joined", { selfId: person.id, role: "host", state: roomState(room, true) });
          broadcastState(room, io);
        } else if (room.hostSid) {
          // host is online → go through the waiting room; host admits from the People panel
          room.waiting.set(socket.id, person);
          me = person;
          inWaiting = true;
          socket.join(`class:${slug}`);
          socket.emit("joined", { selfId: person.id, role: "participant", waiting: true, state: roomState(room, false) });
          for (const p of room.people.values()) {
            if (p.role === "host") io.to(p.sid).emit("waiting_update", { waiting: personSummary([...room.waiting.values()]) });
          }
        } else {
          socket.emit("error_msg", { message: "The teacher hasn't started this class yet. Please wait and try again." });
          return;
        }
      } catch (e) {
        console.error("join error", e);
        socket.emit("error_msg", { message: "Could not join the class." });
      }
    }
  );

  /* ---------- admission (host / co-host) ---------- */
  socket.on("admit", (data: { sid: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const p = room.waiting.get(data.sid);
    if (!p) return;
    room.waiting.delete(data.sid);
    room.people.set(p.sid, p);
    trackAttendance(room, p);
    io.to(p.sid).emit("admitted", { state: roomState(room, false) });
    broadcastState(room, io);
  });

  socket.on("deny", (data: { sid: string; reason?: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const p = room.waiting.get(data.sid);
    if (!p) return;
    room.waiting.delete(data.sid);
    io.to(p.sid).emit("denied", { reason: data.reason || "The host declined your request to join." });
  });

  /* ---------- WebRTC signaling relay ---------- */
  socket.on("signal", (data: { to: string; data: unknown }) => {
    if (!room || !me) return;
    io.to(data.to).emit("signal", { from: socket.id, data: data.data });
  });

  /* ---------- media / hand / screen state ---------- */
  socket.on("media_state", (data: { mic?: boolean; cam?: boolean }) => {
    if (!room || !me) return;
    if (typeof data.mic === "boolean") me.mic = data.mic;
    if (typeof data.cam === "boolean") me.cam = data.cam;
    broadcastState(room, io);
  });

  socket.on("screen", (data: { on: boolean }) => {
    if (!room || !me) return;
    /* only the host, co-hosts and explicitly granted participants may share */
    if (data.on && me.role !== "host" && me.role !== "cohost" && !me.allowShare) return;
    me.screen = !!data.on;
    broadcastState(room, io);
  });

  socket.on("hand", (data: { raised: boolean }) => {
    if (!room || !me || me.role === "observer") return;
    me.hand = !!data.raised;
    broadcastState(room, io);
    if (me.hand && room.hostSid) {
      io.to(room.hostSid).emit("toast", { message: `✋ ${me.name} raised their hand` });
    }
  });

  /* ---------- active speaker (throttled relay) ---------- */
  socket.on("speaking", (data: { active: boolean }) => {
    if (!room || !me || me.role === "observer") return;
    const active = !!data.active;
    const now = Date.now();
    /* max ~1 direction change / sec per peer — duplicates are always dropped */
    if (active === me.lastSpeakDir || now - me.lastSpeakAt < 500) return;
    me.lastSpeakDir = active;
    me.lastSpeakAt = now;
    io.to(`class:${room.slug}`).emit("speaking", { peerId: me.id, active });
  });

  /* ---------- reactions (everyone except observers) ---------- */
  socket.on("reaction", (data: { emoji: string }) => {
    if (!room || !me || me.role === "observer") return;
    const emoji = String(data?.emoji ?? "").trim().slice(0, 8);
    if (!emoji) return;
    io.to(`class:${room.slug}`).emit("reaction", { id: uid(), emoji, from: me.id, fromName: me.name, at: Date.now() });
  });

  /* ---------- whiteboard ---------- */
  socket.on("wb_stroke", (data: { points?: WbPoint[]; color?: string; width?: number; done?: boolean }) => {
    if (!room || !me) return;
    if (me.role !== "host" && me.role !== "cohost") return; // drawing is a host / co-host power
    const points = (data.points ?? [])
      .slice(0, 600)
      .map((p) => ({ x: Math.min(1, Math.max(0, Number(p?.x) || 0)), y: Math.min(1, Math.max(0, Number(p?.y) || 0)) }));
    if (points.length < 2) return;
    const safeHex = /^#[0-9a-fA-F]{3,8}$/.test(String(data.color)) ? String(data.color) : "#F47B20";
    const stroke: WbStroke = {
      id: uid(),
      points,
      color: safeHex,
      width: Math.min(24, Math.max(1, Number(data.width) || 4)),
    };
    room.wb.push(stroke);
    if (room.wb.length > 300) room.wb.shift(); // keep the last 300 strokes
    io.to(`class:${room.slug}`).emit("wb_stroke", stroke);
  });

  socket.on("wb_clear", () => {
    if (!room || !isMod(room, socket.id)) return;
    room.wb = [];
    io.to(`class:${room.slug}`).emit("wb_clear");
  });

  /* ---------- captions (host-controlled, simulated) ---------- */
  socket.on("caption_state", (data: { enabled: boolean; lang?: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const lang = ["en", "ar", "hi"].includes(String(data?.lang)) ? String(data.lang) : room.caption.lang;
    room.caption = { enabled: !!data?.enabled, lang };
    io.to(`class:${room.slug}`).emit("caption_state", room.caption);
    broadcastState(room, io);
  });

  socket.on("caption_line", (data: { text: string; lang?: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const text = String(data?.text ?? "").slice(0, 300).trim();
    if (!text) return;
    io.to(`class:${room.slug}`).emit("caption_line", { text, lang: room.caption.lang, at: Date.now() });
  });

  /* ---------- recording (host only — consent on file) ---------- */
  socket.on("recording_state", (data: { active: boolean }) => {
    if (!room || !isHost(room, socket.id)) return;
    room.recordingActive = !!data?.active;
    room.recordingStartedAt = room.recordingActive ? Date.now() : null;
    io.to(`class:${room.slug}`).emit("recording_state", { active: room.recordingActive, startedAt: room.recordingStartedAt });
    broadcastState(room, io);
  });

  /* ---------- breakout rooms (display-level grouping) ---------- */
  socket.on(
    "breakout",
    (data: { action: "start" | "return_all"; rooms?: { name: string; participants: string[] }[]; durationSec?: number }) => {
      if (!room || !isMod(room, socket.id)) return;
      if (data?.action === "start") {
        const rooms = (data.rooms ?? [])
          .slice(0, 6)
          .map((r, i) => ({ name: String(r?.name || `Room ${i + 1}`).slice(0, 40), participants: (r?.participants ?? []).map(String).slice(0, 60) }));
        if (!rooms.length) return;
        room.breakout = { rooms, startedAt: Date.now(), durationSec: Math.min(3600, Math.max(60, Number(data.durationSec) || 300)) };
        io.to(`class:${room.slug}`).emit("breakout", {
          action: "start",
          rooms: room.breakout.rooms,
          startedAt: room.breakout.startedAt,
          durationSec: room.breakout.durationSec,
        });
      } else {
        room.breakout = null;
        io.to(`class:${room.slug}`).emit("breakout", { action: "return_all" });
      }
      broadcastState(room, io);
    }
  );

  /* ---------- bans & room lock (host only) ---------- */
  socket.on("ban", (data: { peerId: string }) => {
    if (!room || !isHost(room, socket.id)) return;
    const p = [...room.people.values(), ...room.waiting.values()].find((x) => x.id === String(data?.peerId ?? ""));
    if (!p || p.role === "host") return;
    room.bans.set(p.id, { id: p.id, name: p.name });
    room.bans.set(p.name.trim().toLowerCase(), { id: p.id, name: p.name });
    io.to(p.sid).emit("banned", { reason: "You were removed from this class by the host." });
    markLeft(room, p.id);
    room.people.delete(p.sid);
    room.waiting.delete(p.sid);
    broadcastState(room, io);
    /* give the client a beat to receive the event, then drop the socket */
    const sid = p.sid;
    setTimeout(() => {
      try {
        io.sockets.sockets.get(sid)?.disconnect(true);
      } catch {}
    }, 500);
  });

  socket.on("lock_room", (data: { locked: boolean }) => {
    if (!room || !isHost(room, socket.id)) return;
    room.roomLocked = !!data?.locked;
    io.to(`class:${room.slug}`).emit("lock_room", { locked: room.roomLocked });
    broadcastState(room, io);
  });

  /* ---------- role updates: co-host + screen-share grants (host only) ---------- */
  socket.on("role_update", (data: { peerId: string; role?: "cohost" | "participant"; allowShare?: boolean }) => {
    if (!room || !isHost(room, socket.id)) return;
    const p = [...room.people.values()].find((x) => x.id === String(data?.peerId ?? ""));
    if (!p || p.role === "host") return;
    if (data?.role === "cohost") p.role = "cohost";
    else if (data?.role === "participant" && p.role !== "observer") p.role = "participant";
    if (typeof data?.allowShare === "boolean") p.allowShare = data.allowShare;
    io.to(`class:${room.slug}`).emit("role_update", { peerId: p.id, role: p.role, allowShare: !!p.allowShare });
    broadcastState(room, io);
  });

  /* ---------- chat ---------- */
  socket.on("chat_send", (data: { text: string }) => {
    if (!room || !me || !room.meta.allowChat || me.role === "observer") return;
    const text = String(data.text || "").slice(0, 500).trim();
    if (!text) return;
    const msg: ChatMsg = { id: uid(), from: me.id, name: me.name, text, at: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 400) room.chat.shift();
    io.to(`class:${room.slug}`).emit("chat_new", msg);
  });

  /* ---------- polls ---------- */
  socket.on("poll_create", (data: { question: string; options: string[] }) => {
    if (!room || !isMod(room, socket.id)) return;
    const options = (data.options || []).map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 6);
    if (!data.question || options.length < 2) return;
    const poll: Poll = { id: uid(), question: String(data.question).slice(0, 200), options, open: true, votes: {} };
    room.polls.unshift(poll);
    if (room.polls.length > 20) room.polls.pop();
    broadcastState(room, io);
  });

  socket.on("poll_vote", (data: { pollId: string; optionIndex: number }) => {
    if (!room || !me || me.role === "observer") return;
    const poll = room.polls.find((p) => p.id === data.pollId);
    if (!poll || !poll.open) return;
    poll.votes[me.id] = data.optionIndex;
    broadcastState(room, io);
  });

  socket.on("poll_close", (data: { pollId: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const poll = room.polls.find((p) => p.id === data.pollId);
    if (poll) poll.open = false;
    broadcastState(room, io);
  });

  /* ---------- concept pulse (Got it / Slightly lost / Lost) ---------- */
  socket.on("pulse_send", (data: { choice: PulseChoice }) => {
    if (!room || !me || me.role === "observer") return; // host AND participants may send
    const choice = data?.choice;
    if (choice !== "got" && choice !== "slight" && choice !== "lost") return; // ignore unknown choices
    room.pulse.voters.set(socket.id, choice); // one vote per person, latest wins
    recomputePulse(room);
    broadcastPulse(room, io);
  });

  socket.on("pulse_reset", () => {
    if (!room || !isMod(room, socket.id)) return; // host / co-host
    room.pulse.voters.clear();
    recomputePulse(room);
    broadcastPulse(room, io);
  });

  /* ---------- Q&A ---------- */
  socket.on("qa_ask", (data: { text: string }) => {
    if (!room || !me || me.role === "observer") return;
    const text = String(data.text || "").slice(0, 300).trim();
    if (!text) return;
    const item: QaItem = { id: uid(), from: me.id, name: me.name, text, upvotes: new Set(), at: Date.now() };
    room.qa.unshift(item);
    if (room.qa.length > 60) room.qa.pop();
    broadcastState(room, io);
  });

  socket.on("qa_upvote", (data: { qaId: string }) => {
    if (!room || !me || me.role === "observer") return;
    const item = room.qa.find((q) => q.id === data.qaId);
    if (item) {
      if (item.upvotes.has(me.id)) item.upvotes.delete(me.id);
      else item.upvotes.add(me.id);
      broadcastState(room, io);
    }
  });

  socket.on("qa_answer", (data: { qaId: string; answer: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const item = room.qa.find((q) => q.id === data.qaId);
    if (item) {
      item.answer = String(data.answer || "").slice(0, 400);
      broadcastState(room, io);
    }
  });

  socket.on("qa_dismiss", (data: { qaId: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const item = room.qa.find((q) => q.id === data.qaId);
    if (item) {
      item.dismissed = true;
      broadcastState(room, io);
    }
  });

  /* ---------- quiz ---------- */
  socket.on("quiz_launch", (data: { questions: { q: string; options: string[]; answer: number; seconds?: number }[] }) => {
    if (!room || !isMod(room, socket.id)) return;
    const questions = (data.questions || [])
      .filter((q) => q.q && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 20)
      .map((q) => ({ q: String(q.q).slice(0, 250), options: q.options.slice(0, 5).map((o) => String(o).slice(0, 90)), answer: q.answer | 0, seconds: Math.min(120, Math.max(10, q.seconds ?? 30)) }));
    if (!questions.length) return;
    room.quiz = { open: true, qIndex: 0, questions, answers: {}, reveal: false, scores: {} };
    broadcastState(room, io);
  });

  socket.on("quiz_next", () => {
    if (!room || !isMod(room, socket.id)) return;
    const q = room.quiz;
    if (!q.open) return;
    if (q.reveal) {
      if (q.qIndex >= q.questions.length - 1) {
        q.open = false; // finished — leaderboard remains visible
      } else {
        q.qIndex += 1;
        q.reveal = false;
      }
    } else {
      q.reveal = true; // reveal answer for current question
    }
    broadcastState(room, io);
  });

  socket.on("quiz_answer", (data: { qIndex: number; choice: number }) => {
    if (!room || !me || me.role === "observer") return;
    const q = room.quiz;
    if (!q.open || q.reveal || data.qIndex !== q.qIndex) return;
    const list = q.answers[me.id] ?? (q.answers[me.id] = []);
    if (list[data.qIndex] !== undefined) return; // one attempt per question
    list[data.qIndex] = data.choice;
    const s = q.scores[me.id] ?? (q.scores[me.id] = { name: me.name, correct: 0, points: 0 });
    if (data.choice === q.questions[data.qIndex].answer) {
      s.correct += 1;
      s.points += 100;
    }
    broadcastState(room, io);
  });

  socket.on("quiz_end", () => {
    if (!room || !isMod(room, socket.id)) return;
    room.quiz.open = false;
    broadcastState(room, io);
  });

  /* ---------- slides ---------- */
  socket.on("slides_set", (data: { slides: string[] }) => {
    if (!room || !isMod(room, socket.id)) return;
    room.slides = (data.slides || []).slice(0, 30);
    room.slideIndex = 0;
    broadcastState(room, io);
  });

  socket.on("slides_page", (data: { index: number }) => {
    if (!room || !isMod(room, socket.id)) return;
    if (data.index >= 0 && data.index < room.slides.length) {
      room.slideIndex = data.index;
      broadcastState(room, io);
    }
  });

  /* ---------- host controls (co-hosts included) ---------- */
  socket.on("force_mute", (data: { sid: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    io.to(data.sid).emit("force_muted");
    const p = room.people.get(data.sid);
    if (p) p.mic = false;
    broadcastState(room, io);
  });

  socket.on("mute_all", () => {
    if (!room || !isMod(room, socket.id)) return;
    for (const p of room.people.values()) {
      if (p.role !== "host") {
        io.to(p.sid).emit("force_muted");
        p.mic = false;
      }
    }
    broadcastState(room, io);
  });

  socket.on("remove", (data: { sid: string; reason?: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    const p = room.people.get(data.sid);
    if (!p || p.role === "host") return;
    io.to(data.sid).emit("removed", { reason: data.reason || "The host removed you from this class." });
    markLeft(room, p.id);
    room.people.delete(data.sid);
    broadcastState(room, io);
  });

  /* host → participant nudge (e.g. "please unmute") */
  socket.on("notify", (data: { sid: string; message: string }) => {
    if (!room || !isMod(room, socket.id)) return;
    io.to(data.sid).emit("toast", { message: String(data.message || "").slice(0, 200) });
  });

  socket.on("get_attendance", () => {
    if (!room || !isMod(room, socket.id)) return;
    socket.emit("attendance", { attendees: attendanceReport(room) });
  });

  socket.on("end_class", () => {
    if (!room || !isHost(room, socket.id)) return;
    room.pulse.voters.clear(); // reset concept pulse along with the other state
    recomputePulse(room);
    for (const p of room.people.values()) markLeft(room, p.id);
    const report = attendanceReport(room);
    io.to(`class:${room.slug}`).emit("class_ended", { attendees: report });
    // clear the room after everyone had a chance to receive the event
    const slug = room.slug;
    setTimeout(() => rooms.delete(slug), 8000);
  });

  /* ---------- disconnect ---------- */
  socket.on("disconnect", () => {
    if (!room || !me) return;
    /* clear any active-speaker flag the leaver had */
    if (me.lastSpeakDir) {
      io.to(`class:${room.slug}`).emit("speaking", { peerId: me.id, active: false });
    }
    /* drop the leaver's concept-pulse vote so the gauge stays accurate */
    if (room.pulse.voters.delete(socket.id)) {
      recomputePulse(room);
      broadcastPulse(room, io);
    }
    if (inWaiting) {
      room.waiting.delete(socket.id);
      for (const p of room.people.values()) {
        if (p.role === "host") io.to(p.sid).emit("waiting_update", { waiting: personSummary([...room.waiting.values()]) });
      }
      return;
    }
    const wasHost = room.hostSid === socket.id;
    room.people.delete(socket.id);
    if (wasHost) {
      room.hostSid = null;
      for (const p of room.people.values()) io.to(p.sid).emit("host_left");
    } else {
      markLeft(room, me.id);
    }
    broadcastState(room, io);
  });
});

/* periodic cleanup of dead rooms */
setInterval(() => {
  const now = Date.now();
  for (const [slug, r] of rooms) {
    if (!r.hostSid && r.people.size === 0 && r.waiting.size === 0) {
      const lastJoin = Math.max(0, ...[...r.attendance.values()].map((a) => a.joinedAt), 0);
      if (now - lastJoin > 30 * 60 * 1000) rooms.delete(slug);
    }
  }
}, 60 * 1000);


}
