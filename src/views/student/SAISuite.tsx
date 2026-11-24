"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles, ScanLine, Gauge, Mic, BarChart3, CalendarClock, Network, Layers, FileCheck2, BrainCircuit, HeartHandshake, Languages, ArrowLeft, Upload, Loader2, CheckCircle2, XCircle, RefreshCw, Square, Copy, Camera,
} from "lucide-react";

/* ---------------- tool catalogue (Screen 42) ---------------- */
type ToolId = "tutor" | "doubt" | "practice" | "reading" | "mock" | "planner" | "map" | "cards" | "grader" | "coach" | "insights" | "language";
const TOOLS: { id: ToolId; title: string; desc: string; color: string; badge: "AI" | "NEW"; icon: React.ComponentType<{ className?: string }>; audience?: string }[] = [
  { id: "tutor", title: "Live AI Tutor", desc: "Talk to Maya, face to face, in your language", color: "#6D4AE0", badge: "NEW", icon: Sparkles },
  { id: "doubt", title: "Doubt Scanner", desc: "Photo of a problem to step-by-step help", color: "#4A62D8", badge: "AI", icon: ScanLine },
  { id: "practice", title: "Adaptive Practice", desc: "Questions that match your level", color: "#1F9D6B", badge: "AI", icon: Gauge },
  { id: "reading", title: "Voice Reading Coach", desc: "Read aloud; fix pronunciation", color: "#F26B1D", badge: "NEW", icon: Mic },
  { id: "mock", title: "Mock Test Analyzer", desc: "Topic-wise gaps after every test", color: "#142366", badge: "AI", icon: BarChart3 },
  { id: "planner", title: "Study Planner", desc: "Boards, JEE, NEET and Olympiad plans", color: "#13A39E", badge: "AI", icon: CalendarClock },
  { id: "map", title: "Concept Maps", desc: "One-click mind maps for chapters", color: "#E9A04B", badge: "AI", icon: Network },
  { id: "cards", title: "Flashcards", desc: "Spaced revision from your mistakes", color: "#D64545", badge: "AI", icon: Layers },
  { id: "grader", title: "Answer-sheet Grader", desc: "Handwritten answers with rubric", color: "#6D4AE0", badge: "NEW", icon: FileCheck2, audience: "For tutors" },
  { id: "coach", title: "Teaching Coach", desc: "Strategies per student, role-play", color: "#142366", badge: "NEW", icon: BrainCircuit, audience: "For tutors" },
  { id: "insights", title: "Parent Insights", desc: "Plain-language progress and tips", color: "#1F9D6B", badge: "AI", icon: HeartHandshake, audience: "For parents" },
  { id: "language", title: "Language Buddy", desc: "Hinglish, Hindi, Kannada, Tamil, Telugu", color: "#F26B1D", badge: "AI", icon: Languages },
];

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
  return j.data as T;
}

/* ======================================================================= */

