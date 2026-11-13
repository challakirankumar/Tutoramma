"use client";

import { useEffect, useState } from "react";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { toast } from "@/hooks/use-toast";
import { untilLabel, dateOf, timeOf } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  BookOpenCheck,
  FlaskConical,
  RefreshCw,
  ShieldAlert,
  Zap,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Target,
} from "lucide-react";

/* ---------------- types ---------------- */
interface Question {
  q: string;
  options?: string[];
  answer?: string;
  explanation?: string;
  marks?: number;
  chapter?: string;
}
interface Homework {
  id: string;
  title: string;
  subject: string;
  dueAt: string;
  xp: number;
  status: string;
  score: number | null;
  feedback: string | null;
  submission: { answers: string[]; text: string | null; at: string } | null;
  batchId: string | null;
  tutor: { id: string; name: string; color: string } | null;
  questions: Question[];
}
interface TestResult {
  id: string;
  title: string;
  subject: string;
  score: number;
  total: number;
  xp: number;
  weakTopics: string[];
  takenAt: string;
}

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const LETTERS = ["A", "B", "C", "D", "E"];

function StatusBadge({ status }: { status: string }) {
  if (status === "graded") return <span className="sk-pill sk-pill-green"><CheckCircle2 className="w-3 h-3" /> Graded</span>;
  if (status === "submitted") return <span className="sk-pill sk-pill-blue"><Hourglass className="w-3 h-3" /> Submitted</span>;
  return <span className="sk-pill sk-pill-orange"><BookOpenCheck className="w-3 h-3" /> To do</span>;
}

