"use client";

import { useCallback, useEffect, useState } from "react";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView, SectionTitle } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { dateOf, dateTimeOf, timeOf } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

interface StudentCard {
  id: string;
  name: string;
  color: string;
  grade: string | null;
  board: string | null;
  school: string | null;
  subjects: string[];
  sessionsCompleted: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  nextSessionMode: string | null;
  mastery: { subject: string; avg: number }[];
  weakTopics: string[];
}

interface ReportContent {
  summary: string;
  highlights: string[];
  focus: string[];
  score: number | null;
  attendance: string;
  label: string;
  fallback?: boolean;
}
interface ReportRow {
  id: string;
  studentId: string;
  studentName: string;
  studentColor: string;
  weekStart: string;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  content: ReportContent;
}
interface ReportsData {
  weekStart: string;
  awaiting: ReportRow[];
  approved: ReportRow[];
}

/* ---------- tiny chip editor for highlights / focus ---------- */
function ChipEditor({
  label,
  chips,
  onChange,
  placeholder,
  max,
}: {
  label: string;
  chips: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || chips.length >= max) return;
    onChange([...chips, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {chips.map((c, i) => (
          <span key={`${c}-${i}`} className="sk-pill sk-pill-navy !whitespace-normal !leading-relaxed text-left">
            {c}
            <button
              className="ml-1 opacity-70 hover:opacity-100"
              aria-label={`Remove ${c}`}
              onClick={() => onChange(chips.filter((_, j) => j !== i))}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {chips.length === 0 && <span className="text-[12px] text-muted-foreground">None yet</span>}
      </div>
      {chips.length < max && (
        <div className="flex items-center gap-2">
          <input
            className="sk-input flex-1 !py-1.5 text-[12.5px]"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            aria-label={`Add ${label}`}
          />
          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={add} type="button">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      )}
    </div>
  );
}

export function TStudents() {
  const [students, setStudents] = useState<StudentCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* weekly report approvals */
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [review, setReview] = useState<ReportRow | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editHighlights, setEditHighlights] = useState<string[]>([]);
  const [editFocus, setEditFocus] = useState<string[]>([]);
  const [approveBusy, setApproveBusy] = useState(false);
  const [discardBusy, setDiscardBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tutor/students");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load your roster.");
      setStudents((json?.data?.students ?? []) as StudentCard[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your roster.");
      setStudents([]);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch("/api/tutor/reports");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load weekly reports.");
      setReports(json.data as ReportsData);
    } catch (e) {
      toast({
        title: "Couldn't load weekly reports",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
      setReports({ weekStart: new Date().toISOString(), awaiting: [], approved: [] });
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadReports();
  }, [load, loadReports]);

  const openReview = (r: ReportRow) => {
    setReview(r);
    setEditSummary(r.content.summary);
    setEditHighlights(r.content.highlights.slice(0, 3));
    setEditFocus(r.content.focus.slice(0, 2));
  };

  const approve = async () => {
    if (!review) return;
    setApproveBusy(true);
    try {
      const res = await fetch("/api/tutor/reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: review.id,
          content: { summary: editSummary, highlights: editHighlights, focus: editFocus },
          approve: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "Could not approve the report.");
      toast({
        title: "Report approved & sent",
        description: `${review.studentName}'s parent has been notified.`,
      });
      setReview(null);
      loadReports();
    } catch (e) {
      toast({
        title: "Couldn't approve",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setApproveBusy(false);
    }
  };

  const discard = async () => {
    if (!review) return;
    setDiscardBusy(true);
    try {
      const res = await fetch(`/api/tutor/reports?id=${review.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "Could not discard the draft.");
      toast({ title: "Draft discarded", description: `${review.studentName}'s draft was deleted.` });
      setReview(null);
      loadReports();
    } catch (e) {
      toast({
        title: "Couldn't discard",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDiscardBusy(false);
    }
  };

  const awaiting = reports?.awaiting ?? [];

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">My students</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {students ? `${students.length} learners on your roster` : "Loading roster…"} · mastery from their learning passports
          </p>
        </div>
      </div>

      {error && (
        <div className="sk-callout sk-callout-danger">
          {error} —{" "}
          <button className="underline font-semibold" onClick={load}>
            retry
          </button>
        </div>
      )}

      {/* ---------- weekly report approvals ---------- */}
      <section className="sk-card p-5 space-y-4" aria-label="Weekly report approvals">
        <SectionTitle
          title="Weekly report approvals"
          sub={`AI drafts from session notes & tests · week of ${reports ? dateOf(reports.weekStart) : "…"}`}
          right={
            <div className="flex items-center gap-2">
              {awaiting.length > 0 && (
                <span className="sk-pill sk-pill-orange">
                  <ClipboardCheck className="w-3 h-3" /> {awaiting.length} awaiting
                </span>
              )}
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={loadReports} disabled={reportsLoading}>
                {reportsLoading ? "Drafting…" : "Refresh"}
              </button>
            </div>
          }
        />

        {reportsLoading && !reports ? (
          <div className="py-6">
            <LoadingView label="Drafting this week's reports from session notes and tests…" />
          </div>
        ) : awaiting.length === 0 ? (
          <div className="sk-well px-4 py-3.5 text-[12.5px] text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#1F9D68] shrink-0" />
            All caught up — no drafts waiting for your approval this week.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {awaiting.map((r) => (
              <li key={r.id} className="sk-well p-3.5 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                <AvatarTile name={r.studentName} color={r.studentColor} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13.5px]">{r.studentName}</span>
                    <span className="sk-pill sk-pill-grey">Week of {dateOf(r.weekStart)}</span>
                    {r.content.fallback ? (
                      <span className="sk-pill sk-pill-orange" title="The writing assistant was unavailable — edit before approving">
                        Offline fallback — review carefully
                      </span>
                    ) : (
                      <span className="sk-pill sk-pill-navy">
                        <Sparkles className="w-3 h-3" /> AI draft
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">{r.content.summary}</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => openReview(r)}>
                  <FileText className="w-3.5 h-3.5" /> Review
                </Button>
              </li>
            ))}
          </ul>
        )}

        {reports && reports.approved.length > 0 && (
          <div className="pt-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Recently approved</div>
            <ul className="space-y-1.5">
              {reports.approved.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 text-[12.5px] text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D68] shrink-0" />
                  <span className="font-semibold text-foreground">{r.studentName}</span>
                  <span>· week of {dateOf(r.weekStart)}</span>
                  <span>· approved {r.approvedAt ? dateTimeOf(r.approvedAt) : "recently"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- roster ---------- */}
      {!students ? (
        <LoadingView label="Loading students…" />
      ) : students.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState icon={Users} title="No students yet" sub="Students appear here after their first booking with you." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {students.map((s) => (
            <article key={s.id} className="sk-card p-5 space-y-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarTile name={s.name} color={s.color} size={44} />
                  <div className="min-w-0">
                    <div className="font-bold text-[14px] truncate">{s.name}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate inline-flex items-center gap-1">
                      <GraduationCap className="w-3 h-3 shrink-0" />
                      {s.grade ?? "—"} · {s.board ?? "—"}
                    </div>
                  </div>
                </div>
                <div className="sk-well px-2.5 py-1.5 text-center shrink-0">
                  <div className="text-[15px] font-bold tabular leading-none">{s.sessionsCompleted}</div>
                  <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground mt-0.5">sessions</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {s.subjects.map((sub) => (
                  <StatusPill key={sub} tone="blue" dot={false}>{sub}</StatusPill>
                ))}
              </div>

              {s.mastery.length > 0 ? (
                <div className="space-y-2">
                  {s.mastery.map((m) => (
                    <div key={m.subject}>
                      <div className="flex justify-between text-[11px] font-semibold mb-1">
                        <span>{m.subject} mastery</span>
                        <span className="tabular text-muted-foreground">{m.avg}%</span>
                      </div>
                      <div className="sk-progress-track">
                        <div
                          className={`sk-progress-fill ${m.avg >= 70 ? "sk-progress-fill-green" : m.avg >= 50 ? "" : "sk-progress-fill-orange"}`}
                          style={{ width: `${Math.max(3, m.avg)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sk-well px-3 py-2 text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-orange shrink-0" /> New — no mastery data yet. It builds up
                  after the next few sessions.
                </div>
              )}

              {s.weakTopics.length > 0 && (
                <div className="flex items-start gap-1.5 flex-wrap">
                  <AlertTriangle className="w-3.5 h-3.5 text-brand-orange mt-0.5 shrink-0" />
                  {s.weakTopics.map((t) => (
                    <span key={t} className="sk-pill sk-pill-orange">{t}</span>
                  ))}
                </div>
              )}

              <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-auto">
                <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                {s.nextSessionAt ? (
                  <span>
                    Next: <span className="font-semibold text-foreground">{dateOf(s.nextSessionAt)} · {timeOf(s.nextSessionAt)}</span>
                    {s.lastSessionAt ? <span> · last {dateOf(s.lastSessionAt)}</span> : null}
                  </span>
                ) : s.lastSessionAt ? (
                  <span>Last session {dateOf(s.lastSessionAt)} · nothing booked next</span>
                ) : (
                  <span>No sessions completed yet</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ---------- review + approve dialog ---------- */}
      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto sk-scroll">
          <DialogHeader>
            <DialogTitle>Weekly report — {review?.studentName}</DialogTitle>
            <DialogDescription>
              Edit the draft freely, then approve to send it to the parent. Nothing is shared until you approve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {review?.content.attendance && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="sk-pill sk-pill-grey">
                  <ClipboardCheck className="w-3 h-3" /> {review.content.attendance}
                </span>
                {typeof review.content.score === "number" && (
                  <span className="sk-pill sk-pill-navy">Mastery confidence {review.content.score}/100</span>
                )}
              </div>
            )}

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Summary</div>
              <Textarea
                className="sk-input min-h-[140px] text-[13px] leading-relaxed"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                aria-label="Report summary"
              />
            </div>

            <ChipEditor
              label="Highlights"
              chips={editHighlights}
              onChange={setEditHighlights}
              placeholder="Add a highlight (max 3)…"
              max={3}
            />
            <ChipEditor
              label="Focus areas"
              chips={editFocus}
              onChange={setEditFocus}
              placeholder="Add a focus area (max 2)…"
              max={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={discard}
              disabled={discardBusy || approveBusy}
            >
              <Trash2 className="w-3.5 h-3.5" /> {discardBusy ? "Discarding…" : "Discard draft"}
            </Button>
            <Button onClick={approve} disabled={!editSummary.trim() || approveBusy}>
              <Send className="w-3.5 h-3.5" />
              {approveBusy ? "Approving…" : "Approve & send to parent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
