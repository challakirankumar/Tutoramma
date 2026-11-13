"use client";

/**
 * Tutor Amma — Digital Classroom (meeting room).
 * Google-Meet-style experience running fully inside the app:
 *   · waiting room + host admission · video / audio / screen share
 *   · chat, polls, Q&A with upvotes + AI answer drafts, live quizzes
 *     (importable from the Question Paper Studio), slide decks
 *     (uploadable images OR generated from a saved lesson plan)
 *   · host-only controls: admit/deny, mute one/all, remove, end class
 *   · signature round 2: whiteboard, floating reactions, live captions
 *     (EN/AR/HI, simulated), consented recording indicator, breakout
 *     rooms, ban + room lock, co-hosts, allow-screen-share, active
 *     speaker spotlight, observer (parent) mode, AI class notes +
 *     catch-up packs + spaced revision nudges on end.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import {
  useClassroom,
  type ClassroomPerson,
  type AttendanceRow,
  type PulseChoice,
  type PulseView,
  type QuizView,
  type WbPoint,
  type WbStrokeView,
  type BreakoutView,
} from "@/lib/classroom-client";
import { toast } from "@/hooks/use-toast";
import { pdfAttendance } from "@/lib/pdf";
import { clsx } from "clsx";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, Hand, LogOut, Users, MessageSquare,
  BarChart3, HelpCircle, Zap, Presentation, X, Check, ChevronLeft, ChevronRight, Send,
  Plus, Trash2, ShieldCheck, Lock, LockOpen, Radio, Clock, FileQuestion, Sparkles, Volume2, VolumeX,
  ThumbsUp, Meh, ThumbsDown, RotateCcw, HeartPulse,
  Pen, Captions, CircleDot, Split, MoreVertical, Smile, Download, Ban, Loader2, BookOpen, RefreshCw, Eye,
} from "lucide-react";

type EmitFn = (event: string, payload?: Record<string, unknown>) => void;

/* ============================================================
 * shared bits
 * ============================================================ */
interface ClassInfo {
  id: string;
  title: string;
  subject: string;
  board: string | null;
  grade: string | null;
  agenda: string;
  batchTitle: string | null;
  scheduledAt: string;
  durationMin: number;
  code: string;
  status: string;
  waitingRoom: boolean;
  allowChat: boolean;
  tutorName: string;
  tutorColor: string;
}

interface LessonDeckSlide {
  title: string;
  bullets: string[];
}

interface NotesDraft {
  summary: string;
  actionItems: string[];
  homework: string;
  absentees?: string[];
  status?: string;
  aiDraft?: boolean;
  generatedAt?: string;
}

