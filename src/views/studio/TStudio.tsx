"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { dateOf, fromNow, timeOf, WEEKDAYS } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, ArrowRight, BookMarked, BookOpen, CalendarClock, Check, CheckCircle2, ChevronDown, ClipboardCheck,
  Clock, FileStack, FileText, GraduationCap, Home, Layers, Lightbulb, Link2, ListChecks, Minus,
  Package, PenLine, Pencil, Plus, Presentation, Printer, Quote, RefreshCw, Save, Send, Sparkles,
  Target, Users, Wand2,
} from "lucide-react";
import { pdfLessonPlan } from "@/lib/pdf";
import { parseTaxonomy, parseJsonArray, type TaxonomyLabels } from "@/lib/curriculum";

/** Board taxonomy labels with graceful fallback. */
function taxonomyOf(b?: BoardRow | null): TaxonomyLabels {
  return parseTaxonomy(b?.taxonomy);
}

type ConversionKind = "worksheet" | "assessment" | "homework" | "ppt";

const CONVERSION_META: Record<ConversionKind, { title: string; desc: string }> = {
  worksheet: { title: "Generate Worksheet", desc: "Printable practice worksheet with a student header — optionally with a teacher answer key." },
  assessment: { title: "Generate Assessment", desc: "Formative or summative check aligned to this plan's success criteria." },
  homework: { title: "Generate Homework", desc: "Student-facing assignment with estimated time, mode and an optional parent note." },
  ppt: { title: "Generate PPT Slides", desc: "Editable slide outline with objectives, 5E sequence, examples and checks." },
};

interface ConversionDraft {
  kind: ConversionKind;
  title: string;
  instructions: string;
  sections: { name: string; type: "MCQ" | "SA" | "LA"; marksEach: number; questions: { q: string; options?: string[]; answer: string; chapter: string; difficulty: string; cognitive?: string }[] }[];
  answerKey: { note?: string; sections: { name: string; answers: string[] }[] };
  totalMarks: number;
  durationMin: number;
  config: Record<string, unknown>;
}

/** Deterministic fallback questions used by homework / PPT artifacts (built purely from the plan). */
function homeworkQuestions(tasks: string[], expected: string) {
  return tasks.map((t) => ({
    q: t,
    answer: expected || "Checked in the next class — show all working.",
    chapter: "Homework",
    difficulty: "medium",
  }));
}

function slideOutlineQuestions(content: LessonPlanContent, slideCount: number) {
  const slides: { q: string; answer: string; chapter: string; difficulty: string }[] = [];
  const push = (title: string, bullets: string[]) =>
    slides.push({ q: title, answer: bullets.join(" · "), chapter: "Slides", difficulty: "medium" });
  push("Slide 1 — Title & learning objectives", content.learningObjectives.slice(0, 3));
  push("Slide 2 — Success criteria (kid language)", content.successCriteria.slice(0, 3));
  const perStage = Math.max(1, Math.floor((slideCount - 4) / Math.max(1, content.stages.length)));
  let n = 3;
  for (const s of content.stages) {
    for (let i = 0; i < perStage && n <= slideCount - 2; i++, n++) {
      const bullets = [
        s.title,
        ...(s.teacherScript ? [s.teacherScript.split(".")[0]] : []),
        ...(s.analogy ? [`Analogy: ${s.analogy}`] : []),
        ...(s.boardWork?.length ? [`Board: ${s.boardWork[0]}`] : []),
      ];
      push(`Slide ${n} — ${s.stage}: ${s.title}`, bullets);
    }
  }
  push(`Slide ${n} — Worked example`, (content.stages.find((s) => s.workedExamples?.length)?.workedExamples ?? []).slice(0, 1).map((w) => w.problem));
  n++;
  push(`Slide ${n} — Check for understanding & homework`, content.homework.tasks.slice(0, 3));
  return slides.slice(0, slideCount);
}

/* ============================================================
 * Types — shared with the question-paper studio (TPapers)
 * ============================================================ */
export interface BoardRow {
  id: string; code: string; name: string; country: string; region: string;
  status: string; verifyState: string; lastExam: string | null; bodies: string; levels: string;
  sourceUrl?: string | null;
  verifiedAt: string | null; grades: number; subjects: number; chapters: number; selectable: boolean;
  language?: string; languages?: string; taxonomy?: string; yearFormat?: string; pathways?: string;
  approvedQ?: number; topics?: number;
}
export interface GradeRow { id: string; name: string }
export interface SubjectRow { id: string; name: string; chapterCount: number }
export interface TopicRow {
  id: string; name: string; number: number; marks: number;
  subTopics: { name: string }[];
}
export interface ChapterRow {
  id: string; name: string; number: number; status: string;
  source: string; verifiedAt: string | null; marks: number;
  topics?: TopicRow[];
}
export interface StudioStudent { id: string; name: string; color: string; grade: string }

export interface PlanQuestion { q: string; expected: string }
export interface WorkedExample { problem: string; solution: string }
export interface PlanStage {
  stage: string; durationMinutes: number; title: string; teacherScript: string;
  analogy: string; boardWork: string[]; workedExamples: WorkedExample[];
  questions: PlanQuestion[]; differentiation: string;
}
export interface LessonPlanContent {
  schemaVersion: string; title: string;
  learningObjectives: string[]; successCriteria: string[]; materials: string[];
  stages: PlanStage[];
  homework: { tasks: string[]; expectedOutput: string };
  assessment: { formativeChecks: string[]; evidence: string; adjustment: string };
  sourceRefs: string[];
}
export interface PlanListItem {
  id: string; title: string; board: string; grade: string; subject: string;
  chapterNames: string[]; difficulty: string; periods: number; periodMinutes: number;
  slideCount: number; provenance: string; version: number; status: string;
  sharedCount: number; linkedSlotId: string | null; createdAt: string;
}
export interface PlanDetail extends PlanListItem {
  contentJson: LessonPlanContent;
  sharedWith: string[];
  sharedWithNames: string[];
  reflection: ReflectionData;
}

export interface ReflectionData {
  status: "none" | "draft" | "submitted" | string;
  updatedAt: string | null;
  wentWell: string;
  improve: string;
  engagement: string;
  nextSteps: string;
  revision: number;
  submittedAt: string | null;
}

/** Small fetch wrapper that unwraps `{ data }` and throws readable errors.
 *  `timeoutMs` bounds the request so AI generation can never spin the UI forever. */
