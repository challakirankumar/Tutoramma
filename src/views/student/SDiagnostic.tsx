"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { Stethoscope, Play, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Target, Trophy, Send } from "lucide-react";

interface Q { topic: string; q: string; options: string[] }
interface Result { score: number; total: number; topics: { topic: string; correct: number; total: number }[]; gaps: string[]; strengths: string[]; review: { topic: string; q: string; picked: number | null; answer: number; options: string[]; explanation: string; ok: boolean }[]; sharedWith: number }
interface Past { id: string; score: number; total: number; createdAt: string; result: { gaps: string[]; strengths: string[] } }

/** Learning-gap Diagnostic (spec §30): a 12-question check before the first class; results go to the tutor. */
export function SDiagnostic() {
  const { setView } = useAppStore();
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [seed, setSeed] = useState(0);
  const [qs, setQs] = useState<Q[]>([]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [res, setRes] = useState<Result | null>(null);
  const [past, setPast] = useState<Past[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/diagnostic", { cache: "no-store" }).then((r) => r.json()).then((j) => setPast(j.data ?? [])).catch(() => setPast([]));
  }, [phase]);

  const post = async (body: unknown) => {
    const r = await fetch("/api/diagnostic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Failed");
    return j.data;
  };
  const start = async () => {
    setBusy(true);
    try {
      const d = await post({ action: "start" });
      setSeed(d.seed);
      setQs(d.questions);
      setAnswers(Array(d.questions.length).fill(null));
      setI(0);
      setPhase("quiz");
    } catch (e) {
      toast({ title: "Couldn't start", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    setBusy(true);
    try {
      setRes(await post({ action: "submit", seed, answers }));
      setPhase("result");
    } catch (e) {
      toast({ title: "Couldn't submit", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ModuleHeader group="learning" icon={Stethoscope} title="Learning-gap Check" subtitle="12 quick maths questions across six topics. Your tutor gets your gaps before the first class — so lessons start where you need them." pills={[{ label: "About 8 minutes", tone: "info" }, { label: "Not graded", tone: "verified" }]} />
      {phase === "intro" && (
        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
          <div className="rounded-[24px] p-7 text-white" style={{ background: "linear-gradient(135deg,#1B2F79,#142366 55%,#0E1A52)" }}>
            <div className="font-display text-[30px] font-extrabold leading-tight">Find your starting point.</div>
            <p className="text-white/75 mt-2 text-[14.5px]">Unitary method, inverse proportion, percentages, linear equations, factorisation and mensuration — two questions each. No marks, no ranking. It only helps your tutor plan.</p>
            <button className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#F26B1D] font-bold" disabled={busy} onClick={start}><Play className="w-4 h-4" /> Start the check</button>
          </div>
          <div className="sk-card p-5">
            <div className="text-[15px] font-extrabold text-[#142366]">Earlier checks</div>
            {!past ? <LoadingView /> : !past.length ? <p className="text-[12.5px] text-muted-foreground mt-2">This will be your first.</p> : past.map((p) => (
              <div key={p.id} className="sk-well p-3 mt-2.5 text-[12.5px]">
                <div className="flex justify-between"><b>{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</b><b>{p.score}/{p.total}</b></div>
                {p.result.gaps.length > 0 && <div className="text-[#D9580E] mt-1">Gaps: {p.result.gaps.join(", ")}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {phase === "quiz" && qs[i] && (
        <div className="max-w-[760px] mx-auto sk-card p-6 sm:p-8">
          <div className="flex justify-between text-[12px] font-bold text-muted-foreground"><span>Question {i + 1} of {qs.length}</span><span>{qs[i].topic}</span></div>
          <div className="h-2 rounded-full bg-[#EEF2FA] mt-2 overflow-hidden"><div className="h-full bg-[#F26B1D] transition-all" style={{ width: `${((i + 1) / qs.length) * 100}%` }} /></div>
          <div className="text-[19px] font-bold text-[#142366] mt-6 leading-snug">{qs[i].q}</div>
          <div className="grid sm:grid-cols-2 gap-2.5 mt-5">
            {qs[i].options.map((o, k) => (
              <button key={k} onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))} className={clsx("text-left px-4 py-3.5 rounded-2xl border text-[15px] font-semibold transition-all", answers[i] === k ? "border-[#142366] bg-[#F0F4FE] shadow-[0_0_0_3px_rgba(20,35,102,.08)]" : "bg-white hover:border-[#B9C6E4]")} style={answers[i] === k ? undefined : { borderColor: "var(--border)" }}>
                <span className="text-muted-foreground mr-2">{String.fromCharCode(65 + k)}.</span>{o}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-6">
            <HeaderButton onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}><ArrowLeft className="w-3.5 h-3.5" /> Back</HeaderButton>
            {i < qs.length - 1 ? (
              <HeaderButton variant="primary" onClick={() => setI(i + 1)}>{answers[i] === null ? "Skip" : "Next"} <ArrowRight className="w-3.5 h-3.5" /></HeaderButton>
            ) : (
              <HeaderButton variant="orange" onClick={submit} disabled={busy}><Send className="w-3.5 h-3.5" /> See my results</HeaderButton>
            )}
          </div>
        </div>
      )}
      {phase === "result" && res && (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
            <div className="rounded-[24px] p-7 text-white" style={{ background: "linear-gradient(135deg,#1B2F79,#142366 55%,#0E1A52)" }}>
              <Trophy className="w-8 h-8 text-[#FFC27A]" />
              <div className="font-display text-[44px] font-extrabold mt-2">{res.score}/{res.total}</div>
              <div className="text-white/75">{res.gaps.length ? `Start with: ${res.gaps.join(", ")}` : "No major gaps — ready for stretch work!"}</div>
              {res.sharedWith > 0 && <div className="mt-4 text-[12.5px] text-[#7EE2B0] flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Shared with your {res.sharedWith} tutor{res.sharedWith > 1 ? "s" : ""}</div>}
              <div className="flex gap-2 mt-5">
                <button className="px-4 py-2 rounded-full bg-[#F26B1D] text-[13px] font-bold" onClick={() => setView("s-ai-suite", { suiteTool: "practice", suiteAt: Date.now() })}>Practise my gaps</button>
                <button className="px-4 py-2 rounded-full bg-white/10 border border-white/25 text-[13px] font-bold" onClick={() => setPhase("intro")}>Done</button>
              </div>
            </div>
            <div className="sk-card p-5">
              <div className="text-[15px] font-extrabold text-[#142366] flex items-center gap-2"><Target className="w-4 h-4" /> By topic</div>
              <div className="space-y-3 mt-4">
                {res.topics.map((t) => {
                  const pct = t.total ? (t.correct / t.total) * 100 : 0;
                  return (
                    <div key={t.topic}>
                      <div className="flex justify-between text-[13px]"><span>{t.topic}</span><b className={pct < 50 ? "text-[#D9580E]" : pct === 100 ? "text-[#1F7A55]" : ""}>{t.correct}/{t.total}</b></div>
                      <div className="h-2 rounded-full bg-[#EEF2FA] mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, pct)}%`, background: pct < 50 ? "#F26B1D" : pct === 100 ? "#1F9D6B" : "#142366" }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="sk-card p-5">
            <div className="text-[15px] font-extrabold text-[#142366]">Review</div>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {res.review.map((r, k) => (
                <div key={k} className="sk-well p-3 text-[12.5px]">
                  <div className="flex gap-2">{r.ok ? <CheckCircle2 className="w-4 h-4 text-[#1F9D6B] shrink-0" /> : <XCircle className="w-4 h-4 text-[#D64545] shrink-0" />}<b>{r.q}</b></div>
                  <div className="text-muted-foreground mt-1 pl-6">{r.ok ? "Correct." : `Answer: ${r.options[r.answer]}.`} {r.explanation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