export function SAISuite() {
  const { setView, context } = useAppStore();
  const [tool, setTool] = useState<ToolId | null>(null);
  const [stats, setStats] = useState<{ doubts: number; avg: number; escalated: number; sessions: number } | null>(null);

  useEffect(() => {
    const ts = Number(context?.suiteAt ?? 0);
    if (context?.suiteTool && Date.now() - ts < 6000) setTool(context.suiteTool as ToolId);
  }, [context?.suiteTool, context?.suiteAt]);

  useEffect(() => {
    fetch("/api/ai-tutor", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const s = (j?.data ?? []) as { understanding: number; flagged: boolean; transcript: { role: string; at: string }[] }[];
        const weekAgo = Date.now() - 7 * 86400000;
        const doubts = s.reduce((a, x) => a + x.transcript.filter((t) => t.role === "student" && new Date(t.at).getTime() > weekAgo).length, 0);
        setStats({ doubts, avg: s.length ? Math.round(s.reduce((a, x) => a + x.understanding, 0) / s.length) : 0, escalated: s.filter((x) => x.flagged).length, sessions: s.length });
      })
      .catch(() => setStats({ doubts: 0, avg: 0, escalated: 0, sessions: 0 }));
  }, []);

  const open = (id: ToolId) => {
    if (id === "tutor") return setView("s-ai-tutor");
    if (id === "planner") return setView("s-planner");
    if (id === "cards") return setView("s-flashcards");
    if (id === "grader" || id === "coach" || id === "insights") return toast({ title: TOOLS.find((t) => t.id === id)!.audience!, description: `${TOOLS.find((t) => t.id === id)!.title} lives in the ${id === "insights" ? "parent" : "tutor"} workspace and works on your data with consent.` });
    setTool(id);
  };

  const active = TOOLS.find((t) => t.id === tool);

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="learning"
        icon={Sparkles}
        trail={["AI Tutor"]}
        title={active ? active.title : "AI Learning Suite"}
        subtitle={active ? active.desc : "Everything that helps you understand faster, in one place. Every tool is explainable and teacher-visible."}
        pills={[{ label: "AI", tone: "ai" }, { label: "Parent-visible history", tone: "verified" }]}
        actions={active ? <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setTool(null)}><ArrowLeft className="w-3.5 h-3.5" /> All tools</button> : undefined}
      />

      {!active ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AccentKpi label="Doubts asked this week" value={stats?.doubts ?? "—"} />
            <AccentKpi label="Avg understanding" value={stats ? `${stats.avg}%` : "—"} sub="from Maya's checks" />
            <AccentKpi label="Sessions with Maya" value={stats?.sessions ?? "—"} />
            <AccentKpi label="Wellbeing checks" value={stats?.escalated ?? "—"} sub="guardian alerted when needed" />
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {TOOLS.map((t) => (
              <div key={t.id} className="sk-card p-4 flex flex-col">
                <div className="flex items-start justify-between">
                  <span className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-white" style={{ background: t.color }}>
                    <t.icon className="w-5 h-5" />
                  </span>
                  <span className={clsx("px-2 py-[2px] rounded-full text-[10px] font-bold border", t.badge === "AI" ? "bg-[#EFEAFD] text-[#6D4AE0] border-[#DCD2FB]" : "bg-[#FFF1E6] text-[#D9580E] border-[#FBD9C0]")}>{t.badge}</span>
                </div>
                <div className="text-[14px] font-extrabold text-[#142366] mt-3">{t.title}</div>
                <div className="text-[12px] text-muted-foreground flex-1">{t.desc}</div>
                {t.audience && <div className="text-[10.5px] font-bold text-[#A86A12] mt-1">{t.audience}</div>}
                <button className="self-start mt-3 px-4 py-1.5 rounded-full border text-[12px] font-bold text-[#142366] hover:border-[#B9C6E4]" style={{ borderColor: "var(--border)" }} onClick={() => open(t.id)}>
                  Open
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground text-center">AI assists and explains — it never grades you, decides admissions or replaces your tutor. Not sure? Every tool offers your human tutor.</p>
        </>
      ) : tool === "doubt" ? (
        <DoubtScanner />
      ) : tool === "practice" ? (
        <AdaptivePractice />
      ) : tool === "reading" ? (
        <ReadingCoach />
      ) : tool === "mock" ? (
        <MockAnalyzer />
      ) : tool === "map" ? (
        <ConceptMap />
      ) : (
        <LanguageBuddy />
      )}
    </div>
  );
}

