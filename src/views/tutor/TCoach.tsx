"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { BrainCircuit, Sparkles, RefreshCw, Send, Loader2, ClipboardCopy, Users, Info } from "lucide-react";

interface StudentLite {
  id: string;
  name: string;
  color: string;
  subject?: string;
  grade: string;
  board: string;
}
interface Profile {
  studentId: string;
  name: string;
  grade: string;
  board: string;
  subject?: string;
  bars: { label: string; value: number }[];
  pace: string;
  attentionMin: number;
  prefers: string[];
  language: string;
  misconceptions: string[];
  weakTopics: string[];
  goals: string[];
  quizAvg: number | null;
  sources: string[];
}
interface Plan {
  steps: { title: string; detail: string }[];
  why: string;
  source: string;
}
interface Feedback {
  clarity: number;
  pacing: number;
  questioning: number;
  waitTime: number;
  tip: string;
}

const PERSONAS = [
  { id: "shy", label: "Shy · low prior knowledge" },
  { id: "careless", label: "Fast but careless" },
  { id: "anxious", label: "Anxious about maths" },
];
const OPENERS: Record<string, string> = { shy: "I don't get why we divide first…", careless: "This is easy, the answer is 60. Next?", anxious: "I'm really bad at this topic." };

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error(j?.error?.message || `Request failed (${res.status})`);
  return j.data as T;
}

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-[12.5px]">
        <span className="truncate pr-2">{label}</span>
        <b className="tabular">{value}</b>
      </div>
      <div className="h-[7px] rounded-full bg-[#E8EDF8] mt-1 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: tone }} />
      </div>
    </div>
  );
}
const toneFor = (v: number) => (v >= 75 ? "#1F9D6B" : v >= 55 ? "#142366" : "#F26B1D");

/* ======================================================================= */