/* ---------------- view ---------------- */
export function SHomework() {
  const [data, setData] = useState<{ homework: Homework[]; tests: TestResult[] } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"homework" | "tests">("homework");

  /* detail dialog */
  const [openHw, setOpenHw] = useState<Homework | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ autoGraded: boolean; correct?: number; total?: number; pct?: number; wrongTopics?: string[] } | null>(null);

  const load = () => {
    setError("");
    getJson<{ homework: Homework[]; tests: TestResult[] }>("/api/homework")
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load your homework."));
  };

  useEffect(load, []);

  const openDetail = (h: Homework) => {
    setOpenHw(h);
    setAnswers(h.questions.map((_, i) => (h.submission?.answers?.[i] ?? "")));
    setNotes("");
    setResult(null);
  };

  const submit = async () => {
    if (!openHw) return;
    setBusy(true);
    try {
      const res = await postJson<{
        homework: Homework;
        result: { autoGraded: boolean; correct?: number; total?: number; pct?: number; wrongTopics?: string[] };
        xp: { awarded: number };
      }>(`/api/homework/${openHw.id}/submit`, { answers, text: notes || undefined });
      setResult(res.result);
      if (res.result.autoGraded) {
        toast({
          title: `Auto-graded: ${res.result.pct}%`,
          description: `Scored ${res.result.correct}/${res.result.total} · +${res.xp.awarded} XP added to your passport 🎉`,
        });
      } else {
        toast({
          title: "Submitted for review",
          description: "Your tutor will grade it and leave feedback — XP lands after grading.",
        });
      }
      load();
    } catch (e) {
      toast({
        title: "Couldn't submit",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your homework"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary" onClick={load}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading homework & tests…" />;

  const dueList = data.homework.filter((h) => h.status === "assigned");

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Homework & Tests</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Practice makes progress — finish homework on time to earn XP and keep your streak.
          </p>
        </div>
        <div className="sk-segment">
          <button
            className={`sk-segment-item ${tab === "homework" ? "sk-segment-item-active" : ""}`}
            onClick={() => setTab("homework")}
          >
            Homework · {data.homework.length}
          </button>
          <button
            className={`sk-segment-item ${tab === "tests" ? "sk-segment-item-active" : ""}`}
            onClick={() => setTab("tests")}
          >
            Quick Tests · {data.tests.length}
          </button>
        </div>
      </div>

      {/* ---------- homework tab ---------- */}
      {tab === "homework" &&
        (data.homework.length === 0 ? (
          <div className="sk-card p-6">
            <EmptyState
              icon={BookOpenCheck}
              title="No homework yet"
              sub="Your tutor assigns practice here after each session — check back soon."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {dueList.length > 0 && (
              <div className="sk-callout sk-callout-warn flex gap-2.5">
                <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    {dueList.length} task{dueList.length === 1 ? "" : "s"} due soon
                  </span>{" "}
                  — submit before the deadline to earn your XP in full.
                </div>
              </div>
            )}
            {data.homework.map((h) => (
              <button key={h.id} className="sk-card p-4 sm:p-5 w-full text-left hover:brightness-[0.99] transition" onClick={() => openDetail(h)}>
                <div className="flex items-center gap-3.5">
                  <div
                    className="sk-avatar shrink-0"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background:
                        h.status === "graded"
                          ? "linear-gradient(180deg,#46BD85,#1F9D68)"
                          : h.status === "submitted"
                            ? "linear-gradient(180deg,#5A83F0,#315BE5)"
                            : "linear-gradient(180deg,#FFA24D,#E76E0F)",
                    }}
                  >
                    <BookOpenCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[14.5px] truncate">{h.title}</span>
                      {h.batchId && <span className="sk-pill sk-pill-green">Group</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-muted-foreground">
                      <span className="sk-pill sk-pill-navy">{h.subject}</span>
                      {h.tutor && (
                        <span className="flex items-center gap-1.5">
                          <AvatarTile name={h.tutor.name} color={h.tutor.color} size={20} radius={6} /> {h.tutor.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" /> due {dateOf(h.dueAt)} {timeOf(h.dueAt)} · {untilLabel(h.dueAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={h.status} />
                    <span className="sk-pill sk-pill-blue">
                      <Zap className="w-3 h-3" /> +{h.xp} XP
                    </span>
                    {h.status === "graded" && h.score != null && (
                      <span className="text-[12px] font-extrabold tabular text-brand-navy">{h.score}%</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}

      {/* ---------- tests tab ---------- */}
      {tab === "tests" &&
        (data.tests.length === 0 ? (
          <div className="sk-card p-6">
            <EmptyState
              icon={FlaskConical}
              title="No quick tests yet"
              sub="Quick tests appear here after you submit auto-graded homework — a fast way to earn XP."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.tests.map((t) => {
              const pct = t.total > 0 ? Math.round((t.score / t.total) * 100) : 0;
              return (
                <div key={t.id} className="sk-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[14.5px] truncate">{t.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="sk-pill sk-pill-navy">{t.subject}</span>
                        <span className="text-[11.5px] text-muted-foreground">{dateOf(t.takenAt)}</span>
                      </div>
                    </div>
                    <span className="sk-pill sk-pill-blue shrink-0">
                      <Zap className="w-3 h-3" /> +{t.xp} XP
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <div
                      className="sk-avatar shrink-0"
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 15,
                        background: pct >= 70 ? "linear-gradient(180deg,#46BD85,#1F9D68)" : "linear-gradient(180deg,#FFA24D,#E76E0F)",
                      }}
                    >
                      <span className="text-[13px] font-extrabold tabular">{pct}%</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-bold tabular">
                          {t.score}/{t.total} correct
                        </span>
                        <span className={`sk-pill ${pct >= 70 ? "sk-pill-green" : "sk-pill-orange"}`}>
                          {pct >= 70 ? "Strong" : "Keep practising"}
                        </span>
                      </div>
                      <div className="sk-progress-track">
                        <div
                          className={`sk-progress-fill ${pct >= 70 ? "sk-progress-fill-green" : "sk-progress-fill-orange"}`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Test score"
                        />
                      </div>
                    </div>
                  </div>
                  {t.weakTopics.length > 0 && (
                    <div className="mt-3.5">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Revise these</div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.weakTopics.map((w) => (
                          <span key={w} className="sk-pill sk-pill-orange">
                            <Target className="w-3 h-3" /> {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {/* ---------- homework detail dialog ---------- */}
      <Dialog open={!!openHw} onOpenChange={(o) => !o && setOpenHw(null)}>
        <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto sk-scroll">
          {openHw && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {openHw.title}
                  <StatusBadge status={result ? (result.autoGraded ? "graded" : "submitted") : openHw.status} />
                </DialogTitle>
                <DialogDescription>
                  {openHw.subject} · due {dateOf(openHw.dueAt)} {timeOf(openHw.dueAt)} ({untilLabel(openHw.dueAt)}) · +{openHw.xp} XP
                  {openHw.tutor ? ` · from ${openHw.tutor.name}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* graded result banner */}
                {(result?.autoGraded || openHw.status === "graded") && (
                  <div className="sk-well rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-[14px]">Your score</span>
                      <span className="font-extrabold text-[18px] tabular text-brand-navy">
                        {result?.autoGraded ? `${result.pct}%` : `${openHw.score ?? 0}%`}
                      </span>
                    </div>
                    <div className="sk-progress-track">
                      <div
                        className={`sk-progress-fill ${
                          (result?.pct ?? openHw.score ?? 0) >= 70 ? "sk-progress-fill-green" : "sk-progress-fill-orange"
                        }`}
                        style={{ width: `${Math.max(4, result?.pct ?? openHw.score ?? 0)}%` }}
                      />
                    </div>
                    {(result?.autoGraded
                      ? `Auto-graded — ${result.correct}/${result.total} correct. Tutor will review the details.`
                      : openHw.feedback) && (
                      <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                        {result?.autoGraded
                          ? `Auto-graded — ${result.correct}/${result.total} correct. Tutor will review the details.`
                          : openHw.feedback}
                      </p>
                    )}
                    {result?.wrongTopics && result.wrongTopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {result.wrongTopics.map((w) => (
                          <span key={w} className="sk-pill sk-pill-orange">
                            <Target className="w-3 h-3" /> {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* questions */}
                <div className="space-y-3">
                  {openHw.questions.map((qq, i) => {
                    const editable = !result && openHw.status === "assigned";
                    const chosen = answers[i] ?? "";
                    return (
                      <div key={i} className="sk-well rounded-2xl p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-[13px] leading-snug">
                            {i + 1}. {qq.q}
                          </span>
                          {qq.marks != null && <span className="sk-pill sk-pill-grey shrink-0">{qq.marks}m</span>}
                        </div>
                        {qq.options ? (
                          <div className="mt-2.5 space-y-1.5">
                            {qq.options.map((opt, oi) => {
                              const letter = LETTERS[oi];
                              const selected = chosen === letter;
                              return (
                                <button
                                  key={oi}
                                  disabled={!editable}
                                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] transition ${
                                    selected
                                      ? "bg-white ring-2 ring-[#315BE5]/60 shadow-sm font-semibold"
                                      : editable
                                        ? "hover:bg-white/70"
                                        : "opacity-80 cursor-default"
                                  }`}
                                  onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? letter : x)))}
                                  aria-pressed={selected}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10.5px] font-bold ${
                                      selected ? "text-white" : "bg-[#E2E8F4] text-[#57627F]"
                                    }`}
                                    style={selected ? { background: "linear-gradient(180deg,#33549E,#14246B)" } : undefined}
                                  >
                                    {letter}
                                  </span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        ) : editable ? (
                          <textarea
                            className="sk-input mt-2.5 min-h-16"
                            placeholder="Write your answer…"
                            value={chosen}
                            onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                            aria-label={`Answer to question ${i + 1}`}
                          />
                        ) : (
                          <div className="mt-2.5 text-[12.5px] bg-white rounded-xl px-3 py-2 border border-border">
                            {chosen || <span className="text-muted-foreground italic">No answer submitted</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* notes + submit */}
                {!result && openHw.status === "assigned" && (
                  <>
                    <textarea
                      className="sk-input min-h-16"
                      placeholder="Anything you want to tell your tutor? (optional notes)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      aria-label="Notes for your tutor"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11.5px] text-muted-foreground">
                        MCQ homework is auto-graded instantly — open questions go to your tutor.
                      </span>
                      <button className="sk-btn sk-btn-orange" disabled={busy} onClick={submit}>
                        {busy ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Submitting…
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" /> Submit · +{openHw.xp} XP
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {openHw.status === "submitted" && !result && (
                  <div className="sk-callout sk-callout-info flex gap-2.5">
                    <Hourglass className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Submitted — awaiting review.</span> Your tutor will grade it and leave
                      feedback here.
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
