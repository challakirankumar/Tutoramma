"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, HeaderButton } from "@/components/shared/ModuleHeader";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Mic, MicOff, Send, Camera, CameraOff, Volume2, VolumeX, Turtle, Lightbulb, Languages, HelpCircle, Frown, ScanLine, History, Trash2, ShieldCheck, LifeBuoy, X, Loader2 } from "lucide-react";

/* ---------------- types ---------------- */
interface Turn {
  role: "student" | "maya";
  text: string;
  board?: string[];
  at: string;
}
interface Reply {
  sessionId: string;
  say: string;
  board: string[];
  understanding: number;
  distress?: boolean;
  source?: string;
}

const LANGS = [
  { id: "en", label: "English", speech: "en-IN" },
  { id: "hinglish", label: "Hinglish", speech: "en-IN" },
  { id: "hi", label: "हिन्दी", speech: "hi-IN" },
  { id: "kn", label: "ಕನ್ನಡ", speech: "kn-IN" },
  { id: "ta", label: "தமிழ்", speech: "ta-IN" },
  { id: "te", label: "తెలుగు", speech: "te-IN" },
];

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/* ======================================================================= */

export function SAITutor() {
  const { setView } = useAppStore();
  const [tab, setTab] = useState("talk");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [board, setBoard] = useState<string[]>(["Hi! I'm Maya 👋", "Ask me any doubt —", "I'll explain and write it here."]);
  const [understanding, setUnderstanding] = useState(50);
  const [lang, setLang] = useState("en");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [cam, setCam] = useState(false);
  const [distress, setDistress] = useState(false);
  const [mouth, setMouth] = useState(0);
  const recRef = useRef<SR | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  /* lip-sync: animate mouth while speaking */
  useEffect(() => {
    if (!speaking) return setMouth(0);
    const id = setInterval(() => setMouth(0.25 + Math.random() * 0.75), 110);
    return () => clearInterval(id);
  }, [speaking]);

  const speak = useCallback(
    (say: string) => {
      if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(say.replace(/[*_#`]/g, ""));
      const target = LANGS.find((l) => l.id === lang)?.speech ?? "en-IN";
      const voices = window.speechSynthesis.getVoices();
      u.voice = voices.find((v) => v.lang === target && /female|woman|zira|heera|veena|lekha/i.test(v.name)) ?? voices.find((v) => v.lang === target) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
      u.lang = target;
      u.rate = 0.98;
      u.pitch = 1.08;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [voiceOn, lang]
  );

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const ask = useCallback(
    async (message: string, action = "") => {
      if (busy || (!message.trim() && !action)) return;
      setBusy(true);
      const shown = message.trim() || { slower: "Please go slower 🐢", example: "Give me an example 💡", quiz: "Quiz me ❓", confused: "I am confused 😕" }[action] || action;
      setTurns((t) => [...t, { role: "student", text: shown, at: new Date().toISOString() }]);
      setText("");
      try {
        const res = await fetch("/api/ai-tutor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, message, action, language: lang }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error?.message || "Maya couldn't answer");
        const r = j.data as Reply;
        setSessionId(r.sessionId);
        setTurns((t) => [...t, { role: "maya", text: r.say, board: r.board, at: new Date().toISOString() }]);
        if (r.board?.length) setBoard(r.board);
        setUnderstanding(r.understanding);
        if (r.distress) setDistress(true);
        speak(r.say);
      } catch (e) {
        toast({ title: "Maya is unavailable", description: (e as Error).message, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [busy, sessionId, lang, speak]
  );

  /* hold to talk — browser speech recognition */
  const startListening = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      toast({ title: "Voice input isn't supported in this browser", description: "Type your doubt instead — Maya will still talk back." });
      return;
    }
    window.speechSynthesis?.cancel(); // barge-in: interrupt Maya
    const rec = new Ctor();
    rec.lang = LANGS.find((l) => l.id === lang)?.speech ?? "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      finalText = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setText(finalText);
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) void ask(finalText);
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  const stopListening = () => recRef.current?.stop();

  const toggleCam = async () => {
    if (cam) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCam(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      streamRef.current = s;
      setCam(true);
      setTimeout(() => videoRef.current && (videoRef.current.srcObject = s), 50);
    } catch {
      toast({ title: "Camera not available", description: "Maya works fine without it." });
    }
  };

  const quick = [
    { id: "slower", label: "Slower", icon: Turtle },
    { id: "example", label: "Give an example", icon: Lightbulb },
    { id: "lang", label: "Explain in Hindi", icon: Languages },
    { id: "quiz", label: "Quiz me", icon: HelpCircle },
    { id: "confused", label: "I am confused", icon: Frown },
    { id: "scan", label: "Scan my doubt", icon: ScanLine },
  ];

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="learning"
        icon={Sparkles}
        trail={["AI Tutor"]}
        title="Live AI Tutor · Maya"
        subtitle="Talk to Maya about any doubt. She listens, explains out loud, writes on the board and checks that you understood."
        pills={[{ label: busy ? "Thinking" : speaking ? "Speaking" : "Live", tone: "live" }, { label: "AI", tone: "ai" }, { label: "NEW", tone: "new" }]}
        actions={
          <>
            <HeaderButton onClick={() => setTab("history")}><History className="w-3.5 h-3.5" /> History</HeaderButton>
            <HeaderButton variant="orange" onClick={() => setView("s-messages")}>Ask my tutor instead</HeaderButton>
          </>
        }
        tabs={[
          { id: "talk", label: "Talk" },
          { id: "history", label: "History" },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {distress && (
        <div className="rounded-2xl p-4 bg-[#FFF5F5] border border-[#F6CFCF] flex gap-3" role="alert">
          <LifeBuoy className="w-6 h-6 text-[#C03342] shrink-0" />
          <div className="text-[13px] text-[#5C1A22]">
            <b>You are not alone.</b> Maya paused the lesson and let your parent and our safety team know. If you are in danger call <b>112</b>. Childline <b>1098</b> (24×7) · Tele-MANAS <b>14416</b>.
          </div>
          <button className="ml-auto self-start p-1" onClick={() => setDistress(false)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {tab === "history" ? (
        <HistoryPanel />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* -------- avatar + understanding -------- */}
          <div className="xl:col-span-4 space-y-4">
            <div className="rounded-[22px] p-4 relative overflow-hidden aspect-square max-h-[360px] w-full" style={{ background: "radial-gradient(circle at 50% 35%, #2B3E8F 0%, #172867 55%, #0E1A52 100%)" }}>
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#D7F5E5] text-[#1F7A55]">
                {listening ? "Listening…" : speaking ? "Speaking" : busy ? "Thinking…" : "Ready"} · {LANGS.find((l) => l.id === lang)?.label}
              </span>
              <MayaAvatar mouth={mouth} thinking={busy} listening={listening} />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-[3px] h-6 items-end" aria-hidden>
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={i} className="w-[4px] rounded-full bg-[#9DB4FF] transition-all duration-100" style={{ height: speaking || listening ? `${6 + Math.abs(Math.sin(Date.now() / 120 + i)) * 18 * (0.4 + mouth)}px` : "5px", opacity: speaking || listening ? 1 : 0.4 }} />
                ))}
              </div>
              {cam && <video ref={videoRef} autoPlay muted playsInline className="absolute right-3 top-3 w-[88px] h-[66px] rounded-xl object-cover border-2 border-white/60 -scale-x-100" />}
            </div>
            <div className="sk-card p-4">
              <div className="text-[14px] font-extrabold text-[#142366]">Understanding meter</div>
              <div className="text-[30px] font-extrabold tabular text-[#F26B1D] leading-tight">{understanding}%</div>
              <div className="h-[8px] rounded-full bg-[#E8EDF8] overflow-hidden">
                <div className="h-full rounded-full bg-[#F26B1D] transition-all duration-700" style={{ width: `${understanding}%` }} />
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-2">
                {understanding < 45 ? "Maya will slow down and re-explain with a picture or example." : understanding < 75 ? "Getting there — Maya will check with a quick question." : "Great grip — Maya may offer a challenge question."}
              </p>
            </div>
          </div>

          {/* -------- whiteboard + quick actions -------- */}
          <div className="xl:col-span-5 space-y-4">
            <div className="sk-card p-5 min-h-[300px]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-extrabold text-[#142366]">Shared whiteboard</div>
                <select className="text-[11px] font-semibold rounded-full bg-[#EEF2FA] px-2.5 py-1 border-0" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
                  {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div className="mt-5 space-y-3 pl-2" aria-live="polite">
                {board.map((line, i) => (
                  <div key={`${line}-${i}`} className="ta-board-line text-[19px] sm:text-[21px] leading-snug text-[#142366]" style={{ animationDelay: `${i * 0.35}s`, fontWeight: i === 0 ? 800 : 500 }}>
                    {colorise(line)}
                  </div>
                ))}
              </div>
            </div>
            <div className="sk-card p-4">
              <div className="text-[14px] font-extrabold text-[#142366] mb-2">Quick actions</div>
              <div className="flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <button
                    key={q.id}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EEF2FA] text-[#22357F] text-[11.5px] font-semibold hover:bg-[#E2E9F8] disabled:opacity-50"
                    onClick={() => {
                      if (q.id === "scan") return setView("s-ai-suite", { suiteTool: "doubt", suiteAt: Date.now() });
                      if (q.id === "lang") {
                        setLang("hi");
                        return ask("Please explain that again in Hindi.");
                      }
                      void ask("", q.id);
                    }}
                  >
                    <q.icon className="w-3.5 h-3.5" /> {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* -------- conversation + controls -------- */}
          <div className="xl:col-span-3 space-y-4">
            <div className="sk-card p-4 flex flex-col h-[360px]">
              <div className="text-[14px] font-extrabold text-[#142366] mb-2">Conversation</div>
              <div className="flex-1 overflow-y-auto sk-scroll space-y-2 pr-1">
                {turns.length === 0 && <p className="text-[12px] text-muted-foreground">Try: “Why is 45 divided by 3 first?” or “Explain photosynthesis simply”.</p>}
                {turns.map((t, i) =>
                  t.role === "student" ? (
                    <div key={i} className="ml-auto max-w-[90%] rounded-2xl px-3 py-2 bg-[#142366] text-white text-[12.5px]">{t.text}</div>
                  ) : (
                    <div key={i} className="max-w-[95%] rounded-2xl px-3 py-2 bg-[#F1ECFE] text-[12.5px]">
                      <div className="text-[11px] font-bold text-[#6D4AE0]">Maya</div>
                      {t.text}
                    </div>
                  )
                )}
                {busy && <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Maya is thinking…</div>}
                <div ref={endRef} />
              </div>
              <div className="flex gap-1.5 mt-2">
                <input className="sk-input !py-2 !text-[12.5px]" placeholder="Type your doubt…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(text)} />
                <button className="sk-btn sk-btn-primary sk-btn-sm" disabled={busy || !text.trim()} onClick={() => ask(text)} aria-label="Send"><Send className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="rounded-[18px] p-4 bg-[#FFF8EC] border border-[#F3DFB8] text-[11.5px] text-[#5E4A1F] space-y-1">
              <div className="text-[13px] font-extrabold text-[#142366] flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Safety and privacy</div>
              <div>✓ Explains steps; does not hand over final homework answers</div>
              <div>✓ Camera is optional and never recorded or uploaded</div>
              <div>✓ Your parent can read the transcript</div>
              <div>✓ Not sure? Maya says so and offers your tutor</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={clsx("flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-white text-[13px] font-bold select-none touch-none", listening ? "bg-[#D64545]" : "bg-[#F26B1D]")}
                onPointerDown={startListening}
                onPointerUp={stopListening}
                onPointerLeave={() => listening && stopListening()}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {listening ? "Release to send" : "Hold to talk"}
              </button>
              <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={toggleCam}>{cam ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />} {cam ? "Camera off" : "Camera"}</button>
              <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => { setVoiceOn((v) => !v); window.speechSynthesis?.cancel(); }} aria-label={voiceOn ? "Mute Maya" : "Unmute Maya"}>
                {voiceOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Highlights the result after "=" in orange/green like the reference whiteboard. */
function colorise(line: string) {
  const i = line.lastIndexOf("=");
  if (i < 0) return line;
  return (
    <>
      {line.slice(0, i + 1)}
      <span className="font-extrabold text-[#F26B1D]">{line.slice(i + 1)}</span>
    </>
  );
}

/* ---------------- animated avatar ---------------- */
function MayaAvatar({ mouth, thinking, listening }: { mouth: number; thinking: boolean; listening: boolean }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200 + Math.random() * 1500);
    return () => clearInterval(id);
  }, []);
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 m-auto w-[68%] h-[68%]" role="img" aria-label="Maya, the AI tutor">
      <circle cx="100" cy="100" r="92" fill={listening ? "#FF9A4D" : "#5A7BF0"} opacity="0.16" className={clsx(listening && "animate-pulse")} />
      <path d="M48 92 C 48 40, 152 40, 152 92 L 152 120 C 140 104, 60 104, 48 120 Z" fill="#2A1A14" />
      <ellipse cx="100" cy="108" rx="48" ry="54" fill="#E8B48A" />
      <path d="M52 96 C 60 54, 140 54, 148 96 C 132 76, 70 76, 52 96 Z" fill="#2A1A14" />
      {blink ? (
        <>
          <path d="M76 104 Q 82 106 88 104" stroke="#2A1A14" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M112 104 Q 118 106 124 104" stroke="#2A1A14" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="82" cy="104" rx="5" ry={thinking ? 4 : 5.5} fill="#2A1A14" />
          <ellipse cx="118" cy="104" rx="5" ry={thinking ? 4 : 5.5} fill="#2A1A14" />
          <circle cx="84" cy="102" r="1.4" fill="#fff" />
          <circle cx="120" cy="102" r="1.4" fill="#fff" />
        </>
      )}
      <path d={thinking ? "M74 92 Q 82 88 90 92" : "M74 94 Q 82 90 90 94"} stroke="#2A1A14" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d={thinking ? "M110 90 Q 118 86 126 92" : "M110 94 Q 118 90 126 94"} stroke="#2A1A14" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="72" cy="124" r="7" fill="#F29B85" opacity="0.45" />
      <circle cx="128" cy="124" r="7" fill="#F29B85" opacity="0.45" />
      <ellipse cx="100" cy="134" rx={11 + mouth * 3} ry={2.5 + mouth * 9} fill="#B8424C" />
      {mouth < 0.15 && <path d="M88 132 Q 100 142 112 132" stroke="#B8424C" strokeWidth="4" fill="none" strokeLinecap="round" />}
      <circle cx="148" cy="112" r="4" fill="#F26B1D" />
    </svg>
  );
}

/* ---------------- history ---------------- */
function HistoryPanel() {
  const [list, setList] = useState<{ id: string; topic: string; understanding: number; flagged: boolean; updatedAt: string; transcript: Turn[] }[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => fetch("/api/ai-tutor", { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j?.data ?? [])).catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);
  const del = async (id: string) => {
    if (!confirm("Delete this conversation and Maya's memory of it?")) return;
    await fetch(`/api/ai-tutor?id=${id}`, { method: "DELETE" });
    toast({ title: "Conversation deleted" });
    void load();
  };
  if (!list) return <div className="sk-card p-6"><div className="h-24 ta-shimmer rounded-xl" /></div>;
  if (!list.length) return <div className="sk-card p-6 text-[12.5px] text-muted-foreground text-center">No conversations yet — start talking to Maya.</div>;
  return (
    <div className="space-y-2.5">
      <p className="text-[12px] text-muted-foreground">Your parent can read these transcripts. You or your parent can delete any conversation.</p>
      {list.map((s) => (
        <div key={s.id} className="sk-card p-4">
          <div className="flex items-center gap-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <div className="font-bold text-[#142366] truncate">{s.topic || "Doubt session"}</div>
              <div className="text-[11.5px] text-muted-foreground">{new Date(s.updatedAt).toLocaleString("en-IN")} · {s.transcript.length} messages · understanding {s.understanding}%{s.flagged && " · wellbeing check"}</div>
            </button>
            <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => del(s.id)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {open === s.id && (
            <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              {s.transcript.map((t, i) => (
                <div key={i} className="text-[12.5px]"><b className={t.role === "maya" ? "text-[#6D4AE0]" : "text-[#142366]"}>{t.role === "maya" ? "Maya" : "You"}:</b> {t.text}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
