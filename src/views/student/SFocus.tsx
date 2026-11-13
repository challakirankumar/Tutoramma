"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { LoadingView, SectionTitle } from "@/components/shared/Section";
import { KpiCard } from "@/components/shared/KpiCard";
import { toast } from "@/hooks/use-toast";
import { useAppStore } from "@/stores/app-store";
import { Timer, Play, Pause, RotateCcw, SkipForward, Flame, Clock, CalendarDays, Target, Volume2, VolumeX, CloudRain, Waves, Wind, Coffee, Brain } from "lucide-react";

/* ---------------- types ---------------- */
interface FocusStats {
  todayMinutes: number;
  weekMinutes: number;
  totalMinutes: number;
  sessionsCount: number;
  streak: number;
  heatmap: Record<string, number>;
  subjects: { name: string; minutes: number }[];
  recent: { id: string; minutes: number; label: string; subject: string; createdAt: string }[];
}

const PRESETS = [
  { id: "pomodoro", label: "Pomodoro", focus: 25, rest: 5, icon: Timer },
  { id: "deep", label: "Deep work", focus: 50, rest: 10, icon: Brain },
  { id: "sprint", label: "Sprint", focus: 15, rest: 3, icon: Flame },
] as const;
const SUBJECTS = ["Mathematics", "Science", "English", "Social Science", "Languages", "Other"];
const GOALS = [30, 60, 90, 120, 180];
const STORE_KEY = "ta-focus-timer";
const GOAL_KEY = "ta-focus-goal";

type Phase = "focus" | "break";
interface TimerState {
  phase: Phase;
  running: boolean;
  endsAt: number | null; // epoch ms while running
  remaining: number; // seconds while paused
  total: number; // seconds of the current phase
  preset: string;
  subject: string;
  intention: string;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/* ---------------- ambient sound (generated, no assets) ---------------- */
type Ambient = "off" | "brown" | "rain" | "ocean";
function useAmbient() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ stop: () => void } | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [kind, setKind] = useState<Ambient>("off");
  const [volume, setVolume] = useState(0.5);

  const stop = useCallback(() => {
    nodesRef.current?.stop();
    nodesRef.current = null;
  }, []);

  const play = useCallback(
    (k: Ambient) => {
      stop();
      setKind(k);
      if (k === "off") return;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = ctxRef.current ?? new Ctx();
      ctxRef.current = ctx;
      void ctx.resume();
      const len = 2 * ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        if (k === "brown" || k === "ocean") {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        } else data[i] = white * 0.35;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = k === "rain" ? "highpass" : "lowpass";
      filter.frequency.value = k === "rain" ? 900 : k === "ocean" ? 700 : 500;
      const gain = ctx.createGain();
      gain.gain.value = volume * (k === "rain" ? 0.5 : 0.9);
      gainRef.current = gain;
      src.connect(filter).connect(gain).connect(ctx.destination);
      let lfo: OscillatorNode | null = null;
      if (k === "ocean") {
        // slow swell: modulate gain with a 0.12 Hz LFO
        lfo = ctx.createOscillator();
        lfo.frequency.value = 0.12;
        const depth = ctx.createGain();
        depth.gain.value = volume * 0.6;
        lfo.connect(depth).connect(gain.gain);
        lfo.start();
      }
      src.start();
      nodesRef.current = {
        stop: () => {
          try {
            src.stop();
            lfo?.stop();
          } catch {}
          src.disconnect();
        },
      };
    },
    [stop, volume]
  );

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume * (kind === "rain" ? 0.5 : 0.9);
  }, [volume, kind]);
  useEffect(() => () => stop(), [stop]);

  const chime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = ctxRef.current ?? new Ctx();
      ctxRef.current = ctx;
      [660, 880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.type = "sine";
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.9);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.18);
        o.stop(ctx.currentTime + i * 0.18 + 1);
      });
    } catch {}
  }, []);

  return { kind, play, volume, setVolume, chime };
}

/* ======================================================================= */

