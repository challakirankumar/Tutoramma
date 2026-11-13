"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { CalendarClock, Sparkles, CheckCircle2, Circle, Trash2, Download, Plus, X, BookOpen, PenTool, RefreshCcw, ClipboardCheck, Coffee, Target, AlertTriangle, Wand2, RefreshCw } from "lucide-react";

/* ---------------- types ---------------- */
interface PlanTask {
  id: string;
  title: string;
  subject: string;
  minutes: number;
  kind: "learn" | "practice" | "revise" | "mock" | "rest";
  done: boolean;
}
interface PlanDay {
  date: string;
  tasks: PlanTask[];
}
interface Plan {
  id: string;
  examName: string;
  examDate: string;
  hoursPerDay: number;
  source: string;
  days: PlanDay[];
  progress: { done: number; total: number; minutesDone: number };
}
interface PlannerData {
  plan: Plan | null;
  weakTopics: string[];
  grade: string | null;
}

const KIND: Record<PlanTask["kind"], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  learn: { label: "Learn", cls: "sk-pill-blue", icon: BookOpen },
  practice: { label: "Practice", cls: "sk-pill-orange", icon: PenTool },
  revise: { label: "Revise", cls: "sk-pill-green", icon: RefreshCcw },
  mock: { label: "Mock test", cls: "sk-pill-red", icon: ClipboardCheck },
  rest: { label: "Light day", cls: "sk-pill-grey", icon: Coffee },
};

const TEMPLATE_SUBJECTS: Record<string, string[]> = {
  Mathematics: ["Rational Numbers", "Linear Equations", "Factorisation", "Mensuration", "Exponents & Powers", "Data Handling"],
  Science: ["Light: Reflection", "Sound", "Force & Pressure", "Friction", "Cell Structure"],
  English: ["Grammar: Tenses", "Reported Speech", "Letter Writing", "Comprehension"],
  "Social Science": ["Resources", "Agriculture", "The Constitution", "Colonialism"],
};

const todayIso = () => new Date().toISOString().slice(0, 10);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json" } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

/* ======================================================================= */

export function SPlanner() {
  const [data, setData] = useState<PlannerData | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<PlannerData>("/api/planner")
      .then((d) => {
        setError("");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error)
    return (
      <div className="sk-card p-6">
        <EmptyState icon={CalendarClock} title="Couldn't load your planner" sub={error} action={<button className="sk-btn sk-btn-primary" onClick={load}><RefreshCw className="w-4 h-4" /> Try again</button>} />
      </div>
    );
  if (!data) return <LoadingView label="Opening your planner…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Revision Planner</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">A day-by-day exam plan with spaced revision (1-3-7 days), weak-topic priority, light days and mock tests in the final stretch.</p>
        </div>
        {data.plan && !editing && (
          <div className="flex gap-2">
            <button className="sk-btn sk-btn-sm" onClick={() => downloadIcs(data.plan!)}>
              <Download className="w-3.5 h-3.5" /> Add to calendar
            </button>
            <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setEditing(true)}>
              <Wand2 className="w-3.5 h-3.5" /> New plan
            </button>
          </div>
        )}
      </div>

      {!data.plan || editing ? (
        <PlanBuilder
          weakTopics={data.weakTopics}
          onCancel={data.plan ? () => setEditing(false) : undefined}
          onCreated={(p) => {
            setData((d) => (d ? { ...d, plan: p } : d));
            setEditing(false);
          }}
        />
      ) : (
        <PlanView plan={data.plan} onChange={(p) => setData((d) => (d ? { ...d, plan: p } : d))} onDeleted={() => setData((d) => (d ? { ...d, plan: null } : d))} />
      )}
    </div>
  );
}