export async function api<T>(url: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const controller = timeoutMs ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
    init = { ...init, signal: controller.signal };
  }
  try {
    const res = await fetch(url, init);
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(json?.error?.message || "Something went wrong. Please try again.");
    return json?.data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Generation is taking longer than expected. Your settings are kept — please try generating again.");
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ============================================================
 * Small shared pieces (also used by TPapers)
 * ============================================================ */
export function ProvenancePill({ provenance }: { provenance: string }) {
  const cls = provenance === "AI draft" ? "sk-pill-navy" : provenance === "AI draft + tutor edits" ? "sk-pill-blue" : "sk-pill-grey";
  return (
    <span className={`sk-pill ${cls}`} title={`How this artifact was produced: ${provenance}`}>
      {provenance === "Structured fallback" ? <Wand2 className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
      {provenance}
    </span>
  );
}

const STUDIO_STATUS: Record<string, { label: string; tone: "grey" | "blue" | "green" }> = {
  draft: { label: "Draft", tone: "grey" },
  saved: { label: "Saved", tone: "blue" },
  shared: { label: "Shared", tone: "green" },
};
export function StudioStatusPill({ status }: { status: string }) {
  const s = STUDIO_STATUS[status] ?? { label: status, tone: "grey" as const };
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

export function DifficultyPill({ difficulty }: { difficulty: string }) {
  const tone = difficulty === "Easy" ? "green" : difficulty === "Hard" ? "red" : "orange";
  return <StatusPill tone={tone} dot={false}>{difficulty}</StatusPill>;
}

/** Horizontal step indicator built on the sk-step design system classes. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto sk-scroll py-1" role="list" aria-label="Progress steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div
            key={label}
            role="listitem"
            aria-current={active ? "step" : undefined}
            className={`sk-step ${active ? "sk-step-active" : done ? "sk-step-done" : ""}`}
          >
            <span className="sk-step-dot">{done ? <Check className="w-3 h-3" strokeWidth={3} /> : n}</span>
            <span className="hidden sm:inline">{label}</span>
            {active && <span className="sm:hidden">{label}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Expandable, checkable chapter rows bound to the verified curriculum registry. */
export function ChapterList({
  chapters,
  selected,
  onToggle,
  onToggleAll,
  maxHeight = "max-h-[420px]",
  taxonomy = { subject: "Subject", top: "Chapter", mid: "Topic", leaf: "Sub-topic" },
  maxChapters = 8,
  onSelectedTopicsChange,
}: {
  chapters: ChapterRow[];
  selected: string[];
  onToggle: (name: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  maxHeight?: string;
  taxonomy?: { subject: string; top: string; mid: string; leaf: string };
  maxChapters?: number;
  onSelectedTopicsChange?: (count: number) => void;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const allSelected = chapters.length > 0 && chapters.every((c) => selected.includes(c.name));
  const toggleExpand = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectedSubTopicCount = useMemo(
    () => chapters.filter((c) => selected.includes(c.name)).reduce((a, c) => a + (c.topics ?? []).reduce((b, t) => b + (t.subTopics?.length ?? 0), 0), 0),
    [chapters, selected]
  );
  useEffect(() => {
    onSelectedTopicsChange?.(selectedSubTopicCount);
  }, [selectedSubTopicCount, onSelectedTopicsChange]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted-foreground">
          {selected.length} of {chapters.length} {taxonomy.top.toLowerCase()}{chapters.length === 1 ? "" : "s"} selected
          {selectedSubTopicCount > 0 && (
            <span className="text-[#156F4C] font-semibold"> · {selectedSubTopicCount} {taxonomy.leaf.toLowerCase()}s</span>
          )}
          <span className="text-[10.5px] opacity-70"> · max {maxChapters} per plan</span>
        </span>
        <button
          className="text-[12px] font-bold text-brand-navy underline underline-offset-2 hover:opacity-80"
          onClick={() => onToggleAll(!allSelected)}
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className={`${maxHeight} overflow-y-auto sk-scroll space-y-2 pr-1`} role="group" aria-label={`${taxonomy.top}s`}>
        {chapters.map((ch) => {
          const isSel = selected.includes(ch.name);
          const isOpen = expanded.includes(ch.id);
          const topicCount = ch.topics?.length ?? 0;
          const subCount = (ch.topics ?? []).reduce((a, t) => a + (t.subTopics?.length ?? 0), 0);
          return (
            <div
              key={ch.id}
              className={`rounded-[14px] border transition-all ${isSel ? "border-[#315BE5]/60 bg-[#F0F4FE] dark:bg-[#1B2445]" : "border-border bg-card hover:border-[#B9C6E4]"}`}
            >
              <div className="flex items-center gap-3 p-3">
                <Checkbox
                  checked={isSel}
                  onCheckedChange={() => onToggle(ch.name)}
                  aria-label={`Select ${taxonomy.top.toLowerCase()} ${ch.number}: ${ch.name}`}
                  className="mt-0.5"
                />
                <button type="button" className="flex-1 text-left min-w-0" onClick={() => onToggle(ch.name)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold tracking-wide text-muted-foreground uppercase">Ch {ch.number}</span>
                    <span className="font-semibold text-[13px] leading-snug">{ch.name}</span>
                    <span className="sk-pill sk-pill-green">Active</span>
                    <span className="sk-pill sk-pill-grey">{ch.marks} marks</span>
                    {topicCount > 0 && (
                      <span className="sk-pill sk-pill-grey">{topicCount} {taxonomy.mid.toLowerCase()}s · {subCount} {taxonomy.leaf.toLowerCase()}s</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleExpand(ch.id)}
                  aria-label={`${isOpen ? "Hide" : "Show"} details for ${ch.name}`}
                  aria-expanded={isOpen}
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                >
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {isOpen && (
                <div className="px-3.5 pb-3 pt-0.5 text-[11.5px] text-muted-foreground leading-relaxed border-t border-dashed border-border mt-1 pt-2.5 ml-9 space-y-1.5">
                  <div>
                    Source: <span className="font-semibold text-foreground">{ch.source}</span>
                    {ch.verifiedAt ? <> · Verified {dateOf(ch.verifiedAt)}</> : null}
                    {ch.status !== "active" ? <> · Status: {ch.status}</> : null}
                  </div>
                  {(ch.topics ?? []).length > 0 && (
                    <div className="rounded-[10px] border border-border bg-white/60 dark:bg-white/5 p-2.5 space-y-2">
                      <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                        {taxonomy.mid} → {taxonomy.leaf} breakdown
                      </div>
                      {(ch.topics ?? []).map((t) => (
                        <div key={t.id} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-[2px] text-[#156F4C] shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground text-[11.5px]">{t.name}</span>
                            <span className="text-[10.5px] opacity-70 ml-1.5">{t.marks} marks</span>
                            {t.subTopics?.length > 0 && (
                              <div className="text-[10.5px] mt-0.5">{t.subTopics.map((s) => s.name).join(" · ")}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Checkbox dialog for sharing an artifact with the tutor's students. */
export function ShareStudentsDialog({
  open, onOpenChange, students, title, description, confirmLabel = "Send to students",
  busy = false, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StudioStudent[] | null;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (studentIds: string[]) => void;
}) {
  // The body (and its selection state) mounts fresh on every open — no reset effects needed.
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {open ? (
        <ShareDialogBody
          students={students}
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          busy={busy}
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

function ShareDialogBody({
  students, title, description, confirmLabel, busy, onOpenChange, onConfirm,
}: {
  students: StudioStudent[] | null;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (studentIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = !!students && students.length > 0 && selected.length === students.length;

  return (
    <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 text-left">
          <DialogTitle className="text-[16px]">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-2 shrink-0">
          <button
            className="text-[12px] font-bold text-brand-navy underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            onClick={() => setSelected(allSelected ? [] : (students ?? []).map((s) => s.id))}
            disabled={!students || students.length === 0}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto sk-scroll px-5 pb-3 space-y-1.5">
          {!students ? (
            <LoadingView label="Loading your students…" />
          ) : students.length === 0 ? (
            <EmptyState icon={Users} title="No students yet" sub="Students appear here after their first booking with you." />
          ) : (
            students.map((s) => {
              const on = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                  className={`w-full flex items-center gap-3 rounded-[12px] border p-2.5 text-left transition ${on ? "border-[#315BE5]/60 bg-[#F0F4FE] dark:bg-[#1B2445]" : "border-border hover:border-[#B9C6E4]"}`}
                  aria-pressed={on}
                >
                  {/* visual check indicator (a real Checkbox here would nest a button inside a button) */}
                  <span
                    aria-hidden
                    className={`w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${on ? "bg-primary border-primary text-primary-foreground" : "border-input bg-transparent"}`}
                  >
                    {on && <Check className="w-3 h-3" strokeWidth={3.2} />}
                  </span>
                  <AvatarTile name={s.name} color={s.color} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[13px] truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.grade || "—"}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <DialogFooter className="p-4 border-t border-border items-center gap-2 flex-col sm:flex-row">
          <span className="text-[11px] text-muted-foreground mr-auto flex items-center gap-1.5">
            <Send className="w-3 h-3" /> In-app + WhatsApp (demo)
          </span>
          <button className="sk-btn sk-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button
            className="sk-btn sk-btn-orange"
            disabled={selected.length === 0 || busy}
            onClick={() => onConfirm(selected)}
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {confirmLabel} {selected.length > 0 ? `(${selected.length})` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
  );
}

/** Cycling status messages shown while an AI generation runs. */
export function ProgressCycle({ labels }: { labels: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (labels.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % labels.length), 2600);
    return () => clearInterval(t);
  }, [labels.length]);
  return (
    <div className="sk-card-flat p-6 sm:p-8 flex flex-col items-center gap-3.5 text-center" role="status" aria-live="polite">
      <div
        className="w-10 h-10 rounded-full animate-spin"
        style={{
          background: "conic-gradient(from 0deg, #FFE1BC, #F47B20)",
          mask: "radial-gradient(farthest-side, transparent 58%, #000 60%)",
          WebkitMask: "radial-gradient(farthest-side, transparent 58%, #000 60%)",
        }}
      />
      <div className="text-[13.5px] font-bold">{labels[i]}</div>
      <div className="w-60 max-w-full sk-progress-track">
        <div
          className="sk-progress-fill sk-progress-fill-orange"
          style={{ width: `${Math.round(((i + 1) / labels.length) * 100)}%`, transition: "width 2.6s linear" }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">This can take up to a minute — good teaching is worth it.</div>
    </div>
  );
}

/* ============================================================
 * Lesson plan rendering (library dialog + wizard preview + print)
 * ============================================================ */
const STAGE_META: Record<string, string> = {
  ENGAGE: "sk-pill-orange",
  EXPLORE: "sk-pill-green",
  EXPLAIN: "sk-pill-navy",
  ELABORATE: "sk-pill-blue",
  EVALUATE: "sk-pill-red",
};

const TINTS: Record<string, string> = {
  blue: "bg-[#EDF3FE] border-[#C9D7F8] dark:bg-[#151D3A] dark:border-[#2A3560]",
  amber: "bg-[#FFF6E8] border-[#F2D9B3] dark:bg-[#241E12] dark:border-[#4A3B22]",
  red: "bg-[#FDEEF0] border-[#F2C6CC] dark:bg-[#251519] dark:border-[#4A2A30]",
};

function TintWell({
  tone, title, icon: Icon, children,
}: {
  tone: keyof typeof TINTS; title: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[14px] border p-3.5 shadow-[inset_0_1px_3px_rgba(20,36,107,0.07)] dark:shadow-none ${TINTS[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
        {title}
      </div>
      {children}
    </div>
  );
}

function BlockLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5">
      <Icon className="w-3.5 h-3.5" />
      {children}
    </div>
  );
}

export function LessonPlanBody({
  content, editing = false, allowObjectiveEdit = false, onChange,
}: {
  content: LessonPlanContent;
  editing?: boolean;
  allowObjectiveEdit?: boolean;
  onChange?: (c: LessonPlanContent) => void;
}) {
  const [objEditing, setObjEditing] = useState<number | null>(null);

  const patch = (p: Partial<LessonPlanContent>) => onChange?.({ ...content, ...p });
  const patchStage = (i: number, p: Partial<PlanStage>) => {
    patch({ stages: content.stages.map((s, x) => (x === i ? { ...s, ...p } : s)) });
  };

  const objectives = content.learningObjectives ?? [];
  const criteria = content.successCriteria ?? [];
  const materials = content.materials ?? [];
  const stages = content.stages ?? [];
  const homework = content.homework ?? { tasks: [], expectedOutput: "" };
  const assessment = content.assessment ?? { formativeChecks: [], evidence: "", adjustment: "" };

  return (
    <div className="space-y-5">
      {/* objectives */}
      <section aria-label="Learning objectives" className="sk-card-flat p-4 sm:p-5">
        <BlockLabel icon={Target}>Learning objectives</BlockLabel>
        <ol className="space-y-2 mt-1">
          {objectives.map((o, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#14246B] text-white text-[10.5px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              {objEditing === i ? (
                <input
                  autoFocus
                  className="sk-input flex-1 !py-1.5 text-[13px]"
                  value={o}
                  aria-label={`Objective ${i + 1}`}
                  onChange={(e) => patch({ learningObjectives: objectives.map((x, xi) => (xi === i ? e.target.value : x)) })}
                  onBlur={() => setObjEditing(null)}
                  onKeyDown={(e) => e.key === "Enter" && setObjEditing(null)}
                />
              ) : (
                <>
                  <span className="flex-1 text-[13px] leading-relaxed">{o}</span>
                  {allowObjectiveEdit && (
                    <button
                      className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                      onClick={() => setObjEditing(i)}
                      aria-label={`Edit objective ${i + 1}`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* success criteria + materials */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section aria-label="Success criteria" className="sk-card-flat p-4 sm:p-5">
          <BlockLabel icon={ListChecks}>Success criteria</BlockLabel>
          <ul className="space-y-2 mt-1">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-[#1F9D68] shrink-0 mt-0.5" />
                {c}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Materials" className="sk-card-flat p-4 sm:p-5">
          <BlockLabel icon={Package}>Materials to prepare</BlockLabel>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {materials.length ? (
              materials.map((m, i) => (
                <span key={i} className="sk-pill sk-pill-orange">{m}</span>
              ))
            ) : (
              <span className="text-[12.5px] text-muted-foreground">No special materials needed.</span>
            )}
          </div>
        </section>
      </div>

      {/* 5E stages */}
      <div className="space-y-4">
        {stages.map((s, i) => {
          const meta = STAGE_META[s.stage?.toUpperCase?.() ?? ""] ?? "sk-pill-grey";
          return (
            <article key={i} className="sk-card p-4 sm:p-5 space-y-3.5" aria-label={`${s.stage} stage`}>
              <header className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`sk-pill ${meta} tracking-wider`}>{s.stage}</span>
                  <h4 className="font-bold text-[14px] truncate">{s.title}</h4>
                </div>
                <span className="sk-pill sk-pill-grey">
                  <Clock className="w-3 h-3" /> {s.durationMinutes} min
                </span>
              </header>

              {editing ? (
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Explanation to say aloud</label>
                  <textarea
                    className="sk-input mt-1.5 min-h-[84px] text-[12.5px] leading-relaxed"
                    value={s.teacherScript}
                    aria-label={`${s.stage} explanation to say aloud`}
                    onChange={(e) => patchStage(i, { teacherScript: e.target.value })}
                  />
                </div>
              ) : (
                s.teacherScript && (
                  <TintWell tone="blue" title="Explanation to say aloud" icon={Quote}>
                    <p className="text-[13px] leading-relaxed">{s.teacherScript}</p>
                  </TintWell>
                )
              )}

              {editing ? (
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Analogy to use</label>
                  <textarea
                    className="sk-input mt-1.5 min-h-[56px] text-[12.5px]"
                    value={s.analogy}
                    aria-label={`${s.stage} analogy`}
                    onChange={(e) => patchStage(i, { analogy: e.target.value })}
                  />
                </div>
              ) : (
                s.analogy && (
                  <TintWell tone="amber" title="Analogy to use" icon={Lightbulb}>
                    <p className="text-[13px] leading-relaxed italic">{s.analogy}</p>
                  </TintWell>
                )
              )}

              {(editing || (s.boardWork ?? []).length > 0) && (
                <TintWell tone="red" title="Board work / diagram" icon={PenLine}>
                  {editing ? (
                    <textarea
                      className="sk-input mt-1 min-h-[64px] text-[12.5px] bg-white/80"
                      value={(s.boardWork ?? []).join("\n")}
                      aria-label={`${s.stage} board work, one line per item`}
                      onChange={(e) => patchStage(i, { boardWork: e.target.value.split("\n").filter((x) => x.trim()) })}
                      placeholder="One board-work item per line"
                    />
                  ) : (
                    <ul className="space-y-1.5">
                      {s.boardWork.map((b, j) => (
                        <li key={j} className="text-[12.5px] leading-relaxed flex gap-2">
                          <span className="text-brand-orange font-bold shrink-0">—</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </TintWell>
              )}

              {(s.workedExamples ?? []).length > 0 && (
                <div>
                  <BlockLabel icon={FileText}>Worked examples</BlockLabel>
                  <div className="space-y-2">
                    {s.workedExamples.map((w, j) => (
                      <div key={j} className="rounded-[12px] border border-border bg-card/70 p-3">
                        <div className="text-[12.5px] font-bold leading-snug flex gap-2">
                          <span className="sk-pill sk-pill-navy shrink-0">E{j + 1}</span>
                          <span>{w.problem}</span>
                        </div>
                        <p className="text-[12.5px] text-muted-foreground mt-1.5 pl-1 whitespace-pre-wrap leading-relaxed">{w.solution}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(s.questions ?? []).length > 0 && (
                <div>
                  <BlockLabel icon={Layers}>Questions &amp; expected answers</BlockLabel>
                  <div className="space-y-1.5">
                    {s.questions.map((q, j) => (
                      <div key={j} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 rounded-[12px] bg-[#F6F8FD] dark:bg-[#1A2242] p-3">
                        <div className="flex-1 text-[12.5px] font-semibold leading-relaxed">
                          <span className="text-muted-foreground mr-1">Q{j + 1}.</span>
                          {q.q}
                        </div>
                        <div className="text-[12px] text-[#1F9D68] font-semibold sm:max-w-[46%] leading-relaxed sm:border-l sm:border-dashed sm:border-[#D6E7DC] sm:pl-3">
                          {q.expected}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editing ? (
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Differentiation note</label>
                  <textarea
                    className="sk-input mt-1.5 min-h-[52px] text-[12.5px]"
                    value={s.differentiation}
                    aria-label={`${s.stage} differentiation`}
                    onChange={(e) => patchStage(i, { differentiation: e.target.value })}
                  />
                </div>
              ) : (
                s.differentiation && (
                  <div className="flex items-start gap-2.5 rounded-[12px] border border-dashed border-border p-3">
                    <Users className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">Differentiation</div>
                      <p className="text-[12.5px] leading-relaxed mt-0.5">{s.differentiation}</p>
                    </div>
                  </div>
                )
              )}
            </article>
          );
        })}
      </div>

      {/* homework + assessment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section aria-label="Homework" className="sk-card-flat p-4 sm:p-5">
          <BlockLabel icon={Home}>Homework</BlockLabel>
          {editing ? (
            <div className="space-y-2.5 mt-1">
              <textarea
                className="sk-input min-h-[76px] text-[12.5px]"
                value={(homework.tasks ?? []).join("\n")}
                aria-label="Homework tasks, one per line"
                onChange={(e) => patch({ homework: { ...homework, tasks: e.target.value.split("\n").filter((x) => x.trim()) } })}
                placeholder="One task per line"
              />
              <input
                className="sk-input text-[12.5px]"
                value={homework.expectedOutput}
                aria-label="Expected homework output"
                onChange={(e) => patch({ homework: { ...homework, expectedOutput: e.target.value } })}
                placeholder="Expected output"
              />
            </div>
          ) : (
            <>
              <ul className="space-y-1.5 mt-1">
                {(homework.tasks ?? []).map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                    <span className="w-4 h-4 rounded-[5px] border-2 border-[#E8A45C] shrink-0 mt-1" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              {homework.expectedOutput && (
                <div className="text-[11.5px] text-muted-foreground mt-2.5 flex items-center gap-1.5">
                  <ClipboardCheck className="w-3.5 h-3.5 shrink-0" /> Expected: {homework.expectedOutput}
                </div>
              )}
            </>
          )}
        </section>
        <section aria-label="Assessment for learning" className="sk-card-flat p-4 sm:p-5">
          <BlockLabel icon={ClipboardCheck}>Assessment for learning</BlockLabel>
          {editing ? (
            <div className="space-y-2.5 mt-1">
              <textarea
                className="sk-input min-h-[60px] text-[12.5px]"
                value={(assessment.formativeChecks ?? []).join("\n")}
                aria-label="Formative checks, one per line"
                onChange={(e) => patch({ assessment: { ...assessment, formativeChecks: e.target.value.split("\n").filter((x) => x.trim()) } })}
                placeholder="One formative check per line"
              />
              <textarea
                className="sk-input min-h-[52px] text-[12.5px]"
                value={assessment.evidence}
                aria-label="Evidence of learning"
                onChange={(e) => patch({ assessment: { ...assessment, evidence: e.target.value } })}
                placeholder="Evidence collected"
              />
              <textarea
                className="sk-input min-h-[52px] text-[12.5px]"
                value={assessment.adjustment}
                aria-label="Adjustment if learning is shaky"
                onChange={(e) => patch({ assessment: { ...assessment, adjustment: e.target.value } })}
                placeholder="Adjustment / reteach plan"
              />
            </div>
          ) : (
            <div className="space-y-2.5 mt-1 text-[12.5px] leading-relaxed">
              {(assessment.formativeChecks ?? []).map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#1F9D68] shrink-0 mt-0.5" />
                  {f}
                </div>
              ))}
              {assessment.evidence && (
                <p><span className="font-bold">Evidence:</span> <span className="text-muted-foreground">{assessment.evidence}</span></p>
              )}
              {assessment.adjustment && (
                <p><span className="font-bold">If shaky:</span> <span className="text-muted-foreground">{assessment.adjustment}</span></p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* source refs */}
      {(content.sourceRefs ?? []).length > 0 && (
        <div className="flex items-start gap-2 text-[11.5px] text-muted-foreground px-1">
          <BookMarked className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Grounded in: {(content.sourceRefs ?? []).join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Wizard — 7 steps
 * ============================================================ */
const WIZARD_STEPS = ["Board", "Grade", "Subject", "Chapters", "Configure", "Generate", "Save"];
const GEN_MESSAGES = ["Retrieving verified curriculum…", "Drafting 5E stages…", "Verifying solutions…", "Polishing teacher scripts…"];

interface GenResult {
  plan: LessonPlanContent;
  provenance: string;
  generationMs: number;
}

function LessonWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);

  const [boards, setBoards] = useState<BoardRow[] | null>(null);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [boardCode, setBoardCode] = useState("");
  const [boardName, setBoardName] = useState("");

  const [grades, setGrades] = useState<GradeRow[] | null>(null);
  const [gradeName, setGradeName] = useState("");
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [chapterNames, setChapterNames] = useState<string[]>([]);

  const [difficulty, setDifficulty] = useState("Medium");
  const [periods, setPeriods] = useState(1);
  const [periodMinutes, setPeriodMinutes] = useState(45);
  const [slideCount, setSlideCount] = useState(8);
  const [language, setLanguage] = useState("English");
  const [includeImages, setIncludeImages] = useState(true);
  const [subTopicCount, setSubTopicCount] = useState(0);
  const subTopicCb = useCallback((n: number) => setSubTopicCount(n), []);

  const [generating, setGenerating] = useState(false);
  const [gen, setGen] = useState<GenResult | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const loadBoards = useCallback(async () => {
    setBoardsError(null);
    try {
      setBoards(await api<BoardRow[]>("/api/curriculum/boards"));
    } catch (e) {
      setBoardsError(e instanceof Error ? e.message : "Could not load the curriculum registry.");
      setBoards([]);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  /* board → grades (changing board clears the rest of the chain) */
  useEffect(() => {
    if (!boardCode) {
      setGrades(null);
      return;
    }
    let alive = true;
    setGrades(null);
    setGradeName("");
    setSubjects(null);
    setSubjectName("");
    setChapters(null);
    setChapterNames([]);
    setGen(null);
    // default the instruction language from the board's own list
    const b = boards?.find((x) => x.code === boardCode);
    setLanguage(b ? parseJsonArray(b.languages)[0] || "English" : "English");
    api<{ grades: GradeRow[] }>(`/api/curriculum/grades?boardId=${encodeURIComponent(boardCode)}`)
      .then((d) => alive && setGrades(d.grades))
      .catch(() => alive && setGrades([]));
    return () => {
      alive = false;
    };
  }, [boardCode, boards]);

  /* grade → subjects */
  useEffect(() => {
    if (!boardCode || !gradeName) {
      setSubjects(null);
      setSubjectName("");
      return;
    }
    let alive = true;
    setSubjects(null);
    setSubjectName("");
    setChapters(null);
    setChapterNames([]);
    setGen(null);
    api<{ subjects: SubjectRow[] }>(`/api/curriculum/subjects?boardId=${encodeURIComponent(boardCode)}&gradeId=${encodeURIComponent(gradeName)}`)
      .then((d) => alive && setSubjects(d.subjects))
      .catch(() => alive && setSubjects([]));
    return () => {
      alive = false;
    };
  }, [boardCode, gradeName]);

  /* subject → chapters */
  useEffect(() => {
    if (!boardCode || !gradeName || !subjectName) {
      setChapters(null);
      setChapterNames([]);
      return;
    }
    let alive = true;
    setChapters(null);
    setChapterNames([]);
    setGen(null);
    api<{ chapters: ChapterRow[] }>(`/api/curriculum/chapters?boardId=${encodeURIComponent(boardCode)}&gradeId=${encodeURIComponent(gradeName)}&subjectId=${encodeURIComponent(subjectName)}`)
      .then((d) => alive && setChapters(d.chapters))
      .catch(() => alive && setChapters([]));
    return () => {
      alive = false;
    };
  }, [boardCode, gradeName, subjectName]);

  const totalMinutes = periods * periodMinutes;
  const selBoard = boards?.find((b) => b.code === boardCode);

  const invalidateGen = () => setGen(null);
  const MAX_CHAPTERS = 8;

  const toggleChapter = (name: string) => {
    setChapterNames((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      if (prev.length >= MAX_CHAPTERS) {
        toast({ title: `Up to ${MAX_CHAPTERS} chapters per plan`, description: "A single plan works best focused — split bigger units into two plans.", variant: "destructive" });
        return prev;
      }
      return [...prev, name];
    });
    invalidateGen();
  };
  const toggleAllChapters = (selectAll: boolean) => {
    setChapterNames(selectAll ? (chapters ?? []).slice(0, MAX_CHAPTERS).map((c) => c.name) : []);
    invalidateGen();
  };

  const canNext =
    (step === 1 && !!boardCode) ||
    (step === 2 && !!gradeName) ||
    (step === 3 && !!subjectName) ||
    (step === 4 && chapterNames.length > 0) ||
    step === 5 ||
    (step === 6 && !!gen);

  const generate = async () => {
    setGenerating(true);
    setGen(null);
    try {
      const data = await api<GenResult>("/api/studio/generate/lesson-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          board: boardCode, grade: gradeName, subject: subjectName, chapters: chapterNames,
          difficulty, periods, periodMinutes, slideCount, language, includeImages,
        }),
      }, 75_000);
      setGen(data);
      if (!title) setTitle(data.plan.title || `${chapterNames[0] ?? "Lesson"} plan`);
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!gen) return;
    setSaving(true);
    try {
      await api("/api/studio/lesson-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || gen.plan.title || "Untitled lesson plan",
          board: boardCode, grade: gradeName, subject: subjectName, chapterNames,
          difficulty, periods, periodMinutes, slideCount,
          contentJson: gen.plan, provenance: gen.provenance,
        }),
      });
      toast({
        title: "Lesson plan saved to your library",
        description: `“${title.trim() || gen.plan.title}” is ready to edit, print or share with your students.`,
      });
      onDone();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* wizard header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Generate a lesson plan</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Seven quick steps — grounded in verified board syllabi, structured on the 5E model.
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost" onClick={onDone}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to library
        </button>
      </div>

      <div className="sk-card p-4 sm:p-6 space-y-5">
        <Stepper steps={WIZARD_STEPS} current={step} />

        {/* 1 · board */}
        {step === 1 && (
          <div>
            <h3 className="font-bold text-[15px]">Which board is this lesson for?</h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-4">
              Only verified boards are selectable — others are being ingested into the registry.
            </p>
            {boardsError && (
              <div className="sk-callout sk-callout-danger mb-3">
                {boardsError} —{" "}
                <button className="underline font-semibold" onClick={loadBoards}>retry</button>
              </div>
            )}
            {!boards ? (
              <LoadingView label="Loading the curriculum registry…" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {boards.map((b) => {
                  const disabled = !b.selectable;
                  const selected = b.code === boardCode;
                  return (
                    <button
                      key={b.code}
                      disabled={disabled}
                      onClick={() => {
                        setBoardCode(b.code);
                        setBoardName(b.name);
                        setStep(2);
                      }}
                      className={`sk-card p-4 text-left space-y-2 transition-all ${
                        disabled ? "opacity-55 cursor-not-allowed" : "hover:-translate-y-0.5"
                      } ${selected ? "ring-2 ring-[#315BE5]/50 border-[#315BE5]" : ""}`}
                      aria-pressed={selected}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-[13.5px] leading-snug">{b.name}</div>
                        {b.verifyState === "verified" ? (
                          <span className="sk-pill sk-pill-green">Verified</span>
                        ) : (
                          <span className="sk-pill sk-pill-grey">Coming soon</span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {b.country} · {b.bodies}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{b.levels}</div>
                      <div className="text-[11px] font-semibold text-brand-navy">
                        {b.grades} grades · {b.subjects} subjects · {b.chapters} verified chapters
                      </div>
                      {b.status === "legacy" && (
                        <span className="sk-pill sk-pill-orange">Legacy — last exam {b.lastExam ?? "—"}</span>
                      )}
                      {selected && (
                        <div className="pt-1">
                          <span className="sk-pill sk-pill-navy"><Check className="w-3 h-3" /> Selected</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2 · grade */}
        {step === 2 && (
          <div>
            <h3 className="font-bold text-[15px]">Grade band</h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-4">{boardName} · pick the class you are teaching.</p>
            {!grades ? (
              <LoadingView label="Loading grades…" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {grades.map((g) => (
                  <button
                    key={g.id}
                    className={`sk-chip ${gradeName === g.name ? "sk-chip-active" : ""}`}
                    onClick={() => {
                      setGradeName(g.name);
                      setStep(3);
                    }}
                    aria-pressed={gradeName === g.name}
                  >
                    <GraduationCap className="w-3.5 h-3.5" /> {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3 · subject */}
        {step === 3 && (
          <div>
            <h3 className="font-bold text-[15px]">Subject</h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-4">
              {boardName} · {gradeName}
            </p>
            {!subjects ? (
              <LoadingView label="Loading subjects…" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    className={`sk-chip ${subjectName === s.name ? "sk-chip-active" : ""}`}
                    onClick={() => {
                      setSubjectName(s.name);
                      setStep(4);
                    }}
                    aria-pressed={subjectName === s.name}
                  >
                    <BookOpen className="w-3.5 h-3.5" /> {s.name}
                    <span className="opacity-70 text-[10.5px] ml-1">({s.chapterCount} ch)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4 · chapters (with topic → sub-topic tree) */}
        {step === 4 && (
          <div>
            <h3 className="font-bold text-[15px]">{taxonomyOf(selBoard).top}s to cover</h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-4">
              Verified {boardName} · {gradeName} · {subjectName} {taxonomyOf(selBoard).top.toLowerCase()}s. Expand a row for its {taxonomyOf(selBoard).mid.toLowerCase()}s, {taxonomyOf(selBoard).leaf.toLowerCase()}s, source and verification date.
            </p>
            {!chapters ? (
              <LoadingView label="Loading chapters…" />
            ) : chapters.length === 0 ? (
              <EmptyState icon={BookOpen} title="No chapters found" sub="This subject has no chapters in the registry yet." />
            ) : (
              <>
                <ChapterList chapters={chapters} selected={chapterNames} onToggle={toggleChapter} onToggleAll={toggleAllChapters} taxonomy={taxonomyOf(selBoard)} onSelectedTopicsChange={subTopicCb} />
                <div className="sticky bottom-2 z-10 mt-3 rounded-[14px] border border-border bg-white/90 dark:bg-[#161D3A]/90 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-2 shadow-[0_4px_16px_rgba(20,36,107,0.10)]">
                  <span className="text-[12.5px] font-semibold">
                    {chapterNames.length} {taxonomyOf(selBoard).top.toLowerCase()}{chapterNames.length === 1 ? "" : "s"} selected
                    {subTopicCount > 0 && (
                      <span className="text-[#156F4C] font-semibold"> · {subTopicCount} {taxonomyOf(selBoard).leaf.toLowerCase()}s</span>
                    )}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {chapterNames.length > 0 ? chapterNames.slice(0, 2).join(", ") + (chapterNames.length > 2 ? ` +${chapterNames.length - 2} more` : "") : `Select at least one ${taxonomyOf(selBoard).top.toLowerCase()}`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* 5 · configure */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-[15px]">Configure the lesson</h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">Tune difficulty, length and slide depth.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Difficulty</div>
                <div className="sk-segment" role="group" aria-label="Difficulty">
                  {["Easy", "Medium", "Hard"].map((d) => (
                    <button
                      key={d}
                      className={`sk-segment-item ${difficulty === d ? "sk-segment-item-active" : ""}`}
                      onClick={() => {
                        setDifficulty(d);
                        invalidateGen();
                      }}
                      aria-pressed={difficulty === d}
                    >
                      {d}{d === "Medium" ? " — grade level" : ""}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="lw-lang" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">
                  Instruction language
                </label>
                <select
                  id="lw-lang"
                  className="sk-input"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    invalidateGen();
                  }}
                >
                  {(parseJsonArray(selBoard?.languages).length ? parseJsonArray(selBoard?.languages) : ["English"]).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Periods (1–3)</div>
                <div className="flex items-center gap-3">
                  <button
                    className="sk-btn sk-btn-ghost !px-3"
                    onClick={() => {
                      setPeriods((p) => Math.max(1, p - 1));
                      invalidateGen();
                    }}
                    disabled={periods <= 1}
                    aria-label="Fewer periods"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="sk-well px-5 py-2 text-center min-w-[92px]">
                    <span className="text-[17px] font-bold tabular">{periods}</span>
                    <span className="text-[11px] text-muted-foreground ml-1.5">period{periods > 1 ? "s" : ""}</span>
                  </div>
                  <button
                    className="sk-btn sk-btn-ghost !px-3"
                    onClick={() => {
                      setPeriods((p) => Math.min(3, p + 1));
                      invalidateGen();
                    }}
                    disabled={periods >= 3}
                    aria-label="More periods"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Minutes per period</div>
                <div className="sk-segment" role="group" aria-label="Minutes per period">
                  {[40, 45, 50].map((m) => (
                    <button
                      key={m}
                      className={`sk-segment-item ${periodMinutes === m ? "sk-segment-item-active" : ""}`}
                      onClick={() => {
                        setPeriodMinutes(m);
                        invalidateGen();
                      }}
                      aria-pressed={periodMinutes === m}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Slide depth</div>
                <div className="sk-segment" role="group" aria-label="Slide count">
                  {[6, 8, 10].map((s) => (
                    <button
                      key={s}
                      className={`sk-segment-item ${slideCount === s ? "sk-segment-item-active" : ""}`}
                      onClick={() => {
                        setSlideCount(s);
                        invalidateGen();
                      }}
                      aria-pressed={slideCount === s}
                    >
                      {s} slides
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Images &amp; diagrams</div>
                <div className="sk-segment" role="group" aria-label="Images">
                  <button
                    className={`sk-segment-item ${includeImages ? "sk-segment-item-active" : ""}`}
                    onClick={() => {
                      setIncludeImages(true);
                      invalidateGen();
                    }}
                    aria-pressed={includeImages}
                  >
                    Include
                  </button>
                  <button
                    className={`sk-segment-item ${!includeImages ? "sk-segment-item-active" : ""}`}
                    onClick={() => {
                      setIncludeImages(false);
                      invalidateGen();
                    }}
                    aria-pressed={!includeImages}
                  >
                    Text only
                  </button>
                </div>
              </div>
            </div>

            <div className="sk-well p-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Summary</div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[12.5px]">
                <div><dt className="text-muted-foreground text-[11px]">Board</dt><dd className="font-semibold">{selBoard?.name ?? boardCode}</dd></div>
                <div><dt className="text-muted-foreground text-[11px]">Grade</dt><dd className="font-semibold">{gradeName}</dd></div>
                <div><dt className="text-muted-foreground text-[11px]">Subject</dt><dd className="font-semibold">{subjectName}</dd></div>
                <div><dt className="text-muted-foreground text-[11px]">Chapters</dt><dd className="font-semibold">{chapterNames.length} selected</dd></div>
                {subTopicCount > 0 && <div><dt className="text-muted-foreground text-[11px]">Sub-topics</dt><dd className="font-semibold">{subTopicCount}</dd></div>}
                <div><dt className="text-muted-foreground text-[11px]">Total time</dt><dd className="font-semibold tabular">{totalMinutes} minutes</dd></div>
                <div><dt className="text-muted-foreground text-[11px]">Difficulty</dt><dd className="font-semibold">{difficulty}</dd></div>
                <div><dt className="text-muted-foreground text-[11px]">Language</dt><dd className="font-semibold">{language}</dd></div>
                <div><dt className="text-muted-foreground text-[11px]">Images</dt><dd className="font-semibold">{includeImages ? "Included" : "Text only"}</dd></div>
              </dl>
            </div>
          </div>
        )}

        {/* 6 · generate */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-[15px]">Review &amp; generate</h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                The 5E draft (Engage → Explore → Explain → Elaborate → Evaluate) is generated from the verified chapters only.
              </p>
            </div>

            <dl className="sk-well p-4 text-[12.5px] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Board</dt><dd className="font-semibold">{selBoard?.name ?? boardCode}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Grade</dt><dd className="font-semibold">{gradeName}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Subject</dt><dd className="font-semibold">{subjectName}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Difficulty</dt><dd className="font-semibold">{difficulty}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Time</dt><dd className="font-semibold tabular">{periods} × {periodMinutes} min = {totalMinutes} min</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Slides</dt><dd className="font-semibold">{slideCount}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Chapters</dt><dd className="font-semibold leading-relaxed">{chapterNames.join(" · ")}</dd></div>
            </dl>

            {generating ? (
              <ProgressCycle labels={GEN_MESSAGES} />
            ) : gen ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ProvenancePill provenance={gen.provenance} />
                    <span className="sk-pill sk-pill-grey"><Clock className="w-3 h-3" /> {(gen.generationMs / 1000).toFixed(1)}s</span>
                    <span className="text-[12px] text-muted-foreground">Draft ready — full preview on the next step.</span>
                  </div>
                  <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={generate} disabled={generating}>
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </button>
                </div>
                <div className="sk-card p-4 max-h-[420px] overflow-y-auto sk-scroll">
                  <LessonPlanBody content={gen.plan} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <button className="sk-btn sk-btn-orange sk-btn-lg" onClick={generate}>
                  <Sparkles className="w-4 h-4" /> Generate with AI
                </button>
                <p className="text-[11.5px] text-muted-foreground max-w-sm text-center">
                  Every draft is checked against the 5E structure. If the AI is unavailable, a structured pedagogical template is used — and always labelled honestly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 7 · preview & save */}
        {step === 7 && gen && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-[15px]">Name it &amp; save</h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                Saved as a draft in your library — edit, print, share or convert it anytime.
              </p>
            </div>
            <div>
              <label htmlFor="plan-title" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Lesson title
              </label>
              <input
                id="plan-title"
                className="sk-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Rational Numbers — The Number Line Sprint"
                maxLength={120}
              />
            </div>
            <div className="sk-card p-4 max-h-[460px] overflow-y-auto sk-scroll">
              <LessonPlanBody content={gen.plan} />
            </div>
          </div>
        )}

        {/* footer */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            className="sk-btn sk-btn-ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            {step === 4 && chapterNames.length === 0 && (
              <span className="text-[11.5px] text-muted-foreground hidden sm:block">Select at least one chapter to continue</span>
            )}
            {step === 7 ? (
              <button className="sk-btn sk-btn-primary" onClick={save} disabled={saving || !title.trim()}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save to Library
              </button>
            ) : (
              <button
                className="sk-btn sk-btn-primary"
                onClick={() => setStep((s) => Math.min(7, s + 1))}
                disabled={!canNext}
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Link-to-timetable dialog helpers
 * ============================================================ */
interface SlotRow {
  id: string; startAt: string; endAt: string; subject: string; mode: string;
  student: { id: string; name: string; color: string } | null;
}

function LinkSlotDialog({
  open, onOpenChange, slots, loading, linkedId, busy, onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: SlotRow[] | null;
  loading: boolean;
  linkedId: string | null;
  busy: boolean;
  onLink: (bookingId: string) => void;
}) {
  // Body mounts fresh on every open, so the picked slot resets naturally.
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {open ? (
        <LinkSlotBody
          slots={slots}
          loading={loading}
          linkedId={linkedId}
          busy={busy}
          onOpenChange={onOpenChange}
          onLink={onLink}
        />
      ) : null}
    </Dialog>
  );
}

function LinkSlotBody({
  slots, loading, linkedId, busy, onOpenChange, onLink,
}: {
  slots: SlotRow[] | null;
  loading: boolean;
  linkedId: string | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (bookingId: string) => void;
}) {
  const [pick, setPick] = useState("");

  return (
    <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 text-left">
          <DialogTitle className="text-[16px]">Link to a timetable slot</DialogTitle>
          <DialogDescription>
            Attach this lesson to one of your accepted sessions this week — it will be ready to teach when the slot arrives.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto sk-scroll px-5 pb-4 space-y-2">
          {loading ? (
            <LoadingView label="Loading this week's sessions…" />
          ) : !slots || slots.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No sessions this week" sub="Accepted bookings from the next 7 days will appear here." />
          ) : (
            slots.map((b) => {
              const d = new Date(b.startAt);
              const on = pick === b.id;
              const isLinked = linkedId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPick(b.id)}
                  className={`w-full flex items-center gap-3 rounded-[12px] border p-3 text-left transition ${
                    on ? "border-[#315BE5]/60 bg-[#F0F4FE] dark:bg-[#1B2445]" : isLinked ? "border-[#1F9D68]/50" : "border-border hover:border-[#B9C6E4]"
                  }`}
                  aria-pressed={on}
                >
                  <AvatarTile name={b.student?.name ?? "Student"} color={b.student?.color ?? "#315BE5"} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold">
                      {WEEKDAYS[d.getDay()]} · {timeOf(b.startAt)} – {timeOf(b.endAt)}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {b.student?.name ?? "Student"} · {b.subject}
                    </div>
                  </div>
                  {isLinked && <span className="sk-pill sk-pill-green">Linked</span>}
                </button>
              );
            })
          )}
        </div>
        <DialogFooter className="p-4 border-t border-border gap-2">
          <button className="sk-btn sk-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button className="sk-btn sk-btn-primary" disabled={!pick || busy} onClick={() => onLink(pick)}>
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Link lesson
          </button>
        </DialogFooter>
      </DialogContent>
  );
}

/* ============================================================
 * Post-Class Reflection dialog (LearnX lesson-plan spec §6)
 * Four prompts — Save as Draft persists; Submit records the revision.
 * ============================================================ */
const REFLECTION_PROMPTS: { key: keyof Omit<ReflectionData, "status" | "updatedAt" | "revision" | "submittedAt">; label: string; placeholder: string }[] = [
  { key: "wentWell", label: "What went well in this lesson?", placeholder: "e.g. The hook grabbed attention immediately; most students hit the success criteria…" },
  { key: "improve", label: "What could be improved?", placeholder: "e.g. The EXPLORE stage needed more time; the extension task was too easy for some pairs…" },
  { key: "engagement", label: "Student response / engagement", placeholder: "e.g. High during the worked example; quieter students engaged in the pair share…" },
  { key: "nextSteps", label: "Next steps / follow-up", placeholder: "e.g. Re-teach the second worked example as a starter; assign the challenge homework…" },
];

function ReflectionDialog({
  open, onOpenChange, plan, busy, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanDetail | null;
  busy: boolean;
  onSave: (answers: Record<string, string>, submit: boolean) => void;
}) {
  // The body (and its answer state) mounts fresh on every open — the persisted
  // draft seeds the form naturally, with no reset effects needed.
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {open ? (
        <ReflectionDialogBody plan={plan} busy={busy} onOpenChange={onOpenChange} onSave={onSave} />
      ) : null}
    </Dialog>
  );
}

function ReflectionDialogBody({
  plan, busy, onOpenChange, onSave,
}: {
  plan: PlanDetail | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (answers: Record<string, string>, submit: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({
    wentWell: plan?.reflection?.wentWell ?? "",
    improve: plan?.reflection?.improve ?? "",
    engagement: plan?.reflection?.engagement ?? "",
    nextSteps: plan?.reflection?.nextSteps ?? "",
  });

  const filled = REFLECTION_PROMPTS.filter((p) => (answers[p.key] ?? "").trim()).length;

  return (
    <DialogContent className="sm:max-w-lg max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden">
      <DialogHeader className="p-5 pb-3 text-left">
        <DialogTitle className="text-[16px]">Post-Class Reflection</DialogTitle>
        <DialogDescription>
          {plan ? `For “${plan.title}” — ` : ""}your reflection will be reviewed by the Tutor Amma academic team. Drafts persist until you submit them.
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 min-h-0 overflow-y-auto sk-scroll px-5 pb-4 space-y-4">
        {REFLECTION_PROMPTS.map((p) => (
          <div key={p.key}>
            <label htmlFor={`refl-${p.key}`} className="text-[12px] font-bold block mb-1.5">
              {p.label}
            </label>
            <textarea
              id={`refl-${p.key}`}
              className="sk-input min-h-[72px] text-[12.5px] leading-relaxed"
              value={answers[p.key] ?? ""}
              placeholder={p.placeholder}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [p.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="text-[11px] text-muted-foreground">
          {filled} of 4 prompts answered{filled < 4 ? " — all four are required to submit for review" : " — ready to submit"}.
        </div>
      </div>
      <DialogFooter className="p-4 border-t border-border gap-2 flex-col sm:flex-row">
        <button className="sk-btn sk-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </button>
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            className="sk-btn sk-btn-primary"
            disabled={busy || filled === 0}
            onClick={() => onSave(answers, false)}
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save as Draft
          </button>
          <button
            className="sk-btn sk-btn-orange"
            disabled={busy || filled < 4}
            onClick={() => onSave(answers, true)}
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Submit for Review
          </button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================================================
 * Main view — library + wizard
 * ============================================================ */
/** Convert-this-plan dialog — real Worksheet / Assessment / Homework / PPT artifacts (LearnX §4). */
function ConversionDialog({
  open,
  onOpenChange,
  kind,
  plan,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: ConversionKind;
  plan: PlanDetail | null;
  onSaved: (kind: ConversionKind) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ConversionDraft | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  /* per-kind config (defaults mirror the LearnX recording examples) */
  const [qCount, setQCount] = useState(10);
  const [wsDifficulty, setWsDifficulty] = useState("Medium");
  const [diagrams, setDiagrams] = useState(true);
  const [studentHeader, setStudentHeader] = useState(true);
  const [includeKey, setIncludeKey] = useState(true);
  const [intent, setIntent] = useState<"formative" | "summative">("formative");
  const [mix, setMix] = useState<"balanced" | "mcq-heavy" | "written">("balanced");
  const [hwMinutes, setHwMinutes] = useState(30);
  const [hwMode, setHwMode] = useState<"Individual" | "Group">("Individual");
  const [parentNote, setParentNote] = useState(false);
  const [slideCount, setSlideCount] = useState(8);
  const [slideStyle, setSlideStyle] = useState("Clean classroom");
  const [slideAudience, setSlideAudience] = useState("Grade level");

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setBusy(false);
      setSaveBusy(false);
    }
  }, [open]);

  if (!plan) return null;
  const c = plan.contentJson;
  const chaptersForGen = plan.chapterNames.length ? plan.chapterNames : [plan.subject];

  const buildHomeworkDraft = (): ConversionDraft => {
    const tasks = c.homework?.tasks?.length ? c.homework.tasks : [`Revise ${plan.chapterNames[0] ?? plan.subject} from today's class notes`];
    const note = parentNote
      ? "Parent note: please sign below to confirm the homework was completed. A gentle reminder will follow before the next class."
      : undefined;
    const sections = [{
      name: "Homework tasks",
      type: "SA" as const,
      marksEach: 0,
      questions: homeworkQuestions(tasks, c.homework?.expectedOutput ?? ""),
    }];
    return {
      kind: "homework",
      title: `${plan.chapterNames[0] ?? plan.subject} — Homework${hwMode === "Group" ? " (Group)" : ""}`,
      instructions: `Estimated time: ${hwMinutes} minutes. Mode: ${hwMode}.${note ? ` ${note}` : ""} Show all working in your notebook.`,
      sections,
      answerKey: { note: "Teacher copy — completion checklist", sections: sections.map((s) => ({ name: s.name, answers: s.questions.map((q) => q.answer) })) },
      totalMarks: 0,
      durationMin: hwMinutes,
      config: { kind: "homework", hwMinutes, hwMode, parentNote: note ? true : false, sourceVersion: plan.version },
    };
  };

  const buildPptDraft = (): ConversionDraft => {
    const slides = slideOutlineQuestions(c, slideCount);
    const sections = [{
      name: `Slide outline — ${slideStyle} · ${slideAudience}`,
      type: "SA" as const,
      marksEach: 0,
      questions: slides,
    }];
    return {
      kind: "ppt",
      title: `${plan.chapterNames[0] ?? plan.subject} — Slide deck (${slideCount} slides)`,
      instructions: `Editable outline for a ${slideCount}-slide presentation in a ${slideStyle.toLowerCase()} style for a ${slideAudience.toLowerCase()} audience. Speaker notes come from your 5E plan.`,
      sections,
      answerKey: { note: "Slide bullet notes for the teacher", sections: sections.map((s) => ({ name: s.name, answers: s.questions.map((q) => q.answer) })) },
      totalMarks: 0,
      durationMin: plan.periods * plan.periodMinutes,
      config: { kind: "ppt", slideCount, slideStyle, slideAudience, sourceVersion: plan.version },
    };
  };

  const generate = async () => {
    if (kind === "homework") {
      setDraft(buildHomeworkDraft());
      return;
    }
    if (kind === "ppt") {
      setDraft(buildPptDraft());
      return;
    }
    setBusy(true);
    try {
      // worksheet: 1 mark per question; assessment: weighted by intent
      let sections: { type: "MCQ" | "SA" | "LA"; count: number; marksEach: number }[];
      let totalMarks: number;
      if (kind === "worksheet") {
        const mcq = Math.max(2, Math.round(qCount * 0.6));
        const sa = Math.max(2, qCount - mcq);
        sections = [{ type: "MCQ", count: mcq, marksEach: 1 }, { type: "SA", count: sa, marksEach: 2 }];
        totalMarks = mcq + sa * 2;
      } else {
        const laEach = intent === "summative" ? 5 : 4;
        if (mix === "mcq-heavy") {
          sections = [{ type: "MCQ", count: 8, marksEach: 1 }, { type: "SA", count: 4, marksEach: 3 }, { type: "LA", count: 2, marksEach: laEach }];
        } else if (mix === "written") {
          sections = [{ type: "SA", count: 8, marksEach: 3 }, { type: "LA", count: 4, marksEach: laEach + 1 }];
        } else {
          sections = [{ type: "MCQ", count: 5, marksEach: 1 }, { type: "SA", count: 5, marksEach: 3 }, { type: "LA", count: 3, marksEach: laEach }];
        }
        totalMarks = sections.reduce((a, s) => a + s.count * s.marksEach, 0);
      }
      interface GenSectionQ { q: string; options?: string[]; answer: string; chapter: string; difficulty: string; cognitive?: string }
      interface GenResp { contentJson: { instructions: string; sections: { name: string; type: string; marksEach: number; questions: GenSectionQ[] }[] }; answerKeyJson: ConversionDraft["answerKey"]; provenance: string; generationMs: number }
      const data = await api<GenResp>(
        "/api/studio/generate/paper",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            board: plan.board, grade: plan.grade, subject: plan.subject, chapters: chaptersForGen,
            totalMarks, durationMin: Math.max(15, Math.round(totalMarks * 1.2)),
            difficulty: kind === "worksheet" ? wsDifficulty : intent === "summative" ? "Hard" : "Medium",
            sections,
          }),
        },
        75_000,
      );
      const sectionsOut: ConversionDraft["sections"] = sections.map((s, i) => ({
        name: `Part ${String.fromCharCode(65 + i)} — ${s.type === "MCQ" ? "Multiple choice" : s.type === "SA" ? "Short answer" : "Long answer"} (${s.marksEach} mark${s.marksEach > 1 ? "s" : ""} each)`,
        type: s.type,
        marksEach: s.marksEach,
        questions: (data.contentJson.sections[i]?.questions ?? []).map((q) => ({
          q: q.q, options: q.options, answer: q.answer, chapter: q.chapter, difficulty: q.difficulty, cognitive: q.cognitive,
        })),
      }));
      setDraft({
        kind,
        title:
          kind === "worksheet"
            ? `${plan.chapterNames[0] ?? plan.subject} — Practice worksheet`
            : `${plan.chapterNames[0] ?? plan.subject} — ${intent === "summative" ? "Summative" : "Formative"} assessment`,
        instructions: kind === "worksheet"
          ? `Practice makes permanent — attempt every question.${diagrams ? " Diagram questions are marked clearly." : ""}${studentHeader ? " Write your name, date and marks on the header." : ""}`
          : `${intent === "summative" ? "Summative check" : "Formative check — this is feedback, not a verdict."} Aligned to the success criteria of ${plan.chapterNames[0] ?? plan.subject}.`,
        sections: sectionsOut,
        answerKey: includeKey ? data.answerKeyJson : { sections: [] },
        totalMarks,
        durationMin: Math.max(15, Math.round(totalMarks * 1.2)),
        config: {
          kind, qCount, wsDifficulty, diagrams, studentHeader, includeKey, intent, mix,
          sourceVersion: plan.version,
        },
      });
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaveBusy(true);
    try {
      await api("/api/studio/papers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          kind: draft.kind,
          lessonPlanId: plan.id,
          sourceVersion: plan.version,
          board: plan.board,
          grade: plan.grade,
          subject: plan.subject,
          chapters: chaptersForGen,
          configJson: {
            totalMarks: draft.totalMarks,
            durationMin: draft.durationMin,
            sections: draft.sections.map((s) => ({ type: s.type, count: s.questions.length, marksEach: s.marksEach })),
            deliveryMode: "M2",
            ...draft.config,
          },
          contentJson: { instructions: draft.instructions, sections: draft.sections },
          answerKeyJson: draft.answerKey,
          provenance: "AI draft",
          headerJson: { template: "classic", schoolName: "Tutor Amma", examTitle: draft.title, showStudentFields: studentHeader },
        }),
      });
      toast({
        title: `${draft.kind === "ppt" ? "Slide outline" : draft.kind[0].toUpperCase() + draft.kind.slice(1)} saved to your Question Paper Studio`,
        description: `“${draft.title}” — generated from ${plan.title} v${plan.version}. Preview, print and share it from the studio library.`,
      });
      onSaved(draft.kind);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const meta = CONVERSION_META[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto sk-scroll">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[16px]">{meta.title}</DialogTitle>
          <DialogDescription className="text-[12px]">{meta.desc} Prefilled from “{plan.title}” v{plan.version}.</DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-4">
            {/* context chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="sk-pill sk-pill-navy">{plan.board}</span>
              <span className="sk-pill sk-pill-grey">{plan.grade}</span>
              <span className="sk-pill sk-pill-grey">{plan.subject}</span>
              <span className="sk-pill sk-pill-grey">{plan.chapterNames.length} chapters</span>
              <span className="sk-pill sk-pill-grey">{plan.periods} × {plan.periodMinutes} min</span>
              <span className="sk-pill sk-pill-grey">{plan.difficulty}</span>
            </div>

            {(kind === "worksheet" || kind === "assessment") && (
              <>
                {kind === "worksheet" ? (
                  <>
                    <div>
                      <label htmlFor="cv-qcount" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">Number of questions</label>
                      <input id="cv-qcount" type="number" min={4} max={25} className="sk-input" value={qCount} onChange={(e) => setQCount(Math.max(4, Math.min(25, Number(e.target.value) || 10)))} />
                    </div>
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Difficulty</span>
                      <div className="sk-segment" role="group" aria-label="Worksheet difficulty">
                        {["Easy", "Medium", "Hard"].map((d) => (
                          <button key={d} className={`sk-segment-item ${wsDifficulty === d ? "sk-segment-item-active" : ""}`} onClick={() => setWsDifficulty(d)} aria-pressed={wsDifficulty === d}>{d}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex items-center gap-2.5 text-[12.5px] font-medium cursor-pointer">
                        <Switch checked={diagrams} onCheckedChange={setDiagrams} /> Include diagrams
                      </label>
                      <label className="flex items-center gap-2.5 text-[12.5px] font-medium cursor-pointer">
                        <Switch checked={studentHeader} onCheckedChange={setStudentHeader} /> Student header (name / date / marks)
                      </label>
                      <label className="flex items-center gap-2.5 text-[12.5px] font-medium cursor-pointer">
                        <Switch checked={includeKey} onCheckedChange={setIncludeKey} /> Separate teacher answer key
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Intent</span>
                      <div className="sk-segment" role="group" aria-label="Assessment intent">
                        <button className={`sk-segment-item ${intent === "formative" ? "sk-segment-item-active" : ""}`} onClick={() => setIntent("formative")} aria-pressed={intent === "formative"}>Formative</button>
                        <button className={`sk-segment-item ${intent === "summative" ? "sk-segment-item-active" : ""}`} onClick={() => setIntent("summative")} aria-pressed={intent === "summative"}>Summative</button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Question mix</span>
                      <div className="sk-segment" role="group" aria-label="Question mix">
                        <button className={`sk-segment-item ${mix === "mcq-heavy" ? "sk-segment-item-active" : ""}`} onClick={() => setMix("mcq-heavy")} aria-pressed={mix === "mcq-heavy"}>MCQ-heavy</button>
                        <button className={`sk-segment-item ${mix === "balanced" ? "sk-segment-item-active" : ""}`} onClick={() => setMix("balanced")} aria-pressed={mix === "balanced"}>Balanced</button>
                        <button className={`sk-segment-item ${mix === "written" ? "sk-segment-item-active" : ""}`} onClick={() => setMix("written")} aria-pressed={mix === "written"}>Written</button>
                      </div>
                    </div>
                    <div className="sk-well p-3 text-[11.5px] text-muted-foreground">
                      Aligned to this plan&apos;s success criteria: {c.successCriteria.slice(0, 2).join(" · ")}
                    </div>
                  </>
                )}
              </>
            )}

            {kind === "homework" && (
              <>
                <div>
                  <label htmlFor="cv-hwmin" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                    Estimated time: <span className="text-foreground font-bold">{hwMinutes} minutes</span>
                  </label>
                  <input
                    id="cv-hwmin"
                    type="range" min={10} max={90} step={5}
                    className="w-full accent-[#F47B20]"
                    value={hwMinutes}
                    onChange={(e) => setHwMinutes(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-[10.5px] text-muted-foreground mt-0.5"><span>10 min</span><span>90 min</span></div>
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Mode</span>
                  <div className="sk-segment" role="group" aria-label="Homework mode">
                    <button className={`sk-segment-item ${hwMode === "Individual" ? "sk-segment-item-active" : ""}`} onClick={() => setHwMode("Individual")} aria-pressed={hwMode === "Individual"}>Individual</button>
                    <button className={`sk-segment-item ${hwMode === "Group" ? "sk-segment-item-active" : ""}`} onClick={() => setHwMode("Group")} aria-pressed={hwMode === "Group"}>Group</button>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 text-[12.5px] font-medium cursor-pointer">
                  <Switch checked={parentNote} onCheckedChange={setParentNote} /> Include parent note (signature / completion reminder)
                </label>
                <div className="sk-well p-3 text-[11.5px] text-muted-foreground">
                  From this plan: {c.homework?.tasks?.slice(0, 2).join(" · ") || "revision tasks"}
                </div>
              </>
            )}

            {kind === "ppt" && (
              <>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Slide count</span>
                  <div className="sk-segment" role="group" aria-label="Slide count">
                    {[6, 8, 10, 12].map((s) => (
                      <button key={s} className={`sk-segment-item ${slideCount === s ? "sk-segment-item-active" : ""}`} onClick={() => setSlideCount(s)} aria-pressed={slideCount === s}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cv-aud" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">Audience / level</label>
                    <select id="cv-aud" className="sk-input" value={slideAudience} onChange={(e) => setSlideAudience(e.target.value)}>
                      <option>Grade level</option>
                      <option>Support group</option>
                      <option>Advanced group</option>
                      <option>Parent open house</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cv-style" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">Visual style</label>
                    <select id="cv-style" className="sk-input" value={slideStyle} onChange={(e) => setSlideStyle(e.target.value)}>
                      <option>Clean classroom</option>
                      <option>Visual &amp; diagram heavy</option>
                      <option>Minimal text</option>
                      <option>Exam-prep focused</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button className="sk-btn sk-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
              <button className="sk-btn sk-btn-primary" onClick={generate} disabled={busy}>
                {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {busy ? "Generating…" : `Generate ${kind === "ppt" ? "outline" : kind}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* preview before save (never a fake success) */}
            <div className="sk-card-flat p-4 max-h-[380px] overflow-y-auto sk-scroll space-y-3">
              <div>
                <h4 className="font-bold text-[13.5px]">{draft.title}</h4>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{draft.instructions}</p>
              </div>
              {draft.sections.map((s) => (
                <div key={s.name}>
                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1">{s.name}</div>
                  <ol className="list-decimal ml-4 space-y-1">
                    {s.questions.map((q, i) => (
                      <li key={i} className="text-[12px] leading-snug">
                        {q.q}
                        {s.marksEach > 0 && <span className="text-muted-foreground text-[10.5px]"> [{s.marksEach}]</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              {includeKey && draft.answerKey.sections?.[0]?.answers?.length > 0 && (
                <p className="text-[10.5px] text-muted-foreground">
                  A separate teacher answer key is attached and stays private to your account.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button className="sk-btn sk-btn-ghost" onClick={() => setDraft(null)} disabled={saveBusy}>Back to settings</button>
              <button className="sk-btn sk-btn-primary" onClick={save} disabled={saveBusy}>
                {saveBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save to Library
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TStudio() {
  const setView = useAppStore((s) => s.setView);
  const [mode, setMode] = useState<"library" | "wizard">("library");

  /* conversions (Worksheet / Assessment / Homework / PPT) — real artifacts, saved to the papers library */
  const [conversion, setConversion] = useState<ConversionKind | null>(null);

  /* library */
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const loadPlans = useCallback(async () => {
    setListError(null);
    try {
      setPlans(await api<PlanListItem[]>("/api/studio/lesson-plans"));
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load your lesson plans.");
      setPlans([]);
    }
  }, []);
  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  /* students (share dialog + shared-with names) */
  const [students, setStudents] = useState<StudioStudent[] | null>(null);
  useEffect(() => {
    api<StudioStudent[]>("/api/studio/students")
      .then(setStudents)
      .catch(() => setStudents([]));
  }, []);

  /* detail dialog */
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const openPlan = useCallback(async (id: string) => {
    setDetail(null); // clear the previously opened plan so the loading state shows, never stale content
    setDialogOpen(true);
    try {
      const d = await api<PlanDetail>(`/api/studio/lesson-plans/${id}`);
      setDetail(d);
    } catch (e) {
      toast({
        title: "Could not open this plan",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
      setDialogOpen(false);
    }
  }, []);

  /* editing draft */
  const [draft, setDraft] = useState<LessonPlanContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  useEffect(() => {
    setDraft(detail ? JSON.parse(JSON.stringify(detail.contentJson)) : null);
    setEditing(false);
  }, [detail]);

  const dirty = useMemo(
    () => !!detail && !!draft && JSON.stringify(draft) !== JSON.stringify(detail.contentJson),
    [detail, draft],
  );

  const saveEdits = async () => {
    if (!detail || !draft) return;
    setSaveBusy(true);
    try {
      const res = await api<{ version: number }>(`/api/studio/lesson-plans/${detail.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentJson: draft }),
      });
      toast({
        title: `Saved as v${res.version}`,
        description: "Your edits are versioned — previous versions stay in your audit trail.",
      });
      setEditing(false);
      await openPlan(detail.id);
      loadPlans();
    } catch (e) {
      toast({
        title: "Could not save edits",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const markSaved = async () => {
    if (!detail) return;
    setSaveBusy(true);
    try {
      await api(`/api/studio/lesson-plans/${detail.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "saved" }),
      });
      toast({ title: "Saved to library", description: `“${detail.title}” is now safely filed in your lesson library.` });
      await openPlan(detail.id);
      loadPlans();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  /* share */
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const sharePlan = async (studentIds: string[]) => {
    if (!detail) return;
    setShareBusy(true);
    try {
      await api(`/api/studio/lesson-plans/${detail.id}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentIds }),
      });
      toast({
        title: `Shared with ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`,
        description: `“${detail.title}” was sent in-app (and via WhatsApp in the full product).`,
      });
      setShareOpen(false);
      await openPlan(detail.id);
      loadPlans();
    } catch (e) {
      toast({
        title: "Could not share",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  /* link to timetable */
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const openSlots = async () => {
    setSlotsOpen(true);
    setSlotsLoading(true);
    try {
      interface BookingRow extends SlotRow { state: string }
      const all = await api<BookingRow[]>("/api/bookings");
      const in7Days = Date.now() + 7 * 24 * 3600 * 1000;
      setSlots(
        all
          .filter((b) => b.state === "accepted" && new Date(b.startAt).getTime() < in7Days)
          .sort((a, b) => a.startAt.localeCompare(b.startAt)),
      );
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };
  const linkSlot = async (bookingId: string) => {
    if (!detail) return;
    setLinkBusy(true);
    try {
      await api(`/api/studio/lesson-plans/${detail.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedSlotId: bookingId }),
      });
      toast({ title: "Lesson linked to timetable slot", description: "Open your timetable to see it attached to the session." });
      setSlotsOpen(false);
      await openPlan(detail.id);
    } catch (e) {
      toast({
        title: "Could not link",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLinkBusy(false);
    }
  };

  /* post-class reflection (LearnX lesson-plan spec §6) */
  const [reflectOpen, setReflectOpen] = useState(false);
  const [reflectBusy, setReflectBusy] = useState(false);
  const saveReflection = async (answers: Record<string, string>, submit: boolean) => {
    if (!detail) return;
    setReflectBusy(true);
    try {
      await api(`/api/studio/lesson-plans/${detail.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reflection: {
            wentWell: answers.wentWell ?? "",
            improve: answers.improve ?? "",
            engagement: answers.engagement ?? "",
            nextSteps: answers.nextSteps ?? "",
          },
          reflectionStatus: submit ? "submitted" : "draft",
        }),
      });
      toast({
        title: submit ? "Reflection submitted for review" : "Reflection draft saved",
        description: submit
          ? `Revision recorded for “${detail.title}”. The academic team has been notified.`
          : "Your draft persists — finish and submit it after the class.",
      });
      setReflectOpen(false);
      await openPlan(detail.id);
    } catch (e) {
      toast({
        title: "Could not save reflection",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setReflectBusy(false);
    }
  };

  /* branded PDF download */
  const pdfBusy = useRef(false);
  const downloadPlanPdf = async () => {
    if (!detail || pdfBusy.current) return;
    pdfBusy.current = true;
    try {
      await pdfLessonPlan({
        title: detail.title,
        board: detail.board,
        grade: detail.grade,
        subject: detail.subject,
        chapterNames: detail.chapterNames,
        difficulty: detail.difficulty,
        periods: detail.periods,
        periodMinutes: detail.periodMinutes,
        slideCount: detail.slideCount,
        provenance: detail.provenance,
        version: detail.version,
        createdAt: detail.createdAt,
        content: detail.contentJson,
      });
      toast({
        title: "Lesson plan PDF downloaded",
        description: "Branded A4 PDF with the Tutor Amma letterhead — ready to print.",
      });
    } catch (e) {
      console.error("[lesson-plan pdf]", e);
      toast({ title: "Could not build the PDF", variant: "destructive" });
    } finally {
      pdfBusy.current = false;
    }
  };

  const linkedSlotLabel = useMemo(() => {
    if (!detail?.linkedSlotId || !slots) return null;
    const b = slots.find((x) => x.id === detail.linkedSlotId);
    return b ? `${WEEKDAYS[new Date(b.startAt).getDay()]} ${timeOf(b.startAt)} · ${b.student?.name ?? ""}` : null;
  }, [detail, slots]);

  /* ------- render ------- */
  if (mode === "wizard") {
    return (
      <LessonWizard
        onDone={() => {
          setMode("library");
          loadPlans();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Teaching Studio — Lesson Plans</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {plans
              ? `${plans.length} plan${plans.length === 1 ? "" : "s"} in your library · grounded in verified board syllabi`
              : "Loading your library…"}
          </p>
        </div>
        <button className="sk-btn sk-btn-orange" onClick={() => setMode("wizard")}>
          <Sparkles className="w-4 h-4" /> Generate lesson plan
        </button>
      </div>

      {listError && (
        <div className="sk-callout sk-callout-danger">
          {listError} —{" "}
          <button className="underline font-semibold" onClick={loadPlans}>retry</button>
        </div>
      )}

      {!plans ? (
        <LoadingView label="Loading your lesson plans…" />
      ) : plans.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={FileStack}
            title="Your lesson library is empty"
            sub="Generate your first curriculum-grounded 5E lesson plan — it takes under a minute."
            action={
              <button className="sk-btn sk-btn-orange" onClick={() => setMode("wizard")}>
                <Sparkles className="w-4 h-4" /> Generate lesson plan
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((p) => (
            <article
              key={p.id}
              className="sk-card p-5 space-y-3.5 flex flex-col cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(20,36,107,0.12)]"
              onClick={() => openPlan(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPlan(p.id)}
              aria-label={`Open lesson plan ${p.title}`}
            >
              <div>
                <h3 className="font-bold text-[14px] leading-snug line-clamp-2">{p.title}</h3>
                <div className="text-[11.5px] text-muted-foreground mt-1">
                  {p.chapterNames.slice(0, 2).join(", ")}
                  {p.chapterNames.length > 2 ? ` +${p.chapterNames.length - 2} more` : p.chapterNames.length === 0 ? "No chapters" : ""}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="sk-pill sk-pill-navy">{p.board}</span>
                <span className="sk-pill sk-pill-grey">{p.grade}</span>
                <span className="sk-pill sk-pill-grey">{p.subject}</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <StudioStatusPill status={p.status} />
                <DifficultyPill difficulty={p.difficulty} />
                <span className="sk-pill sk-pill-grey">v{p.version}</span>
                <ProvenancePill provenance={p.provenance} />
              </div>

              <div className="flex items-center justify-between text-[11.5px] text-muted-foreground mt-auto pt-1 border-t border-dashed border-border">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {p.sharedCount} shared
                </span>
                <span>{fromNow(p.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* -------- preview dialog -------- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(false);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {dialogOpen && (!detail || !draft) ? (
            <div className="py-10">
              <DialogTitle className="sr-only">Opening lesson plan</DialogTitle>
              <DialogDescription className="sr-only">Loading the full 5E lesson plan.</DialogDescription>
              <LoadingView label="Opening lesson plan…" />
            </div>
          ) : detail && draft ? (
            <>
              <div className="p-5 pb-4 border-b border-border shrink-0">
                <DialogHeader className="text-left space-y-2">
                  <DialogTitle className="text-[17px] leading-snug pr-8">{detail.title}</DialogTitle>
                  <DialogDescription className="sr-only">Full lesson plan preview and actions</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <span className="sk-pill sk-pill-navy">{detail.board}</span>
                  <span className="sk-pill sk-pill-grey">{detail.grade}</span>
                  <span className="sk-pill sk-pill-grey">{detail.subject}</span>
                  <DifficultyPill difficulty={detail.difficulty} />
                  <span className="sk-pill sk-pill-grey">
                    <Clock className="w-3 h-3" /> {detail.periods} × {detail.periodMinutes} min
                  </span>
                  <span className="sk-pill sk-pill-grey">{detail.slideCount} slides</span>
                  <StudioStatusPill status={detail.status} />
                  <span className="sk-pill sk-pill-grey">v{detail.version}</span>
                  <ProvenancePill provenance={detail.provenance} />
                  {linkedSlotLabel && (
                    <span className="sk-pill sk-pill-green"><Link2 className="w-3 h-3" /> {linkedSlotLabel}</span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
                  <span>Generated {dateOf(detail.createdAt)}</span>
                  {detail.sharedWithNames.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> Shared with {detail.sharedWithNames.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto sk-scroll p-5">
                <LessonPlanBody
                  content={draft}
                  editing={editing}
                  allowObjectiveEdit
                  onChange={setDraft}
                />

                {/* Reflection & Review — post-class card (LearnX lesson-plan spec §6) */}
                {!editing && (
                  <section aria-label="Reflection and review" className="sk-card-flat p-4 sm:p-5 mt-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-brand-navy" />
                        <h4 className="font-bold text-[14px]">Reflection &amp; Review</h4>
                      </div>
                      {detail.reflection?.status === "submitted" ? (
                        <span className="sk-pill sk-pill-green">Submitted</span>
                      ) : detail.reflection?.status === "draft" ? (
                        <span className="sk-pill sk-pill-orange">Draft</span>
                      ) : (
                        <span className="sk-pill sk-pill-grey">Not started</span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground leading-relaxed mt-2">
                      {detail.reflection?.status === "submitted" ? (
                        <>
                          Submitted for review on {dateOf(detail.reflection.submittedAt ?? detail.reflection.updatedAt ?? detail.createdAt)}
                          {detail.reflection.revision > 0 && <> · revision {detail.reflection.revision}</>}. The academic team can read the source lesson and your notes.
                        </>
                      ) : detail.reflection?.status === "draft" ? (
                        <>
                          Draft saved {detail.reflection.updatedAt ? fromNow(detail.reflection.updatedAt) : ""} — it persists until you submit it for review.
                        </>
                      ) : (
                        <>
                          No reflection submitted yet. Click below to draft your post-class reflection; it persists as a Draft until you submit it for review.
                        </>
                      )}
                    </div>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm mt-3" onClick={() => setReflectOpen(true)}>
                      <PenLine className="w-3.5 h-3.5" />
                      {detail.reflection?.status === "draft" ? "Continue reflection" : detail.reflection?.status === "submitted" ? "View / update reflection" : "Draft post-class reflection"}
                    </button>
                  </section>
                )}
              </div>

              {/* action bar */}
              <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur p-3 sm:px-5 flex flex-wrap items-center gap-2">
                {editing ? (
                  <>
                    <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={saveEdits} disabled={saveBusy || !dirty}>
                      {saveBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save changes{dirty ? "" : " (no changes)"}
                    </button>
                    <button
                      className="sk-btn sk-btn-ghost sk-btn-sm"
                      onClick={() => {
                        setDraft(JSON.parse(JSON.stringify(detail.contentJson)));
                        setEditing(false);
                      }}
                      disabled={saveBusy}
                    >
                      Cancel edit
                    </button>
                  </>
                ) : (
                  <>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setEditing(true)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground hidden md:inline ml-1">Convert</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        className="sk-chip !py-1 !px-2.5 !text-[11px]"
                        onClick={() =>
                          setView("t-papers", {
                            fromPlan: { board: detail.board, grade: detail.grade, subject: detail.subject, chapters: detail.chapterNames },
                          })
                        }
                      >
                        <FileText className="w-3 h-3" /> Question Paper
                      </button>
                      <button
                        className="sk-chip !py-1 !px-2.5 !text-[11px]"
                        onClick={() => setConversion("worksheet")}
                      >
                        Worksheet
                      </button>
                      <button
                        className="sk-chip !py-1 !px-2.5 !text-[11px]"
                        onClick={() => setConversion("assessment")}
                      >
                        Assessment
                      </button>
                      <button
                        className="sk-chip !py-1 !px-2.5 !text-[11px]"
                        onClick={() => setConversion("homework")}
                      >
                        Homework
                      </button>
                      <button
                        className="sk-chip !py-1 !px-2.5 !text-[11px]"
                        onClick={() => setConversion("ppt")}
                      >
                        <Presentation className="w-3 h-3" /> PPT Slides
                      </button>
                    </div>
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                      <button
                        className="sk-btn sk-btn-primary sk-btn-sm"
                        onClick={() => {
                          downloadPlanPdf();
                        }}
                      >
                        <Printer className="w-3.5 h-3.5" /> Download PDF
                      </button>
                      {detail.status === "draft" && (
                        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={markSaved} disabled={saveBusy}>
                          <Save className="w-3.5 h-3.5" /> Save to Library
                        </button>
                      )}
                      <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => setShareOpen(true)}>
                        <Send className="w-3.5 h-3.5" /> Send to Students
                      </button>
                      <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={openSlots}>
                        <Link2 className="w-3.5 h-3.5" /> Link to Timetable
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* share dialog */}
      <ShareStudentsDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        students={students}
        title="Send to students"
        description={detail ? `Share “${detail.title}” — students receive it in-app (and via WhatsApp in the full product).` : ""}
        busy={shareBusy}
        onConfirm={sharePlan}
      />

      {/* link-to-timetable dialog */}
      <LinkSlotDialog
        open={slotsOpen}
        onOpenChange={setSlotsOpen}
        slots={slots}
        loading={slotsLoading}
        linkedId={detail?.linkedSlotId ?? null}
        busy={linkBusy}
        onLink={linkSlot}
      />

      {/* post-class reflection dialog */}
      <ReflectionDialog
        open={reflectOpen}
        onOpenChange={setReflectOpen}
        plan={detail}
        busy={reflectBusy}
        onSave={saveReflection}
      />

      {/* lesson-to-resource conversions (real artifacts saved to the papers library) */}
      {conversion && (
        <ConversionDialog
          open={!!conversion}
          onOpenChange={(o) => !o && setConversion(null)}
          kind={conversion}
          plan={detail}
          onSaved={() => {
            /* converted artifacts live in the Question Paper Studio library */
          }}
        />
      )}
    </div>
  );
}
