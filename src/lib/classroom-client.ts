"use client";

/**
 * Tutor Amma — Digital Classroom client.
 * Realtime signaling (ClassroomHub Durable Object at /rt/classroom) + WebRTC mesh
 * for audio/video/screen-share. Gracefully degrades to an avatar-only
 * experience when camera/microphone permissions are unavailable.
 */
import { io } from "@/lib/realtime/client";
import { useCallback, useEffect, useRef, useState } from "react";

/* ----------------------------- types ----------------------------- */
export type ClassroomRole = "host" | "cohost" | "participant" | "observer";

export interface ClassroomPerson {
  id: string;
  sid: string;
  name: string;
  color: string;
  role: ClassroomRole;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  hand: boolean;
  allowShare?: boolean;
}

export interface WbPoint {
  x: number; // normalized 0-1 against the stage
  y: number;
}
export interface WbStrokeView {
  id: string;
  points: WbPoint[];
  color: string;
  width: number;
}
export interface CaptionStateView {
  enabled: boolean;
  lang: string; // en | ar | hi
}
export interface CaptionLineView {
  text: string;
  lang?: string;
  at: number;
}
export interface BreakoutRoomView {
  name: string;
  participants: string[]; // person ids
}
export interface BreakoutView {
  action: "start" | "return_all";
  rooms?: BreakoutRoomView[];
  startedAt?: number;
  durationSec?: number;
}
export interface ReactionView {
  id: string;
  emoji: string;
  from: string;
  fromName: string;
  at: number;
}
export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}
export interface PollView {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  votes: Record<number, number>;
  total: number;
}
export interface QaView {
  id: string;
  from: string;
  name: string;
  text: string;
  upvotes: number;
  answered: boolean;
  answer?: string;
  at: number;
}
export interface QuizView {
  open: boolean;
  qIndex?: number;
  reveal?: boolean;
  total?: number;
  current?: { q: string; options: string[]; seconds: number } | null;
  answeredCount?: number;
  leaderboard?: { rank: number; name: string; correct: number; points: number }[];
}
export type PulseChoice = "got" | "slight" | "lost";
export interface PulseView {
  counts: { got: number; slight: number; lost: number };
  total: number;
}
export interface SlidesView {
  count: number;
  index: number;
  slide: string | null;
}
export interface RoomState {
  meta: { title: string; subject: string; hostName: string; allowChat: boolean };
  hostOnline: boolean;
  participants: ClassroomPerson[];
  waiting?: ClassroomPerson[];
  chat: ChatMsg[];
  polls: PollView[];
  qa: QaView[];
  quiz: QuizView;
  pulse?: PulseView;
  slides: SlidesView | null;
  /* signature round 2 */
  wbSnapshot?: WbStrokeView[];
  captionState?: CaptionStateView;
  recordingActive?: boolean;
  recordingStartedAt?: number | null;
  breakout?: BreakoutView | null;
  roomLocked?: boolean;
}
export interface AttendanceRow {
  name: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
  durationMin: number;
  status: string;
}

export type Phase = "connecting" | "waiting" | "in_class" | "denied" | "removed" | "ended" | "error";

export interface JoinOptions {
  slug: string;
  name: string;
  role: "host" | "participant" | "observer";
  hostKey?: string;
  color?: string;
  userId?: string;
  meta?: { title?: string; subject?: string; hostName?: string; allowChat?: boolean };
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

interface Peer {
  pc: RTCPeerConnection;
  audioSender: RTCRtpSender;
  videoSender: RTCRtpSender;
  initiator: boolean;
}

/* ----------------------------- hook ----------------------------- */
export function useClassroom(opts: JoinOptions) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [selfId, setSelfId] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [pulse, setPulse] = useState<PulseView | null>(null);
  const [myPulse, setMyPulse] = useState<PulseChoice | null>(null);
  /* signature round 2 */
  const [strokes, setStrokes] = useState<WbStrokeView[]>([]);
  const [reactions, setReactions] = useState<ReactionView[]>([]);
  const [captionState, setCaptionState] = useState<CaptionStateView>({ enabled: false, lang: "en" });
  const [captionLine, setCaptionLine] = useState<CaptionLineView | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [breakout, setBreakout] = useState<BreakoutView | null>(null);
  const [roomLocked, setRoomLocked] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const lastReactionRef = useRef(0);
  const isObserver = opts.role === "observer";

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const peersRef = useRef(new Map<string, Peer>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);