async function fetchClassInfo(slug: string): Promise<ClassInfo | null> {
  try {
    const res = await fetch(`/api/live-classes/join/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data ?? null) as ClassInfo | null;
  } catch {
    return null;
  }
}

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* deterministic pseudo-random column for floating reactions */
function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/* ============================================================
 * video tile
 * ============================================================ */
function VideoTile({
  stream,
  person,
  self,
  isStage,
  speaking,
}: {
  stream: MediaStream | null;
  person: ClassroomPerson;
  self: boolean;
  isStage?: boolean;
  speaking?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  const showVideo = !!stream && (self ? person.cam || person.screen : true) && (person.cam || person.screen || !self);

  return (
    <div
      className={clsx(
        "relative rounded-2xl overflow-hidden bg-[#101B45] border border-white/10 shadow-lg flex items-center justify-center min-h-[130px] transition-shadow",
        isStage && "sm:col-span-2 sm:row-span-2 min-h-[240px]",
        speaking && "ring-[3px] ring-[#315BE5] ring-offset-2 ring-offset-[#0A1233]"
      )}
    >
      {stream && (person.cam || person.screen) ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={self}
          className={clsx("w-full h-full object-cover", isStage && "object-contain bg-[#0A1233]")}
        />
      ) : (
        <div
          className="sk-avatar"
          style={{ width: isStage ? 96 : 56, height: isStage ? 96 : 56, borderRadius: isStage ? 28 : 16, background: `linear-gradient(180deg, ${person.color}, ${person.color}bb)`, fontSize: isStage ? 34 : 20 }}
        >
          {initials(person.name)}
        </div>
      )}
      {person.screen && (
        <span className="absolute top-2 left-2 sk-pill !bg-[#F47B20] !text-white !border-[#D66408] text-[10px]">
          <MonitorUp className="w-3 h-3" /> Presenting
        </span>
      )}
      {speaking && (
        <span className="absolute top-2 left-2 sk-pill !bg-[#315BE5] !text-white !border-[#315BE5] text-[10px]">
          <Volume2 className="w-3 h-3" /> Speaking
        </span>
      )}
      {person.hand && (
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#F47B20] text-white flex items-center justify-center shadow-md animate-bounce" title={`${person.name} raised a hand`}>
          <Hand className="w-3.5 h-3.5" />
        </span>
      )}
      <div className="absolute bottom-0 inset-x-0 px-2.5 py-1.5 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[11.5px] font-bold text-white truncate">
          {person.name} {self && "(you)"}
        </span>
        {person.role === "host" && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-[#FFD9AE] shrink-0">Host</span>
        )}
        {person.role === "cohost" && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-[#AFC4FF] shrink-0">Co-host</span>
        )}
        {person.role === "observer" && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-white/60 shrink-0">Observer</span>
        )}
        <span className="ml-auto shrink-0">
          {person.mic ? <Mic className="w-3.5 h-3.5 text-[#7FE3B0]" /> : <MicOff className="w-3.5 h-3.5 text-[#FF9DA6]" />}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
 * main view
 * ============================================================ */
export function ClassroomView({ guestName }: { guestName?: string }) {
  const { user, classroom, setClassroom, setView } = useAppStore();
  const [info, setInfo] = useState<ClassInfo | null>(null);
  const [infoError, setInfoError] = useState("");
  const startedPatch = useRef(false);
  const endedPatch = useRef(false);

  /* observer flag rides on the classroom session object (parent "Observe") */
  const cls = classroom as { slug: string; role: "host" | "participant"; hostKey?: string; observer?: boolean } | null;
  const slug = cls?.slug ?? "";
  const observer = !!cls?.observer;
  const role = cls?.role ?? "participant";

  const displayName = guestName ?? user?.name ?? "Guest";
  const displayColor = user?.avatarColor ?? "#F47B20";

  /* signature-round-2 UI state */
  const [wbOn, setWbOn] = useState(false);
  const [breakoutOpen, setBreakoutOpen] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [recNow, setRecNow] = useState(Date.now());
  const [lessonDeck, setLessonDeck] = useState<LessonDeckSlide[] | null>(null);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [notes, setNotes] = useState<NotesDraft | null>(null);
  const [notesStatus, setNotesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notesDismissed, setNotesDismissed] = useState(false);

  /* fetch class info first (also validates the link) */
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    fetchClassInfo(slug).then((d) => {
      if (!alive) return;
      if (!d) setInfoError("This class link is not valid — ask your teacher for a fresh link.");
      else setInfo(d);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  const cr = useClassroom({
    slug,
    name: displayName,
    role: observer ? "observer" : role,
    hostKey: cls?.hostKey,
    color: displayColor,
    userId: user?.id,
    meta: info ? { title: info.title, subject: info.subject, hostName: info.tutorName, allowChat: info.allowChat } : undefined,
  });

  /* host marks the class LIVE in the DB once (so students see status) */
  useEffect(() => {
    if (role === "host" && info && cr.phase === "in_class" && !startedPatch.current && user) {
      startedPatch.current = true;
      fetch(`/api/live-classes/${info.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      }).catch(() => {});
    }
  }, [role, info, cr.phase, user]);

  /* persist attendance + recording meta when the host ends the class */
  useEffect(() => {
    if (role === "host" && cr.phase === "ended" && cr.attendance && info && !endedPatch.current) {
      endedPatch.current = true;
      fetch(`/api/live-classes/${info.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "ended",
          attendance: { attendees: cr.attendance },
          recorded: recSec > 0,
          recordingSec: recSec,
        }),
      })
        .catch(() => {})
        .finally(() => setAttendanceSaved(true));
    }
  }, [role, cr.phase, cr.attendance, info, recSec]);

  /* AI notes generation — automatic once attendance is persisted */
  const generateNotes = useCallback(async () => {
    if (!info) return;
    setNotesStatus("loading");
    try {
      const res = await fetch(`/api/live-classes/${info.id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          qaCount: cr.room?.qa?.length ?? 0,
          slideTitles: lessonDeck?.map((s) => s.title) ?? [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "The AI draft failed.");
      setNotes((json?.data ?? null) as NotesDraft | null);
      setNotesStatus("ready");
    } catch {
      setNotesStatus("error");
      toast({ title: "Could not generate class notes", description: "You can retry from the notes panel.", variant: "destructive" });
    }
  }, [info]);

  useEffect(() => {
    if (role === "host" && cr.phase === "ended" && attendanceSaved && !notesDismissed && notesStatus === "idle" && !notes) {
      generateNotes();
    }
  }, [role, cr.phase, attendanceSaved, notesDismissed, notesStatus, notes, generateNotes]);

  /* quiz persistence — save the leaderboard to student progress when a quiz closes */
  const quizCacheRef = useRef<{ lb: { name: string; correct: number; points: number }[]; total: number } | null>(null);
  const quizSavedRef = useRef("");
  useEffect(() => {
    const q = cr.room?.quiz;
    if (q?.open && q.leaderboard && q.total) {
      quizCacheRef.current = { lb: q.leaderboard, total: q.total };
      return;
    }
    if (!q?.open && quizCacheRef.current && info && role === "host") {
      const { lb, total } = quizCacheRef.current;
      quizCacheRef.current = null;
      if (!lb.length) return;
      const sig = `${info.id}|${total}|${lb.map((r) => `${r.name}:${r.correct}`).join(",")}`;
      if (sig === quizSavedRef.current) return;
      quizSavedRef.current = sig;
      fetch(`/api/live-classes/${info.id}/quiz-results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ results: lb.map((r) => ({ name: r.name, score: r.correct, total })) }),
      })
        .then((r) => r.json())
        .then((json) => {
          const saved = json?.data?.saved ?? 0;
          if (saved > 0) toast({ title: "Scores saved to student progress", description: `${saved} result${saved > 1 ? "s" : ""} recorded for matched students.` });
          else toast({ title: "Quiz ended", description: "No matched students in the scoreboard — nothing to save." });
        })
        .catch(() => toast({ title: "Could not save quiz scores", variant: "destructive" }));
    }
  }, [cr.room?.quiz, info, role]);

  /* elapsed timer */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (cr.phase !== "in_class") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [cr.phase]);

  /* recording seconds (host accumulates while the room records) */
  useEffect(() => {
    if (!cr.recordingActive || cr.phase !== "in_class") return;
    const t = setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [cr.recordingActive, cr.phase]);

  useEffect(() => {
    if (!cr.recordingActive) return;
    const t = setInterval(() => setRecNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cr.recordingActive]);
  const recElapsed = cr.recordingActive && cr.recordingStartedAt ? Math.max(0, Math.floor((recNow - cr.recordingStartedAt) / 1000)) : 0;

  /* toast auto-dismiss */
  useEffect(() => {
    if (!cr.toastMsg) return;
    const t = setTimeout(() => cr.setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [cr.toastMsg, cr]);

  /* host caption engine — narrate the current slide's bullets (or the
   * agenda) as a caption line every 4s; non-English lines are translated
   * once via the captions API and cached per line */
  const captionLines = useMemo(() => {
    const deck = lessonDeck;
    const idx = cr.room?.slides?.index ?? 0;
    if (deck && deck[idx]?.bullets?.length) return deck[idx].bullets;
    const agenda = (info?.agenda ?? "").trim();
    if (agenda) return agenda.split(/(?<=[.!?:])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    return info ? [`${info.title} — ${info.subject}`] : [];
  }, [lessonDeck, cr.room?.slides?.index, info]);

  useCaptionEngine({
    active: role === "host" && cr.captionState.enabled && cr.phase === "in_class",
    lang: cr.captionState.lang || "en",
    classId: info?.id ?? "",
    lines: captionLines,
    emit: cr.emit,
  });

  const exitRoom = useCallback(() => {
    setClassroom(null);
    if (!user) return; // guests stay on the ended screen
    setView(user.role === "tutor" ? "t-live" : user.role === "parent" ? "p-live" : "s-live");
  }, [setClassroom, setView, user]);

  /* ------------------------- status screens ------------------------- */
  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
        <div className="sk-card p-8 text-center max-w-sm">
          <p className="text-[14px] font-semibold">No classroom selected.</p>
          <button className="sk-btn sk-btn-primary mt-4" onClick={() => (user ? setView(user.role === "tutor" ? "t-live" : user.role === "parent" ? "p-live" : "s-live") : setClassroom(null))}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (infoError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
        <div className="sk-card p-8 text-center max-w-sm">
          <X className="w-8 h-8 mx-auto text-[#C03342]" />
          <p className="text-[15px] font-bold mt-3">Can&apos;t open this class</p>
          <p className="text-[12.5px] text-muted-foreground mt-1">{infoError}</p>
          <button className="sk-btn sk-btn-primary mt-4" onClick={exitRoom}>Go back</button>
        </div>
      </div>
    );
  }

  if (!info || (cr.phase === "connecting" && !cr.room)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
        <div className="sk-avatar" style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 24 }}>
          TA
        </div>
        <p className="text-[14px] font-bold text-white">Connecting to the classroom…</p>
        <div className="w-7 h-7 rounded-full animate-spin" style={{ background: "conic-gradient(from 0deg, #26418F, #fff)", mask: "radial-gradient(farthest-side, transparent 58%, #000 60%)", WebkitMask: "radial-gradient(farthest-side, transparent 58%, #000 60%)" }} />
      </div>
    );
  }

  if (cr.phase === "waiting") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
        <div className="sk-card p-8 max-w-md w-full text-center">
          <div className="sk-avatar mx-auto" style={{ width: 64, height: 64, borderRadius: 20, background: `linear-gradient(180deg,${displayColor},${displayColor}bb)`, fontSize: 24 }}>
            {initials(displayName)}
          </div>
          <h2 className="text-[17px] font-extrabold mt-4">{info.title}</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{info.subject} · with {info.tutorName}</p>
          <div className="sk-well p-4 mt-5 flex items-center gap-3 text-left">
            <ShieldCheck className="w-5 h-5 text-[#1F9D68] shrink-0" />
            <p className="text-[12.5px] leading-relaxed">
              You&apos;re in the waiting room{observer ? " as an observer" : ""}. <span className="font-bold">{info.tutorName}</span> has been notified and will let you in shortly.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3" /> Only the teacher can admit participants.
          </p>
        </div>
      </div>
    );
  }

  if (cr.phase === "denied" || cr.phase === "removed" || cr.phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
        <div className="sk-card p-8 text-center max-w-sm">
          <div className="sk-avatar mx-auto" style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(180deg,#E96A75,#C03342)", fontSize: 24 }}>
            !
          </div>
          <p className="text-[15px] font-bold mt-3">
            {cr.phase === "denied" ? "Joining request declined" : cr.phase === "removed" ? "Removed from the class" : "Connection problem"}
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-1">{cr.errorMsg}</p>
          <button className="sk-btn sk-btn-primary mt-4" onClick={exitRoom}>Go back</button>
        </div>
      </div>
    );
  }

  if (cr.phase === "ended") {
    return (
      <>
        <EndedScreen
          info={info}
          role={observer ? "observer" : role}
          attendance={cr.attendance}
          onExit={exitRoom}
          onOpenNotes={role === "host" && notes ? () => setNotesDismissed(false) : undefined}
        />
        {role === "host" && !notesDismissed && (
          <NotesDialog
            classId={info.id}
            notes={notes}
            status={notesStatus}
            onRetry={generateNotes}
            onSkip={() => setNotesDismissed(true)}
          />
        )}
      </>
    );
  }

  /* ------------------------- in class ------------------------- */
  const room = cr.room;
  const isHost = role === "host";
  const participants = room?.participants ?? [];
  const myMember = participants.find((p) => p.id === cr.selfId);
  const myRole: string = myMember?.role ?? (observer ? "observer" : role);
  const isMod = isHost || myRole === "cohost";
  const presenter = participants.find((p) => p.screen) ?? null;
  const speakingPeer = participants.find((p) => cr.speakingIds.includes(p.id)) ?? null;
  const spotlight = presenter ?? speakingPeer; // auto-spotlight the active speaker
  const slides = room?.slides ?? null;
  const quiz = room?.quiz;
  const activePoll = room?.polls.find((p) => p.open) ?? null;
  /* concept pulse — live understanding signal */
  const pulseTotal = cr.pulse?.total ?? 0;
  const pulseLosingPct = pulseTotal
    ? Math.round((((cr.pulse?.counts.slight ?? 0) + (cr.pulse?.counts.lost ?? 0)) / pulseTotal) * 100)
    : 0;
  const pulseSuggest = pulseTotal >= 2 && pulseLosingPct > 35;

  /* whiteboard overlay: visible to everyone once there is ink; hosts also
   * see (and get drawing powers on) a blank board when the pen tool is on */
  const wbVisible = (cr.strokes?.length ?? 0) > 0 || (isHost && wbOn);

  /* host tool actions */
  const toggleRecording = () => {
    if (cr.recordingActive) {
      cr.emit("recording_state", { active: false });
      toast({ title: "Recording stopped", description: `${fmtElapsed(recSec)} captured — the indicator is off for everyone.` });
      return;
    }
    if (confirm("Recording requires parent consent (recorded consent is on file). Start recording?")) {
      cr.emit("recording_state", { active: true });
      toast({ title: "Recording started", description: "Everyone in the class sees a red REC indicator." });
    }
  };

  const captionLang = cr.captionState.lang || "en";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#1B2F79)" }}>
      {/* toast */}
      {cr.toastMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[130] sk-card !bg-[#14246B] !border-[#26418F] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-xl">
          {cr.toastMsg}
        </div>
      )}

      {/* top bar */}
      <header className="shrink-0 h-[54px] px-3 sm:px-4 flex items-center gap-2.5 border-b border-white/10 text-white">
        <div className="sk-avatar shrink-0" style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 11 }}>TA</div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold truncate">{info.title}</div>
          <div className="text-[10.5px] text-white/60 truncate">
            {info.subject}{info.grade ? ` · ${info.grade}` : ""} · {info.tutorName}{observer ? " · observing" : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {cr.recordingActive ? (
            <span className="sk-pill !bg-[#C03342] !text-white !border-[#E96A75] text-[10.5px] animate-pulse" title="This class is being recorded (consent on file)">
              <span className="w-2 h-2 rounded-full bg-white" /> REC {fmtElapsed(recElapsed)}
            </span>
          ) : (
            <span className="sk-pill !bg-[#C03342]/15 !border-[#E96A75]/40 !text-[#FF9DA6] text-[10.5px] hidden sm:inline-flex">
              <Radio className="w-3 h-3" /> LIVE
            </span>
          )}
          <span className="text-[12px] font-bold tabular text-white/80 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> {fmtElapsed(elapsed)}
          </span>
          {cr.roomLocked && (
            <span className="sk-pill !bg-[#F47B20]/15 !border-[#F47B20]/40 !text-[#FFD9AE] text-[10.5px]" title="The host locked the room — new join requests are denied">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
          <span className="text-[11.5px] font-bold text-white/70 tabular hidden md:inline">Code {info.code}</span>
          {isHost && (room?.waiting?.length ?? 0) > 0 && (
            <span className="sk-pill !bg-[#F47B20] !text-white !border-[#D66408] text-[10.5px]">
              {room!.waiting!.length} waiting
            </span>
          )}
          {isHost && pulseSuggest && (
            <span className="sk-pill !bg-[#F47B20] !text-white !border-[#D66408] text-[10.5px]">
              <HeartPulse className="w-3 h-3" /> {pulseLosingPct}% re-explain
            </span>
          )}
        </div>
      </header>

      {/* body */}
      <div className="flex-1 min-h-0 flex">
        {/* stage */}
        <main className="flex-1 min-w-0 flex flex-col p-3 sm:p-4 gap-3">
          {cr.mediaNotice && (
            <div className="sk-callout sk-callout-warn !bg-[#FFF4E4]/10 !border-[#F5D9AE]/30 !text-[#FFE1BC] text-[12px]">{cr.mediaNotice}</div>
          )}

          {cr.breakout?.action === "start" && (
            <BreakoutBanner breakout={cr.breakout} participants={participants} selfId={cr.selfId} isHost={isHost} emit={cr.emit} />
          )}

          <div className="relative flex-1 min-h-0 flex flex-col">
            <div className="relative flex-1 min-h-0">
              {slides ? (
                <SlideStage slides={slides} isHost={isMod} emit={cr.emit} />
              ) : quiz?.open ? (
                <QuizStage quiz={quiz} isHost={isMod} emit={cr.emit} />
              ) : spotlight ? (
                <div className="flex-1 min-h-0 grid gap-3 grid-cols-1 sm:grid-cols-[1fr_200px] lg:grid-cols-[1fr_220px]">
                  <VideoTile stream={cr.remote[spotlight.sid] ?? (spotlight.id === cr.selfId ? cr.localStream : null)} person={spotlight} self={spotlight.id === cr.selfId} isStage speaking={cr.speakingIds.includes(spotlight.id)} />
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-1 overflow-y-auto sk-scroll">
                    {participants
                      .filter((p) => p.id !== spotlight.id)
                      .map((p) => (
                        <VideoTile key={p.sid} stream={cr.remote[p.sid] ?? (p.id === cr.selfId ? cr.localStream : null)} person={p} self={p.id === cr.selfId} speaking={cr.speakingIds.includes(p.id)} />
                      ))}
                  </div>
                </div>
              ) : (
                <div
                  className={clsx("flex-1 min-h-0 overflow-y-auto sk-scroll grid gap-3", [
                    "grid-cols-1",
                    participants.length > 1 && "grid-cols-2",
                    participants.length > 4 && "sm:grid-cols-3",
                    participants.length > 8 && "lg:grid-cols-4",
                  ])}
                >
                  {participants.map((p) => (
                    <VideoTile key={p.sid} stream={cr.remote[p.sid] ?? (p.id === cr.selfId ? cr.localStream : null)} person={p} self={p.id === cr.selfId} speaking={cr.speakingIds.includes(p.id)} />
                  ))}
                </div>
              )}

              {/* floating reactions layer */}
              <ReactionLayer reactions={cr.reactions} />

              {/* whiteboard overlay */}
              {wbVisible && (
                <WhiteboardOverlay
                  strokes={cr.strokes}
                  canDraw={isHost && wbOn}
                  onStroke={(points, color, width) => cr.emit("wb_stroke", { points, color, width, done: true })}
                  onClear={() => cr.emit("wb_clear")}
                  onClose={() => setWbOn(false)}
                />
              )}
            </div>

            {/* caption bar (everyone sees the teacher's live captions) */}
            {(cr.captionState.enabled || cr.captionLine) && (
              <CaptionBar line={cr.captionLine?.text ?? ""} lang={cr.captionLine?.lang ?? captionLang} />
            )}
          </div>

          {activePoll && <QuickPollStrip poll={activePoll} selfId={cr.selfId} isHost={isMod} emit={cr.emit} />}

          {!isHost && !observer && <PulseStrip myPulse={cr.myPulse} onSend={cr.sendPulse} />}
        </main>

        {/* side panel */}
        <SidePanel cr={cr} isHost={isHost} isMod={isMod} observer={observer} info={info} onDeckChange={setLessonDeck} />
      </div>

      {/* control bar */}
      {observer ? (
        <footer className="shrink-0 border-t border-white/10 px-3 sm:px-5 py-2.5 flex items-center gap-3 text-white">
          <span className="sk-pill !bg-[#315BE5]/25 !border-[#315BE5]/50 !text-[#AFC4FF] text-[11px]" title="Parents observe without audio, video or chat">
            <Eye className="w-3.5 h-3.5" /> Observer mode — view only
          </span>
          <button className="sk-btn sk-btn-danger sk-btn-sm ml-auto" onClick={cr.leave}>
            <LogOut className="w-4 h-4" /> Leave
          </button>
        </footer>
      ) : (
        <footer className="shrink-0 border-t border-white/10 px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3 text-white overflow-x-auto sk-scroll">
          <CtrlBtn on={cr.micOn} onClick={cr.toggleMic} onIcon={<Mic className="w-5 h-5" />} offIcon={<MicOff className="w-5 h-5" />} label={cr.micOn ? "Mute" : "Unmute"} />
          <CtrlBtn on={cr.camOn} onClick={cr.toggleCam} onIcon={<VideoIcon className="w-5 h-5" />} offIcon={<VideoOff className="w-5 h-5" />} label={cr.camOn ? "Stop video" : "Start video"} />
          {(isMod || myMember?.allowShare) && (
            <CtrlBtn on={cr.screenOn} onClick={cr.toggleScreen} onIcon={<MonitorUp className="w-5 h-5" />} offIcon={<MonitorUp className="w-5 h-5" />} label={isHost ? "Share screen" : myMember?.allowShare ? "Share screen (allowed by teacher)" : "Share screen"} accent />
          )}
          {!isHost && (
            <CtrlBtn on={cr.handRaised} onClick={cr.toggleHand} onIcon={<Hand className="w-5 h-5" />} offIcon={<Hand className="w-5 h-5" />} label="Raise hand" />
          )}

          {/* reactions */}
          <ReactionBar onSend={cr.sendReaction} />

          {/* host tools */}
          {isHost && (
            <div className="flex items-center gap-1.5 shrink-0 border-l border-white/15 pl-1.5 sm:pl-3">
              <ToolBtn active={wbOn} onClick={() => setWbOn((v) => !v)} title="Whiteboard — draw over the stage" icon={<Pen className="w-[18px] h-[18px]" />} />
              <ToolBtn
                active={cr.captionState.enabled}
                onClick={() => cr.emit("caption_state", { enabled: !cr.captionState.enabled, lang: captionLang })}
                title={cr.captionState.enabled ? "Turn captions off" : "Turn live captions on"}
                icon={<Captions className="w-[18px] h-[18px]" />}
              />
              {cr.captionState.enabled && (
                <button
                  className="h-8 px-2 rounded-full border border-[#315BE5]/60 bg-[#315BE5]/25 text-[11px] font-extrabold text-white"
                  title={`Caption language: ${captionLang === "en" ? "English" : captionLang === "ta" ? "தமிழ் Tamil" : "हिन्दी Hindi"} — click to switch`}
                  onClick={() => {
                    const next = captionLang === "en" ? "ta" : captionLang === "ta" ? "hi" : "en";
                    cr.emit("caption_state", { enabled: true, lang: next });
                  }}
                >
                  {captionLang === "en" ? "EN" : captionLang === "ta" ? "TA" : "HI"}
                </button>
              )}
              <ToolBtn active={cr.recordingActive} danger onClick={toggleRecording} title={cr.recordingActive ? "Stop recording" : "Record class (consent on file)"} icon={<CircleDot className="w-[18px] h-[18px]" />} />
              <ToolBtn active={cr.breakout?.action === "start"} onClick={() => setBreakoutOpen(true)} title="Breakout rooms" icon={<Split className="w-[18px] h-[18px]" />} />
              <ToolBtn
                active={cr.roomLocked}
                warn={cr.roomLocked}
                onClick={() => {
                  cr.emit("lock_room", { locked: !cr.roomLocked });
                  toast({ title: cr.roomLocked ? "Room unlocked" : "Room locked", description: cr.roomLocked ? "New join requests are accepted again." : "New join requests are auto-denied." });
                }}
                title={cr.roomLocked ? "Unlock the room" : "Lock the room — deny new join requests"}
                icon={cr.roomLocked ? <Lock className="w-[18px] h-[18px]" /> : <LockOpen className="w-[18px] h-[18px]" />}
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {isHost ? (
              <button
                className="sk-btn sk-btn-danger sk-btn-sm"
                onClick={() => {
                  if (confirm("End this class for everyone? Attendance will be saved and Amma will draft class notes.")) cr.endClass();
                }}
              >
                <LogOut className="w-4 h-4" /> End class
              </button>
            ) : (
              <button className="sk-btn sk-btn-danger sk-btn-sm" onClick={cr.leave}>
                <LogOut className="w-4 h-4" /> Leave
              </button>
            )}
          </div>
        </footer>
      )}

      {/* host: breakout rooms dialog */}
      {breakoutOpen && (
        <BreakoutDialog
          people={participants.filter((p) => p.role !== "host")}
          breakoutActive={cr.breakout?.action === "start"}
          emit={cr.emit}
          onClose={() => setBreakoutOpen(false)}
        />
      )}
    </div>
  );
}

/* ============================================================
 * small host tool button
 * ============================================================ */
function ToolBtn({
  active,
  onClick,
  title,
  icon,
  danger,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={clsx(
        "w-9 h-9 shrink-0 rounded-full flex items-center justify-center border transition-all",
        active
          ? danger
            ? "bg-[#C03342] border-[#E96A75] text-white shadow-[0_3px_12px_rgba(192,51,66,.45)] animate-pulse"
            : warn
              ? "bg-[#F47B20] border-[#D66408] text-white shadow-[0_3px_12px_rgba(231,110,15,.45)]"
              : "bg-[#315BE5] border-[#4E74EC] text-white shadow-[0_3px_12px_rgba(49,91,229,.45)]"
          : "bg-white/10 border-white/20 text-white hover:bg-white/20"
      )}
    >
      {icon}
    </button>
  );
}

/* ============================================================
 * control button
 * ============================================================ */
function CtrlBtn({
  on,
  onClick,
  onIcon,
  offIcon,
  label,
  accent,
}: {
  on: boolean;
  onClick: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={clsx(
        "w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all border",
        on
          ? accent
            ? "bg-[#F47B20] border-[#D66408] text-white shadow-[0_3px_12px_rgba(231,110,15,.45)]"
            : "bg-white/90 border-white text-[#14246B] shadow-md hover:bg-white"
          : "bg-[#C03342] border-[#A62836] text-white shadow-[0_3px_12px_rgba(192,51,66,.4)]"
      )}
    >
      {on ? onIcon : offIcon}
    </button>
  );
}

/* ============================================================
 * reactions — footer bar + floating layer
 * ============================================================ */
const REACTIONS = ["👍", "❤️", "😂", "🎉", "👏"];

function ReactionBar({ onSend }: { onSend: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hidden sm:flex items-center gap-1 shrink-0" role="group" aria-label="Send a reaction">
        {REACTIONS.map((e) => (
          <button
            key={e}
            className="w-9 h-9 rounded-full hover:bg-white/15 active:scale-90 transition-all text-[18px] leading-none flex items-center justify-center"
            onClick={() => onSend(e)}
            aria-label={`React with ${e}`}
            title={`React with ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="sm:hidden relative shrink-0">
        <button
          className={clsx("w-11 h-11 rounded-full flex items-center justify-center border transition-all", open ? "bg-white/90 border-white text-[#14246B]" : "bg-white/10 border-white/20 text-white")}
          onClick={() => setOpen((o) => !o)}
          aria-label="Reactions"
          aria-pressed={open}
        >
          <Smile className="w-5 h-5" />
        </button>
        {open && (
          <div className="absolute bottom-14 right-0 z-[120] flex flex-col gap-1 rounded-2xl border border-white/15 bg-[#0A1233] p-2 shadow-xl">
            {REACTIONS.map((e) => (
              <button
                key={e}
                className="w-10 h-10 rounded-full hover:bg-white/15 active:scale-90 transition-all text-[20px] flex items-center justify-center"
                onClick={() => {
                  onSend(e);
                  setOpen(false);
                }}
                aria-label={`React with ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ReactionLayer({ reactions }: { reactions: { id: string; emoji: string }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20" aria-hidden>
      <style>{`@keyframes sk-reaction-float{0%{transform:translateY(0) scale(.6);opacity:0}12%{opacity:1;transform:translateY(-20px) scale(1.15)}100%{transform:translateY(-240px) scale(1.4);opacity:0}}.sk-reaction{animation:sk-reaction-float 2.5s ease-out forwards}`}</style>
      {reactions.map((r) => (
        <span
          key={r.id}
          className="sk-reaction absolute text-[28px] drop-shadow-lg"
          style={{ left: `${8 + (hashNum(r.id) % 78)}%`, bottom: "10%" }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

/* ============================================================
 * whiteboard overlay (host draws, everyone watches)
 * ============================================================ */
const WB_COLORS = [
  { hex: "#F47B20", label: "Orange" },
  { hex: "#14246B", label: "Navy" },
  { hex: "#1F9D68", label: "Green" },
  { hex: "#101B45", label: "Black" },
];
const WB_WIDTHS = [2, 4, 8];

function drawWbStroke(ctx: CanvasRenderingContext2D, s: WbStrokeView, w: number, h: number) {
  if (!s.points?.length) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(1, (s.width * w) / 900);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
  ctx.stroke();
}

function WhiteboardOverlay({
  strokes,
  canDraw,
  onStroke,
  onClear,
  onClose,
}: {
  strokes: WbStrokeView[];
  canDraw: boolean;
  onStroke: (points: WbPoint[], color: string, width: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const currentRef = useRef<WbPoint[]>([]);
  const [color, setColor] = useState("#F47B20");
  const [width, setWidth] = useState(4);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !cv.width) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes) drawWbStroke(ctx, s, cv.width, cv.height);
    if (currentRef.current.length > 1) {
      drawWbStroke(ctx, { id: "tmp", points: currentRef.current, color, width }, cv.width, cv.height);
    }
  }, [strokes, color, width]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = Math.max(1, size.w);
    cv.height = Math.max(1, size.h);
    redraw();
  }, [size, redraw]);

  const norm = (e: React.PointerEvent<HTMLCanvasElement>): WbPoint | null => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    const p = norm(e);
    if (!p) return;
    drawingRef.current = true;
    currentRef.current = [p];
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !drawingRef.current) return;
    const p = norm(e);
    if (!p) return;
    const pts = currentRef.current;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return; // light sampling
    pts.push(p);
    redraw();
  };

  const up = () => {
    if (!canDraw || !drawingRef.current) return;
    drawingRef.current = false;
    const pts = currentRef.current;
    currentRef.current = [];
    if (pts.length >= 2) onStroke(pts, color, width);
    redraw();
  };

  const exportPng = () => {
    const cv = document.createElement("canvas");
    cv.width = 1600;
    cv.height = 900;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1600, 900);
    for (const s of strokes) drawWbStroke(ctx, s, 1600, 900);
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `tutor-amma-whiteboard-${Date.now()}.png`;
    a.click();
    toast({ title: "Whiteboard exported", description: "PNG downloaded with everything drawn so far." });
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 z-10 rounded-2xl overflow-hidden">
      <canvas
        ref={canvasRef}
        className={clsx("absolute inset-0 w-full h-full", canDraw ? "cursor-crosshair" : "pointer-events-none")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      {!canDraw && (
        <span className="absolute top-2 left-2 sk-pill !bg-black/50 !text-white !border-white/20 text-[10px] pointer-events-none">
          <Pen className="w-3 h-3" /> Whiteboard
        </span>
      )}
      {canDraw && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-white/20 bg-[#0A1233]/90 px-2 py-1.5 shadow-lg">
          {WB_COLORS.map((c) => (
            <button
              key={c.hex}
              className={clsx("w-6 h-6 rounded-full border-2 transition-all", color === c.hex ? "border-white scale-110" : "border-white/30")}
              style={{ background: c.hex }}
              onClick={() => setColor(c.hex)}
              title={`${c.label} pen`}
              aria-label={`${c.label} pen`}
            />
          ))}
          <span className="w-px h-5 bg-white/20 mx-0.5" />
          {WB_WIDTHS.map((w) => (
            <button
              key={w}
              className={clsx("w-6 h-6 rounded-full flex items-center justify-center transition-all", width === w ? "bg-white/25" : "hover:bg-white/15")}
              onClick={() => setWidth(w)}
              title={`Pen width ${w}`}
              aria-label={`Pen width ${w}`}
            >
              <span className="rounded-full bg-white" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
          <span className="w-px h-5 bg-white/20 mx-0.5" />
          <button className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white" onClick={exportPng} title="Export PNG" aria-label="Export whiteboard as PNG" disabled={!strokes.length}>
            <Download className="w-4 h-4" />
          </button>
          <button className="w-7 h-7 rounded-full hover:bg-[#FDE3E5]/20 flex items-center justify-center text-[#FF9DA6]" onClick={() => { if (strokes.length && confirm("Clear the whiteboard for everyone?")) onClear(); }} title="Clear whiteboard" aria-label="Clear whiteboard">
            <Trash2 className="w-4 h-4" />
          </button>
          <button className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white" onClick={onClose} title="Stop drawing" aria-label="Stop drawing">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * captions bar (simulated live captions)
 * ============================================================ */
function CaptionBar({ line, lang }: { line: string; lang: string }) {
  return (
    <div className="shrink-0 pt-2.5 flex flex-col items-center gap-1" role="status" aria-live="polite">
      <div className="max-w-full sm:max-w-2xl rounded-full bg-black/80 border border-white/15 px-4 py-2 flex items-center gap-2.5 shadow-lg">
        <span className="sk-pill !bg-[#F47B20] !text-white !border-[#D66408] text-[9px] shrink-0">CC</span>
        <p className="text-[13px] font-semibold text-white truncate" dir={lang === "ar" ? "rtl" : "ltr"}>
          {line || "Waiting for the teacher…"}
        </p>
      </div>
      <span className="text-[9.5px] text-white/40 font-semibold uppercase tracking-wide">Live captions (simulated)</span>
    </div>
  );
}

/* ============================================================
 * breakout rooms — banner (everyone) + host dialog
 * ============================================================ */
function BreakoutBanner({
  breakout,
  participants,
  selfId,
  isHost,
  emit,
}: {
  breakout: BreakoutView;
  participants: ClassroomPerson[];
  selfId: string;
  isHost: boolean;
  emit: EmitFn;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const rooms = breakout.rooms ?? [];
  const myRoom = rooms.find((r) => r.participants.includes(selfId)) ?? null;
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? "Student";
  const endAt = (breakout.startedAt ?? Date.now()) + (breakout.durationSec ?? 0) * 1000;
  const remain = Math.max(0, Math.floor((endAt - now) / 1000));
  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");
  const mates = myRoom ? myRoom.participants.filter((id) => id !== selfId).map(nameOf) : [];

  return (
    <div className="shrink-0 rounded-2xl bg-[#0A1233]/90 border border-[#F47B20]/40 px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="sk-pill !bg-[#F47B20]/25 !border-[#F47B20]/50 !text-[#FFD9AE] text-[10.5px]">
        <Split className="w-3 h-3" /> Breakout
      </span>
      {isHost ? (
        <span className="text-[12.5px] font-bold text-white">
          {rooms.length} room{rooms.length > 1 ? "s" : ""} running · {mm}:{ss} remaining
        </span>
      ) : myRoom ? (
        <span className="text-[12.5px] font-bold text-white truncate">
          Breakout: {myRoom.name}{mates.length ? <> — with {mates.join(", ")}</> : " — you're alone in this room"} · {mm}:{ss} remaining
        </span>
      ) : (
        <span className="text-[12.5px] font-bold text-white">Rooms in progress · {mm}:{ss} remaining</span>
      )}
      {remain === 0 && <span className="text-[11px] font-semibold text-[#FFD9AE]">Time&apos;s up — rejoin the main room.</span>}
      <span className="text-[10px] text-white/45 hidden sm:inline">Demo build: rooms share the main audio/video stream.</span>
      {isHost && (
        <button className="sk-btn sk-btn-orange sk-btn-sm !py-1 !px-2.5 !text-[11px] ml-auto" onClick={() => emit("breakout", { action: "return_all" })}>
          <RotateCcw className="w-3.5 h-3.5" /> Return all
        </button>
      )}
    </div>
  );
}

function BreakoutDialog({
  people,
  breakoutActive,
  emit,
  onClose,
}: {
  people: ClassroomPerson[];
  breakoutActive: boolean;
  emit: EmitFn;
  onClose: () => void;
}) {
  const [roomCount, setRoomCount] = useState(2);
  const [auto, setAuto] = useState(true);
  const [durationMin, setDurationMin] = useState(5);
  const [manualAssign, setManualAssign] = useState<Record<string, number>>({});

  /* auto-grouping is derived (balanced random split), manual picks are state */
  const autoGroups = useMemo(() => {
    const ids = people.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const next: Record<string, number> = {};
    ids.forEach((id, i) => {
      next[id] = i % roomCount;
    });
    return next;
  }, [people, roomCount]);
  const assign = auto ? autoGroups : manualAssign;
  const setAssign = (next: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) =>
    setManualAssign(next);

  const start = () => {
    const rooms = Array.from({ length: roomCount }, (_, i) => ({
      name: `Room ${i + 1}`,
      participants: Object.entries(assign)
        .filter(([, r]) => r === i)
        .map(([id]) => id),
    })).filter((r) => r.participants.length);
    if (!rooms.length) {
      toast({ title: "Assign at least one participant to a room" });
      return;
    }
    emit("breakout", { action: "start", rooms, durationSec: durationMin * 60 });
    toast({ title: `Breakout started — ${rooms.length} room${rooms.length > 1 ? "s" : ""}`, description: `${durationMin} minutes. Everyone sees their room and a countdown.` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(14,26,82,.45)" }} role="dialog" aria-modal>
      <div className="sk-card w-full max-w-lg max-h-[90vh] overflow-y-auto sk-scroll p-5" style={{ boxShadow: "0 24px 70px rgba(20,36,107,.35)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-extrabold">Breakout rooms</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">Split the class into small groups for a timed activity.</p>
          </div>
          <button className="p-1.5 rounded-xl hover:bg-[var(--accent)]" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {breakoutActive && (
          <div className="sk-callout sk-callout-info mt-3 flex items-center justify-between gap-2">
            <span className="text-[12px]">A breakout is running right now.</span>
            <button className="sk-btn sk-btn-orange sk-btn-sm !py-1 !px-2.5 !text-[11px]" onClick={() => { emit("breakout", { action: "return_all" }); onClose(); }}>
              <RotateCcw className="w-3.5 h-3.5" /> Return all early
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 mt-4">
          <div>
            <label className="text-[11px] font-bold text-muted-foreground" htmlFor="bo-rooms">Rooms</label>
            <select id="bo-rooms" className="sk-input mt-1 !py-2 !text-[12.5px]" value={roomCount} onChange={(e) => setRoomCount(Number(e.target.value))}>
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} rooms</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground" htmlFor="bo-duration">Duration</label>
            <select id="bo-duration" className="sk-input mt-1 !py-2 !text-[12.5px]" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>{n} min</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground" htmlFor="bo-auto">Grouping</label>
            <button
              id="bo-auto"
              className="w-full mt-1 flex items-center gap-3 text-left"
              onClick={() => setAuto((a) => !a)}
              role="switch"
              aria-checked={auto}
            >
              <span className={clsx("w-10 h-6 rounded-full relative transition-colors shrink-0", auto ? "bg-[#1F9D68]" : "bg-[#C9D3E8]")}>
                <span className={clsx("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", auto ? "left-[18px]" : "left-0.5")} />
              </span>
              <span className="text-[11.5px] font-bold leading-tight">Auto-group</span>
            </button>
          </div>
        </div>
        {auto && (
          <p className="text-[10.5px] text-muted-foreground mt-1.5">
            Balanced random split (guest students have no mastery data, so groups are randomised evenly).
          </p>
        )}

        {!auto && (
          <div className="mt-3 max-h-56 overflow-y-auto sk-scroll rounded-xl border border-border divide-y">
            {people.length === 0 && <p className="text-[12px] text-muted-foreground p-3 text-center">No participants to group yet.</p>}
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span className="text-[12px] font-bold truncate flex-1">{p.name}</span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: roomCount }, (_, i) => (
                    <button
                      key={i}
                      className={clsx(
                        "w-7 h-7 rounded-lg text-[11px] font-extrabold border transition-all",
                        assign[p.id] === i ? "bg-[#F47B20] border-[#D66408] text-white" : "border-border text-muted-foreground hover:border-[#F47B20]"
                      )}
                      onClick={() => setAssign((a) => ({ ...a, [p.id]: i }))}
                      aria-label={`Put ${p.name} in room ${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* preview */}
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(roomCount, 4)}, minmax(0, 1fr))` }}>
          {Array.from({ length: roomCount }, (_, i) => {
            const members = Object.entries(assign).filter(([, r]) => r === i).map(([id]) => people.find((p) => p.id === id)?.name).filter(Boolean) as string[];
            return (
              <div key={i} className="sk-well p-2.5">
                <p className="text-[11px] font-extrabold text-[#2A4BB8]">Room {i + 1} · {members.length}</p>
                <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5 truncate">{members.length ? members.join(", ") : "—"}</p>
              </div>
            );
          })}
        </div>

        <p className="text-[10.5px] text-muted-foreground mt-3">Demo build: rooms share the main audio/video stream — grouping is display-level.</p>

        <div className="flex items-center gap-2.5 mt-4">
          <button className="sk-btn sk-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="sk-btn sk-btn-orange sk-btn-sm ml-auto" onClick={start}>
            <Split className="w-4 h-4" /> Start breakout
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * slides stage
 * ============================================================ */
function SlideStage({
  slides,
  isHost,
  emit,
}: {
  slides: { count: number; index: number; slide: string | null };
  isHost: boolean;
  emit: EmitFn;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-[#0A1233] border border-white/10 flex items-center justify-center relative">
        {slides.slide ? (
          <img src={slides.slide} alt={`Slide ${slides.index + 1}`} className="max-w-full max-h-full object-contain" />
        ) : (
          <p className="text-white/50 text-[13px]">Slide {slides.index + 1} unavailable</p>
        )}
        <span className="absolute bottom-3 left-3 sk-pill !bg-black/50 !text-white !border-white/20 text-[10.5px]">
          <Presentation className="w-3 h-3" /> Slide {slides.index + 1} / {slides.count}
        </span>
      </div>
      {isHost && (
        <div className="shrink-0 flex items-center justify-center gap-2.5">
          <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={slides.index === 0} onClick={() => emit("slides_page", { index: slides.index - 1 })}>
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-[12px] font-bold text-white/80 tabular w-16 text-center">{slides.index + 1} / {slides.count}</span>
          <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={slides.index >= slides.count - 1} onClick={() => emit("slides_page", { index: slides.index + 1 })}>
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * quiz stage (also rendered for host — with advance control)
 * ============================================================ */
function QuizStage({
  quiz,
  isHost,
  emit,
}: {
  quiz: QuizView;
  isHost: boolean;
  emit: EmitFn;
}) {
  const qIndex = quiz.qIndex ?? 0;

  if (!quiz.current && quiz.reveal !== undefined) {
    /* finished — final leaderboard */
    return (
      <div className="flex-1 min-h-0 rounded-2xl bg-[#0A1233] border border-white/10 p-6 overflow-y-auto sk-scroll">
        <div className="text-center mb-4">
          <TrophyHeader />
          <p className="text-white/70 text-[12.5px] mt-1">Final leaderboard</p>
        </div>
        <Leaderboard rows={quiz.leaderboard ?? []} />
      </div>
    );
  }
  if (!quiz.current) return null;

  /* keyed per-question card — its internal state resets naturally */
  return (
    <QuizQuestionCard
      key={qIndex}
      quiz={quiz}
      qIndex={qIndex}
      isHost={isHost}
      emit={emit}
    />
  );
}

function QuizQuestionCard({
  quiz,
  qIndex,
  isHost,
  emit,
}: {
  quiz: QuizView;
  qIndex: number;
  isHost: boolean;
  emit: EmitFn;
}) {
  const current = quiz.current!;
  const [choice, setChoice] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(current.seconds ?? 30);

  useEffect(() => {
    if (quiz.reveal) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [quiz.reveal]);

  return (
    <div className="flex-1 min-h-0 rounded-2xl bg-[#0A1233] border border-white/10 p-5 sm:p-7 flex flex-col overflow-y-auto sk-scroll">
      <div className="flex items-center justify-between gap-3">
        <span className="sk-pill !bg-[#315BE5]/25 !border-[#315BE5]/50 !text-[#AFC4FF] text-[10.5px]">
          <Zap className="w-3 h-3" /> Live quiz · Q{qIndex + 1} of {quiz.total}
        </span>
        {!quiz.reveal && (
          <span className={clsx("text-[13px] font-extrabold tabular", secondsLeft <= 5 ? "text-[#FF9DA6]" : "text-white/80")}>
            ⏱ {secondsLeft}s
          </span>
        )}
      </div>
      <h2 className="text-[17px] sm:text-[20px] font-extrabold text-white leading-snug mt-3">{current.q}</h2>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
        {current.options.map((opt, i) => {
          const letter = ["A", "B", "C", "D", "E"][i];
          const picked = choice === i;
          return (
            <button
              key={i}
              disabled={quiz.reveal || (!isHost && choice !== null)}
              onClick={() => {
                setChoice(i);
                if (!isHost) emit("quiz_answer", { qIndex, choice: i });
              }}
              className={clsx(
                "text-left rounded-xl border px-3.5 py-3 text-[13.5px] font-semibold transition-all flex items-center gap-2.5",
                quiz.reveal
                  ? "border-white/15 bg-white/5 text-white/70"
                  : picked
                    ? "border-[#F47B20] bg-[#F47B20]/20 text-white"
                    : "border-white/15 bg-white/5 text-white/85 hover:border-[#315BE5] hover:bg-[#315BE5]/15"
              )}
            >
              <span className={clsx("w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0", picked ? "bg-[#F47B20] text-white" : "bg-white/10 text-white/70")}>
                {letter}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
      <div className="mt-auto pt-4 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11.5px] text-white/60">
          {isHost ? "Advance when everyone has answered" : quiz.reveal ? "Answers locked — watch the reveal" : choice !== null ? "Answer locked in ✓" : "Pick your answer"}
        </span>
        {isHost && (
          <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => emit("quiz_next")}>
            {quiz.reveal ? (qIndex >= (quiz.total ?? 1) - 1 ? "Finish & show winners" : "Next question") : "Reveal answer"}
          </button>
        )}
      </div>
      {(quiz.leaderboard?.length ?? 0) > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-white/50 mb-2">Top scorers</p>
          <Leaderboard rows={quiz.leaderboard?.slice(0, 3) ?? []} compact />
        </div>
      )}
    </div>
  );
}

function TrophyHeader() {
  return <span className="sk-avatar mx-auto" style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 24 }}>🏆</span>;
}

function Leaderboard({ rows, compact }: { rows: { rank: number; name: string; correct: number; points: number }[]; compact?: boolean }) {
  return (
    <div className={clsx("space-y-2", !compact && "max-w-md mx-auto w-full")}>
      {rows.map((r) => (
        <div key={r.rank} className={clsx("flex items-center gap-3 rounded-xl border px-3.5 py-2.5", r.rank === 1 ? "bg-[#F47B20]/15 border-[#F47B20]/40" : "bg-white/5 border-white/10")}>
          <span className={clsx("w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-extrabold shrink-0", r.rank === 1 ? "bg-[#F47B20] text-white" : "bg-white/10 text-white/70")}>
            {r.rank}
          </span>
          <span className="text-[13.5px] font-bold text-white truncate">{r.name}</span>
          <span className="ml-auto text-[11.5px] text-white/60 shrink-0">{r.correct} correct</span>
          <span className="text-[13px] font-extrabold text-[#FFD9AE] tabular shrink-0">{r.points}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 * quick poll strip (under stage)
 * ============================================================ */
function QuickPollStrip({
  poll,
  selfId,
  isHost,
  emit,
}: {
  poll: { id: string; question: string; options: string[]; votes: Record<number, number>; total: number; open: boolean };
  selfId: string;
  isHost: boolean;
  emit: EmitFn;
}) {
  const [voted, setVoted] = useState<number | null>(null);
  const total = Math.max(1, poll.total);
  return (
    <div className="shrink-0 rounded-2xl bg-[#0A1233]/90 border border-[#315BE5]/40 p-3.5 sm:p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="sk-pill !bg-[#315BE5]/25 !border-[#315BE5]/50 !text-[#AFC4FF] text-[10.5px]">
          <BarChart3 className="w-3 h-3" /> Quick poll
        </span>
        <p className="text-[13.5px] font-bold text-white">{poll.question}</p>
        <span className="ml-auto text-[11px] text-white/60">{poll.total} vote{poll.total === 1 ? "" : "s"}</span>
        {isHost && poll.open && (
          <button className="sk-btn sk-btn-ghost sk-btn-sm !py-1 !px-2.5 !text-[11px]" onClick={() => emit("poll_close", { pollId: poll.id })}>
            Close poll
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {poll.options.map((opt, i) => {
          const votes = poll.votes[i] ?? 0;
          const pct = Math.round((votes / total) * 100);
          const picked = voted === i;
          return (
            <button
              key={i}
              disabled={!poll.open || voted !== null || isHost}
              onClick={() => {
                setVoted(i);
                emit("poll_vote", { pollId: poll.id, optionIndex: i });
              }}
              className={clsx(
                "relative overflow-hidden text-left rounded-xl border px-3 py-2.5 transition-all",
                picked ? "border-[#F47B20]" : "border-white/15 hover:border-[#315BE5]",
                (!poll.open || voted !== null || isHost) && "cursor-default"
              )}
            >
              <span className="absolute inset-y-0 left-0 bg-[#315BE5]/25" style={{ width: `${poll.total ? pct : 0}%` }} />
              <span className="relative flex items-center gap-2 text-[12.5px] font-semibold text-white/90">
                {picked && <Check className="w-3.5 h-3.5 text-[#F47B20]" />}
                {opt}
                <span className="ml-auto tabular text-white/60">{votes}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!poll.open && <p className="text-[10.5px] text-white/50 mt-2">Poll closed — final results shown.</p>}
    </div>
  );
}

/* ============================================================
 * concept pulse — participant one-tap signal (Got it / Slightly lost / Lost)
 * ============================================================ */
const PULSE_CHOICES: { key: PulseChoice; label: string; icon: React.ComponentType<{ className?: string }>; onCls: string }[] = [
  { key: "got", label: "Got it", icon: ThumbsUp, onCls: "border-[#1F9D68] bg-[#1F9D68]/25 text-white" },
  { key: "slight", label: "Slightly lost", icon: Meh, onCls: "border-[#F47B20] bg-[#F47B20]/25 text-white" },
  { key: "lost", label: "Lost", icon: ThumbsDown, onCls: "border-[#C03342] bg-[#C03342]/25 text-white" },
];

function PulseStrip({ myPulse, onSend }: { myPulse: PulseChoice | null; onSend: (choice: PulseChoice) => void }) {
  return (
    <div
      className="shrink-0 rounded-2xl bg-[#0A1233]/90 border border-[#315BE5]/40 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2"
      role="group"
      aria-label="Concept pulse — tell the teacher how this is going"
    >
      <span className="text-[11.5px] font-bold text-white/60">How is this going?</span>
      <div className="flex items-center gap-2 flex-1 min-w-[228px]">
        {PULSE_CHOICES.map((c) => {
          const on = myPulse === c.key;
          return (
            <button
              key={c.key}
              onClick={() => onSend(c.key)}
              aria-pressed={on}
              aria-label={c.label}
              title={c.label}
              className={clsx(
                "flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10.5px] sm:text-[12px] font-bold whitespace-nowrap transition-all",
                on ? c.onCls : "border-white/15 bg-white/5 text-white/70 hover:border-white/40 hover:text-white"
              )}
            >
              <c.icon className="w-4 h-4 shrink-0" /> {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * concept pulse — host live gauge (Got it / Slightly lost / Lost)
 * ============================================================ */
function PulseGauge({ pulse, onReset }: { pulse: PulseView | null; onReset: () => void }) {
  const counts = pulse?.counts ?? { got: 0, slight: 0, lost: 0 };
  const total = pulse?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const gotPct = pct(counts.got);
  const slightPct = pct(counts.slight);
  const lostPct = pct(counts.lost);
  const losingPct = total ? Math.round(((counts.slight + counts.lost) / total) * 100) : 0;
  const suggest = total >= 2 && losingPct > 35; // re-explain threshold

  return (
    <div className="shrink-0 p-3 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-[#315BE5] shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Concept pulse</p>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground tabular">{total} response{total === 1 ? "" : "s"}</span>
          {total > 0 && (
            <button className="p-1.5 rounded-lg hover:bg-[var(--accent)] text-muted-foreground" onClick={onReset} title="Reset pulse" aria-label="Reset pulse">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>

      {total === 0 ? (
        <>
          <div className="mt-2 h-3.5 rounded-full border border-dashed border-[#BFCDF6] bg-[#EDF1FA]" aria-hidden="true" />
          <p className="text-[11.5px] text-muted-foreground mt-2">Ask the class: Got it, slightly lost, or lost?</p>
        </>
      ) : (
        <>
          <div
            className="mt-2 h-3.5 w-full rounded-full overflow-hidden flex bg-[#EDF1FA] border border-[#BFCDF6]"
            role="img"
            aria-label={`Class understanding: ${gotPct}% got it, ${slightPct}% slightly lost, ${lostPct}% lost, out of ${total} response${total === 1 ? "s" : ""}`}
          >
            <div className="h-full bg-[#1F9D68] transition-all duration-500" style={{ width: `${gotPct}%` }} />
            <div className="h-full bg-[#F47B20] transition-all duration-500" style={{ width: `${slightPct}%` }} />
            <div className="h-full bg-[#C03342] transition-all duration-500" style={{ width: `${lostPct}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { label: "Got it", n: counts.got, p: gotPct, dot: "bg-[#1F9D68]", txt: "text-[#156F4C]" },
              { label: "Slightly lost", n: counts.slight, p: slightPct, dot: "bg-[#F47B20]", txt: "text-[#A45A0C]" },
              { label: "Lost", n: counts.lost, p: lostPct, dot: "bg-[#C03342]", txt: "text-[#C03342]" },
            ].map((c) => (
              <div key={c.label} className="flex flex-col gap-0.5 min-w-0">
                <span className={clsx("flex items-center gap-1 text-[10px] font-bold truncate", c.txt)}>
                  <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", c.dot)} /> {c.label}
                </span>
                <span className="text-[11px] font-extrabold tabular">{c.n} · {c.p}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {suggest && (
        <div className="mt-2.5 rounded-xl bg-[#FFF4E4] border border-[#F5D9AE] p-2.5">
          <p className="text-[12px] font-bold text-[#8F5A10] leading-snug">
            Re-explain suggested — {losingPct}% of the class is losing the thread.
          </p>
          <button className="sk-btn sk-btn-orange sk-btn-sm mt-2" onClick={onReset}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset pulse
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * side panel — People / Chat / Polls / Q&A / Quiz / Slides
 * ============================================================ */
type PanelTab = "people" | "chat" | "polls" | "qa" | "quiz" | "slides";

function SidePanel({
  cr,
  isHost,
  isMod,
  observer,
  info,
  onDeckChange,
}: {
  cr: ReturnType<typeof useClassroom>;
  isHost: boolean;
  isMod: boolean;
  observer: boolean;
  info: ClassInfo;
  onDeckChange: (deck: LessonDeckSlide[] | null) => void;
}) {
  const [tab, setTab] = useState<PanelTab>("people");
  const [open, setOpen] = useState(false);
  const room = cr.room;
  if (!room) return null;

  const waiting = room.waiting ?? [];
  const hands = room.participants.filter((p) => p.hand).length;

  const tabs: { id: PanelTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: "people", label: "People", icon: Users, badge: (waiting.length || hands) && isMod ? waiting.length + hands : undefined },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "polls", label: "Polls", icon: BarChart3 },
    { id: "qa", label: "Q&A", icon: HelpCircle, badge: room.qa.filter((q) => !q.answered).length || undefined },
    { id: "quiz", label: "Quiz", icon: Zap },
    ...(isMod ? [{ id: "slides" as PanelTab, label: "Slides", icon: Presentation }] : []),
  ];

  return (
    <>
      {/* mobile toggle */}
      <button
        className="lg:hidden absolute right-3 bottom-[72px] z-[120] sk-btn sk-btn-primary sk-btn-sm !rounded-full shadow-xl"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="w-4 h-4" /> : <Users className="w-4 h-4" />}
      </button>

      <aside
        className={clsx(
          "bg-white flex-col border-l w-full sm:w-[320px] shrink-0",
          open ? "fixed inset-y-0 right-0 z-[125] flex" : "hidden",
          "lg:static lg:flex lg:z-auto"
        )}
        style={{ borderColor: "var(--border)" }}
      >
        {/* concept pulse — live understanding gauge (host) */}
        {isMod && <PulseGauge pulse={cr.pulse} onReset={cr.resetPulse} />}

        {/* tabs */}
        <div className="shrink-0 flex items-center gap-1 px-2 pt-2 pb-1.5 border-b overflow-x-auto sk-scroll" style={{ borderColor: "var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold whitespace-nowrap transition-colors",
                tab === t.id ? "bg-[#14246B] text-white" : "text-muted-foreground hover:bg-[var(--accent)]"
              )}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {t.badge ? (
                <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#F47B20] text-white text-[9px] font-bold flex items-center justify-center">{t.badge}</span>
              ) : null}
            </button>
          ))}
          <button className="lg:hidden ml-auto p-1.5 rounded-lg hover:bg-[var(--accent)]" onClick={() => setOpen(false)} aria-label="Close panel">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* content */}
        <div className="flex-1 min-h-0 overflow-y-auto sk-scroll">
          {tab === "people" && <PeopleTab cr={cr} isHost={isHost} isMod={isMod} />}
          {tab === "chat" && <ChatTab cr={cr} info={info} observer={observer} />}
          {tab === "polls" && <PollsTab cr={cr} isMod={isMod} observer={observer} />}
          {tab === "qa" && <QaTab cr={cr} isHost={isHost} isMod={isMod} observer={observer} info={info} />}
          {tab === "quiz" && <QuizTab cr={cr} isMod={isMod} observer={observer} />}
          {tab === "slides" && <SlidesTab cr={cr} info={info} onDeckChange={onDeckChange} />}
        </div>
      </aside>
    </>
  );
}

/* ---------- people ---------- */
function PeopleTab({ cr, isHost, isMod }: { cr: ReturnType<typeof useClassroom>; isHost: boolean; isMod: boolean }) {
  const room = cr.room!;
  const waiting = room.waiting ?? [];
  const [menuFor, setMenuFor] = useState<string | null>(null); // sid of open kebab menu

  const roleLabel = (r: string) => (r === "host" ? "Teacher" : r === "cohost" ? "Co-host" : r === "observer" ? "Observer" : "Student");

  return (
    <div className="p-3 space-y-4">
      {isMod && waiting.length > 0 && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#A45A0C] mb-2">Waiting room · {waiting.length}</p>
          <div className="space-y-2">
            {waiting.map((w) => (
              <div key={w.sid} className="sk-well p-2.5 flex items-center gap-2.5">
                <div className="sk-avatar shrink-0" style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(180deg,${w.color},${w.color}bb)`, fontSize: 12 }}>
                  {initials(w.name)}
                </div>
                <span className="text-[12.5px] font-bold truncate">{w.name}</span>
                {w.role === "observer" && <span className="sk-pill sk-pill-grey !text-[9px] !px-1.5">observer</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  <button className="sk-btn sk-btn-success sk-btn-sm !px-2.5" onClick={() => cr.emit("admit", { sid: w.sid })} title="Admit">
                    <Check className="w-3.5 h-3.5" /> Admit
                  </button>
                  <button className="sk-btn sk-btn-danger sk-btn-sm !px-2.5" onClick={() => cr.emit("deny", { sid: w.sid })} title="Decline">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">In class · {room.participants.length}</p>
          {isMod && room.participants.length > 1 && (
            <button className="sk-btn sk-btn-ghost sk-btn-sm !py-1 !px-2.5 !text-[10.5px]" onClick={() => cr.emit("mute_all")}>
              <MicOff className="w-3 h-3" /> Mute all
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {room.participants.map((p) => (
            <div key={p.sid} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[var(--accent)]">
              <div className="sk-avatar shrink-0" style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(180deg,${p.color},${p.color}bb)`, fontSize: 12 }}>
                {initials(p.name)}
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold truncate flex items-center gap-1.5">
                  {p.name}
                  {p.id === cr.selfId && <span className="text-[10px] text-muted-foreground font-semibold">(you)</span>}
                  {p.allowShare && <span className="sk-pill sk-pill-green !text-[8.5px] !px-1.5" title="Screen share allowed by the teacher">share</span>}
                </div>
                <div className="text-[10.5px] text-muted-foreground">{roleLabel(p.role)}</div>
              </div>
              <div className="ml-auto flex items-center gap-1 shrink-0">
                {p.hand && <Hand className="w-3.5 h-3.5 text-[#F47B20]" />}
                {p.mic ? <Volume2 className="w-3.5 h-3.5 text-[#1F9D68]" /> : <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />}
                {isMod && p.role !== "host" && (
                  <>
                    <button className="p-1.5 rounded-lg hover:bg-[#EDF1FA] text-muted-foreground" title="Mute this student" onClick={() => cr.emit("force_mute", { sid: p.sid })}>
                      <MicOff className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-[#EDF1FA] text-muted-foreground" title="Ask to unmute" onClick={() => cr.emit("notify", { sid: p.sid, message: "The teacher asked you to unmute your microphone" })}>
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {isHost && p.role !== "host" && p.id !== cr.selfId && (
                  <div className="relative">
                    <button
                      className="p-1.5 rounded-lg hover:bg-[#EDF1FA] text-muted-foreground"
                      title="More controls"
                      aria-label={`More controls for ${p.name}`}
                      aria-expanded={menuFor === p.sid}
                      onClick={() => setMenuFor(menuFor === p.sid ? null : p.sid)}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuFor === p.sid && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                        <div className="absolute right-0 top-8 z-50 w-48 rounded-xl border bg-white shadow-xl p-1.5" style={{ borderColor: "var(--border)" }}>
                          <MenuRow icon={MicOff} label="Mute" onClick={() => { cr.emit("force_mute", { sid: p.sid }); setMenuFor(null); }} />
                          <MenuRow
                            icon={MonitorUp}
                            label={p.allowShare ? "Revoke screen share" : "Allow screen share"}
                            onClick={() => {
                              cr.emit("role_update", { peerId: p.id, role: p.role, allowShare: !p.allowShare });
                              toast({ title: p.allowShare ? `Screen share revoked for ${p.name}` : `${p.name} can now share their screen` });
                              setMenuFor(null);
                            }}
                          />
                          <MenuRow
                            icon={ShieldCheck}
                            label={p.role === "cohost" ? "Remove co-host" : "Make co-host"}
                            onClick={() => {
                              cr.emit("role_update", { peerId: p.id, role: p.role === "cohost" ? "participant" : "cohost" });
                              toast({ title: p.role === "cohost" ? `${p.name} is a participant again` : `${p.name} is now a co-host`, description: p.role === "cohost" ? undefined : "They can admit, mute and run polls." });
                              setMenuFor(null);
                            }}
                          />
                          <MenuRow
                            icon={LogOut}
                            label="Remove from class"
                            danger
                            onClick={() => {
                              if (confirm(`Remove ${p.name} from this class?`)) cr.emit("remove", { sid: p.sid });
                              setMenuFor(null);
                            }}
                          />
                          <MenuRow
                            icon={Ban}
                            label="Ban from class"
                            danger
                            onClick={() => {
                              if (confirm(`Ban ${p.name}? Banned users cannot rejoin this class.`)) {
                                cr.emit("ban", { peerId: p.id });
                                toast({ title: `${p.name} was banned`, description: "They cannot rejoin this class." });
                              }
                              setMenuFor(null);
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={clsx("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-bold transition-colors", danger ? "text-[#C03342] hover:bg-[#FDE3E5]" : "text-foreground hover:bg-[var(--accent)]")}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

/* ---------- chat ---------- */
function ChatTab({ cr, info, observer }: { cr: ReturnType<typeof useClassroom>; info: ClassInfo; observer: boolean }) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cr.chat.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    cr.emit("chat_send", { text: t });
    setText("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto sk-scroll p-3 space-y-2.5">
        {cr.chat.length === 0 && (
          <p className="text-[12px] text-muted-foreground text-center py-8">No messages yet — say hello to the class!</p>
        )}
        {cr.chat.map((m) => {
          const mine = m.from === cr.selfId;
          return (
            <div key={m.id} className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
              <div className={clsx("max-w-[85%] rounded-2xl px-3.5 py-2", mine ? "bg-[#14246B] text-white rounded-br-md" : "bg-[#EDF1FA] rounded-bl-md")}>
                {!mine && <span className="block text-[10.5px] font-bold text-[#315BE5]">{m.name}</span>}
                <p className="text-[12.5px] leading-relaxed break-words">{m.text}</p>
              </div>
              <span className="text-[9.5px] text-muted-foreground mt-0.5 px-1">
                {new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {observer ? (
        <div className="shrink-0 p-3 border-t text-[11.5px] text-muted-foreground flex items-center gap-1.5" style={{ borderColor: "var(--border)" }}>
          <Lock className="w-3.5 h-3.5" /> Observer mode — chat is view only.
        </div>
      ) : info.allowChat ? (
        <div className="shrink-0 p-2.5 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
          <input
            className="sk-input !py-2 !text-[12.5px]"
            placeholder="Message the class…"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="sk-btn sk-btn-primary !px-3" onClick={send} aria-label="Send message">
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="shrink-0 p-3 border-t text-[11.5px] text-muted-foreground flex items-center gap-1.5" style={{ borderColor: "var(--border)" }}>
          <Lock className="w-3.5 h-3.5" /> Chat disabled by the teacher.
        </div>
      )}
    </div>
  );
}

/* ---------- polls ---------- */
function PollsTab({ cr, isMod, observer }: { cr: ReturnType<typeof useClassroom>; isMod: boolean; observer: boolean }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const polls = cr.room?.polls ?? [];

  const create = () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      toast({ title: "Add a question and at least 2 options" });
      return;
    }
    cr.emit("poll_create", { question: question.trim(), options: opts });
    setQuestion("");
    setOptions(["", ""]);
  };

  return (
    <div className="p-3 space-y-4">
      {isMod && (
        <div className="sk-card-flat p-3.5 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Launch a quick poll</p>
          <input className="sk-input !py-2 !text-[12.5px]" placeholder="Question — e.g. Was today's topic clear?" value={question} onChange={(e) => setQuestion(e.target.value)} />
          {options.map((o, i) => (
            <input
              key={i}
              className="sk-input !py-2 !text-[12.5px]"
              placeholder={`Option ${i + 1}`}
              value={o}
              onChange={(e) => setOptions((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
            />
          ))}
          <div className="flex items-center gap-2">
            {options.length < 6 && (
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setOptions((p) => [...p, ""])}>
                <Plus className="w-3.5 h-3.5" /> Option
              </button>
            )}
            <button className="sk-btn sk-btn-primary sk-btn-sm ml-auto" onClick={create}>
              <BarChart3 className="w-3.5 h-3.5" /> Launch poll
            </button>
          </div>
        </div>
      )}

      {polls.length === 0 && <p className="text-[12px] text-muted-foreground text-center py-6">No polls yet{isMod ? " — launch one above." : "."}</p>}
      {polls.map((p) => {
        const total = Math.max(1, p.total);
        return (
          <div key={p.id} className="sk-card-flat p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-bold">{p.question}</p>
              <span className={clsx("sk-pill shrink-0", p.open ? "sk-pill-green" : "sk-pill-grey")}>{p.open ? "Open" : "Closed"}</span>
            </div>
            <div className="space-y-2 mt-2.5">
              {p.options.map((opt, i) => {
                const pct = Math.round(((p.votes[i] ?? 0) / total) * 100);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[11.5px] font-semibold">
                      <span>{opt}</span>
                      <span className="tabular text-muted-foreground">{p.votes[i] ?? 0} · {pct}%</span>
                    </div>
                    <div className="sk-progress-track mt-1">
                      <div className="sk-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {observer && polls.length > 0 && <p className="text-[10.5px] text-muted-foreground text-center">Observer mode — polls are view only.</p>}
    </div>
  );
}

/* ---------- Q&A (with AI draft for the host) ---------- */
function QaTab({ cr, isHost, isMod, observer, info }: { cr: ReturnType<typeof useClassroom>; isHost: boolean; isMod: boolean; observer: boolean; info: ClassInfo }) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aiDrafts, setAiDrafts] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const items = useMemo(() => [...(cr.room?.qa ?? [])].sort((a, b) => b.upvotes - a.upvotes), [cr.room?.qa]);

  const ask = () => {
    const t = text.trim();
    if (!t) return;
    cr.emit("qa_ask", { text: t });
    setText("");
  };

  const fetchAiDraft = async (qaId: string, question: string) => {
    setAiBusy(qaId);
    try {
      const res = await fetch(`/api/live-classes/${info.id}/qa-draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, subject: info.subject, grade: info.grade, board: info.board }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "AI draft failed");
      setAiDrafts((d) => ({ ...d, [qaId]: String(json?.data?.draft ?? "") }));
    } catch {
      toast({ title: "AI draft unavailable", description: "Answer manually instead.", variant: "destructive" });
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <div className="p-3 space-y-3">
      {!isMod && !observer && (
        <div className="flex items-center gap-2">
          <input
            className="sk-input !py-2 !text-[12.5px]"
            placeholder="Ask the teacher anything…"
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <button className="sk-btn sk-btn-primary !px-3" onClick={ask} aria-label="Ask question">
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
      {observer && <p className="text-[10.5px] text-muted-foreground text-center">Observer mode — Q&A is view only.</p>}

      {items.length === 0 && <p className="text-[12px] text-muted-foreground text-center py-6">No questions yet — the bravest student asks first.</p>}

      {items.map((q) => {
        const draft = aiDrafts[q.id];
        return (
          <div key={q.id} className={clsx("sk-card-flat p-3.5", q.answered && "opacity-75")}>
            <div className="flex items-start gap-2.5">
              <button
                className={clsx("shrink-0 w-9 py-1.5 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all", q.upvotes > 0 ? "bg-[#EDF1FA] border-[#BFCDF6] text-[#2A4BB8]" : "border-border text-muted-foreground hover:border-[#BFCDF6]")}
                onClick={() => cr.emit("qa_upvote", { qaId: q.id })}
                disabled={observer}
                aria-label="Upvote question"
              >
                <span className="text-[13px] leading-none font-extrabold tabular">▲</span>
                <span className="text-[10.5px] font-bold tabular">{q.upvotes}</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold leading-snug">{q.text}</p>
                <p className="text-[10.5px] text-muted-foreground mt-1">— {q.name}</p>
                {q.answered && (
                  <div className="mt-2 rounded-xl bg-[#E2F6EC] border border-[#B5E3CB] p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#156F4C]">Teacher answered</p>
                    <p className="text-[12px] leading-relaxed mt-0.5">{q.answer}</p>
                  </div>
                )}
                {isHost && !q.answered && draft !== undefined && (
                  <div className="mt-2 rounded-xl bg-[#FFF4E4] border border-[#F5D9AE] p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#A45A0C] flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI draft — review before posting
                    </p>
                    <textarea
                      className="sk-input mt-1.5 !py-1.5 !text-[12px] !h-20 resize-none"
                      value={draft}
                      maxLength={400}
                      onChange={(e) => setAiDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    />
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        className="sk-btn sk-btn-success sk-btn-sm !px-2.5"
                        onClick={() => {
                          const a = draft.trim();
                          if (a) cr.emit("qa_answer", { qaId: q.id, answer: a });
                          setAiDrafts((d) => {
                            const n = { ...d };
                            delete n[q.id];
                            return n;
                          });
                        }}
                      >
                        <Send className="w-3.5 h-3.5" /> Post answer
                      </button>
                      <button
                        className="sk-btn sk-btn-ghost sk-btn-sm !px-2.5"
                        onClick={() =>
                          setAiDrafts((d) => {
                            const n = { ...d };
                            delete n[q.id];
                            return n;
                          })
                        }
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
                {isHost && !q.answered && draft === undefined && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      className="sk-input !py-1.5 !text-[12px]"
                      placeholder="Answer for everyone…"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                    <button
                      className="sk-btn sk-btn-success sk-btn-sm !px-2.5"
                      onClick={() => {
                        const a = (answers[q.id] ?? "").trim();
                        if (a) cr.emit("qa_answer", { qaId: q.id, answer: a });
                      }}
                      aria-label="Send answer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="sk-btn sk-btn-ghost sk-btn-sm !px-2.5 !text-[#8F5A10] !border-[#F5D9AE]"
                      disabled={aiBusy === q.id}
                      onClick={() => fetchAiDraft(q.id, q.text)}
                      title="Draft an exam-accurate answer with AI"
                    >
                      {aiBusy === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI draft
                    </button>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm !px-2.5" onClick={() => cr.emit("qa_dismiss", { qaId: q.id })} title="Dismiss question">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {isMod && !isHost && !q.answered && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      className="sk-input !py-1.5 !text-[12px]"
                      placeholder="Answer for everyone…"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                    <button
                      className="sk-btn sk-btn-success sk-btn-sm !px-2.5"
                      onClick={() => {
                        const a = (answers[q.id] ?? "").trim();
                        if (a) cr.emit("qa_answer", { qaId: q.id, answer: a });
                      }}
                      aria-label="Send answer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm !px-2.5" onClick={() => cr.emit("qa_dismiss", { qaId: q.id })} title="Dismiss question">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- quiz (host builder + participant info) ---------- */
interface PaperLite {
  id: string;
  title: string;
  subject: string;
  contentJson: { sections?: { type: string; questions?: { q: string; options?: string[]; answer: string }[] }[] };
}

function QuizTab({ cr, isMod, observer }: { cr: ReturnType<typeof useClassroom>; isMod: boolean; observer: boolean }) {
  const [qs, setQs] = useState<{ q: string; options: string[]; answer: number }[]>([
    { q: "", options: ["", "", "", ""], answer: 0 },
  ]);
  const [seconds, setSeconds] = useState(30);
  const [papers, setPapers] = useState<PaperLite[] | null>(null);
  const quiz = cr.room?.quiz;

  if (!isMod) {
    return (
      <div className="p-4 space-y-3 text-center">
        <span className="sk-avatar mx-auto" style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 22 }}>
          <Zap className="w-6 h-6 text-white" />
        </span>
        <p className="text-[13.5px] font-bold">Live quizzes</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {observer
            ? "When the teacher launches a quiz it takes over the main stage. Observers watch the action read-only."
            : "When the teacher launches a quiz it takes over the main stage. Answer fast — 100 points per correct answer, one attempt each."}
        </p>
        {quiz?.open && (
          <div className="sk-callout sk-callout-info text-left">A quiz is running — head back to the stage to play.</div>
        )}
      </div>
    );
  }

  const loadPapers = async () => {
    if (papers) return;
    try {
      const res = await fetch("/api/studio/papers");
      const json = await res.json();
      setPapers((json?.data ?? []) as PaperLite[]);
    } catch {
      setPapers([]);
    }
  };

  const importPaper = (p: PaperLite) => {
    const mcq = (p.contentJson?.sections ?? []).find((s) => s.type === "MCQ");
    const questions = (mcq?.questions ?? []).slice(0, 10).map((q) => ({
      q: q.q,
      options: (q.options ?? []).slice(0, 4),
      answer: Math.max(0, ["A", "B", "C", "D"].indexOf(String(q.answer ?? "A").trim().toUpperCase())),
    }));
    if (!questions.length) {
      toast({ title: "That paper has no MCQ section to import" });
      return;
    }
    setQs(questions);
    toast({ title: `Imported ${questions.length} MCQs from “${p.title}”`, description: "Review them below, then launch the quiz." });
  };

  const launch = () => {
    const clean = qs
      .filter((x) => x.q.trim() && x.options.filter((o) => o.trim()).length >= 2)
      .map((x) => ({ q: x.q.trim(), options: x.options.map((o) => o.trim()).filter(Boolean), answer: x.answer, seconds }));
    if (!clean.length) {
      toast({ title: "Add at least one question with 2+ options" });
      return;
    }
    cr.emit("quiz_launch", { questions: clean });
    toast({ title: `Quiz launched — ${clean.length} question${clean.length > 1 ? "s" : ""}`, description: "It's now live on everyone's stage. Scores save to student progress when it ends." });
  };

  return (
    <div className="p-3 space-y-3">
      <div className="sk-card-flat p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Build a live quiz</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-semibold">Timer</span>
            <input type="number" min={10} max={120} value={seconds} onChange={(e) => setSeconds(Math.min(120, Math.max(10, Number(e.target.value) || 30)))} className="sk-input !py-1 !px-2 !w-16 !text-[12px] text-center" />
            <span className="text-[11px] text-muted-foreground font-semibold">s</span>
          </div>
        </div>

        <div>
          <button className="sk-btn sk-btn-ghost sk-btn-sm w-full" onClick={loadPapers}>
            <FileQuestion className="w-3.5 h-3.5" /> Import from Question Paper Studio
          </button>
          {papers && papers.length > 0 && (
            <div className="mt-2 max-h-36 overflow-y-auto sk-scroll rounded-xl border border-border divide-y">
              {papers.map((p) => (
                <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-[var(--accent)] transition-colors" onClick={() => importPaper(p)}>
                  <span className="text-[12px] font-bold">{p.title}</span>
                  <span className="block text-[10.5px] text-muted-foreground">{p.subject}</span>
                </button>
              ))}
            </div>
          )}
          {papers && papers.length === 0 && <p className="text-[11px] text-muted-foreground mt-1.5">No saved papers yet — the MCQ section of any saved paper can be turned into a live quiz.</p>}
        </div>

        {qs.map((item, i) => (
          <div key={i} className="sk-well p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="sk-pill sk-pill-navy shrink-0">Q{i + 1}</span>
              <input className="sk-input !py-1.5 !text-[12px]" placeholder="Question…" value={item.q} onChange={(e) => setQs((prev) => prev.map((x, xi) => (xi === i ? { ...x, q: e.target.value } : x)))} />
              {qs.length > 1 && (
                <button className="p-1.5 rounded-lg hover:bg-[#FDE3E5] text-[#C03342] shrink-0" onClick={() => setQs((prev) => prev.filter((_, xi) => xi !== i))} aria-label="Remove question">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {item.options.map((opt, oi) => (
                <label key={oi} className={clsx("flex items-center gap-1.5 rounded-xl border px-2 py-1.5 cursor-pointer transition-colors", item.answer === oi ? "border-[#1F9D68] bg-[#E2F6EC]" : "border-border")}>
                  <input type="radio" name={`ans-${i}`} checked={item.answer === oi} onChange={() => setQs((prev) => prev.map((x, xi) => (xi === i ? { ...x, answer: oi } : x)))} className="accent-[#1F9D68]" />
                  <input
                    className="w-full bg-transparent outline-none text-[12px] font-semibold"
                    placeholder={`Option ${["A", "B", "C", "D"][oi]}`}
                    value={opt}
                    onChange={(e) => setQs((prev) => prev.map((x, xi) => (xi === i ? { ...x, options: x.options.map((o, oj) => (oj === oi ? e.target.value : o)) } : x)))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setQs((p) => [...p, { q: "", options: ["", "", "", ""], answer: 0 }])}>
            <Plus className="w-3.5 h-3.5" /> Question
          </button>
          <button className="sk-btn sk-btn-orange sk-btn-sm ml-auto" onClick={launch}>
            <Zap className="w-3.5 h-3.5" /> Launch quiz
          </button>
        </div>
        {quiz?.open && (
          <div className="sk-callout sk-callout-info flex items-center justify-between gap-2">
            <span className="text-[12px]">A quiz is live — control it from the main stage.</span>
            <button className="sk-btn sk-btn-danger sk-btn-sm !py-1 !px-2.5 !text-[11px]" onClick={() => cr.emit("quiz_end")}>Stop</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- slides (host) — image upload OR lesson-plan deck ---------- */
function SlidesTab({ cr, info, onDeckChange }: { cr: ReturnType<typeof useClassroom>; info: ClassInfo; onDeckChange: (deck: LessonDeckSlide[] | null) => void }) {
  const slides = cr.room?.slides;
  const [pickerOpen, setPickerOpen] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length > 30) {
      toast({ title: "Max 30 slides per deck" });
      return;
    }
    const images: string[] = [];
    for (const f of [...files]) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const dataUrl = await resizeImage(f, 1600, 0.82);
        images.push(dataUrl);
      } catch {}
    }
    if (!images.length) {
      toast({ title: "Only image files (JPG/PNG) can be shown as slides", variant: "destructive" });
      return;
    }
    onDeckChange(null); // image deck replaces any lesson-plan deck (captions fall back to the agenda)
    cr.emit("slides_set", { slides: images });
    toast({ title: `Deck live — ${images.length} slide${images.length > 1 ? "s" : ""}`, description: "Use the arrows under the stage to flip slides." });
  };

  return (
    <div className="p-3 space-y-3">
      <div className="sk-card-flat p-3.5 space-y-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Present slides</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Upload your presentation as images (JPG/PNG — one per slide, max 30), or build a branded deck straight from a saved
          lesson plan. Everyone sees the slide you&apos;re on.
        </p>
        <label className="sk-btn sk-btn-primary sk-btn-sm w-full cursor-pointer">
          <Presentation className="w-3.5 h-3.5" /> Choose slide images
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        <button className="sk-btn sk-btn-ghost sk-btn-sm w-full" onClick={() => setPickerOpen(true)}>
          <BookOpen className="w-3.5 h-3.5" /> Load from Lesson Plan
        </button>
        {slides && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="sk-pill sk-pill-green">Deck live · {slides.count} slides</span>
            <button
              className="sk-btn sk-btn-danger sk-btn-sm !py-1 !px-2.5 !text-[11px]"
              onClick={() => {
                cr.emit("slides_set", { slides: [] });
                onDeckChange(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        )}
      </div>
      {pickerOpen && (
        <LessonPlanPicker
          classId={info.id}
          onLoaded={(deck) => {
            const images = deck.map((s) => renderTextSlide(s.title, s.bullets)).filter(Boolean);
            if (!images.length) {
              toast({ title: "Could not render the deck", variant: "destructive" });
              return;
            }
            onDeckChange(deck); // structured deck powers the live captions
            cr.emit("slides_set", { slides: images });
            toast({ title: `Deck live — ${images.length} slides from your lesson plan`, description: "Captions can now narrate each slide's bullets." });
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {slides && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: slides.count }).map((_, i) => (
            <button
              key={i}
              onClick={() => cr.emit("slides_page", { index: i })}
              className={clsx("relative rounded-xl border-2 overflow-hidden aspect-video bg-[#0A1233]", i === slides.index ? "border-[#F47B20]" : "border-transparent hover:border-[#BFCDF6]")}
            >
              <img src={slidePreview(cr.room, i)} alt={`Slide ${i + 1}`} className="w-full h-full object-cover opacity-80" />
              <span className="absolute bottom-1 right-1 text-[9.5px] font-bold text-white bg-black/50 rounded px-1">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* lesson-plan picker dialog → server builds the slide deck */
function LessonPlanPicker({
  classId,
  onLoaded,
  onClose,
}: {
  classId: string;
  onLoaded: (deck: LessonDeckSlide[]) => void;
  onClose: () => void;
}) {
  const [plans, setPlans] = useState<{ id: string; title: string; subject: string; grade: string }[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/live-classes/${classId}/slides`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setPlans(json?.data?.plans ?? []))
      .catch(() => setPlans([]));
  }, [classId]);

  const load = async (planId: string) => {
    setBusyId(planId);
    setError("");
    try {
      const res = await fetch(`/api/live-classes/${classId}/slides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonPlanId: planId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not build slides from that plan.");
      onLoaded((json?.data?.slides ?? []) as LessonDeckSlide[]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build slides.");
      setBusyId("");
    }
  };

  return (
    <div className="fixed inset-0 z-[112] flex items-center justify-center p-4" style={{ background: "rgba(14,26,82,.45)" }} role="dialog" aria-modal>
      <div className="sk-card w-full max-w-md max-h-[80vh] overflow-y-auto sk-scroll p-5" style={{ boxShadow: "0 24px 70px rgba(20,36,107,.35)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-extrabold">Load slides from a Lesson Plan</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">Builds a branded deck: title, objectives, one slide per 5E stage, check-up and wrap-up.</p>
          </div>
          <button className="p-1.5 rounded-xl hover:bg-[var(--accent)]" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <div className="sk-callout sk-callout-danger mt-3 text-[12px]">{error}</div>}
        <div className="mt-3 space-y-2">
          {plans === null && <p className="text-[12px] text-muted-foreground text-center py-6">Loading your lesson plans…</p>}
          {plans !== null && plans.length === 0 && (
            <p className="text-[12px] text-muted-foreground text-center py-6">
              No saved lesson plans yet — generate one in Teaching Studio → Lesson Plans first.
            </p>
          )}
          {(plans ?? []).map((p) => (
            <button
              key={p.id}
              className="w-full text-left sk-well p-3 hover:border-[#F47B20] transition-colors flex items-center gap-3"
              disabled={!!busyId}
              onClick={() => load(p.id)}
            >
              <BookOpen className="w-4 h-4 text-[#315BE5] shrink-0" />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold truncate">{p.title}</span>
                <span className="block text-[11px] text-muted-foreground">{p.subject}{p.grade ? ` · ${p.grade}` : ""}</span>
              </span>
              {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin ml-auto shrink-0" /> : <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* render a structured {title, bullets} slide as a branded 1600x900 PNG */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderTextSlide(title: string, bullets: string[]): string {
  const W = 1600;
  const H = 900;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return "";
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0E1A52");
  grad.addColorStop(0.55, "#14246B");
  grad.addColorStop(1, "#26418F");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  /* title (max 3 lines) */
  ctx.font = "800 64px 'Segoe UI', system-ui, -apple-system, sans-serif";
  const titleLines = wrapText(ctx, title || "Slide", W - 280).slice(0, 3);
  let y = 170;
  ctx.fillStyle = "#F47B20";
  ctx.fillRect(100, y - 54, 10, titleLines.length * 78);
  ctx.fillStyle = "#FFFFFF";
  for (const line of titleLines) {
    ctx.fillText(line, 140, y);
    y += 78;
  }

  /* bullets (max 5, wrapped to 2 lines each) */
  y += 40;
  ctx.font = "600 38px 'Segoe UI', system-ui, -apple-system, sans-serif";
  for (const b of (bullets ?? []).slice(0, 5)) {
    if (y > H - 130) break;
    ctx.fillStyle = "#F47B20";
    ctx.beginPath();
    ctx.arc(128, y - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E8EDF9";
    for (const line of wrapText(ctx, b, W - 340).slice(0, 2)) {
      ctx.fillText(line, 165, y);
      y += 50;
    }
    y += 26;
  }

  /* footer brand */
  ctx.font = "700 26px 'Segoe UI', system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.fillText("Tutor Amma · Digital Classroom", 100, H - 60);

  return cv.toDataURL("image/jpeg", 0.9);
}

/* the room state only carries the current slide image — thumbnails reuse it when available */
function slidePreview(room: import("@/lib/classroom-client").RoomState | null, i: number): string {
  return room?.slides?.index === i && room.slides.slide ? room.slides.slide : "";
}

function resizeImage(file: File, maxW: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ============================================================
 * ended screen (with attendance for host)
 * ============================================================ */
function EndedScreen({
  info,
  role,
  attendance,
  onExit,
  onOpenNotes,
}: {
  info: ClassInfo;
  role: string;
  attendance: AttendanceRow[] | null;
  onExit: () => void;
  onOpenNotes?: () => void;
}) {
  const downloadAttendance = async () => {
    if (!attendance?.length) return;
    try {
      await pdfAttendance({
        className: info.title,
        subject: info.subject,
        tutorName: info.tutorName,
        scheduledAt: info.scheduledAt,
        endedAt: new Date().toISOString(),
        attendees: attendance,
      });
      toast({ title: "Attendance PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
    } catch {
      toast({ title: "Could not build the PDF", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
      <div className="sk-card p-7 max-w-lg w-full">
        <div className="text-center">
          <div className="sk-avatar mx-auto" style={{ width: 60, height: 60, borderRadius: 20, background: "linear-gradient(180deg,#46BD85,#1F9D68)", fontSize: 26 }}>
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-[18px] font-extrabold mt-3">{role === "host" ? "Class ended" : "You left the class"}</h2>
          <p className="text-[12.5px] text-muted-foreground mt-1">{info.title} · {info.subject}</p>
        </div>

        {role === "host" && attendance && attendance.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Attendance · {attendance.length} joined</p>
            <div className="max-h-56 overflow-y-auto sk-scroll rounded-xl border border-border divide-y">
              {attendance.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="text-[12.5px] font-bold truncate">{a.name}</span>
                  <span className="sk-pill sk-pill-grey !text-[9.5px] !px-1.5">{a.role === "host" ? "Teacher" : a.role === "observer" ? "Observer" : a.role === "cohost" ? "Co-host" : "Student"}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular shrink-0">{a.durationMin} min</span>
                  <span className={clsx("sk-pill !text-[9.5px] !px-1.5", a.status === "present" ? "sk-pill-green" : "sk-pill-grey")}>{a.status}</span>
                </div>
              ))}
            </div>
            <button className="sk-btn sk-btn-primary sk-btn-sm w-full mt-3" onClick={downloadAttendance}>
              <Sparkles className="w-3.5 h-3.5" /> Download attendance PDF
            </button>
          </div>
        )}

        {onOpenNotes && (
          <button className="sk-btn sk-btn-orange sk-btn-sm w-full mt-3" onClick={onOpenNotes}>
            <BookOpen className="w-3.5 h-3.5" /> Class notes &amp; catch-up packs
          </button>
        )}

        <button className="sk-btn sk-btn-primary w-full mt-5" onClick={onExit}>
          {role === "host" ? "Back to Live Classes" : "Back to Live Classes"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * class notes — AI draft dialog (host, after the class ends)
 * ============================================================ */
function NotesDialog({
  classId,
  notes,
  status,
  onRetry,
  onSkip,
}: {
  classId: string;
  notes: NotesDraft | null;
  status: "idle" | "loading" | "ready" | "error";
  onRetry: () => void;
  onSkip: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [items, setItems] = useState("");
  const [homework, setHomework] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");

  useEffect(() => {
    if (notes) {
      setSummary(notes.summary ?? "");
      setItems((notes.actionItems ?? []).join("\n"));
      setHomework(notes.homework ?? "");
    }
  }, [notes]);

  const save = async (send: boolean) => {
    setBusy(send ? "send" : "draft");
    try {
      const res = await fetch(`/api/live-classes/${classId}/notes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary,
          actionItems: items.split("\n").map((s) => s.trim()).filter(Boolean),
          homework,
          send,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Save failed");
      toast(
        send
          ? { title: "Notes + catch-up packs + revision nudges sent", description: "Attendees got the notes, absentees a catch-up pack, and everyone spaced revision reminders." }
          : { title: "Notes saved as draft", description: "Edit and send them any time from this class." }
      );
      onSkip();
    } catch (e) {
      toast({ title: "Could not save notes", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" style={{ background: "rgba(14,26,82,.5)" }} role="dialog" aria-modal>
      <div className="sk-card w-full max-w-lg max-h-[90vh] overflow-y-auto sk-scroll p-5" style={{ boxShadow: "0 24px 70px rgba(20,36,107,.35)" }}>
        {status === "loading" && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#315BE5]" />
            <p className="text-[14px] font-extrabold">Class notes — AI draft</p>
            <p className="text-[12px] text-muted-foreground">Amma is summarising the class, attendance and Q&A…</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <X className="w-8 h-8 text-[#C03342]" />
            <p className="text-[14px] font-extrabold">Could not generate notes</p>
            <p className="text-[12px] text-muted-foreground">The AI draft didn&apos;t come through this time.</p>
            <div className="flex items-center gap-2 mt-1">
              <button className="sk-btn sk-btn-ghost" onClick={onSkip}>Skip for now</button>
              <button className="sk-btn sk-btn-primary" onClick={onRetry}>
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          </div>
        )}

        {status === "ready" && notes && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-extrabold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#F47B20]" /> Class notes — AI draft
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">Review, edit, then send. Attendees get the notes; absentees get a catch-up pack; everyone gets spaced revision nudges.</p>
              </div>
              <button className="p-1.5 rounded-xl hover:bg-[var(--accent)]" onClick={onSkip} aria-label="Close notes">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 mt-4">
              <div>
                <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="cn-summary">Summary (AI draft)</label>
                <textarea id="cn-summary" className="sk-input mt-1 !h-20 resize-none" value={summary} maxLength={600} onChange={(e) => setSummary(e.target.value)} />
              </div>
              <div>
                <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="cn-actions">Action items — one per line (AI draft)</label>
                <textarea id="cn-actions" className="sk-input mt-1 !h-20 resize-none" value={items} maxLength={600} onChange={(e) => setItems(e.target.value)} />
              </div>
              <div>
                <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="cn-homework">Homework (AI draft)</label>
                <input id="cn-homework" className="sk-input mt-1" value={homework} maxLength={300} onChange={(e) => setHomework(e.target.value)} />
              </div>

              {(notes.absentees?.length ?? 0) > 0 && (
                <div className="sk-well p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#A45A0C]">Absentees — get a catch-up pack</p>
                  <p className="text-[12px] font-semibold mt-1">{notes.absentees!.join(", ")}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 mt-5 flex-wrap">
              <button className="sk-btn sk-btn-ghost" onClick={onSkip} disabled={!!busy}>Later</button>
              <div className="ml-auto flex items-center gap-2">
                <button className="sk-btn sk-btn-primary sk-btn-sm" disabled={!!busy} onClick={() => save(false)}>
                  {busy === "draft" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save as draft
                </button>
                <button className="sk-btn sk-btn-orange sk-btn-sm" disabled={!!busy} onClick={() => save(true)}>
                  {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to students
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * host caption engine — cycles caption lines every 4s while live
 * captions are on; translates non-English lines once (cached)
 * ============================================================ */
function useCaptionEngine(opts: {
  active: boolean;
  lang: string;
  classId: string;
  lines: string[];
  emit: EmitFn;
}) {
  const { active, lang, classId, lines, emit } = opts;
  const idxRef = useRef(0);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const pushLine = async () => {
      if (inFlightRef.current || !lines.length) return;
      const raw = lines[idxRef.current % lines.length] ?? "";
      idxRef.current += 1;
      let text = raw;
      if (lang !== "en" && raw) {
        const key = `${lang}:${raw}`;
        const cached = cacheRef.current.get(key);
        if (cached) {
          text = cached;
        } else {
          inFlightRef.current = true;
          try {
            const res = await fetch(`/api/live-classes/${classId}/captions`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ lines: [raw], lang }),
            });
            const json = await res.json();
            const t = json?.data?.lines?.[0];
            if (t) {
              text = String(t);
              cacheRef.current.set(key, String(t));
            }
          } catch {
            /* keep the English line on failure */
          } finally {
            inFlightRef.current = false;
          }
        }
      }
      if (!cancelled && text) emit("caption_line", { text, lang });
    };
    pushLine();
    const iv = setInterval(pushLine, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [active, lang, classId, lines, emit]);
}