/* ---------------- builder ---------------- */
function PlanBuilder({ weakTopics, onCreated, onCancel }: { weakTopics: string[]; onCreated: (p: Plan) => void; onCancel?: () => void }) {
  const inThreeWeeks = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const [examName, setExamName] = useState("Half-yearly examinations");
  const [examDate, setExamDate] = useState(inThreeWeeks);
  const [hours, setHours] = useState(2);
  const [subjects, setSubjects] = useState<{ name: string; topics: string[] }[]>([
    { name: "Mathematics", topics: TEMPLATE_SUBJECTS.Mathematics.slice(0, 4) },
    { name: "Science", topics: TEMPLATE_SUBJECTS.Science.slice(0, 4) },
  ]);
  const [weak, setWeak] = useState<string[]>(weakTopics);
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);

  const addSubject = (name: string) => {
    if (!name || subjects.some((s) => s.name === name)) return;
    setSubjects((s) => [...s, { name, topics: TEMPLATE_SUBJECTS[name]?.slice(0, 4) ?? [] }]);
  };

  const submit = async () => {
    setBusy(true);
    try {
      // weak topics that aren't in any subject are added to the first subject so they get scheduled
      const all = new Set(subjects.flatMap((s) => s.topics.map((t) => t.toLowerCase())));
      const extra = weak.filter((w) => !all.has(w.toLowerCase()));
      const payload = subjects.map((s, i) => (i === 0 ? { ...s, topics: [...extra, ...s.topics] } : s));
      const plan = await api<Plan>("/api/planner", { method: "POST", body: JSON.stringify({ examName, examDate, hoursPerDay: hours, subjects: payload, weakTopics: weak, useAi }) });
      toast({ title: "Your plan is ready 🗓️", description: `${plan.days.length} days · ${plan.progress.total} tasks${plan.source === "ai" ? " · coached by AI" : ""}` });
      onCreated(plan);
    } catch (e) {
      toast({ title: "Couldn't build plan", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const days = Math.max(0, Math.round((new Date(examDate).getTime() - Date.now()) / 86400000));
  const totalTopics = subjects.reduce((a, s) => a + s.topics.length, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 sk-card p-5 space-y-5">
        <SectionTitle title="Build your plan" sub="Tell us about the exam — we'll do the scheduling maths." right={onCancel && <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={onCancel}>Cancel</button>} />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide">Exam</span>
            <input className="sk-input mt-1.5" value={examName} onChange={(e) => setExamName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide">Exam date</span>
            <input type="date" className="sk-input mt-1.5" min={todayIso()} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
        </div>
        <div>
          <div className="flex justify-between text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide">
            <span>Study time per day</span>
            <span className="text-foreground tabular">{hours} h</span>
          </div>
          <input type="range" min={0.5} max={6} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full mt-1.5 accent-[#315BE5]" aria-label="Hours per day" />
        </div>

        <div className="space-y-3">
          <div className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide">Subjects & topics</div>
          {subjects.map((s, i) => (
            <SubjectEditor
              key={s.name}
              subject={s}
              onChange={(n) => setSubjects((all) => all.map((x, k) => (k === i ? n : x)))}
              onRemove={() => setSubjects((all) => all.filter((_, k) => k !== i))}
            />
          ))}
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(TEMPLATE_SUBJECTS)
              .filter((n) => !subjects.some((s) => s.name === n))
              .map((n) => (
                <button key={n} className="sk-chip" onClick={() => addSubject(n)}>
                  <Plus className="w-3 h-3" /> {n}
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="sk-card p-5 space-y-3">
          <SectionTitle title="Weak topics" sub="These get longer sessions and are scheduled first." />
          <div className="flex flex-wrap gap-1.5">
            {weak.length === 0 && <span className="text-[12px] text-muted-foreground">None yet — tap a topic chip on the left to mark it.</span>}
            {weak.map((w) => (
              <span key={w} className="sk-pill sk-pill-red">
                {w}
                <button onClick={() => setWeak((x) => x.filter((y) => y !== w))} aria-label={`Remove ${w}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subjects
              .flatMap((s) => s.topics)
              .filter((t) => !weak.includes(t))
              .slice(0, 10)
              .map((t) => (
                <button key={t} className="sk-chip !text-[11px]" onClick={() => setWeak((x) => [...x, t])}>
                  + {t}
                </button>
              ))}
          </div>
        </div>
        <div className="sk-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-bold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[#315BE5]" /> AI study coach</div>
              <div className="text-[11.5px] text-muted-foreground">Rewrites tasks into specific actions with Workers AI.</div>
            </div>
            <Switch checked={useAi} onCheckedChange={setUseAi} aria-label="Use AI study coach" />
          </div>
          <div className="sk-well p-3 text-[12px] grid grid-cols-3 text-center">
            <div><div className="text-[18px] font-extrabold tabular">{days}</div><div className="text-muted-foreground text-[10.5px]">days</div></div>
            <div><div className="text-[18px] font-extrabold tabular">{totalTopics}</div><div className="text-muted-foreground text-[10.5px]">topics</div></div>
            <div><div className="text-[18px] font-extrabold tabular">{Math.round(days * hours)}</div><div className="text-muted-foreground text-[10.5px]">hours</div></div>
          </div>
          <button className="sk-btn sk-btn-primary sk-btn-lg w-full" disabled={busy || !examName.trim() || !totalTopics || days < 1} onClick={submit}>
            {busy ? <><Sparkles className="w-4 h-4 animate-pulse" /> Planning…</> : <><Wand2 className="w-4 h-4" /> Generate my plan</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubjectEditor({ subject, onChange, onRemove }: { subject: { name: string; topics: string[] }; onChange: (s: { name: string; topics: string[] }) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState("");
  const suggestions = (TEMPLATE_SUBJECTS[subject.name] ?? []).filter((t) => !subject.topics.includes(t));
  const add = (t: string) => {
    const v = t.trim();
    if (v && !subject.topics.includes(v)) onChange({ ...subject, topics: [...subject.topics, v] });
    setDraft("");
  };
  return (
    <div className="sk-well p-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold">{subject.name}</div>
        <button className="p-1 rounded-lg hover:bg-white" onClick={onRemove} aria-label={`Remove ${subject.name}`}>
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {subject.topics.map((t) => (
          <span key={t} className="sk-pill sk-pill-navy">
            {t}
            <button onClick={() => onChange({ ...subject, topics: subject.topics.filter((x) => x !== t) })} aria-label={`Remove ${t}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          className="bg-transparent outline-none text-[12px] min-w-[140px] flex-1 px-1"
          placeholder="Add topic + Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {suggestions.slice(0, 5).map((t) => (
            <button key={t} className="text-[10.5px] font-semibold text-[#315BE5] hover:underline" onClick={() => add(t)}>
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- plan view ---------------- */
function PlanView({ plan, onChange, onDeleted }: { plan: Plan; onChange: (p: Plan) => void; onDeleted: () => void }) {
  const today = todayIso();
  const [selected, setSelected] = useState(() => (plan.days.some((d) => d.date === today) ? today : plan.days[0]?.date ?? today));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const exam = new Date(plan.examDate).getTime();
  const msLeft = Math.max(0, exam - now);
  const dLeft = Math.floor(msLeft / 86400000);
  const hLeft = Math.floor((msLeft % 86400000) / 3600000);
  const pct = plan.progress.total ? plan.progress.done / plan.progress.total : 0;

  const overdue = useMemo(() => plan.days.filter((d) => d.date < today).flatMap((d) => d.tasks.filter((t) => !t.done && t.kind !== "rest")), [plan, today]);
  const day = plan.days.find((d) => d.date === selected);

  const toggle = async (t: PlanTask) => {
    const optimistic = { ...plan, days: plan.days.map((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })) };
    onChange(optimistic);
    try {
      const res = await api<Plan & { xp: { level: number; levelUp: boolean } | null }>("/api/planner", { method: "PATCH", body: JSON.stringify({ taskId: t.id, done: !t.done }) });
      onChange(res);
      if (!t.done) toast({ title: "Task done ✓ +10 XP", description: res.xp?.levelUp ? `Level ${res.xp.level} unlocked! 🎉` : t.title });
    } catch (e) {
      onChange(plan);
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!confirm("Delete this plan? Your progress will be lost.")) return;
    await api("/api/planner", { method: "DELETE" }).catch(() => null);
    onDeleted();
  };

  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-4">
      {/* hero */}
      <div className="sk-card p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#33549E 0%,#1B2F79 55%,#14246B 100%)" }}>
        <div className="flex flex-col md:flex-row md:items-center gap-6 relative z-10">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[.18em] text-white/60">Countdown</div>
            <div className="text-[22px] font-extrabold mt-1 truncate">{plan.examName}</div>
            <div className="text-[12.5px] text-white/70">{new Date(plan.examDate).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            <div className="flex gap-3 mt-4">
              {[
                [dLeft, "days"],
                [hLeft, "hours"],
                [plan.progress.total - plan.progress.done, "tasks left"],
              ].map(([v, l]) => (
                <div key={l as string} className="rounded-2xl bg-white/10 px-4 py-2.5 text-center min-w-[78px]">
                  <div className="text-[24px] font-extrabold tabular leading-none">{v}</div>
                  <div className="text-[10.5px] text-white/65 mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-[112px] h-[112px]">
              <svg viewBox="0 0 112 112" className="w-full h-full -rotate-90">
                <circle cx="56" cy="56" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="11" />
                <circle cx="56" cy="56" r={R} fill="none" stroke="#FFC24D" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset .6s ease" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[22px] font-extrabold tabular leading-none">{Math.round(pct * 100)}%</div>
                <div className="text-[10px] text-white/65">complete</div>
              </div>
            </div>
            <div className="text-[12px] text-white/75 space-y-1">
              <div><b className="text-white tabular">{plan.progress.done}</b> / {plan.progress.total} tasks</div>
              <div><b className="text-white tabular">{Math.round(plan.progress.minutesDone / 60)}</b> h studied</div>
              <div>{plan.source === "ai" ? <span className="sk-pill sk-pill-blue !text-[10px]"><Sparkles className="w-3 h-3" /> AI coached</span> : <span className="sk-pill sk-pill-grey !text-[10px]">Smart schedule</span>}</div>
            </div>
          </div>
        </div>
        <CalendarClock className="absolute -right-6 -bottom-8 w-48 h-48 text-white/[0.06] rotate-[-10deg]" />
      </div>

      {overdue.length > 0 && (
        <div className="sk-callout sk-callout-warn flex items-start gap-2 text-[12.5px]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>{overdue.length} task{overdue.length === 1 ? "" : "s"} from earlier days</b> still open — try clearing one or two in today&apos;s light slot, or tick them off if you already did them.
          </div>
        </div>
      )}

      {/* day strip */}
      <div className="sk-card p-4">
        <div className="relative flex gap-2 overflow-x-auto sk-scroll pb-1">
          {plan.days.map((d) => {
            const done = d.tasks.filter((t) => t.done).length;
            const all = d.tasks.length;
            const dt = new Date(d.date + "T12:00:00");
            const isToday = d.date === today;
            const past = d.date < today;
            return (
              <button
                key={d.date}
                onClick={() => setSelected(d.date)}
                className={clsx("shrink-0 w-[62px] rounded-2xl py-2 text-center border transition-all", selected === d.date ? "bg-[#14246B] text-white border-[#14246B] shadow-lg" : "bg-white border-[var(--border)] hover:border-[#B9C6E4]", past && selected !== d.date && "opacity-70")}
              >
                <div className={clsx("text-[10px] font-bold uppercase", selected === d.date ? "text-white/70" : "text-muted-foreground")}>{isToday ? "Today" : dt.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-[18px] font-extrabold tabular leading-tight">{dt.getDate()}</div>
                <div className="flex justify-center gap-[3px] mt-1">
                  {d.tasks.slice(0, 5).map((t) => (
                    <span key={t.id} className="w-[5px] h-[5px] rounded-full" style={{ background: t.done ? "#1F9D68" : selected === d.date ? "rgba(255,255,255,.4)" : "#C9D3E8" }} />
                  ))}
                </div>
                <div className="sr-only">{done} of {all} done</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* tasks of the selected day */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 sk-card p-5">
          <SectionTitle
            title={selected === today ? "Today's plan" : new Date(selected + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
            sub={day ? `${day.tasks.reduce((a, t) => a + t.minutes, 0)} min planned · ${day.tasks.filter((t) => t.done).length}/${day.tasks.length} done` : "No tasks"}
          />
          <div className="space-y-2 mt-4">
            {day?.tasks.map((t) => {
              const K = KIND[t.kind];
              return (
                <button key={t.id} onClick={() => toggle(t)} className={clsx("w-full text-left sk-card-flat !rounded-2xl p-3.5 flex items-center gap-3 transition-all hover:border-[#B9C6E4]", t.done && "opacity-60")}>
                  {t.done ? <CheckCircle2 className="w-5 h-5 text-[#1F9D68] shrink-0" /> : <Circle className="w-5 h-5 text-[#AAB8D8] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className={clsx("text-[13px] font-semibold leading-snug", t.done && "line-through")}>{t.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={clsx("sk-pill !text-[10px]", K.cls)}>
                        <K.icon className="w-3 h-3" /> {K.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-semibold">{t.subject}</span>
                    </div>
                  </div>
                  <span className="sk-pill sk-pill-grey tabular shrink-0">{t.minutes}m</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <div className="sk-card p-5">
            <SectionTitle title="How this plan works" />
            <ul className="mt-3 space-y-2.5 text-[12px] text-muted-foreground">
              <li className="flex gap-2"><Target className="w-4 h-4 text-[#C03342] shrink-0" /> Weak topics come first and get longer sessions.</li>
              <li className="flex gap-2"><RefreshCcw className="w-4 h-4 text-[#1F9D68] shrink-0" /> Every topic returns for spaced revision 1, 3 and 7 days later.</li>
              <li className="flex gap-2"><Coffee className="w-4 h-4 text-[#57627F] shrink-0" /> Every 7th day is a light day to prevent burnout.</li>
              <li className="flex gap-2"><ClipboardCheck className="w-4 h-4 text-[#E76E0F] shrink-0" /> The final days are timed mock tests with error-log review.</li>
            </ul>
          </div>
          <button className="sk-btn sk-btn-danger w-full" onClick={remove}>
            <Trash2 className="w-4 h-4" /> Delete plan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ICS export ---------------- */
function downloadIcs(plan: Plan) {
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tutor Amma//Revision Planner//EN", "CALSCALE:GREGORIAN"];
  for (const d of plan.days) {
    const date = d.date.replace(/-/g, "");
    const next = new Date(new Date(d.date + "T12:00:00").getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const minutes = d.tasks.reduce((a, t) => a + t.minutes, 0);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${plan.id}-${date}@tutoramma`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(`📚 ${plan.examName} prep — ${minutes} min`)}`,
      `DESCRIPTION:${esc(d.tasks.map((t) => `• ${t.title} (${t.minutes}m)`).join("\n"))}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tutor-amma-revision-plan.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