/* ---------------- Doubt Scanner ---------------- */
function DoubtScanner() {
  const [img, setImg] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ problem: string; topic: string; steps: string[]; check: string; confidence: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      /* downscale to keep the upload small */
      const im = new Image();
      im.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = im.width * scale;
        c.height = im.height * scale;
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        setImg(c.toDataURL("image/jpeg", 0.85));
      };
      im.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  };
  const scan = async () => {
    setBusy(true);
    setOut(null);
    try {
      setOut(await post("/api/ai-suite/doubt", { image: img, note }));
    } catch (e) {
      toast({ title: "Couldn't read the doubt", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="sk-card p-5 space-y-3">
        <div
          className="sk-well min-h-[240px] flex items-center justify-center cursor-pointer overflow-hidden"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          {img ? <img src={img} alt="Your problem" className="max-h-[320px] object-contain" /> : (
            <div className="text-center text-[12.5px] text-muted-foreground p-6">
              <Camera className="w-8 h-8 mx-auto mb-2 text-[#4A62D8]" />
              Take a photo or drop an image of one problem
              <div className="text-[11px] mt-1">Crop to just the question for best results</div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <textarea className="sk-input min-h-[70px]" placeholder="Or type the problem / add a note (e.g. “I'm stuck at step 2”)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <button className="sk-btn sk-btn-ghost" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" /> Choose photo</button>
          <button className="sk-btn sk-btn-primary flex-1" disabled={busy || (!img && !note.trim())} onClick={scan}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} Scan my doubt</button>
        </div>
      </div>
      <div className="sk-card p-5">
        {!out ? (
          busy ? <LoadingView label="Reading your problem…" /> : <EmptyState icon={ScanLine} title="Step-by-step help appears here" sub="Grounded explanation, then one question to check you understood. Graded homework stops before the final answer." />
        ) : (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{out.topic}</div>
            <div className="text-[15px] font-extrabold text-[#142366] mt-1">{out.problem}</div>
            <ol className="mt-4 space-y-2.5">
              {out.steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13px]"><span className="w-6 h-6 rounded-full bg-[#4A62D8] text-white text-[11.5px] font-bold flex items-center justify-center shrink-0">{i + 1}</span><span>{s.replace(/^\d+[.)]\s*/, "")}</span></li>
              ))}
            </ol>
            <div className="mt-4 rounded-xl bg-[#FFF8EC] border border-[#F3DFB8] p-3 text-[12.5px]"><b>Check yourself:</b> {out.check}</div>
            {out.confidence !== "high" && <p className="text-[11.5px] text-[#A86A12] mt-2">Maya isn't fully sure about this one — please confirm with your tutor.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Adaptive Practice ---------------- */
function AdaptivePractice() {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState(2);
  const [q, setQ] = useState<{ q: string; options: string[]; answer: number; explanation: string; level: number; source: string } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 });
  const [busy, setBusy] = useState(false);

  const next = async (lvl = level) => {
    setBusy(true);
    setPicked(null);
    try {
      setQ(await post("/api/ai-suite/practice", { subject: "Mathematics", topic, level: lvl, seed: Math.floor(Math.random() * 1e6) }));
    } catch (e) {
      toast({ title: "Couldn't load a question", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void next(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    const ok = i === q.answer;
    const streak = ok ? score.streak + 1 : 0;
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1, streak }));
    /* rises after two in a row, falls after a miss */
    setLevel((l) => (ok && streak >= 2 ? Math.min(5, l + 1) : !ok ? Math.max(1, l - 1) : l));
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 sk-card p-5">
        <div className="flex flex-wrap gap-2 items-center">
          <input className="sk-input !py-1.5 flex-1 min-w-[200px]" placeholder="Topic (optional) — e.g. Linear equations" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => next()}><RefreshCw className="w-3.5 h-3.5" /> New question</button>
        </div>
        {busy || !q ? (
          <LoadingView label="Choosing a question at your level…" />
        ) : (
          <div className="mt-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Level {q.level} of 5 · {q.source === "ai" ? "AI-written" : "verified bank"}</div>
            <div className="text-[17px] font-bold text-[#142366] mt-2 leading-snug">{q.q}</div>
            <div className="grid sm:grid-cols-2 gap-2 mt-4">
              {q.options.map((o, i) => (
                <button key={i} onClick={() => choose(i)} className={clsx("text-left px-4 py-3 rounded-2xl border text-[14px] font-semibold transition-colors", picked === null ? "bg-white hover:border-[#B9C6E4]" : i === q.answer ? "bg-[#E6F6EE] border-[#7FD1A9]" : i === picked ? "bg-[#FDECEC] border-[#F1A9A9]" : "bg-white opacity-60")} style={picked === null ? { borderColor: "var(--border)" } : undefined}>
                  <span className="text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>{o}
                </button>
              ))}
            </div>
            {picked !== null && (
              <div className="mt-4 rounded-xl p-3 text-[13px] flex gap-2" style={{ background: picked === q.answer ? "#E6F6EE" : "#FFF5F5" }}>
                {picked === q.answer ? <CheckCircle2 className="w-5 h-5 text-[#1F9D6B] shrink-0" /> : <XCircle className="w-5 h-5 text-[#D64545] shrink-0" />}
                <div><b>{picked === q.answer ? "Correct!" : "Not quite."}</b> {q.explanation}</div>
              </div>
            )}
            {picked !== null && <button className="sk-btn sk-btn-primary mt-4" onClick={() => next()}>Next question</button>}
          </div>
        )}
      </div>
      <div className="sk-card p-5 space-y-3">
        <div className="text-[14px] font-extrabold text-[#142366]">Your level</div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((l) => <div key={l} className="flex-1 h-3 rounded-full" style={{ background: l <= level ? "#1F9D6B" : "#E8EDF8" }} />)}
        </div>
        <div className="text-[12.5px] text-muted-foreground">Two correct in a row moves you up; a miss brings an easier question so you rebuild confidence.</div>
        <div className="grid grid-cols-3 gap-2 text-center pt-2">
          <div className="sk-well p-2"><div className="text-[18px] font-extrabold tabular">{score.right}/{score.total}</div><div className="text-[10.5px] text-muted-foreground">correct</div></div>
          <div className="sk-well p-2"><div className="text-[18px] font-extrabold tabular">{score.total ? Math.round((score.right / score.total) * 100) : 0}%</div><div className="text-[10.5px] text-muted-foreground">accuracy</div></div>
          <div className="sk-well p-2"><div className="text-[18px] font-extrabold tabular">{score.streak}</div><div className="text-[10.5px] text-muted-foreground">streak</div></div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Voice Reading Coach ---------------- */
const PASSAGES = [
  { lang: "en-IN", label: "English", text: "The monsoon arrived early this year. Farmers in the village were happy because the fields needed water. Children splashed in the puddles on their way to school." },
  { lang: "hi-IN", label: "हिन्दी", text: "बरसात का मौसम आ गया है। खेतों में हरियाली छा गई है और किसान बहुत खुश हैं। बच्चे स्कूल जाते समय पानी में खेलते हैं।" },
  { lang: "en-IN", label: "Science", text: "Light travels in a straight line. When light falls on a mirror, it bounces back. This is called reflection of light." },
];
function ReadingCoach() {
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState("");
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);
  const [t0, setT0] = useState(0);
  const [secs, setSecs] = useState(0);
  const p = PASSAGES[idx];
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  const target = useMemo(() => norm(p.text), [p.text]);
  const said = new Set(norm(heard));
  const correct = target.filter((w) => said.has(w)).length;
  const missed = target.filter((w) => !said.has(w));

  const start = () => {
    const W = window as unknown as { SpeechRecognition?: new () => never; webkitSpeechRecognition?: new () => never };
    const Ctor = (W.SpeechRecognition ?? W.webkitSpeechRecognition) as unknown as (new () => { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void }) | undefined;
    if (!Ctor) return toast({ title: "Voice input isn't supported in this browser", description: "Try Chrome on Android or desktop." });
    const r = new Ctor();
    r.lang = p.lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => setHeard(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => {
      setRec(null);
      setSecs((Date.now() - t0) / 1000);
    };
    setHeard("");
    const now = Date.now();
    setT0(now);
    setSecs(0);
    r.start();
    setRec(r);
  };
  const stop = () => {
    rec?.stop();
    setSecs((Date.now() - t0) / 1000);
  };
  const wpm = secs > 2 ? Math.round((norm(heard).length / secs) * 60) : 0;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 sk-card p-5">
        <div className="flex gap-1.5 mb-4">
          {PASSAGES.map((x, i) => <button key={i} className={clsx("sk-chip", idx === i && "sk-chip-active")} onClick={() => { setIdx(i); setHeard(""); }}>{x.label}</button>)}
        </div>
        <p className="text-[20px] leading-relaxed">
          {p.text.split(/(\s+)/).map((tok, i) => {
            const w = norm(tok)[0];
            if (!w) return tok;
            const hit = heard && said.has(w);
            return <span key={i} className={clsx("rounded px-0.5", heard ? (hit ? "bg-[#E6F6EE] text-[#1F7A55]" : "bg-[#FFF1E6] text-[#D9580E]") : "")}>{tok}</span>;
          })}
        </p>
        <div className="flex gap-2 mt-5">
          {rec ? <button className="sk-btn sk-btn-danger" onClick={stop}><Square className="w-4 h-4" /> Stop</button> : <button className="sk-btn sk-btn-orange" onClick={start}><Mic className="w-4 h-4" /> Start reading aloud</button>}
          <button className="sk-btn sk-btn-ghost" onClick={() => { const u = new SpeechSynthesisUtterance(p.text); u.lang = p.lang; u.rate = 0.9; speechSynthesis.speak(u); }}>Hear it first</button>
        </div>
        {heard && <p className="text-[12px] text-muted-foreground mt-3">Heard: “{heard}”</p>}
      </div>
      <div className="sk-card p-5 space-y-3">
        <div className="text-[14px] font-extrabold text-[#142366]">Your reading</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="sk-well p-3"><div className="text-[22px] font-extrabold tabular">{target.length ? Math.round((correct / target.length) * 100) : 0}%</div><div className="text-[10.5px] text-muted-foreground">words matched</div></div>
          <div className="sk-well p-3"><div className="text-[22px] font-extrabold tabular">{wpm || "—"}</div><div className="text-[10.5px] text-muted-foreground">words / min</div></div>
        </div>
        {heard && missed.length > 0 && (
          <div>
            <div className="text-[12px] font-bold">Practise these words</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[...new Set(missed)].slice(0, 10).map((w) => (
                <button key={w} className="px-2 py-[2px] rounded-full bg-[#FFF1E6] text-[#D9580E] text-[12px] font-semibold" onClick={() => { const u = new SpeechSynthesisUtterance(w); u.lang = p.lang; u.rate = 0.8; speechSynthesis.speak(u); }}>🔊 {w}</button>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Speech is processed by your browser; nothing is recorded or stored.</p>
      </div>
    </div>
  );
}

/* ---------------- Mock Test Analyzer ---------------- */
function MockAnalyzer() {
  const { setView } = useAppStore();
  const [d, setD] = useState<{ tests: { title: string; subject: string; pct: number; takenAt: string }[]; subjects: { name: string; avg: number; last: number; tests: number }[]; gaps: { topic: string; count: number; mastery: number | null }[]; plan: { day: number; task: string; minutes: number }[]; careless: number } | null>(null);
  useEffect(() => {
    fetch("/api/ai-suite/mock", { cache: "no-store" }).then((r) => r.json()).then((j) => setD(j?.data ?? null)).catch(() => {});
  }, []);
  if (!d) return <LoadingView label="Analysing your tests…" />;
  if (!d.tests.length) return <div className="sk-card p-4"><EmptyState icon={BarChart3} title="No tests yet" sub="Take a quick test in Homework & Tests — the analysis appears here." /></div>;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="sk-card p-5 lg:col-span-2">
        <div className="text-[14px] font-extrabold text-[#142366]">Score trend</div>
        <div className="flex items-end gap-2 h-[160px] mt-4">
          {d.tests.slice(-10).map((t, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-[10.5px] font-bold tabular">{t.pct}%</span>
              <div className="w-full rounded-t-lg" style={{ height: `${Math.max(6, t.pct * 1.3)}px`, background: t.pct >= 80 ? "#1F9D6B" : t.pct >= 60 ? "#142366" : "#F26B1D" }} title={t.title} />
              <span className="text-[9.5px] text-muted-foreground truncate w-full text-center">{t.subject.slice(0, 5)}</span>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-2 mt-5">
          {d.subjects.map((s) => (
            <div key={s.name} className="sk-well p-3"><div className="text-[12px] font-bold">{s.name}</div><div className="text-[20px] font-extrabold tabular">{s.avg}%</div><div className="text-[10.5px] text-muted-foreground">{s.tests} tests · last {s.last}%</div></div>
          ))}
        </div>
        {d.careless > 0 && <p className="text-[12px] text-[#A86A12] mt-3">{d.careless} test{d.careless > 1 ? "s" : ""} scored 70–89% — likely careless slips. Re-check units and signs before submitting.</p>}
      </div>
      <div className="space-y-4">
        <div className="sk-card p-5">
          <div className="text-[14px] font-extrabold text-[#142366]">Topic gaps</div>
          <div className="space-y-2 mt-3">
            {d.gaps.map((g) => (
              <div key={g.topic} className="flex items-center justify-between gap-2 text-[12.5px]"><span className="truncate">{g.topic}</span><span className="sk-pill sk-pill-orange !text-[10px] shrink-0">{g.mastery != null ? `${g.mastery}% mastery` : `${g.count}× missed`}</span></div>
            ))}
          </div>
        </div>
        <div className="sk-card p-5">
          <div className="text-[14px] font-extrabold text-[#142366]">Recovery plan</div>
          <ol className="mt-3 space-y-2 text-[12.5px]">
            {d.plan.map((p) => <li key={p.day}><b>Day {p.day}</b> · {p.task} <span className="text-muted-foreground">({p.minutes} min)</span></li>)}
          </ol>
          <button className="sk-btn sk-btn-sm sk-btn-primary mt-3" onClick={() => setView("s-planner")}>Add to my study planner</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Concept Maps ---------------- */
interface MapNode { label: string; children?: MapNode[] }
function ConceptMap() {
  const [subject, setSubject] = useState("Science");
  const [topic, setTopic] = useState("Light");
  const [m, setM] = useState<{ root: string; children: MapNode[]; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      setM(await post("/api/ai-suite/concept-map", { subject, topic }));
    } catch (e) {
      toast({ title: "Couldn't build the map", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const colors = ["#6D4AE0", "#1F9D6B", "#F26B1D", "#4A62D8", "#D64545", "#13A39E"];
  return (
    <div className="sk-card p-5">
      <div className="flex flex-wrap gap-2">
        <select className="sk-input !w-auto !py-1.5" value={subject} onChange={(e) => setSubject(e.target.value)}>{["Mathematics", "Science", "English", "Social Science"].map((s) => <option key={s}>{s}</option>)}</select>
        <input className="sk-input !py-1.5 flex-1 min-w-[200px]" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Chapter or topic" />
        <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={go} disabled={busy || !topic.trim()}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />} Build map</button>
      </div>
      {m && (
        <div className="mt-6">
          <div className="flex justify-center"><div className="px-5 py-2.5 rounded-2xl bg-[#142366] text-white font-extrabold text-[15px] shadow-lg">{m.root}</div></div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
            {m.children.map((c, i) => (
              <div key={c.label} className="rounded-2xl border-2 p-3" style={{ borderColor: colors[i % colors.length] + "55", background: colors[i % colors.length] + "0D" }}>
                <div className="font-bold text-[13.5px]" style={{ color: colors[i % colors.length] }}>{c.label}</div>
                <ul className="mt-1.5 space-y-1">
                  {(c.children ?? []).map((x) => <li key={x.label} className="text-[12.5px] flex gap-1.5"><span style={{ color: colors[i % colors.length] }}>•</span>{x.label}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">{m.source === "curriculum" ? "Built from the verified curriculum registry." : "AI-drafted — check against your textbook."}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Language Buddy ---------------- */
function LanguageBuddy() {
  const [text, setText] = useState("Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose and release oxygen.");
  const [to, setTo] = useState("hi");
  const [simplify, setSimplify] = useState(false);
  const [out, setOut] = useState<{ text: string; glossary: { term: string; meaning: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      setOut(await post("/api/ai-suite/translate", { text, to, simplify }));
    } catch (e) {
      toast({ title: "Translation unavailable", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const LANGS: [string, string][] = [["hi", "हिन्दी"], ["hinglish", "Hinglish"], ["kn", "ಕನ್ನಡ"], ["ta", "தமிழ்"], ["te", "తెలుగు"], ["ml", "മലയാളം"], ["mr", "मराठी"], ["bn", "বাংলা"], ["en", "Simple English"]];
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="sk-card p-5 space-y-3">
        <textarea className="sk-input min-h-[200px]" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">{LANGS.map(([k, v]) => <button key={k} className={clsx("sk-chip", to === k && "sk-chip-active")} onClick={() => setTo(k)}>{v}</button>)}</div>
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={simplify} onChange={(e) => setSimplify(e.target.checked)} /> Simplify for a younger reader</label>
        <button className="sk-btn sk-btn-primary" onClick={go} disabled={busy || !text.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />} Translate</button>
      </div>
      <div className="sk-card p-5">
        {!out ? <EmptyState icon={Languages} title="Your explanation appears here" sub="Maths and subject terms stay accurate; a glossary explains key words." /> : (
          <>
            <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{out.text}</p>
            <div className="flex gap-2 mt-3">
              <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => navigator.clipboard.writeText(out.text)}><Copy className="w-3.5 h-3.5" /> Copy</button>
            </div>
            {out.glossary.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <div className="text-[12px] font-bold mb-1.5">Glossary</div>
                {out.glossary.map((g) => <div key={g.term} className="text-[12.5px]"><b>{g.term}</b> — {g.meaning}</div>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