export function SFocus() {
  const { context } = useAppStore();
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [goal, setGoal] = useState(60);
  const [t, setT] = useState<TimerState>({ phase: "focus", running: false, endsAt: null, remaining: 25 * 60, total: 25 * 60, preset: "pomodoro", subject: "Mathematics", intention: "" });
  const [now, setNow] = useState(Date.now());
  const ambient = useAmbient();
  const completing = useRef(false);

  const refresh = useCallback(() => {
    fetch("/api/focus", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j?.data && setStats(j.data))
      .catch(() => {});
  }, []);

  /* restore persisted timer + goal */
  useEffect(() => {
    setGoal(load(GOAL_KEY, 60));
    const saved = load<TimerState | null>(STORE_KEY, null);
    if (saved) setT(saved);
    refresh();
  }, [refresh]);

  /* command palette quick-start */
  useEffect(() => {
    const ts = Number(context?.focusAutostart ?? 0);
    if (ts && Date.now() - ts < 4000) setT((s) => (s.running ? s : { ...s, phase: "focus", running: true, endsAt: Date.now() + s.total * 1000 }));
  }, [context?.focusAutostart]);

  useEffect(() => save(STORE_KEY, t), [t]);

  const preset = PRESETS.find((p) => p.id === t.preset) ?? PRESETS[0];
  const remaining = t.running && t.endsAt ? Math.max(0, Math.round((t.endsAt - now) / 1000)) : t.remaining;

  /* tick */
  useEffect(() => {
    if (!t.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [t.running]);

  /* tab title */
  useEffect(() => {
    const base = "Tutor Amma";
    if (t.running) document.title = `${fmt(remaining)} · ${t.phase === "focus" ? "Focus" : "Break"} — ${base}`;
    return () => {
      document.title = base;
    };
  }, [remaining, t.running, t.phase]);

  /* phase completion */
  useEffect(() => {
    if (!t.running || remaining > 0 || completing.current) return;
    completing.current = true;
    ambient.chime();
    const finishedFocus = t.phase === "focus";
    const minutes = Math.round(t.total / 60);
    if (finishedFocus) {
      fetch("/api/focus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes, label: t.intention || `${t.subject} focus`, subject: t.subject }) })
        .then((r) => r.json())
        .then((j) => {
          const xp = j?.data?.xp;
          toast({ title: `Focus block complete — ${minutes} min 🎯`, description: xp ? `+${Math.min(120, minutes)} XP${xp.levelUp ? ` · Level ${xp.level} unlocked!` : ""}. Take a ${preset.rest}-minute break.` : `Take a ${preset.rest}-minute break.` });
          refresh();
        })
        .catch(() => {});
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Focus block complete", { body: "Time for a short break ☕", icon: "/brand/logo-icon.png" });
    } else {
      toast({ title: "Break over", description: "Ready for the next focus block?" });
    }
    const nextPhase: Phase = finishedFocus ? "break" : "focus";
    const total = (nextPhase === "focus" ? preset.focus : preset.rest) * 60;
    setT((s) => ({ ...s, phase: nextPhase, running: finishedFocus, endsAt: finishedFocus ? Date.now() + total * 1000 : null, remaining: total, total }));
    setTimeout(() => (completing.current = false), 500);
  }, [remaining, t, preset, ambient, refresh]);

  const start = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    setT((s) => ({ ...s, running: true, endsAt: Date.now() + s.remaining * 1000 }));
  };
  const pause = () => setT((s) => ({ ...s, running: false, endsAt: null, remaining }));
  const reset = () => setT((s) => ({ ...s, running: false, endsAt: null, phase: "focus", remaining: preset.focus * 60, total: preset.focus * 60 }));
  const skip = () => setT((s) => ({ ...s, endsAt: Date.now(), running: true }));
  const choosePreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setT((s) => ({ ...s, preset: id, phase: "focus", running: false, endsAt: null, remaining: p.focus * 60, total: p.focus * 60 }));
  };

  /* keyboard: space start/pause, r reset */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        if (t.running) pause();
        else start();
      } else if (e.key.toLowerCase() === "r") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pct = t.total ? 1 - remaining / t.total : 0;
  const R = 118;
  const C = 2 * Math.PI * R;
  const isFocus = t.phase === "focus";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Focus Studio</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">Deep-work timer with ambient soundscapes. Every focused minute earns 1 XP and builds your streak.</p>
        </div>
        <span className="sk-pill sk-pill-orange">
          <Flame className="w-3 h-3" /> {stats?.streak ?? 0}-day focus streak
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* ---------- timer ---------- */}
        <div className="xl:col-span-3 sk-card p-6 relative overflow-hidden" style={{ background: isFocus ? "linear-gradient(160deg,#1B2F79 0%,#14246B 60%,#0E1A52 100%)" : "linear-gradient(160deg,#1F9D68 0%,#157A50 100%)" }}>
          <div className="flex flex-wrap gap-1.5 justify-center relative z-10">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => choosePreset(p.id)} disabled={t.running} className={clsx("px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors flex items-center gap-1.5 disabled:opacity-60", t.preset === p.id ? "bg-white text-[#14246B]" : "bg-white/10 text-white hover:bg-white/20")}>
                <p.icon className="w-3.5 h-3.5" /> {p.label} · {p.focus}/{p.rest}
              </button>
            ))}
          </div>

          <div className="relative mx-auto mt-6 w-[270px] h-[270px]">
            <div className="absolute inset-6 rounded-full bg-white/5 ta-breathe" style={{ animationPlayState: t.running ? "running" : "paused" }} />
            <svg viewBox="0 0 270 270" className="w-full h-full -rotate-90">
              <defs>
                <linearGradient id="ta-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={isFocus ? "#FFD86B" : "#FFFFFF"} />
                  <stop offset="100%" stopColor={isFocus ? "#F47B20" : "#B8F0D5"} />
                </linearGradient>
              </defs>
              <circle cx="135" cy="135" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="14" />
              <circle cx="135" cy="135" r={R} fill="none" stroke="url(#ta-ring)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset .3s linear" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <div className="text-[11px] font-bold uppercase tracking-[.2em] text-white/60 flex items-center gap-1">
                {isFocus ? <Brain className="w-3.5 h-3.5" /> : <Coffee className="w-3.5 h-3.5" />} {isFocus ? "Focus" : "Break"}
              </div>
              <div className="text-[58px] font-extrabold tabular leading-none mt-1" aria-live="polite">{fmt(remaining)}</div>
              <div className="text-[12px] text-white/70 mt-2 max-w-[180px] truncate text-center">{t.intention || t.subject}</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-5 relative z-10">
            <button className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" onClick={reset} aria-label="Reset timer">
              <RotateCcw className="w-4.5 h-4.5" />
            </button>
            <button className="w-16 h-16 rounded-full text-[#14246B] flex items-center justify-center shadow-xl active:scale-95 transition-transform" style={{ background: "linear-gradient(180deg,#FFFFFF,#E6ECF8)" }} onClick={t.running ? pause : start} aria-label={t.running ? "Pause" : "Start"}>
              {t.running ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </button>
            <button className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" onClick={skip} aria-label="Skip phase">
              <SkipForward className="w-4.5 h-4.5" />
            </button>
          </div>
          <div className="text-center text-[11px] text-white/50 mt-3">
            <span className="ta-kbd">Space</span> start / pause · <span className="ta-kbd">R</span> reset
          </div>

          {/* ambient */}
          <div className="mt-5 rounded-2xl bg-white/10 p-3 flex items-center gap-2 flex-wrap justify-center relative z-10">
            {(
              [
                ["off", "Silent", VolumeX],
                ["brown", "Brown noise", Wind],
                ["rain", "Rain", CloudRain],
                ["ocean", "Ocean", Waves],
              ] as const
            ).map(([k, label, Icon]) => (
              <button key={k} onClick={() => ambient.play(k)} className={clsx("px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold flex items-center gap-1.5", ambient.kind === k ? "bg-white text-[#14246B]" : "text-white/85 hover:bg-white/10")}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
            {ambient.kind !== "off" && (
              <label className="flex items-center gap-1.5 text-white/80 text-[11px]">
                <Volume2 className="w-3.5 h-3.5" />
                <input type="range" min={0} max={1} step={0.05} value={ambient.volume} onChange={(e) => ambient.setVolume(Number(e.target.value))} className="w-20 accent-white" aria-label="Ambient volume" />
              </label>
            )}
          </div>
        </div>

        {/* ---------- session setup + goal ---------- */}
        <div className="xl:col-span-2 space-y-4">
          <div className="sk-card p-5 space-y-3">
            <SectionTitle title="This session" sub="Name it — a clear intention doubles follow-through." />
            <input className="sk-input" placeholder="I will finish… (e.g. Exercise 14.2, Q1–8)" value={t.intention} maxLength={80} onChange={(e) => setT((s) => ({ ...s, intention: e.target.value }))} />
            <div className="flex flex-wrap gap-1.5">
              {SUBJECTS.map((s) => (
                <button key={s} className={clsx("sk-chip", t.subject === s && "sk-chip-active")} onClick={() => setT((x) => ({ ...x, subject: s }))}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <GoalCard stats={stats} goal={goal} setGoal={(g) => { setGoal(g); save(GOAL_KEY, g); }} />
        </div>
      </div>

      {!stats ? (
        <LoadingView label="Loading your focus history…" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Today" value={`${stats.todayMinutes} min`} sub={`goal ${goal} min`} icon={Clock} tone="orange" />
            <KpiCard label="Last 7 days" value={`${(stats.weekMinutes / 60).toFixed(1)} h`} sub={`${Math.round(stats.weekMinutes / 7)} min/day avg`} icon={CalendarDays} tone="royal" />
            <KpiCard label="Streak" value={`${stats.streak} days`} sub="focus at least once a day" icon={Flame} tone="red" />
            <KpiCard label="16 weeks" value={`${Math.round(stats.totalMinutes / 60)} h`} sub={`${stats.sessionsCount} sessions`} icon={Target} tone="green" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 sk-card p-5">
              <SectionTitle title="Consistency map" sub="Each square is a day — darker means more focused minutes." />
              <Heatmap data={stats.heatmap} />
            </div>
            <div className="sk-card p-5">
              <SectionTitle title="Where your time goes" sub="By subject, last 16 weeks" />
              <div className="space-y-2.5 mt-4">
                {stats.subjects.length === 0 && <div className="text-[12.5px] text-muted-foreground">Complete a focus block to see your split.</div>}
                {stats.subjects.slice(0, 6).map((s, i) => {
                  const max = stats.subjects[0]?.minutes || 1;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-[12px] font-semibold">
                        <span>{s.name}</span>
                        <span className="tabular text-muted-foreground">{(s.minutes / 60).toFixed(1)} h</span>
                      </div>
                      <div className="sk-progress-track mt-1">
                        <div className={clsx("sk-progress-fill", i % 3 === 1 && "sk-progress-fill-orange", i % 3 === 2 && "sk-progress-fill-green")} style={{ width: `${Math.max(4, (s.minutes / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- daily goal ring ---------------- */
function GoalCard({ stats, goal, setGoal }: { stats: FocusStats | null; goal: number; setGoal: (g: number) => void }) {
  const today = stats?.todayMinutes ?? 0;
  const pct = Math.min(1, today / goal);
  const R = 42;
  const C = 2 * Math.PI * R;
  return (
    <div className="sk-card p-5">
      <SectionTitle title="Daily goal" sub={pct >= 1 ? "Goal smashed — brilliant work! 🎉" : `${Math.max(0, goal - today)} min to go today`} />
      <div className="flex items-center gap-5 mt-3">
        <div className="relative w-[104px] h-[104px] shrink-0">
          <svg viewBox="0 0 104 104" className="w-full h-full -rotate-90">
            <circle cx="52" cy="52" r={R} fill="none" stroke="#E8EDF8" strokeWidth="10" />
            <circle cx="52" cy="52" r={R} fill="none" stroke={pct >= 1 ? "#1F9D68" : "#F47B20"} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset .6s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[20px] font-extrabold tabular leading-none">{Math.round(pct * 100)}%</div>
            <div className="text-[10px] text-muted-foreground">{today}/{goal}m</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GOALS.map((g) => (
            <button key={g} className={clsx("sk-chip", goal === g && "sk-chip-active")} onClick={() => setGoal(g)}>
              {g} min
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- heatmap ---------------- */
function Heatmap({ data }: { data: Record<string, number> }) {
  const weeks = 16;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today.getTime() - (weeks * 7 - 1 - (6 - today.getDay())) * 86400000);
  const cols: { date: string; min: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: { date: string; min: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const k = isoDay(day);
      col.push({ date: k, min: data[k] ?? 0, future: day > today });
    }
    cols.push(col);
  }
  const shade = (m: number) => (m === 0 ? "#E8EDF8" : m < 20 ? "#C9D6F5" : m < 45 ? "#8EA8EC" : m < 90 ? "#4A6FE0" : "#14246B");
  return (
    <div className="mt-4 overflow-x-auto sk-scroll">
      <div className="flex gap-[4px] min-w-max">
        <div className="flex flex-col gap-[4px] mr-1 text-[9.5px] text-muted-foreground font-semibold">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="h-[13px] leading-[13px]">{i % 2 ? d : ""}</div>
          ))}
        </div>
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[4px]">
            {col.map((c) => (
              <div key={c.date} className="ta-heat-cell" style={{ background: c.future ? "transparent" : shade(c.min) }} title={c.future ? "" : `${c.date}: ${c.min} min`} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-3 text-[10.5px] text-muted-foreground font-semibold">
        Less {[0, 10, 30, 60, 120].map((m) => <span key={m} className="ta-heat-cell inline-block" style={{ background: shade(m) }} />)} More
      </div>
    </div>
  );
}