export function TCoach() {
  const { setView } = useAppStore();
  const [tab, setTab] = useState("profile");
  const [students, setStudents] = useState<StudentLite[] | null>(null);
  const [sid, setSid] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [topic, setTopic] = useState("Direct and Inverse Proportions");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    api<StudentLite[]>("/api/coach")
      .then((s) => {
        setStudents(s);
        if (s[0]) setSid(s[0].id);
      })
      .catch(() => setStudents([]));
  }, []);

  useEffect(() => {
    if (!sid) return;
    setProfile(null);
    setPlan(null);
    api<Profile>(`/api/coach?studentId=${sid}`).then(setProfile).catch((e) => toast({ title: "Couldn't load profile", description: e.message, variant: "destructive" }));
  }, [sid]);

  const makePlan = useCallback(async () => {
    if (!sid) return;
    setPlanning(true);
    try {
      setPlan(await api<Plan>("/api/coach/plan", { studentId: sid, topic }));
    } catch (e) {
      toast({ title: "Couldn't plan", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPlanning(false);
    }
  }, [sid, topic]);

  useEffect(() => {
    if (profile && !plan && !planning) void makePlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const addToLesson = async () => {
    if (!plan || !profile) return;
    const text = `Teaching approach for ${profile.name} — ${topic}\n${plan.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.detail}`).join("\n")}\nWhy: ${plan.why}`;
    await navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Approach copied to your lesson notes", description: "Opening the Teaching Studio — paste it into Teacher notes of the plan." });
    setView("t-studio");
  };

  if (!students) return <LoadingView label="Loading your students…" />;

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="learning"
        icon={BrainCircuit}
        trail={["Academic Studio"]}
        title="Teaching Coach (AI)"
        subtitle="Understand each student, get a teaching plan that fits them, and rehearse with a simulated learner."
        pills={[{ label: "AI", tone: "ai" }, { label: "Learning profile, not an IQ test", tone: "verified" }]}
        actions={
          students.length > 0 && tab !== "differentiate" ? (
            <select className="sk-input !w-auto !py-2 !rounded-full" value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Choose student">
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.grade}</option>
              ))}
            </select>
          ) : undefined
        }
        tabs={[
          { id: "profile", label: "Profile & strategy" },
          { id: "practice", label: "Role-play practice" },
          { id: "differentiate", label: "Differentiated homework" },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {tab === "differentiate" ? (
        <Differentiate />
      ) : students.length === 0 ? (
        <div className="sk-card p-4"><EmptyState icon={Users} title="No linked students yet" sub="Students appear here once they book you or join one of your classrooms." /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* -------- learning profile -------- */}
          <div className={clsx("sk-card p-5", tab !== "profile" && "hidden xl:block")}>
            {!profile ? (
              <LoadingView label="Building learning profile…" />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="sk-avatar" style={{ width: 44, height: 44, borderRadius: 999, background: "linear-gradient(135deg,#6D8BF2,#4A62D8)", fontSize: 14 }}>
                    {profile.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
                  </span>
                  <div>
                    <div className="font-extrabold text-[#142366]">{profile.name}</div>
                    <div className="text-[12px] text-muted-foreground">{profile.grade} · {profile.board} · {profile.subject ?? "—"}</div>
                  </div>
                </div>
                <div className="text-[15px] font-extrabold text-[#142366] mt-5 mb-3">Learning profile</div>
                <div className="space-y-3">
                  {profile.bars.map((b) => <Bar key={b.label} label={b.label} value={b.value} tone={toneFor(b.value)} />)}
                </div>
                <div className="text-[12px] text-muted-foreground mt-4 leading-relaxed">
                  Pace: {profile.pace} · Attention: about {profile.attentionMin} min · Prefers: {profile.prefers.join(" and ")} · Language: {profile.language}
                  {profile.misconceptions.length > 0 && <div className="mt-1">Common slip: {profile.misconceptions.join("; ")}</div>}
                  {profile.quizAvg != null && <div className="mt-1">Quiz average: {profile.quizAvg}%</div>}
                </div>
                <p className="text-[11.5px] text-muted-foreground mt-4 flex gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Built from {profile.sources.join(", ")} and tutor notes. Visible to tutor and parent; never used for ranking or admissions.
                </p>
              </>
            )}
          </div>

          {/* -------- strategy -------- */}
          <div className={clsx("sk-card p-5", tab !== "profile" && "hidden xl:block")}>
            <div className="text-[15px] font-extrabold text-[#142366]">Suggested approach</div>
            <div className="flex gap-2 mt-2">
              <input className="sk-input !py-1.5" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" onKeyDown={(e) => e.key === "Enter" && makePlan()} />
            </div>
            {planning || !plan ? (
              <div className="space-y-3 mt-4">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-xl ta-shimmer" />)}
              </div>
            ) : (
              <>
                <ol className="mt-4 space-y-3">
                  {plan.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-[#F26B1D] text-white text-[12px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div>
                        <div className="text-[13px] font-bold text-[#142366] leading-snug">{s.title}</div>
                        <div className="text-[12px] text-muted-foreground">{s.detail}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 rounded-2xl border border-[#DCD2FB] bg-[#F6F3FF] p-3.5">
                  <div className="text-[12.5px] font-bold text-[#6D4AE0] flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Why this plan</div>
                  <p className="text-[12px] text-[#4B3C8A] mt-1 leading-relaxed">{plan.why}</p>
                  {plan.source !== "ai" && <p className="text-[10.5px] text-[#7A6BB8] mt-1">Structured template — AI was unavailable.</p>}
                </div>
                <div className="flex gap-2 mt-4">
                  <HeaderButton variant="orange" onClick={addToLesson}><ClipboardCopy className="w-3.5 h-3.5" /> Add to lesson plan</HeaderButton>
                  <HeaderButton onClick={makePlan}><RefreshCw className="w-3.5 h-3.5" /> Regenerate</HeaderButton>
                </div>
              </>
            )}
          </div>

          {/* -------- role-play -------- */}
          <div className={clsx(tab !== "practice" && "hidden xl:block")}>
            <RolePlay topic={topic} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- role-play simulator ---------------- */
function RolePlay({ topic }: { topic: string }) {
  const [persona, setPersona] = useState("shy");
  const [turns, setTurns] = useState<{ role: "tutor" | "student"; text: string }[]>([{ role: "student", text: OPENERS.shy }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Feedback | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTurns([{ role: "student", text: OPENERS[persona] }]);
    setFb(null);
  }, [persona]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...turns, { role: "tutor" as const, text }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const r = await api<{ reply: string; feedback: Feedback }>("/api/coach/roleplay", { persona, topic, turns: next });
      setTurns((t) => [...t, { role: "student", text: r.reply }]);
      setFb(r.feedback);
    } catch (e) {
      toast({ title: "Simulator unavailable", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sk-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[15px] font-extrabold text-[#142366]">Practice with a simulated student</div>
        <span className="px-2 py-[2px] rounded-full text-[10.5px] font-bold bg-[#FFF6E5] text-[#A86A12] border border-[#F5DFB3]">Role-play</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PERSONAS.map((p) => (
          <button key={p.id} className={clsx("px-2.5 py-1 rounded-xl text-[11.5px] font-semibold border", persona === p.id ? "bg-[#142366] text-white border-[#142366]" : "bg-[#EEF2FA] text-[#22357F] border-transparent")} onClick={() => setPersona(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="max-h-[230px] overflow-y-auto sk-scroll space-y-2 pr-1">
        {turns.map((t, i) => (
          <div key={i} className={clsx("rounded-2xl px-3 py-2 text-[12.5px] max-w-[88%]", t.role === "student" ? "bg-[#F1ECFE] text-[#2A1F5C]" : "bg-[#142366] text-white ml-auto")}>
            {t.role === "student" && <div className="text-[11px] font-bold text-[#6D4AE0]">Simulated student</div>}
            {t.text}
          </div>
        ))}
        {busy && <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> student is thinking…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input className="sk-input !py-2" placeholder="Your reply as the tutor…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={send} disabled={busy || !draft.trim()} aria-label="Send"><Send className="w-4 h-4" /></button>
      </div>
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-[14px] font-extrabold text-[#142366] mb-2.5">Coach feedback</div>
        {fb ? (
          <div className="space-y-2.5">
            <Bar label="Clarity" value={fb.clarity} tone="#1F9D6B" />
            <Bar label="Pacing" value={fb.pacing} tone="#142366" />
            <Bar label="Questioning" value={fb.questioning} tone="#142366" />
            <Bar label="Wait time" value={fb.waitTime} tone="#F26B1D" />
            <p className="text-[11.5px] text-muted-foreground pt-1">Tip: {fb.tip}</p>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Reply to the student — feedback on clarity, pacing, questioning and wait time appears after each turn.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- auto-differentiated homework (spec §29) ---------------- */
interface DPlan { studentId: string; name: string; topics: string[]; source: string; count: number; sample: string }
function Differentiate() {
  const { setView } = useAppStore();
  const [plans, setPlans] = useState<DPlan[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [perTopic, setPerTopic] = useState(3);
  const [dueDays, setDueDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const preview = useCallback(() => {
    setPlans(null);
    fetch("/api/coach/differentiate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perTopic }) })
      .then((r) => r.json()).then((j) => setPlans(j.data?.plans ?? [])).catch(() => setPlans([]));
  }, [perTopic]);
  useEffect(preview, [preview]);
  const assign = async () => {
    if (!plans) return;
    setBusy(true);
    const ids = plans.filter((p) => !skip.has(p.studentId)).map((p) => p.studentId);
    const r = await fetch("/api/coach/differentiate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assign: true, studentIds: ids, perTopic, dueDays }) });
    setBusy(false);
    if (r.ok) {
      toast({ title: `Assigned to ${ids.length} student${ids.length === 1 ? "" : "s"}`, description: "Each set targets that student's own gaps and is auto-graded." });
      setView("t-students");
    } else toast({ title: "Couldn't assign", variant: "destructive" });
  };
  if (!plans) return <LoadingView label="Matching practice to each student's gaps…" />;
  if (!plans.length) return <div className="sk-card p-4"><EmptyState icon={Users} title="No linked students yet" sub="Students appear here once they book you." /></div>;
  const chosen = plans.length - plans.filter((p) => skip.has(p.studentId)).length;
  return (
    <div className="sk-card p-5">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <div className="text-[15px] font-extrabold text-[#142366]">One assignment, a different set for every student</div>
          <p className="text-[12px] text-muted-foreground mt-0.5">Built from each student's latest Gap Check, quiz weak topics and learning profile. Answers are auto-graded.</p>
        </div>
        <div className="flex gap-2 items-center text-[12px]">
          <label className="flex items-center gap-1.5">Questions per topic
            <select className="sk-input !w-auto !py-1.5" value={perTopic} onChange={(e) => setPerTopic(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5">Due in
            <select className="sk-input !w-auto !py-1.5" value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))}>{[2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} days</option>)}</select>
          </label>
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={preview}><RefreshCw className="w-3.5 h-3.5" /> Shuffle</button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
        {plans.map((p) => {
          const off = skip.has(p.studentId);
          return (
            <div key={p.studentId} className={clsx("rounded-2xl border p-4 transition", off ? "opacity-50 bg-[#F7F8FB]" : "bg-white")} style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-[13.5px]">{p.name}</div>
                <input type="checkbox" className="accent-[#142366] mt-1" checked={!off} onChange={() => setSkip((x) => { const n = new Set(x); if (n.has(p.studentId)) n.delete(p.studentId); else n.add(p.studentId); return n; })} aria-label={`Include ${p.name}`} />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">{p.topics.map((t) => <span key={t} className="px-2 py-[2px] rounded-full bg-[#EFEAFD] text-[#6D4AE0] text-[11px] font-bold">{t}</span>)}</div>
              <div className="text-[11px] text-muted-foreground mt-2">{p.count} questions · from {p.source}</div>
              {p.sample && <div className="text-[11.5px] mt-2 italic line-clamp-2">“{p.sample}”</div>}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-4">
        <button className="sk-btn sk-btn-primary" disabled={busy || !chosen} onClick={assign}><Sparkles className="w-4 h-4" /> {busy ? "Assigning…" : `Assign to ${chosen} student${chosen === 1 ? "" : "s"}`}</button>
      </div>
    </div>
  );
}