  /* -------- WebRTC helpers -------- */
  const attachLocalTracks = useCallback((peer: Peer) => {
    const stream = localStreamRef.current;
    const mic = stream?.getAudioTracks()[0] ?? null;
    const cam = stream?.getVideoTracks()[0] ?? null;
    try {
      peer.audioSender.replaceTrack(mic);
      peer.videoSender.replaceTrack(screenTrackRef.current ?? cam);
    } catch {
      /* transceiver kinds may mismatch when media was unavailable */
    }
  }, []);

  const ensurePeer = useCallback(
    (sid: string, initiator: boolean): Peer => {
      const existing = peersRef.current.get(sid);
      if (existing) return existing;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
      const videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
      const peer: Peer = { pc, audioSender, videoSender, initiator };
      peersRef.current.set(sid, peer);

      attachLocalTracks(peer);

      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        setRemote((prev) => (prev[sid] === stream ? prev : { ...prev, [sid]: stream }));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit("signal", { to: sid, data: { candidate: e.candidate } });
        }
      };
      pc.onnegotiationneeded = async () => {
        if (!peer.initiator) return;
        try {
          await pc.setLocalDescription(await pc.createOffer());
          socketRef.current?.emit("signal", { to: sid, data: { description: pc.localDescription } });
        } catch {
          /* ignore */
        }
      };
      return peer;
    },
    [attachLocalTracks]
  );

  const dropPeer = useCallback((sid: string) => {
    const peer = peersRef.current.get(sid);
    if (peer) {
      try {
        peer.pc.close();
      } catch {}
      peersRef.current.delete(sid);
    }
    setRemote((prev) => {
      if (!(sid in prev)) return prev;
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  }, []);

  const syncPeers = useCallback(
    (participants: ClassroomPerson[], selfSid: string) => {
      const liveSids = new Set(participants.map((p) => p.sid).filter((s) => s !== selfSid));
      for (const sid of liveSids) {
        if (!peersRef.current.has(sid)) ensurePeer(sid, true); // newcomer initiates
      }
      for (const sid of [...peersRef.current.keys()]) {
        if (!liveSids.has(sid)) dropPeer(sid);
      }
    },
    [dropPeer, ensurePeer]
  );

  /* -------- local media -------- */
  const acquireMedia = useCallback(async () => {
    if (localStreamRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice("This browser can't share camera or mic — you joined in view-only mode.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 360 } });
      localStreamRef.current = stream;
      camTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);
      // polite defaults: mic on, camera on (matches Meet/Teams behaviour)
      stream.getAudioTracks().forEach((t) => (t.enabled = true));
      stream.getVideoTracks().forEach((t) => (t.enabled = true));
      setMicOn(true);
      setCamOn(true);
      for (const peer of peersRef.current.values()) attachLocalTracks(peer);
      socketRef.current?.emit("media_state", { mic: true, cam: true });
    } catch {
      setMediaNotice("Camera/microphone unavailable — you joined without audio & video. You can still chat, vote and answer.");
    }
  }, [attachLocalTracks]);

  /* -------- connection -------- */
  useEffect(() => {
    const o = opts;
    // ClassroomHub runs as a Cloudflare Durable Object on the same origin.
    const socket = io(process.env.NEXT_PUBLIC_CLASSROOMHUB_URL || "/rt/classroom", {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const doJoin = () => {
      socket.emit("join", {
        slug: o.slug,
        name: o.name,
        role: o.role,
        hostKey: o.hostKey,
        color: o.color,
        userId: o.userId,
        meta: o.meta,
      });
    };
    socket.on("connect", doJoin);

    socket.on("joined", (payload: { selfId: string; role: string; waiting?: boolean; state: RoomState }) => {
      setSelfId(payload.selfId);
      setRoom(payload.state);
      setChat(payload.state.chat ?? []);
      setPulse(payload.state.pulse ?? null);
      setStrokes(payload.state.wbSnapshot ?? []); // fresh snapshot on (re)join
      syncRound2(payload.state);
      setPhase(payload.waiting ? "waiting" : "in_class");
      if (!payload.waiting) {
        if (!isObserver) acquireMedia();
        if (socket.id) syncPeers(payload.state.participants, socket.id);
      }
    });

    socket.on("admitted", (payload: { state: RoomState }) => {
      setPhase("in_class");
      setRoom(payload.state);
      setPulse(payload.state.pulse ?? null);
      if (!isObserver) acquireMedia();
      if (socket.id) syncPeers(payload.state.participants, socket.id);
    });

    socket.on("denied", (p: { reason?: string }) => {
      setErrorMsg(p.reason || "The host declined your request to join.");
      setPhase("denied");
    });

    socket.on("join_denied", (p: { reason?: string }) => {
      const reason = p?.reason === "locked" ? "Room locked by the host." : p?.reason === "banned" ? "You were removed from this class by the host and cannot rejoin." : "The host declined your request to join.";
      setErrorMsg(reason);
      setPhase("denied");
    });

    socket.on("banned", (p: { reason?: string }) => {
      setErrorMsg(p?.reason || "You were removed from this class by the host.");
      setPhase("removed");
    });

    socket.on("room_state", (state: RoomState) => {
      setRoom(state);
      setPulse(state.pulse ?? null);
      syncRound2(state);
      if (socket.id) syncPeers(state.participants, socket.id);
    });

    /* ---------- signature round 2 events ---------- */
    const syncRound2 = (state: RoomState) => {
      if (state.captionState) setCaptionState(state.captionState);
      setRecordingActive(!!state.recordingActive);
      setRecordingStartedAt(state.recordingStartedAt ?? null);
      setBreakout(state.breakout ?? null);
      setRoomLocked(!!state.roomLocked);
    };

    socket.on("wb_stroke", (stroke: WbStrokeView) => {
      if (!stroke?.id) return;
      setStrokes((prev) => [...prev.slice(-399), stroke]);
    });

    socket.on("wb_clear", () => setStrokes([]));

    socket.on("reaction", (r: ReactionView) => {
      if (!r?.id) return;
      setReactions((prev) => [...prev.slice(-24), r]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 2500);
    });

    socket.on("caption_state", (cs: CaptionStateView) => {
      setCaptionState(cs ?? { enabled: false, lang: "en" });
      if (!cs?.enabled) setCaptionLine(null);
    });

    socket.on("caption_line", (line: CaptionLineView) => setCaptionLine(line ?? null));

    socket.on("recording_state", (p: { active: boolean; startedAt: number | null }) => {
      setRecordingActive(!!p?.active);
      setRecordingStartedAt(p?.startedAt ?? null);
    });

    socket.on("breakout", (b: BreakoutView) => {
      setBreakout(b?.action === "start" ? b : null);
    });

    socket.on("lock_room", (p: { locked: boolean }) => setRoomLocked(!!p?.locked));

    socket.on("speaking", (p: { peerId: string; active: boolean }) => {
      if (!p?.peerId) return;
      setSpeakingIds((prev) => (p.active ? (prev.includes(p.peerId) ? prev : [...prev, p.peerId]) : prev.filter((id) => id !== p.peerId)));
    });

    socket.on("pulse_state", (p: { counts: { got: number; slight: number; lost: number }; total: number }) => {
      setPulse({ counts: p.counts, total: p.total });
      if (!p.total && !p.counts.got && !p.counts.slight && !p.counts.lost) setMyPulse(null); // host reset the gauge
    });

    socket.on("waiting_update", (p: { waiting: ClassroomPerson[] }) => {
      setRoom((prev) => (prev ? { ...prev, waiting: p.waiting } : prev));
    });

    socket.on("signal", async (p: { from: string; data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      try {
        if (p.data.description) {
          const peer = ensurePeer(p.from, false);
          await peer.pc.setRemoteDescription(p.data.description);
          if (p.data.description.type === "offer") {
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            socket.emit("signal", { to: p.from, data: { description: peer.pc.localDescription } });
          }
        } else if (p.data.candidate) {
          const peer = peersRef.current.get(p.from);
          if (peer) await peer.pc.addIceCandidate(p.data.candidate);
        }
      } catch {
        /* ignore malformed signals */
      }
    });

    socket.on("chat_new", (msg: ChatMsg) => setChat((c) => [...c.slice(-300), msg]));
    socket.on("force_muted", () => {
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
      setMicOn(false);
      setToastMsg("The teacher muted your microphone");
    });
    socket.on("removed", (p: { reason?: string }) => {
      setErrorMsg(p.reason || "You were removed from this class.");
      setPhase("removed");
    });
    socket.on("class_ended", (p: { attendees: AttendanceRow[] }) => {
      setAttendance(p.attendees ?? []);
      setPhase("ended");
    });
    socket.on("host_left", () => setToastMsg("The teacher left — waiting for them to return…"));
    socket.on("toast", (p: { message: string }) => setToastMsg(p.message));
    socket.on("error_msg", (p: { message: string }) => {
      setErrorMsg(p.message || "Something went wrong.");
      setPhase("error");
    });

    return () => {
      for (const peer of peersRef.current.values()) {
        try {
          peer.pc.close();
        } catch {}
      }
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /* -------- controls -------- */
  const toggleMic = useCallback(() => {
    const next = !micOn;
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
    socketRef.current?.emit("media_state", { mic: next });
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const next = !camOn;
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    if (!screenOn && camTrackRef.current) camTrackRef.current.enabled = next;
    setCamOn(next);
    socketRef.current?.emit("media_state", { cam: next });
  }, [camOn, screenOn]);

  const toggleScreen = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    if (screenOn) {
      // stop → restore camera
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      for (const peer of peersRef.current.values()) {
        try {
          peer.videoSender.replaceTrack(camTrackRef.current ?? null);
        } catch {}
      }
      setScreenOn(false);
      socket.emit("screen", { on: false });
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      track.onended = () => {
        screenTrackRef.current = null;
        for (const peer of peersRef.current.values()) {
          try {
            peer.videoSender.replaceTrack(camTrackRef.current ?? null);
          } catch {}
        }
        setScreenOn(false);
        socketRef.current?.emit("screen", { on: false });
      };
      for (const peer of peersRef.current.values()) {
        try {
          peer.videoSender.replaceTrack(track);
        } catch {}
      }
      setScreenOn(true);
      socket.emit("screen", { on: true });
    } catch {
      setToastMsg("Screen sharing was blocked or cancelled");
    }
  }, [screenOn]);

  const toggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit("hand", { raised: next });
  }, [handRaised]);

  /* -------- concept pulse -------- */
  const sendPulse = useCallback((choice: PulseChoice) => {
    setMyPulse(choice); // own choice is highlighted until reset
    socketRef.current?.emit("pulse_send", { choice });
  }, []);

  const resetPulse = useCallback(() => {
    setMyPulse(null);
    socketRef.current?.emit("pulse_reset");
  }, []);

  /* -------- reactions (throttled 2s client-side) -------- */
  const sendReaction = useCallback(
    (emoji: string) => {
      const now = Date.now();
      if (now - lastReactionRef.current < 2000) return;
      lastReactionRef.current = now;
      socketRef.current?.emit("reaction", { emoji });
    },
    []
  );

  /* -------- host actions -------- */
  const emit = useCallback((event: string, payload?: Record<string, unknown>) => {
    socketRef.current?.emit(event, payload ?? {});
  }, []);

  const endClass = useCallback(() => emit("end_class"), [emit]);

  const leave = useCallback(() => {
    socketRef.current?.disconnect();
    setPhase("ended");
  }, []);

  /* -------- active speaker detection (local mic analyser) --------
   * Runs only while unmuted with a live stream; emits direction changes
   * throttled to ~700ms so the hub relay stays cheap. */
  useEffect(() => {
    if (isObserver) return;
    const stream = localStream;
    if (!stream || !micOn) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let speaking = false;
    let lastEmit = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const nowActive = speaking ? rms > 0.025 : rms > 0.05; // hysteresis
      const now = Date.now();
      if (nowActive !== speaking && now - lastEmit > 700) {
        speaking = nowActive;
        lastEmit = now;
        socketRef.current?.emit("speaking", { active: speaking });
      }
    };
    const iv = setInterval(tick, 150);
    return () => {
      clearInterval(iv);
      try {
        src.disconnect();
        ctx.close();
      } catch {}
    };
  }, [localStream, micOn, isObserver]);

  return {
    phase,
    errorMsg,
    room,
    chat,
    micOn,
    camOn,
    screenOn,
    handRaised,
    mediaNotice,
    toastMsg,
    setToastMsg,
    remote,
    localStream,
    selfId,
    attendance,
    pulse,
    myPulse,
    /* signature round 2 */
    strokes,
    reactions,
    captionState,
    captionLine,
    recordingActive,
    recordingStartedAt,
    breakout,
    roomLocked,
    speakingIds,
    sendReaction,
    toggleMic,
    toggleCam,
    toggleScreen,
    toggleHand,
    sendPulse,
    resetPulse,
    emit,
    endClass,
    leave,
  };
}
