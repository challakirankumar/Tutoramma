"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { fromNow } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft, ArrowRight, Bell, BookOpen, Camera, CheckCircle2, ChevronDown, Clock, Dices, FileQuestion, FileStack,
  Globe, ImagePlus, ImageOff, Layers, LayoutTemplate, Library, Loader2, Lock, Minus, Pencil, Plus, Printer,
  RefreshCw, Save, ScanLine, Search, Send, Shuffle, Sparkles, Upload, Users, Wand2, X,
} from "lucide-react";
import { pdfQuestionPaper } from "@/lib/pdf";
import {
  EXAM_TYPES, DELIVERY_MODES, SET_LETTERS, SET_FLAVORS, ALLOTMENT_STRATEGIES, VERIFY_STATE_META, TRACK_PILL,
  REGION_TABS, yearOptions, examTypeById, presetCompliance, parseTaxonomy, parseJsonArray, allotSets,
  shuffledForStudent, hashSeed, africaSubRegion, AFRICA_SUBREGION_ORDER,
} from "@/lib/curriculum";
import {
  api, ChapterList, DifficultyPill, ProgressCycle, ProvenancePill, ShareStudentsDialog,
  Stepper, StudioStatusPill,
  type BoardRow, type ChapterRow, type GradeRow, type StudioStudent, type SubjectRow,
} from "@/views/studio/TStudio";

/* ============================================================
 * Types — question paper (matches seeded contentJson structures)
 * ============================================================ */
type QType = "MCQ" | "SA" | "LA";
type EditTab = "regen" | "bank" | "write" | "image";
const LETTERS = ["A", "B", "C", "D"];
const TYPE_LABEL: Record<QType, string> = { MCQ: "Multiple Choice", SA: "Short Answer", LA: "Long Answer" };
const DEFAULT_LOGO = "/brand/tutor-amma-logo-trim.png";

interface PaperQuestion {
  q: string; options?: string[]; answer: string;
  chapter: string; difficulty: string; cognitive: string; note?: string;
  image?: string; concept?: string;
}
interface PaperSection { name: string; type: QType; marksEach: number; questions: PaperQuestion[] }
interface PaperContent { instructions: string; sections: PaperSection[] }
interface AnswerKeySection { name: string; answers: string[] }
interface AnswerKey { note?: string; sections: AnswerKeySection[] }
interface SectionSpec { type: QType; count: number; marksEach: number }
interface PaperConfig {
  totalMarks: number; durationMin: number; sections: SectionSpec[];
  difficulty?: string; setsCount?: number; deliveryMode?: string;
  examType?: string; language?: string; year?: string;
  sets?: SavedSet[];
}

/** Letterhead options saved with every paper (`headerJson` on the row). */
export interface PaperHeader {
  template: "classic" | "formal" | "minimal";
  schoolName: string;      // default "Tutor Amma"
  examTitle: string;       // default "" → falls back to paper title
  logoDataUrl?: string;    // custom logo; undefined → default Tutor Amma logo; "" → no logo
  showStudentFields: boolean; // default true
}
interface PaperRow {
  id: string; lessonPlanId: string | null; title: string;
  kind?: string; sourceVersion?: number | null;
  board: string; grade: string; subject: string; chapters: string[];
  configJson: PaperConfig; contentJson: PaperContent; answerKeyJson: AnswerKey;
  allotmentJson?: SavedAllotment;
  headerJson?: PaperHeader;
  status: string; provenance: string; sharedWith: string[]; sharedAt: string | null; createdAt: string;
}
interface PaperGenResult {
  contentJson: PaperContent;
  answerKeyJson: AnswerKey;
  provenance: string;
  generationMs: number;
}
/** One generated set of a multi-set paper (M1/M4). Single-set papers hold one entry labelled "A". */
interface GenSet {
  label: string;
  flavor: string | null;
  contentJson: PaperContent;
  answerKeyJson: AnswerKey;
  provenance: string;
}
interface MultiSetGen {
  sets: GenSet[];
  activeSet: number;
  generationMs: number;
}
/** Saved per-set payload stored inside configJson.sets. */
interface SavedSet {
  label: string;
  flavor?: string | null;
  contentJson: PaperContent;
  answerKeyJson: AnswerKey;
}
interface RegistryCounters { verified: number; inProgress: number; planned: number }
interface SavedAllotment {
  strategy?: string;
  seed?: number;
  mode?: string;
  map?: Record<string, number>;
  savedAt?: string;
}
interface Prefill {
  board: string; grade: string; subject: string; chapters: string[];
}
/** Candidate returned by the question-bank API (extra metadata for the picker). */
interface BankQuestion extends PaperQuestion {
  concept?: string;
  source?: "ai" | "bank";
}
/** Everything the edit dialog needs to regenerate / bank / rewrite one question. */
interface QuestionEditCtx {
  board: string; grade: string; subject: string; chapter: string;
  type: QType; marksEach: number; difficulty: string;
  current: PaperQuestion; exclude: string[];
}

/* ============================================================
 * Helpers — images, answer-key sync, header defaults
 * ============================================================ */

/** Resolves the letterhead logo: undefined → default brand logo, "" → none. */
function logoSrcOf(header?: PaperHeader | null): string | null {
  const v = header?.logoDataUrl;
  if (v === undefined) return DEFAULT_LOGO;
  if (v === "") return null;
  return v;
}

/** Guards headerJson coming from the database (may be `{}` on older rows). */
function normalizeHeader(h?: PaperHeader | null): PaperHeader {
  return {
    template: h?.template === "formal" || h?.template === "minimal" ? h.template : "classic",
    schoolName: typeof h?.schoolName === "string" ? h.schoolName : "Tutor Amma",
    examTitle: typeof h?.examTitle === "string" ? h.examTitle : "",
    logoDataUrl: typeof h?.logoDataUrl === "string" ? h.logoDataUrl : undefined,
    showStudentFields: h?.showStudentFields !== false,
  };
}

/** Seeded questions store difficulty lower-case; the generate/bank APIs want
 *  exactly "Easy" | "Medium" | "Hard" — normalise before calling them. */
function normalizeDifficulty(v: string | undefined, fallback = "Medium"): string {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "easy") return "Easy";
  if (s === "hard") return "Hard";
  if (s === "medium") return "Medium";
  return fallback;
}

/** Rebuilds the private answer key after any question replacement. */
function syncAnswerKey(content: PaperContent): AnswerKey {
  return {
    note: "Answer key + step-wise marking scheme — visible to tutor only",
    sections: (content.sections ?? []).map((s) => ({
      name: s.name,
      answers: (s.questions ?? []).map((q) => q.answer),
    })),
  };
}

function cloneContent(c: PaperContent | null | undefined): PaperContent {
  return c ? (JSON.parse(JSON.stringify(c)) as PaperContent) : { instructions: "", sections: [] };
}

/** Reads a File as a data URL, downscaled to ≤1100px on the long side.
 *  PNG stays PNG when the result is small enough; everything else is
 *  re-encoded as JPEG q0.85 on a white background. */
async function fileToDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = raw;
    });
    if (!img.naturalWidth || !img.naturalHeight) return raw;
    const MAX = 1100;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const isPng = raw.startsWith("data:image/png");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    if (!isPng) {
      ctx.fillStyle = "#FFFFFF"; // JPEG has no alpha — fill white first
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    if (isPng) {
      const png = canvas.toDataURL("image/png");
      if (png.length < 900_000) return png;
    }
    // PNG came out too large (photos do) → white-filled JPEG instead
    const c2 = document.createElement("canvas");
    c2.width = w;
    c2.height = h;
    const ctx2 = c2.getContext("2d");
    if (!ctx2) return raw;
    ctx2.fillStyle = "#FFFFFF";
    ctx2.fillRect(0, 0, w, h);
    ctx2.drawImage(img, 0, 0, w, h);
    return c2.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

/** Small cycling status label (inline ProgressCycle flavour). */
function useCycleLabel(labels: string[], active: boolean): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || labels.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % labels.length), 2400);
    return () => clearInterval(t);
  }, [active, labels.length]);
  return labels[Math.min(i, labels.length - 1)] ?? "";
}

/* ============================================================
 * Paper rendering (board-style) — preview tab, builder, print
 * ============================================================ */
function PaperDoc({
  title, board, grade, subject, config, content, header, onAction, actionBusy,
}: {
  title: string; board: string; grade: string; subject: string; config: PaperConfig; content: PaperContent;
  header?: PaperHeader;
  onAction?: (sectionIndex: number, questionIndex: number, action: "regen" | "bank" | "edit") => void;
  actionBusy?: string | null;
}) {
  const template = header?.template ?? "classic";
  const schoolName = header?.schoolName?.trim() || "Tutor Amma";
  const examTitle = header?.examTitle?.trim() ?? "";
  const showFields = header?.showStudentFields !== false;
  const logoSrc = logoSrcOf(header);

  /* ---- masthead by template ---- */
  const masthead = (() => {
    if (template === "formal") {
      return (
        <div
          className="sk-card-flat bg-white dark:bg-[#101735] p-5 border-2 border-[#14246B]"
          style={{ boxShadow: "inset 0 0 0 4px var(--card, #FFFFFF), inset 0 0 0 5px rgba(244,123,32,0.75)" }}
        >
          <div className="flex items-center gap-4">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="h-12 w-auto shrink-0" />
            ) : (
              <div className="w-12 shrink-0" aria-hidden />
            )}
            <div className="flex-1 min-w-0 text-center">
              <div
                className="text-[19px] font-extrabold text-brand-navy leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {schoolName}
              </div>
              {examTitle && (
                <div className="text-[12.5px] font-bold text-brand-navy/80 mt-0.5">{examTitle}</div>
              )}
              <div className="text-[11.5px] text-muted-foreground mt-1">
                {subject} · {grade} · {board}
              </div>
            </div>
            <div className="text-right text-[11px] leading-relaxed shrink-0">
              <div className="font-extrabold text-brand-navy">Time: {config.durationMin} min</div>
              <div className="font-extrabold text-brand-navy mt-0.5">Max Marks: {config.totalMarks}</div>
            </div>
          </div>
        </div>
      );
    }
    if (template === "minimal") {
      return (
        <div className="text-center py-1.5">
          <div className="text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
            {schoolName}
          </div>
          <div className="text-[22px] font-extrabold text-brand-navy mt-1.5 leading-snug">
            {examTitle || title || `${subject} — ${grade}`}
          </div>
          <div className="mx-auto w-10 h-[3px] rounded-full bg-[#F47B20] mt-2.5" aria-hidden />
          <div className="text-[12px] text-muted-foreground mt-2.5">
            {subject} — {grade} · {board}
          </div>
          <div className="text-[11.5px] font-bold text-foreground/85 mt-1.5 tabular">
            Time: {config.durationMin} minutes&nbsp;&nbsp;·&nbsp;&nbsp;Maximum Marks: {config.totalMarks}
          </div>
        </div>
      );
    }
    // classic (default) — the rich navy banner
    return (
      <div
        className="rounded-[16px] p-5 text-white shadow-[0_6px_20px_rgba(20,36,107,0.28)]"
        style={{ background: "linear-gradient(180deg,#33549E 0%,#1B2F79 50%,#14246B 100%)" }}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          {logoSrc && (
            <img
              src={logoSrc}
              alt=""
              className="h-6 w-auto rounded-md bg-white px-1.5 py-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
            />
          )}
          <div className="text-[10px] tracking-[0.22em] font-extrabold uppercase text-[#FFC98F]">
            {schoolName} — Examination
          </div>
        </div>
        <div className="flex justify-between items-end gap-3 flex-wrap mt-2.5">
          <div>
            <div className="text-[15.5px] font-extrabold">{subject} · {grade}</div>
            <div className="text-[11.5px] opacity-85">
              {board}{(examTitle || title) ? ` · ${examTitle || title}` : ""}
            </div>
          </div>
          <div className="text-right text-[11.5px] leading-relaxed">
            <div className="font-bold">Total Marks: {config.totalMarks}</div>
            <div className="opacity-85">Duration: {config.durationMin} minutes</div>
          </div>
        </div>
        {showFields && (
          <div className="mt-3.5 pt-3 border-t border-white/25 flex gap-4 sm:gap-8 text-[11px] opacity-95 flex-wrap">
            <span>Name: ____________________</span>
            <span>Roll No: ________</span>
            <span className="hidden sm:inline">Date: ________</span>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="space-y-5">
      {masthead}
      {template !== "classic" && showFields && (
        <div className="flex gap-4 sm:gap-8 text-[11px] text-muted-foreground flex-wrap -mt-1">
          <span>Name: ____________________</span>
          <span>Roll No: ________</span>
          <span className="hidden sm:inline">Date: ________</span>
        </div>
      )}

      {content.instructions && (
        <p className="text-[12.5px] leading-relaxed px-1">
          <span className="font-extrabold">Instructions:</span> {content.instructions}
        </p>
      )}

      {(content.sections ?? []).map((s, si) => (
        <section key={si} aria-label={s.name}>
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#14246B] pb-1.5 mb-3.5">
            <h3 className="text-[13px] font-extrabold text-brand-navy">{s.name}</h3>
            <span className="sk-pill sk-pill-grey">{s.marksEach} mark{s.marksEach > 1 ? "s" : ""} each</span>
          </div>
          <div className="space-y-3.5">
            {(s.questions ?? []).map((q, qi) => {
              const busy = actionBusy === `${si}:${qi}`;
              return (
                <div
                  key={qi}
                  className={`group flex items-start gap-2.5 rounded-xl px-1.5 -mx-1.5 py-1 transition-colors ${
                    onAction ? "hover:bg-[#F3F6FD] dark:hover:bg-[#1A2242]" : ""
                  }`}
                >
                  <span className="text-[12.5px] font-bold text-muted-foreground shrink-0 w-6 tabular">{qi + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] leading-relaxed font-medium">{q.q}</p>
                      <span className="sk-pill sk-pill-grey shrink-0 mt-0.5 tabular">{s.marksEach}</span>
                    </div>
                    {q.image && (
                      <img
                        src={q.image}
                        alt="Diagram attached to this question"
                        className="mt-2 max-h-56 rounded-lg border border-[#D6DEEE] bg-white"
                      />
                    )}
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-2 pl-1">
                        {q.options.map((o, oi) => (
                          <div key={oi} className="text-[12.5px] text-muted-foreground">
                            <span className="font-bold text-foreground">({LETTERS[oi]})</span> {o}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.note && (
                      <div className="text-[10.5px] text-brand-orange mt-1.5 font-semibold">Note: {q.note}</div>
                    )}
                    {onAction && (
                      <div className="flex items-center justify-end gap-1 mt-1.5 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-orange" aria-label="Updating this question" />}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-navy hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              onClick={() => onAction(si, qi, "regen")}
                              disabled={busy}
                              aria-label="Regenerate this question"
                            >
                              <Dices className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Regenerate this question</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-navy hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              onClick={() => onAction(si, qi, "bank")}
                              disabled={busy}
                              aria-label="Replace from question bank"
                            >
                              <Library className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Replace from question bank</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-navy hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              onClick={() => onAction(si, qi, "edit")}
                              disabled={busy}
                              aria-label="Edit or write my own"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Edit or write my own</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AnswerKeyDoc({ paper }: { paper: PaperRow }) {
  const content = paper.contentJson ?? { instructions: "", sections: [] };
  const key = paper.answerKeyJson ?? { sections: [] };

  return (
    <div className="space-y-4">
      <div className="sk-callout sk-callout-danger flex items-start gap-2.5">
        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <span className="font-extrabold">Answer key never leaves your account.</span> Students receive the paper only — this marking scheme stays private to you.
        </span>
      </div>

      {(content.sections ?? []).map((s, si) => {
        const ks = key.sections?.find((k) => k.name === s.name) ?? key.sections?.[si];
        return (
          <section key={si} className="sk-card-flat p-4 sm:p-5" aria-label={`${s.name} answers`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-[13px] font-extrabold text-brand-navy">{s.name}</h3>
              <span className="sk-pill sk-pill-grey">{s.marksEach} mark{s.marksEach > 1 ? "s" : ""} each</span>
            </div>
            <div className="space-y-2.5">
              {(s.questions ?? []).map((q, qi) => {
                const a = ks?.answers?.[qi] ?? q.answer ?? "";
                return (
                  <div key={qi} className="flex items-start gap-3 rounded-[12px] bg-[#F6F8FD] dark:bg-[#1A2242] p-3">
                    {s.type === "MCQ" ? (
                      <span className="sk-pill sk-pill-navy shrink-0 tabular">{a || "—"}</span>
                    ) : (
                      <span className="text-[11px] font-extrabold text-muted-foreground shrink-0 mt-0.5">Q{qi + 1}</span>
                    )}
                    <div className="min-w-0">
                      <div className="text-[11.5px] text-muted-foreground leading-snug">{q.q}</div>
                      {q.image && (
                        <img
                          src={q.image}
                          alt="Diagram attached to this question"
                          className="mt-1.5 max-h-24 rounded-lg border border-[#D6DEEE] bg-white"
                        />
                      )}
                      {s.type !== "MCQ" && (
                        <p className="text-[12.5px] font-semibold leading-relaxed mt-1 whitespace-pre-wrap">{a}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="sk-pill sk-pill-grey !text-[9.5px] !px-1.5">{q.chapter}</span>
                        <span className="sk-pill sk-pill-grey !text-[9.5px] !px-1.5">{q.difficulty}</span>
                        <span className="sk-pill sk-pill-grey !text-[9.5px] !px-1.5">{q.cognitive}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {key.note && <p className="text-[11.5px] text-muted-foreground px-1">{key.note}</p>}
    </div>
  );
}

/* ============================================================
 * Letterhead editor — builder step 4 + library "Paper details"
 * ============================================================ */
const HEADER_TEMPLATES: { id: PaperHeader["template"]; label: string; hint: string }[] = [
  { id: "classic", label: "Classic", hint: "Navy banner with the Tutor Amma look" },
  { id: "formal", label: "Formal", hint: "Board-exam letterhead, double border" },
  { id: "minimal", label: "Minimal", hint: "Clean modern header, orange rule" },
];

function TemplateThumb({ template }: { template: PaperHeader["template"] }) {
  if (template === "classic") {
    return (
      <div
        className="h-12 rounded-lg px-2.5 flex flex-col justify-center"
        style={{ background: "linear-gradient(180deg,#33549E,#14246B)" }}
      >
        <div className="h-1 w-7 rounded-full bg-[#FFC98F]" />
        <div className="h-1.5 w-14 rounded bg-white/90 mt-1.5" />
        <div className="h-1 w-9 rounded bg-white/50 mt-1" />
      </div>
    );
  }
  if (template === "formal") {
    return (
      <div
        className="h-12 rounded-lg border-2 border-[#14246B] flex flex-col items-center justify-center"
        style={{ boxShadow: "inset 0 0 0 2px var(--card, #FFFFFF), inset 0 0 0 3px rgba(244,123,32,0.8)" }}
      >
        <div className="h-1.5 w-11 rounded bg-[#14246B]" />
        <div className="h-1 w-16 rounded bg-[#98A2BC] mt-1.5" />
      </div>
    );
  }
  return (
    <div className="h-12 rounded-lg border border-[#E2E8F4] flex flex-col items-center justify-center">
      <div className="h-1 w-8 rounded bg-[#98A2BC]" />
      <div className="h-1.5 w-11 rounded bg-[#14246B] mt-1.5" />
      <div className="h-[3px] w-4 rounded-full bg-[#F47B20] mt-1.5" />
    </div>
  );
}

function LetterheadEditor({
  header, onChange, paperTitle,
}: {
  header: PaperHeader;
  onChange: (next: PaperHeader) => void;
  paperTitle: string;
}) {
  const logoInput = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const pickLogo = async (file: File | null | undefined) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      onChange({ ...header, logoDataUrl: await fileToDataUrl(file) });
    } catch {
      toast({
        title: "Could not read that image",
        description: "Please pick a PNG or JPEG file.",
        variant: "destructive",
      });
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* template picker */}
      <div>
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">
          Letterhead template
        </span>
        <div className="grid grid-cols-3 gap-2.5">
          {HEADER_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ ...header, template: t.id })}
              className={`rounded-[14px] border p-2.5 text-left transition ${
                header.template === t.id
                  ? "border-[#315BE5] ring-2 ring-[#315BE5]/20 bg-[#F0F4FE] dark:bg-[#1B2445]"
                  : "border-border hover:border-[#B9C6E4]"
              }`}
              aria-pressed={header.template === t.id}
              aria-label={`${t.label} template — ${t.hint}`}
            >
              <TemplateThumb template={t.id} />
              <div className="text-[12px] font-bold mt-2">{t.label}</div>
              <div className="text-[10.5px] text-muted-foreground leading-snug mt-0.5">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* names */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="le-school" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
            School / institute name
          </label>
          <input
            id="le-school"
            className="sk-input"
            value={header.schoolName}
            maxLength={80}
            placeholder="Tutor Amma"
            onChange={(e) => onChange({ ...header, schoolName: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="le-exam" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Exam title
          </label>
          <input
            id="le-exam"
            className="sk-input"
            value={header.examTitle}
            maxLength={120}
            placeholder={paperTitle || "e.g. Half-Yearly Examination 2025"}
            onChange={(e) => onChange({ ...header, examTitle: e.target.value })}
          />
        </div>
      </div>

      {/* logo */}
      <div className="sk-well p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground block">Logo</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Shown in the letterhead and on every PDF page.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="sk-btn sk-btn-ghost sk-btn-sm"
              onClick={() => logoInput.current?.click()}
              disabled={logoBusy}
            >
              {logoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload logo
            </button>
            {header.logoDataUrl !== undefined && (
              <button
                type="button"
                className="sk-btn sk-btn-ghost sk-btn-sm"
                onClick={() => onChange({ ...header, logoDataUrl: undefined })}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Use Tutor Amma logo
              </button>
            )}
            {header.logoDataUrl !== "" && (
              <button
                type="button"
                className="sk-btn sk-btn-ghost sk-btn-sm"
                onClick={() => onChange({ ...header, logoDataUrl: "" })}
              >
                <ImageOff className="w-3.5 h-3.5" /> Remove logo
              </button>
            )}
          </div>
        </div>
        <input
          ref={logoInput}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload a custom logo"
          onChange={(e) => {
            pickLogo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3 min-h-10">
          {header.logoDataUrl ? (
            <img
              src={header.logoDataUrl}
              alt="Custom logo preview"
              className="h-10 w-auto rounded-md border border-[#D6DEEE] bg-white px-1.5 py-0.5"
            />
          ) : header.logoDataUrl === "" ? (
            <span className="text-[11.5px] text-muted-foreground">No logo — the letterhead uses your institute name only.</span>
          ) : (
            <img src={DEFAULT_LOGO} alt="Tutor Amma logo" className="h-10 w-auto" />
          )}
        </div>
      </div>

      {/* student fields */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[12.5px] font-bold block">Student name / roll / date line</span>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Show the fill-in line for Name, Roll No and Date on the paper.
          </p>
        </div>
        <Switch
          checked={header.showStudentFields}
          onCheckedChange={(v) => onChange({ ...header, showStudentFields: v })}
          aria-label="Show student name, roll number and date fields"
        />
      </div>
    </div>
  );
}

/* ============================================================
 * Question edit dialog — regenerate · bank · write my own · image
 * ============================================================ */
const Q_EDIT_BUSY_MESSAGES = [
  "Writing a fresh question…",
  "Checking it fits the chapter…",
  "Drafting the marking scheme…",
];

/** Shared editable question fields (Write my own + From image tabs). */
function QuestionFields({
  isMCQ, qText, onQText, options, onOption, correctIdx, onCorrect, answerText, onAnswer, disabled,
}: {
  isMCQ: boolean;
  qText: string;
  onQText: (v: string) => void;
  options: string[];
  onOption: (i: number, v: string) => void;
  correctIdx: number;
  onCorrect: (i: number) => void;
  answerText: string;
  onAnswer: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3.5">
      <div>
        <label htmlFor="qe-question" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
          Question text <span className="text-brand-orange">*</span>
        </label>
        <textarea
          id="qe-question"
          className="sk-input min-h-[88px] resize-y text-[13px]"
          maxLength={2000}
          value={qText}
          onChange={(e) => onQText(e.target.value)}
          placeholder="Type or paste the question…"
          disabled={disabled}
        />
        <p className="text-[10.5px] text-muted-foreground mt-1">{qText.trim().length}/2000 characters</p>
      </div>
      {isMCQ ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((o, i) => (
              <div key={i}>
                <label htmlFor={`qe-opt-${i}`} className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                  Option {LETTERS[i]} <span className="text-brand-orange">*</span>
                </label>
                <input
                  id={`qe-opt-${i}`}
                  className="sk-input"
                  value={o}
                  maxLength={240}
                  placeholder={`Option ${LETTERS[i]}`}
                  disabled={disabled}
                  onChange={(e) => onOption(i, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
              Correct answer <span className="text-brand-orange">*</span>
            </span>
            <div className="sk-segment" role="group" aria-label="Correct answer">
              {LETTERS.map((L, i) => (
                <button
                  key={L}
                  type="button"
                  className={`sk-segment-item ${correctIdx === i ? "sk-segment-item-active" : ""}`}
                  onClick={() => onCorrect(i)}
                  aria-pressed={correctIdx === i}
                  disabled={disabled}
                >
                  {L}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="qe-answer" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Answer / marking scheme <span className="text-brand-orange">*</span>
          </label>
          <textarea
            id="qe-answer"
            className="sk-input min-h-[88px] resize-y text-[13px]"
            value={answerText}
            maxLength={2000}
            placeholder="Write the expected answer or a step-wise marking scheme…"
            disabled={disabled}
            onChange={(e) => onAnswer(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function QuestionEditDialog({
  open, onOpenChange, initialTab = "regen", ctx, onReplace, onBusyChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: EditTab;
  ctx: QuestionEditCtx | null;
  onReplace: (q: PaperQuestion) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  return (
    <Dialog open={open && !!ctx} onOpenChange={onOpenChange}>
      {open && ctx ? (
        <QuestionEditBody
          onOpenChange={onOpenChange}
          ctx={ctx}
          initialTab={initialTab}
          onReplace={onReplace}
          onBusyChange={onBusyChange}
        />
      ) : null}
    </Dialog>
  );
}

function QuestionEditBody({
  onOpenChange, ctx, initialTab, onReplace, onBusyChange,
}: {
  onOpenChange: (open: boolean) => void;
  ctx: QuestionEditCtx;
  initialTab: EditTab;
  onReplace: (q: PaperQuestion) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const isMCQ = ctx.type === "MCQ";
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [qText, setQText] = useState(ctx.current.q);
  const [options, setOptions] = useState<string[]>((() => {
    const base = ctx.current.options?.slice(0, 4) ?? [];
    return [0, 1, 2, 3].map((i) => base[i] ?? "");
  })());
  const [correctIdx, setCorrectIdx] = useState(() => {
    const idx = LETTERS.indexOf(String(ctx.current.answer ?? "").trim().toUpperCase().slice(0, 1));
    return idx >= 0 ? idx : 0;
  });
  const [answerText, setAnswerText] = useState(isMCQ ? "" : ctx.current.answer);
  const [image, setImage] = useState<string | undefined>(ctx.current.image);
  const [attachImage, setAttachImage] = useState(true);

  const [regenBusy, setRegenBusy] = useState(false);
  const [polishBusy, setPolishBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankItems, setBankItems] = useState<BankQuestion[] | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState(-1);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const imageFileRef = useRef<HTMLInputElement>(null);
  const imageCamRef = useRef<HTMLInputElement>(null);
  const writeFileRef = useRef<HTMLInputElement>(null);
  const writeCamRef = useRef<HTMLInputElement>(null);

  const busy = regenBusy || polishBusy || visionBusy;
  const busyLabel = useCycleLabel(Q_EDIT_BUSY_MESSAGES, busy);

  /* surface busy state to the parent so the paper row can show its spinner */
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  /* ------- question bank (loads on first open) ------- */
  const loadBank = useCallback(async () => {
    setBankBusy(true);
    setBankError(null);
    try {
      const data = await api<{ questions: BankQuestion[] }>("/api/studio/question-bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          board: ctx.board, grade: ctx.grade, subject: ctx.subject, chapter: ctx.chapter,
          type: ctx.type, difficulty: ctx.difficulty, exclude: ctx.exclude,
        }),
      }, 30_000);
      setBankItems(data.questions ?? []);
    } catch (e) {
      setBankError(e instanceof Error ? e.message : "Could not load the question bank.");
    } finally {
      setBankBusy(false);
    }
  }, [ctx]);

  useEffect(() => {
    void loadBank();
  }, [loadBank]);

  /* ------- shared helpers ------- */
  const generateQuestion = (source: { kind: "fresh" } | { kind: "text"; text: string } | { kind: "image"; imageDataUrl: string }) =>
    api<{ question: PaperQuestion; provenance: string }>("/api/studio/generate/question", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        board: ctx.board, grade: ctx.grade, subject: ctx.subject, chapter: ctx.chapter,
        type: ctx.type, difficulty: ctx.difficulty, exclude: ctx.exclude, source,
      }),
    }, 60_000);

  const fillFromQuestion = (q: PaperQuestion) => {
    setQText(q.q);
    if (isMCQ) {
      if (q.options?.length) {
        const base = q.options.slice(0, 4);
        setOptions([0, 1, 2, 3].map((i) => base[i] ?? ""));
      }
      const idx = LETTERS.indexOf(String(q.answer ?? "").trim().toUpperCase().slice(0, 1));
      if (idx >= 0) setCorrectIdx(idx);
    } else {
      setAnswerText(q.answer);
    }
  };

  const cleanQuestion = (q: PaperQuestion): PaperQuestion => {
    const out: PaperQuestion = {
      q: q.q,
      answer: q.answer,
      chapter: q.chapter || ctx.chapter,
      difficulty: q.difficulty || ctx.difficulty,
      cognitive: q.cognitive || ctx.current.cognitive,
    };
    if (q.options?.length) out.options = q.options;
    if (q.note) out.note = q.note;
    if (q.concept) out.concept = q.concept;
    if (q.image) out.image = q.image;
    return out;
  };

  const qValid = qText.trim().length >= 3 && qText.trim().length <= 2000;
  const mcqValid = !isMCQ || (options.every((o) => o.trim().length > 0) && correctIdx >= 0);
  const ansValid = isMCQ || answerText.trim().length > 0;
  const formValid = qValid && mcqValid && ansValid;

  const buildReplacement = (): PaperQuestion => {
    const out: PaperQuestion = {
      q: qText.trim(),
      answer: isMCQ ? LETTERS[correctIdx] : answerText.trim(),
      chapter: ctx.chapter,
      difficulty: ctx.difficulty,
      cognitive: ctx.current.cognitive,
    };
    if (isMCQ) out.options = options.map((o) => o.trim());
    if (image && attachImage) out.image = image;
    return out;
  };

  const replaceForm = () => {
    if (!formValid) return;
    onReplace(buildReplacement());
    toast({
      title: "Question replaced",
      description: "Your version is in the paper — the answer key was updated to match.",
    });
    onOpenChange(false);
  };

  const replaceWithBank = (b: BankQuestion) => {
    onReplace(cleanQuestion(b));
    toast({
      title: "Question replaced from the bank",
      description: `${b.source === "bank" ? "Curated" : "AI-written"} for ${b.chapter} — the answer key was updated to match.`,
    });
    onOpenChange(false);
  };

  /* ------- actions ------- */
  const doRegen = async () => {
    setRegenBusy(true);
    try {
      const { question, provenance } = await generateQuestion({ kind: "fresh" });
      onReplace(cleanQuestion(question));
      toast({
        title: "Question regenerated",
        description: `${provenance} — only this question changed; the answer key was updated.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not regenerate",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRegenBusy(false);
    }
  };

  const doPolish = async () => {
    if (qText.trim().length < 3) return;
    setPolishBusy(true);
    try {
      const { question } = await generateQuestion({ kind: "text", text: qText.trim() });
      fillFromQuestion(question);
      toast({ title: "AI polished your question — review and replace" });
    } catch (e) {
      toast({
        title: "Could not polish",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setPolishBusy(false);
    }
  };

  const doVision = async () => {
    if (!image) return;
    setVisionBusy(true);
    setVisionError(null);
    try {
      const { question } = await generateQuestion({ kind: "image", imageDataUrl: image });
      fillFromQuestion(question);
    } catch (e) {
      setVisionError(e instanceof Error ? e.message : "The image could not be read. Try a clearer photo.");
    } finally {
      setVisionBusy(false);
    }
  };

  const pickImage = async (file: File | null | undefined) => {
    if (!file) return;
    setImgBusy(true);
    try {
      setImage(await fileToDataUrl(file));
      setAttachImage(true);
    } catch {
      toast({
        title: "Could not read that image",
        description: "Please pick a PNG or JPEG file.",
        variant: "destructive",
      });
    } finally {
      setImgBusy(false);
    }
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickImage(e.target.files?.[0]);
    e.target.value = "";
  };

  /* ------- render ------- */
  return (
    <DialogContent
      className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
      onEscapeKeyDown={(e) => busy && e.preventDefault()}
      onPointerDownOutside={(e) => busy && e.preventDefault()}
      onInteractOutside={(e) => busy && e.preventDefault()}
    >
      <DialogHeader className="p-5 pb-3 text-left space-y-1.5 shrink-0">
        <DialogTitle className="text-[16px]">Edit question</DialogTitle>
        <DialogDescription>
          {ctx.chapter} · {TYPE_LABEL[ctx.type]} · {ctx.marksEach} mark{ctx.marksEach > 1 ? "s" : ""} — only this
          question changes; the section, numbering and marks stay the same.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as EditTab)} className="flex-1 min-h-0 flex flex-col gap-0">
        <TabsList className="mx-5 shrink-0 grid grid-cols-2 sm:inline-flex sm:w-auto w-full h-auto gap-1">
          <TabsTrigger value="regen" className="py-1.5 px-3 text-[12px]">
            <Dices className="w-3.5 h-3.5" /> Regenerate
          </TabsTrigger>
          <TabsTrigger value="bank" className="py-1.5 px-3 text-[12px]">
            <Library className="w-3.5 h-3.5" /> Question bank
          </TabsTrigger>
          <TabsTrigger value="write" className="py-1.5 px-3 text-[12px]">
            <Pencil className="w-3.5 h-3.5" /> Write my own
          </TabsTrigger>
          <TabsTrigger value="image" className="py-1.5 px-3 text-[12px]">
            <ScanLine className="w-3.5 h-3.5" /> From image
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-y-auto sk-scroll p-5 pt-4">
          {/* ---- regenerate ---- */}
          <TabsContent value="regen" className="mt-0 space-y-4">
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              A brand-new question for{" "}
              <span className="font-semibold text-foreground">{ctx.chapter}</span> · {ctx.difficulty} ·{" "}
              {TYPE_LABEL[ctx.type]} — only this question changes; everything else stays exactly the same.
            </p>
            <div className="sk-well p-3.5">
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1">
                Current question (will be replaced)
              </div>
              <p className="text-[12.5px] font-medium leading-relaxed">{ctx.current.q}</p>
              {ctx.current.options?.length ? (
                <div className="text-[11.5px] text-muted-foreground mt-1.5 leading-relaxed">
                  {ctx.current.options.map((o, i) => `(${LETTERS[i]}) ${o}`).join("   ")}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col sm:items-start gap-2.5">
              <button type="button" className="sk-btn sk-btn-orange sk-btn-lg w-full sm:w-auto justify-center" onClick={doRegen} disabled={regenBusy}>
                {regenBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
                {regenBusy ? "Writing a new question…" : "Regenerate question"}
              </button>
              {regenBusy && (
                <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-orange" />
                  {busyLabel}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ---- question bank ---- */}
          <TabsContent value="bank" className="mt-0">
            {bankBusy ? (
              <div className="py-8 flex flex-col items-center gap-2.5 text-muted-foreground" role="status">
                <Loader2 className="w-5 h-5 animate-spin text-brand-navy" />
                <span className="text-[12.5px] font-semibold">Finding questions for {ctx.chapter}…</span>
              </div>
            ) : bankError ? (
              <div className="sk-callout sk-callout-danger">
                {bankError} —{" "}
                <button type="button" className="underline font-semibold" onClick={() => void loadBank()}>
                  retry
                </button>
              </div>
            ) : !bankItems || bankItems.length === 0 ? (
              <EmptyState
                icon={Library}
                title="No bank questions for this chapter"
                sub="Try the Regenerate tab — AI will write a fresh one instead."
              />
            ) : (
              <div className="max-h-[50vh] overflow-y-auto sk-scroll space-y-2.5 pr-1" role="list" aria-label="Question bank candidates">
                {bankItems.map((b, i) => (
                  <article
                    key={i}
                    role="listitem"
                    aria-label={`Bank question ${i + 1}`}
                    className={`sk-card-flat p-3.5 cursor-pointer transition ${
                      selectedBank === i ? "border-[#315BE5] ring-2 ring-[#315BE5]/25" : "hover:border-[#B9C6E4]"
                    }`}
                    onClick={() => setSelectedBank(i)}
                  >
                    <p className="text-[12.5px] font-medium leading-relaxed">{b.q}</p>
                    {b.options?.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 mt-2">
                        {b.options.map((o, oi) => (
                          <div key={oi} className="text-[11.5px] text-muted-foreground">
                            <span className="font-bold text-foreground">({LETTERS[oi]})</span> {o}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                      {b.concept && <span className="sk-pill sk-pill-blue">{b.concept}</span>}
                      <span className="sk-pill sk-pill-grey">{b.chapter}</span>
                      <span className="sk-pill sk-pill-grey">{b.difficulty}</span>
                      <span className="sk-pill sk-pill-grey">{b.cognitive}</span>
                      <span className={`sk-pill ${b.source === "bank" ? "sk-pill-navy" : "sk-pill-orange"}`}>
                        {b.source === "bank" ? "Curated" : "AI"}
                      </span>
                    </div>
                    <div className="flex justify-end mt-2.5">
                      <button
                        type="button"
                        className={selectedBank === i ? "sk-btn sk-btn-primary sk-btn-sm" : "sk-btn sk-btn-ghost sk-btn-sm"}
                        onClick={(e) => {
                          e.stopPropagation();
                          replaceWithBank(b);
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Replace with this
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ---- write my own ---- */}
          <TabsContent value="write" className="mt-0 space-y-4">
            <p className="text-[11.5px] text-muted-foreground">
              Type it, paste it, or upload a diagram — your text becomes the question.
            </p>
            <QuestionFields
              isMCQ={isMCQ}
              qText={qText}
              onQText={setQText}
              options={options}
              onOption={(i, v) => setOptions((prev) => prev.map((o, x) => (x === i ? v : o)))}
              correctIdx={correctIdx}
              onCorrect={setCorrectIdx}
              answerText={answerText}
              onAnswer={setAnswerText}
              disabled={polishBusy}
            />
            <div className="sk-well p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  Optional diagram
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="sk-btn sk-btn-ghost sk-btn-sm"
                    onClick={() => writeFileRef.current?.click()}
                    disabled={imgBusy}
                  >
                    {imgBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload image
                  </button>
                  <button
                    type="button"
                    className="sk-btn sk-btn-ghost sk-btn-sm"
                    onClick={() => writeCamRef.current?.click()}
                    disabled={imgBusy}
                  >
                    <Camera className="w-3.5 h-3.5" /> Camera
                  </button>
                </div>
              </div>
              <input ref={writeFileRef} type="file" accept="image/*" className="sr-only" aria-label="Upload a diagram" onChange={onFilePicked} />
              <input
                ref={writeCamRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="Take a photo of a diagram"
                onChange={onFilePicked}
              />
              {image ? (
                <div className="flex items-start gap-3 flex-wrap">
                  <img src={image} alt="Diagram preview" className="max-h-28 rounded-lg border border-[#D6DEEE] bg-white" />
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setImage(undefined)}>
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Attach a figure, graph or geometry photo — it appears under the question and in the printed PDF.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" className="sk-btn sk-btn-primary" onClick={replaceForm} disabled={!formValid || polishBusy}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Replace question
              </button>
              <button
                type="button"
                className="sk-btn sk-btn-ghost"
                onClick={doPolish}
                disabled={polishBusy || qText.trim().length < 3}
              >
                {polishBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Polish with AI
              </button>
            </div>
          </TabsContent>

          {/* ---- from image ---- */}
          <TabsContent value="image" className="mt-0 space-y-4">
            <p className="text-[11.5px] text-muted-foreground">
              Photograph a question from a textbook or worksheet — AI reads it and fills the fields below for you to check.
            </p>
            {!image ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload a photo of a question"
                  className={`rounded-[14px] border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                    dragOver ? "border-[#F47B20] bg-[#FFF6E8]" : "border-[#C9D5EC] hover:border-[#315BE5]/60"
                  }`}
                  onClick={() => imageFileRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      imageFileRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    pickImage(e.dataTransfer.files?.[0]);
                  }}
                >
                  {imgBusy ? (
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-brand-orange" />
                  ) : (
                    <ImagePlus className="w-6 h-6 mx-auto text-muted-foreground" />
                  )}
                  <div className="text-[12.5px] font-semibold mt-2">
                    {imgBusy ? "Preparing your image…" : "Drop a photo of the question here, or click to browse"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    PNG or JPEG — large photos are downscaled automatically.
                  </div>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="sk-btn sk-btn-ghost sk-btn-sm"
                    onClick={() => imageCamRef.current?.click()}
                    disabled={imgBusy}
                  >
                    <Camera className="w-3.5 h-3.5" /> Use camera
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2.5">
                <img
                  src={image}
                  alt="Question photo preview"
                  className="w-full max-h-64 object-contain mx-auto rounded-xl border border-[#D6DEEE] bg-white"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="sk-btn sk-btn-ghost sk-btn-sm"
                    onClick={() => imageFileRef.current?.click()}
                    disabled={imgBusy || visionBusy}
                  >
                    {imgBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Replace photo
                  </button>
                  <button
                    type="button"
                    className="sk-btn sk-btn-ghost sk-btn-sm"
                    onClick={() => setImage(undefined)}
                    disabled={imgBusy || visionBusy}
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            )}
            <input ref={imageFileRef} type="file" accept="image/*" className="sr-only" aria-label="Choose an image file" onChange={onFilePicked} />
            <input
              ref={imageCamRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a photo of the question"
              onChange={onFilePicked}
            />
            {visionError && <div className="sk-callout sk-callout-danger">{visionError}</div>}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                className="sk-btn sk-btn-orange"
                onClick={doVision}
                disabled={!image || visionBusy || imgBusy}
              >
                {visionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                {visionBusy ? "Reading the image…" : "Run with AI"}
              </button>
              <label className="flex items-center gap-2 text-[12px] font-semibold cursor-pointer">
                <Checkbox
                  checked={attachImage}
                  onCheckedChange={(v) => setAttachImage(v === true)}
                  aria-label="Attach this diagram to the question"
                  disabled={visionBusy}
                />
                Attach this diagram to the question
              </label>
            </div>
            <QuestionFields
              isMCQ={isMCQ}
              qText={qText}
              onQText={setQText}
              options={options}
              onOption={(i, v) => setOptions((prev) => prev.map((o, x) => (x === i ? v : o)))}
              correctIdx={correctIdx}
              onCorrect={setCorrectIdx}
              answerText={answerText}
              onAnswer={setAnswerText}
              disabled={visionBusy}
            />
            <button type="button" className="sk-btn sk-btn-primary" onClick={replaceForm} disabled={!formValid || visionBusy}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Replace question
            </button>
          </TabsContent>
        </div>
      </Tabs>
    </DialogContent>
  );
}

/* ============================================================
 * Builder — 4 steps (curriculum → blueprint → generate → save)
 * ============================================================ */
const BUILDER_STEPS = ["Curriculum", "Blueprint", "Generate", "Save"];
const PAPER_GEN_MESSAGES = [
  "Reading the verified syllabus…",
  "Balancing the blueprint…",
  "Writing questions…",
  "Checking answers & marking schemes…",
];

/* ============================================================
 * Curriculum v2 — profile card (states + lifecycle pills)
 * ============================================================ */
function ProfileCard({
  board: b,
  selected,
  onSelect,
  onPriority,
  onNotify,
}: {
  board: BoardRow;
  selected: boolean;
  onSelect: () => void;
  onPriority: () => void;
  onNotify: () => void;
}) {
  const vs = (b.verifyState ?? "coming_soon") as "verified" | "partial" | "ingesting" | "coming_soon";
  const meta = VERIFY_STATE_META[vs] ?? VERIFY_STATE_META.coming_soon;
  const track = TRACK_PILL[(b.status as "active" | "legacy" | "transitional" | "retired" | "under_review") ?? "active"] ?? TRACK_PILL.active;
  const langs = parseJsonArray(b.languages);
  const stateRing =
    vs === "verified" ? "border-[#156F4C]/50" : vs === "partial" ? "border-[#B45309]/40" : vs === "ingesting" ? "border-[#315BE5]/40" : "border-border";
  const badgeCls =
    vs === "verified" ? "bg-[#156F4C] text-white" : vs === "partial" ? "bg-[#B45309] text-white" : vs === "ingesting" ? "bg-[#315BE5] text-white" : "bg-muted text-muted-foreground";

  return (
    <div
      className={`sk-card-flat p-4 flex flex-col gap-2 transition-all ${stateRing} ${selected ? "ring-2 ring-[#315BE5] shadow-[0_10px_28px_rgba(49,91,229,0.14)]" : ""}`}
      data-testid="profile-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-bold text-[13.5px] leading-snug">{b.name}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">{b.bodies}{b.country ? ` · ${b.country}` : ""}</p>
        </div>
        <span className={`sk-pill shrink-0 text-white ${badgeCls} !border-transparent`} data-state={vs}>{meta.label}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`sk-pill ${track.tone === "green" ? "sk-pill-green" : track.tone === "amber" ? "sk-pill-orange" : track.tone === "blue" ? "sk-pill-blue" : track.tone === "orange" ? "sk-pill-orange" : "sk-pill-grey"}`}>
          {track.label}{b.status === "legacy" && b.lastExam ? ` — last exam ${b.lastExam}` : ""}{b.status === "retired" && b.lastExam ? ` — last sat ${b.lastExam}` : ""}
        </span>
        {b.levels && <span className="sk-pill sk-pill-grey">{b.levels}</span>}
      </div>

      {vs === "verified" && (
        <div className="text-[11.5px] text-muted-foreground">
          {b.chapters} {parseTaxonomy(b.taxonomy).top.toLowerCase()}s · {b.topics ?? 0} {parseTaxonomy(b.taxonomy).mid.toLowerCase()}s · {b.approvedQ ?? 0} approved Q
        </div>
      )}
      {vs === "partial" && (
        <div className="text-[11.5px] text-[#B45309]">
          {b.subjects} of the {b.name} subjects verified — only those are selectable.
        </div>
      )}
      {vs === "ingesting" && (
        <div className="space-y-1.5">
          <div className="sk-progress-track">
            <div className="sk-progress-fill" style={{ width: "40%" }} />
          </div>
          <div className="text-[11px] text-[#315BE5] font-semibold">Pipeline running — 40% ingested</div>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {langs.slice(0, 3).map((l) => (
          <span key={l} className="sk-pill sk-pill-grey">{l}</span>
        ))}
        {b.verifiedAt && (
          <span className="text-[10.5px] text-muted-foreground ml-auto">Verified {new Date(b.verifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
        )}
      </div>

      {b.selectable ? (
        <button
          className={`sk-btn sk-btn-sm mt-1 ${selected ? "sk-btn-primary" : "sk-btn-ghost"}`}
          onClick={onSelect}
          aria-pressed={selected}
        >
          {selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
          {selected ? "Selected" : "Select profile"}
        </button>
      ) : vs === "coming_soon" ? (
        <div className="flex items-center gap-1.5 mt-1">
          <button className="sk-btn sk-btn-ghost sk-btn-sm !text-[11px] flex-1" onClick={onPriority}>
            <Sparkles className="w-3.5 h-3.5" /> Request priority
          </button>
          <button className="sk-btn sk-btn-ghost sk-btn-sm !text-[11px] flex-1" onClick={onNotify}>
            <Bell className="w-3.5 h-3.5" /> Notify me
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{meta.hint}</p>
      )}
    </div>
  );
}

function PaperBuilder({ prefill, onDone }: { prefill: Prefill | null; onDone: () => void }) {
  const [step, setStep] = useState(1);

  const [boards, setBoards] = useState<BoardRow[] | null>(null);
  const [counters, setCounters] = useState<RegistryCounters | null>(null);
  const [regionTabCounts, setRegionTabCounts] = useState<{ region: string; count: number }[]>([]);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [boardCode, setBoardCode] = useState("");
  const [boardName, setBoardName] = useState("");

  /* curriculum v2 filters */
  const [regionTab, setRegionTab] = useState<string>("All");
  const [country, setCountry] = useState("");
  const [registrySearch, setRegistrySearch] = useState("");

  /* curriculum v2 selections */
  const [yearLabel, setYearLabel] = useState("");
  const [pathway, setPathway] = useState("");
  const [language, setLanguage] = useState("English");
  const [examTypeId, setExamTypeId] = useState("custom");

  const [grades, setGrades] = useState<GradeRow[] | null>(null);
  const [gradeName, setGradeName] = useState("");
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [chapterNames, setChapterNames] = useState<string[]>([]);
  const [subTopicCount, setSubTopicCount] = useState(0);
  const subTopicCb = useCallback((n: number) => setSubTopicCount(n), []);

  const [totalMarks, setTotalMarks] = useState(40);
  const [durationMin, setDurationMin] = useState(90);
  const [difficulty, setDifficulty] = useState("Medium");
  const [sections, setSections] = useState<SectionSpec[]>([
    { type: "MCQ", count: 5, marksEach: 1 },
    { type: "SA", count: 3, marksEach: 5 },
    { type: "LA", count: 2, marksEach: 10 },
  ]);
  const [setsCount, setSetsCount] = useState(1);
  const [deliveryMode, setDeliveryMode] = useState<"M1" | "M2" | "M3" | "M4">("M1");

  const [generating, setGenerating] = useState(false);
  const [genMsgIdx, setGenMsgIdx] = useState(0);
  const [gen, setGen] = useState<MultiSetGen | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  /* letterhead + per-question editing */
  const [header, setHeader] = useState<PaperHeader>({
    template: "classic", schoolName: "Tutor Amma", examTitle: "", showStudentFields: true,
  });
  const [edited, setEdited] = useState(false);
  const [editTarget, setEditTarget] = useState<{ si: number; qi: number; tab: EditTab } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    setBoardsError(null);
    try {
      // raw fetch — the v2 registry returns { data, counters, regionTabs } and the
      // shared api() helper would unwrap only `data`
      const res = await fetch("/api/curriculum/boards");
      const json = (await res.json().catch(() => null)) as
        | { data?: BoardRow[]; counters?: RegistryCounters; regionTabs?: { region: string; count: number }[]; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.data) {
        throw new Error(json?.error?.message || "Could not load the curriculum registry.");
      }
      setBoards(json.data);
      setCounters(json.counters ?? null);
      setRegionTabCounts(json.regionTabs ?? []);
    } catch (e) {
      setBoardsError(e instanceof Error ? e.message : "Could not load the curriculum registry.");
      setBoards([]);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  /* prefill: board */
  useEffect(() => {
    if (!prefill || !boards || boardCode) return;
    const b = boards.find((x) => x.code === prefill.board || x.name === prefill.board);
    if (b) {
      setBoardCode(b.code);
      setBoardName(b.name);
    }
  }, [prefill, boards, boardCode]);

  /* board → grades (changing board clears the rest of the chain + v2 selections) */
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
    setYearLabel("");
    setPathway("");
    const b = boards?.find((x) => x.code === boardCode);
    setLanguage(b ? parseJsonArray(b.languages)[0] || "English" : "English");
    api<{ grades: GradeRow[] }>(`/api/curriculum/grades?boardId=${encodeURIComponent(boardCode)}`)
      .then((d) => alive && setGrades(d.grades))
      .catch(() => alive && setGrades([]));
    return () => {
      alive = false;
    };
  }, [boardCode, boards]);

  /* prefill: grade */
  useEffect(() => {
    if (!prefill || !grades || gradeName) return;
    if (grades.some((g) => g.name === prefill.grade)) setGradeName(prefill.grade);
  }, [prefill, grades, gradeName]);

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

  /* prefill: subject */
  useEffect(() => {
    if (!prefill || !subjects || subjectName) return;
    if (subjects.some((s) => s.name === prefill.subject)) setSubjectName(prefill.subject);
  }, [prefill, subjects, subjectName]);

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

  /* prefill: chapters */
  useEffect(() => {
    if (!prefill || !chapters || chapterNames.length > 0) return;
    const names = prefill.chapters.filter((c) => chapters.some((ch) => ch.name === c));
    if (names.length > 0) setChapterNames(names);
  }, [prefill, chapters, chapterNames.length]);

  /* prefill: auto-advance to blueprint once the chain is complete */
  const advanced = useRef(false);
  useEffect(() => {
    if (prefill && !advanced.current && boardCode && gradeName && subjectName && chapterNames.length > 0) {
      advanced.current = true;
      setStep(2);
    }
  }, [prefill, boardCode, gradeName, subjectName, chapterNames.length]);

  /* safety net: never linger on Save without a draft (e.g. a config change wiped it) */
  useEffect(() => {
    if (step === 4 && !gen) setStep(3);
  }, [step, gen]);

  const computedMarks = sections.reduce((a, s) => a + (Number(s.count) || 0) * (Number(s.marksEach) || 0), 0);
  const totalQuestions = sections.reduce((a, s) => a + (Number(s.count) || 0), 0);
  const marksBalanced = computedMarks > 0 && computedMarks === totalMarks;
  const selBoard = boards?.find((b) => b.code === boardCode);

  const patchSection = (i: number, p: Partial<SectionSpec>) => {
    setSections((prev) => prev.map((s, x) => (x === i ? { ...s, ...p } : s)));
    setGen(null);
  };
  const toggleChapter = (name: string) => {
    setChapterNames((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
    setGen(null);
  };
  const toggleAllChapters = (selectAll: boolean) => {
    setChapterNames(selectAll ? (chapters ?? []).map((c) => c.name) : []);
    setGen(null);
  };

  const canNext =
    (step === 1 && chapterNames.length > 0) ||
    (step === 2 && marksBalanced && durationMin >= 10 && durationMin <= 240) ||
    (step === 3 && !!gen);

  /* Smart Preset Engine — choosing an exam type fills the blueprint (marks / duration / sections). */
  const applyExamType = useCallback((id: string) => {
    setExamTypeId(id);
    setGen(null);
    const t = examTypeById(id);
    if (!t || id === "custom") return;
    setTotalMarks(t.preset.marks);
    setDurationMin(t.preset.durationMin);
    setSections(t.preset.sections.map((s) => ({ type: s.type, count: s.count, marksEach: s.marksEach })));
    toast({
      title: `${t.label} preset applied`,
      description: `${t.preset.marks} marks · ${t.preset.durationMin} min · ${t.preset.sections.map((s) => `${s.count}×${s.type}`).join(" + ")} — edit anything before generating.`,
    });
  }, []);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setGen(null);
    setEditTarget(null);
    setEdited(false);
    setGenMsgIdx(0);
    try {
      const multiSet = deliveryMode === "M1" || deliveryMode === "M4";
      const flavors: (string | null)[] = multiSet && setsCount > 1
        ? SET_LETTERS.slice(0, setsCount)
        : [null];
      const msgTimer = setInterval(() => setGenMsgIdx((i) => i + 1), 2400);
      const sets: GenSet[] = [];
      let totalMs = 0;
      for (const f of flavors) {
        const data = await api<PaperGenResult>("/api/studio/generate/paper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            board: boardCode, grade: gradeName, subject: subjectName, chapters: chapterNames,
            totalMarks, durationMin, difficulty, sections: sections.map((s) => ({ type: s.type, count: s.count, marksEach: s.marksEach })),
            setFlavor: f,
          }),
        }, 75_000);
        totalMs += data.generationMs;
        sets.push({ label: f ?? "A", flavor: f, contentJson: data.contentJson, answerKeyJson: data.answerKeyJson, provenance: data.provenance });
      }
      clearInterval(msgTimer);
      setGen({ sets, activeSet: 0, generationMs: totalMs });
      if (!title) {
        setTitle(`${subjectName} — ${difficulty} paper · ${totalMarks} marks`);
      }
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
      await api("/api/studio/papers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || `${subjectName} paper`,
          board: boardCode, grade: gradeName, subject: subjectName, chapters: chapterNames,
          configJson: {
            totalMarks, durationMin, difficulty,
            sections: sections.map((s) => ({ type: s.type, count: s.count, marksEach: s.marksEach })),
            setsCount, deliveryMode,
            examType: examTypeId, language, year: yearLabel, pathway: pathway || undefined,
            sets: gen.sets.map((s) => ({ label: s.label, flavor: s.flavor, contentJson: s.contentJson, answerKeyJson: s.answerKeyJson })),
          },
          contentJson: gen.sets[0].contentJson,
          answerKeyJson: gen.sets[0].answerKeyJson,
          provenance: edited ? "AI draft + tutor edits" : gen.sets.every((s) => s.provenance === "AI draft") ? "AI draft" : gen.sets[0].provenance,
          headerJson: header,
        }),
      });
      toast({
        title: "Question paper saved to your library",
        description: gen.sets.length > 1
          ? `“${title.trim()}” saved with ${gen.sets.length} sets (A–${gen.sets[gen.sets.length - 1].label}) — allot them to students from the library.`
          : `“${title.trim()}” is ready — preview it, print it, or send it to your students.`,
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

  /* draft PDF download (step 4) — reflects the letterhead + active set live */
  const downloadDraft = async () => {
    if (!gen) return;
    try {
      const s = gen.sets[gen.activeSet] ?? gen.sets[0];
      await pdfQuestionPaper(
        {
          title: title.trim() || `${subjectName} paper`,
          board: selBoard?.name ?? boardCode,
          grade: gradeName,
          subject: subjectName,
          chapters: chapterNames,
          config: { totalMarks, durationMin },
          content: s.contentJson,
          answerKey: s.answerKeyJson,
          provenance: s.provenance,
          header,
          setLabel: gen.sets.length > 1 ? `Set ${s.label}` : undefined,
        },
        { includeAnswers: false }
      );
      toast({
        title: "Question paper PDF downloaded",
        description: gen.sets.length > 1 ? `Set ${s.label} PDF — same blueprint, distinct questions.` : "Branded A4 PDF with your letterhead — ready to print.",
      });
    } catch {
      toast({ title: "Could not build the PDF", variant: "destructive" });
    }
  };

  /* per-question editing (steps 3 + 4) — edits the ACTIVE set only */
  const replaceQuestion = useCallback((si: number, qi: number, q: PaperQuestion) => {
    setGen((prev) => {
      if (!prev) return prev;
      const ai = prev.activeSet;
      const sets = prev.sets.map((s, x) => {
        if (x !== ai) return s;
        const secs = (s.contentJson.sections ?? []).map((sec, y) =>
          y === si ? { ...sec, questions: (sec.questions ?? []).map((old, z) => (z === qi ? q : old)) } : sec
        );
        const content: PaperContent = { ...s.contentJson, sections: secs };
        return { ...s, contentJson: content, answerKeyJson: syncAnswerKey(content) };
      });
      return { ...prev, sets };
    });
    setEdited(true);
  }, []);

  const handleAction = (si: number, qi: number, action: "regen" | "bank" | "edit") => {
    setEditTarget({ si, qi, tab: action === "edit" ? "write" : action });
  };

  const editCtx = useMemo<QuestionEditCtx | null>(() => {
    if (!gen || !editTarget) return null;
    const active = gen.sets[gen.activeSet] ?? gen.sets[0];
    const s = active.contentJson.sections?.[editTarget.si];
    const q = s?.questions?.[editTarget.qi];
    if (!s || !q) return null;
    const exclude = (active.contentJson.sections ?? []).flatMap((sec, x) =>
      (sec.questions ?? []).filter((_, y) => !(x === editTarget.si && y === editTarget.qi)).map((qq) => qq.q)
    );
    return {
      board: boardCode, grade: gradeName, subject: subjectName,
      chapter: q.chapter || chapterNames[0] || subjectName,
      type: s.type, marksEach: s.marksEach,
      difficulty: normalizeDifficulty(q.difficulty, difficulty),
      current: q, exclude,
    };
  }, [gen, editTarget, boardCode, gradeName, subjectName, chapterNames, difficulty]);

  const previewConfig: PaperConfig = {
    totalMarks, durationMin, difficulty,
    sections: sections.map((s) => ({ type: s.type, count: s.count, marksEach: s.marksEach })),
    setsCount, deliveryMode,
    examType: examTypeId, language, year: yearLabel,
  };

  /* preset compliance (Smart Preset Engine meter) */
  const compliance = useMemo(
    () => presetCompliance(
      { totalMarks, durationMin, sections: sections.map((s) => ({ type: s.type, count: s.count, marksEach: s.marksEach })) },
      examTypeById(examTypeId)?.preset ?? { marks: totalMarks, durationMin, sections: [], instructions: "" },
    ),
    [totalMarks, durationMin, sections, examTypeId],
  );

  /* blueprint grid — estimated question spread across the selected chapters by weightage */
  const chapterWeightsExact = (chapters ?? []).every((c) => c.marks > 0);
  const chapterRows = useMemo(() => {
    const sel = (chapters ?? []).filter((c) => chapterNames.includes(c.name));
    const totalW = sel.reduce((a, c) => a + (c.marks || 5), 0) || 1;
    return sel.map((c) => {
      const share = (c.marks || 5) / totalW;
      const qs = Math.max(1, Math.round(totalQuestions * share));
      return { name: c.name, topics: (c.topics ?? []).length, marks: c.marks || 5, qs, estimated: !chapterWeightsExact };
    });
  }, [chapters, chapterNames, totalQuestions, chapterWeightsExact]);

  /* curriculum v2 — country list + filtered board scope */
  const countriesInScope = useMemo(() => {
    const set = new Set<string>();
    for (const b of boards ?? []) {
      if (regionTab !== "All" && b.region !== regionTab) continue;
      if (b.country) set.add(b.country);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [boards, regionTab]);

  const boardsInScope = useMemo(() => {
    const q = registrySearch.trim().toLowerCase();
    return (boards ?? []).filter((b) => {
      if (regionTab !== "All" && b.region !== regionTab) return false;
      if (country && b.country !== country) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.bodies.toLowerCase().includes(q) ||
        b.country.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q)
      );
    });
  }, [boards, regionTab, country, registrySearch]);

  /* how many sets will this generation produce */
  const genSetTotal = deliveryMode === "M1" || deliveryMode === "M4" ? Math.max(1, setsCount) : 1;

  /* Africa tab — group the in-scope profiles into collapsible sub-region
     sections (East / West / Southern / Central / North Africa), countries
     alphabetical inside each section (curriculum spec §3.3). */
  const [collapsedSubs, setCollapsedSubs] = useState<string[]>([]);
  const africaGroups = useMemo(() => {
    if (regionTab !== "Africa") return [];
    return AFRICA_SUBREGION_ORDER.map((sub) => ({
      sub,
      boards: boardsInScope
        .filter((b) => africaSubRegion(b.country) === sub)
        .sort((a, b) => (a.country ?? "").localeCompare(b.country ?? "")),
    })).filter((g) => g.boards.length > 0);
  }, [regionTab, boardsInScope]);
  const toggleSub = (sub: string) =>
    setCollapsedSubs((prev) => (prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub]));

  const profileCardProps = (b: BoardRow) => ({
    board: b,
    selected: boardCode === b.code,
    onSelect: () => {
      if (!b.selectable) {
        toast({
          title: `${b.name} — ${VERIFY_STATE_META[(b.verifyState as "verified" | "partial" | "ingesting" | "coming_soon") ?? "coming_soon"].label.toLowerCase()}`,
          description: b.verifyState === "coming_soon"
            ? "No verified registry yet — request priority and we'll speed up the ingestion pipeline."
            : b.verifyState === "ingesting"
              ? "The official syllabus pipeline is running — selectable as soon as a reviewer signs off."
              : `Only verified subjects are selectable (${b.subjects} of the ${b.name} subjects are verified).`,
        });
        return;
      }
      setBoardCode(b.code);
      setBoardName(b.name);
    },
    onPriority: () =>
      toast({
        title: `Priority requested for ${b.name}`,
        description: "Demand recorded — the ingestion queue re-sorts by teacher demand every week.",
      }),
    onNotify: () =>
      toast({
        title: `We'll notify you about ${b.name}`,
        description: "You'll see it in your notifications the moment this registry is verified.",
      }),
  });

  return (
    <div className="space-y-4">
      {/* builder header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Build a question paper</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Pick the syllabus, balance the blueprint, and let the studio draft board-style questions with a private answer key.
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost" onClick={onDone}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to library
        </button>
      </div>

      <div className="sk-card p-4 sm:p-6 space-y-5">
        <Stepper steps={BUILDER_STEPS} current={step} />

        {/* 1 · curriculum (v2 — region > country > profile > level > year > pathway > subject > strands > language > exam type) */}
        {step === 1 && (
          <div className="space-y-4">
            {prefill && (
              <div className="sk-callout sk-callout-info">
                Prefilled from your lesson plan — adjust the chapters if this paper should cover less or more.
              </div>
            )}
            <div>
              <h3 className="font-bold text-[15px]">Curriculum</h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                Region → country → profile → level &amp; year → subject → {parseTaxonomy(selBoard?.taxonomy).top.toLowerCase()}s → language → exam type. Only verified registries are selectable.
              </p>
            </div>

            {boardsError && (
              <div className="sk-callout sk-callout-danger">
                {boardsError} —{" "}
                <button className="underline font-semibold" onClick={loadBoards}>retry</button>
              </div>
            )}

            {!boards ? (
              <LoadingView label="Loading the curriculum registry…" />
            ) : (
              <>
                {/* header counters + region tabs + search */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[12px] font-semibold text-muted-foreground" data-testid="registry-counters">
                    {counters ? (
                      <>
                        <span className="text-[#156F4C]">{counters.verified} verified</span>
                        {" · "}
                        <span className="text-[#B45309]">{counters.inProgress} in progress</span>
                        {" · "}
                        <span>{counters.planned} planned</span>
                      </>
                    ) : "Loading counters…"}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Curriculum regions">
                  {regionTabCounts.map(({ region, count }) => (
                    <button
                      key={region}
                      role="tab"
                      aria-selected={regionTab === region}
                      className={`sk-chip ${regionTab === region ? "sk-chip-active" : ""}`}
                      onClick={() => setRegionTab(region)}
                    >
                      <Globe className="w-3.5 h-3.5" /> {region}
                      <span className="opacity-70 text-[10.5px] ml-1">{count}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pb-country" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      Country
                    </label>
                    <select
                      id="pb-country"
                      className="sk-input"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      <option value="">All countries</option>
                      {countriesInScope.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pb-search" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      Search board / exam body
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        id="pb-search"
                        className="sk-input !pl-9"
                        placeholder="e.g. KCSE, WASSCE, CBSE, Samacheer"
                        value={registrySearch}
                        onChange={(e) => setRegistrySearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* profile cards — Africa tab groups into collapsible sub-regions */}
                {regionTab === "Africa" ? (
                  <div className="space-y-3">
                    {africaGroups.map(({ sub, boards: groupBoards }) => {
                      const collapsed = collapsedSubs.includes(sub);
                      return (
                        <div key={sub} className="rounded-[14px] border border-border bg-card/60 overflow-hidden">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                            onClick={() => toggleSub(sub)}
                            aria-expanded={!collapsed}
                          >
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                            <span className="text-[12.5px] font-extrabold tracking-wide uppercase text-brand-navy dark:text-white">{sub}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {groupBoards.length} profile{groupBoards.length > 1 ? "s" : ""} · {groupBoards.map((b) => b.country).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                            </span>
                          </button>
                          {!collapsed && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 px-3.5 pb-3.5 pt-0.5 border-t border-dashed border-border">
                              {groupBoards.map((b) => (
                                <ProfileCard key={b.code} {...profileCardProps(b)} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {boardsInScope.map((b) => (
                      <ProfileCard key={b.code} {...profileCardProps(b)} />
                    ))}
                  </div>
                )}
                {boardsInScope.length === 0 && (
                  <EmptyState icon={Globe} title="No profile matches" sub="Clear the search or pick another region / country." />
                )}

                {/* level + year (after a selectable board is picked) */}
                {boardCode && (
                  <div className="sk-card-flat p-4 space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                        Level — {selBoard?.levels || "profile levels"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">Only verified levels are selectable.</span>
                    </div>
                    {!grades ? (
                      <LoadingView label="Loading levels…" />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {grades.map((g) => (
                          <button
                            key={g.id}
                            className={`sk-chip ${gradeName === g.name ? "sk-chip-active" : ""}`}
                            onClick={() => setGradeName(g.name)}
                            aria-pressed={gradeName === g.name}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {gradeName && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label htmlFor="pb-year" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Academic year
                          </label>
                          <select
                            id="pb-year"
                            className="sk-input"
                            value={yearLabel}
                            onChange={(e) => setYearLabel(e.target.value)}
                          >
                            <option value="">Select year…</option>
                            {yearOptions(selBoard?.yearFormat).map((y) => (
                              <option key={y.label} value={y.label} disabled={!y.ingested}>
                                {y.label}{!y.ingested ? " — not ingested" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        {parseJsonArray(selBoard?.pathways).length > 0 && (
                          <div>
                            <label htmlFor="pb-pathway" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                              Pathway / stream
                            </label>
                            <select
                              id="pb-pathway"
                              className="sk-input"
                              value={pathway}
                              onChange={(e) => setPathway(e.target.value)}
                            >
                              <option value="">Select pathway…</option>
                              {parseJsonArray(selBoard?.pathways).map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label htmlFor="pb-language" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Language
                          </label>
                          <select
                            id="pb-language"
                            className="sk-input"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                          >
                            {(parseJsonArray(selBoard?.languages).length ? parseJsonArray(selBoard?.languages) : ["English"]).map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* subjects */}
                {boardCode && gradeName && (
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      {parseTaxonomy(selBoard?.taxonomy).subject}
                    </span>
                    {!subjects ? (
                      <LoadingView label="Loading subjects…" />
                    ) : subjects.length === 0 ? (
                      <EmptyState icon={BookOpen} title="No verified subjects" sub="This profile has no verified subjects for the selected level yet." />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {subjects.map((s) => (
                          <button
                            key={s.id}
                            className={`sk-chip ${subjectName === s.name ? "sk-chip-active" : ""}`}
                            onClick={() => setSubjectName(s.name)}
                            aria-pressed={subjectName === s.name}
                          >
                            <BookOpen className="w-3.5 h-3.5" /> {s.name}
                            <span className="opacity-70 text-[10.5px] ml-1">({s.chapterCount} {parseTaxonomy(selBoard?.taxonomy).top.toLowerCase()}s)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* exam type — Smart Preset Engine */}
                {boardCode && gradeName && subjectName && (
                  <div className="sk-card-flat p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Exam type</span>
                      <span className="sk-pill sk-pill-blue"><Sparkles className="w-3 h-3" /> Smart preset fills the blueprint</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EXAM_TYPES.map((t) => (
                        <button
                          key={t.id}
                          className={`sk-chip ${examTypeId === t.id ? "sk-chip-active" : ""}`}
                          onClick={() => applyExamType(t.id)}
                          aria-pressed={examTypeId === t.id}
                        >
                          {t.label}
                          <span className="opacity-70 text-[10.5px] ml-1">{t.scope === "national" ? "national" : "school"}</span>
                        </button>
                      ))}
                    </div>
                    {examTypeById(examTypeId) && examTypeId !== "custom" && (
                      <p className="text-[11.5px] text-muted-foreground mt-2">
                        {examTypeById(examTypeId)!.label}: {examTypeById(examTypeId)!.preset.marks} marks · {examTypeById(examTypeId)!.preset.durationMin} min ·{" "}
                        {examTypeById(examTypeId)!.preset.sections.map((s) => `${s.count}×${s.type}(${s.marksEach})`).join(" + ")}
                      </p>
                    )}
                  </div>
                )}

                {/* chapters / strands */}
                {boardCode && gradeName && subjectName && (
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      {parseTaxonomy(selBoard?.taxonomy).top}s
                    </span>
                    {!chapters ? (
                      <LoadingView label={`Loading ${parseTaxonomy(selBoard?.taxonomy).top.toLowerCase()}s…`} />
                    ) : chapters.length === 0 ? (
                      <EmptyState icon={BookOpen} title="No chapters found" sub="This subject has no chapters in the registry yet." />
                    ) : (
                      <ChapterList
                        chapters={chapters}
                        selected={chapterNames}
                        onToggle={toggleChapter}
                        onToggleAll={toggleAllChapters}
                        taxonomy={parseTaxonomy(selBoard?.taxonomy)}
                        maxChapters={10}
                        onSelectedTopicsChange={subTopicCb}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 2 · blueprint */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-bold text-[15px]">Blueprint</h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                Balance the sections so they add up to the total marks exactly.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="pb-marks" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                  Total marks
                </label>
                <input
                  id="pb-marks"
                  type="number" min={1} max={200}
                  className="sk-input"
                  value={totalMarks}
                  onChange={(e) => {
                    setTotalMarks(Number(e.target.value) || 0);
                    setGen(null);
                  }}
                />
              </div>
              <div>
                <label htmlFor="pb-duration" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                  Duration (min)
                </label>
                <input
                  id="pb-duration"
                  type="number" min={10} max={240}
                  className="sk-input"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">Difficulty</span>
                <div className="sk-segment" role="group" aria-label="Difficulty">
                  {["Easy", "Medium", "Hard"].map((d) => (
                    <button
                      key={d}
                      className={`sk-segment-item ${difficulty === d ? "sk-segment-item-active" : ""}`}
                      onClick={() => {
                        setDifficulty(d);
                        setGen(null);
                      }}
                      aria-pressed={difficulty === d}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Sections</span>
              <div className="space-y-2">
                {sections.map((s, i) => (
                  <div key={i} className="sk-well p-3 flex items-center gap-2 flex-wrap">
                    <span className="sk-pill sk-pill-navy shrink-0">{LETTERS[i]}</span>
                    <select
                      className="sk-input !w-auto !py-1.5 text-[12.5px]"
                      value={s.type}
                      onChange={(e) => patchSection(i, { type: e.target.value as QType })}
                      aria-label={`Section ${LETTERS[i]} type`}
                    >
                      <option value="MCQ">Multiple choice</option>
                      <option value="SA">Short answer</option>
                      <option value="LA">Long answer</option>
                    </select>
                    <input
                      type="number" min={1} max={30}
                      className="sk-input !w-[74px] !py-1.5 text-[12.5px] tabular"
                      value={s.count}
                      onChange={(e) => patchSection(i, { count: Number(e.target.value) || 0 })}
                      aria-label={`Section ${LETTERS[i]} number of questions`}
                    />
                    <span className="text-[12px] text-muted-foreground">×</span>
                    <input
                      type="number" min={1} max={10}
                      className="sk-input !w-[74px] !py-1.5 text-[12.5px] tabular"
                      value={s.marksEach}
                      onChange={(e) => patchSection(i, { marksEach: Number(e.target.value) || 0 })}
                      aria-label={`Section ${LETTERS[i]} marks per question`}
                    />
                    <span className="text-[12px] font-semibold tabular">
                      {s.count} × {s.marksEach} = {(Number(s.count) || 0) * (Number(s.marksEach) || 0)} marks · {TYPE_LABEL[s.type]}
                    </span>
                    <button
                      className="ml-auto p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 shrink-0"
                      onClick={() => {
                        setSections((prev) => prev.filter((_, x) => x !== i));
                        setGen(null);
                      }}
                      disabled={sections.length <= 1}
                      aria-label={`Remove section ${LETTERS[i]}`}
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="sk-btn sk-btn-ghost sk-btn-sm mt-2"
                onClick={() => {
                  setSections((prev) => [...prev, { type: "SA", count: 2, marksEach: 2 }]);
                  setGen(null);
                }}
                disabled={sections.length >= 4}
              >
                <Plus className="w-3.5 h-3.5" /> Add section
              </button>
            </div>

            {/* live marks meter */}
            <div className="sk-card-flat p-4">
              <div className="flex justify-between text-[12px] font-semibold mb-2">
                <span>Blueprint marks</span>
                <span className="tabular">{computedMarks} / {totalMarks} marks · {totalQuestions} questions</span>
              </div>
              <div className="sk-progress-track">
                <div
                  className={`sk-progress-fill ${
                    marksBalanced ? "sk-progress-fill-green" : computedMarks > totalMarks ? "sk-progress-fill-orange" : ""
                  }`}
                  style={{ width: `${Math.min(100, totalMarks > 0 ? (computedMarks / totalMarks) * 100 : 0)}%` }}
                />
              </div>
              {marksBalanced ? (
                <div className="mt-2.5 flex items-center gap-1.5 text-[12px] font-bold text-[#156F4C]">
                  <CheckCircle2 className="w-4 h-4" />
                  Blueprint balances perfectly — {totalMarks} marks across {totalQuestions} question{totalQuestions === 1 ? "" : "s"}.
                </div>
              ) : (
                <div className="mt-2.5 text-[12px] text-muted-foreground">
                  {totalMarks <= 0
                    ? "Set a total for the paper."
                    : computedMarks > totalMarks
                      ? `Over by ${computedMarks - totalMarks} marks — reduce counts or marks per question.`
                      : `${totalMarks - computedMarks} marks left to allocate.`}
                </div>
              )}
            </div>

            {/* preset compliance meter */}
            {examTypeById(examTypeId) && examTypeId !== "custom" && (
              <div className="sk-card-flat p-4">
                <div className="flex justify-between text-[12px] font-semibold mb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#315BE5]" /> {examTypeById(examTypeId)!.label} preset compliance
                  </span>
                  <span className="tabular">{compliance.score}%</span>
                </div>
                <div className="sk-progress-track">
                  <div
                    className={`sk-progress-fill ${compliance.score >= 100 ? "sk-progress-fill-green" : compliance.score >= 70 ? "sk-progress-fill-orange" : ""}`}
                    style={{ width: `${compliance.score}%` }}
                  />
                </div>
                <div className="mt-2.5 text-[12px]">
                  {compliance.score >= 100 ? (
                    <span className="flex items-center gap-1.5 font-bold text-[#156F4C]">
                      <CheckCircle2 className="w-4 h-4" /> Matches the verified {examTypeById(examTypeId)!.label} pattern exactly.
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {compliance.diffs.length > 0 ? `Differs from preset: ${compliance.diffs.join(" · ")}.` : ""}{" "}
                      <button
                        className="underline font-semibold text-brand-navy"
                        onClick={() => applyExamType(examTypeId)}
                      >
                        Apply preset
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* blueprint grid — marks distribution across the selected chapters */}
            <div className="sk-card-flat p-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">
                Blueprint grid — weightage by {parseTaxonomy(selBoard?.taxonomy).top.toLowerCase()}
              </div>
              <div className="overflow-x-auto sk-scroll">
                <table className="w-full text-[11.5px] min-w-[520px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-1.5 pr-3 font-semibold">{parseTaxonomy(selBoard?.taxonomy).top}</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">{parseTaxonomy(selBoard?.taxonomy).mid}s</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">Weightage</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">Qs (est.)</th>
                      <th className="py-1.5 font-semibold text-right">Marks (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapterRows.map((r) => (
                      <tr key={r.name} className="border-b border-dashed border-border/60 last:border-0">
                        <td className="py-1.5 pr-3 font-semibold max-w-[220px] truncate" title={r.name}>{r.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{r.topics}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{r.marks}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{r.qs}</td>
                        <td className="py-1.5 text-right tabular">{r.estimated ? `~${r.marks}` : String(r.marks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10.5px] text-muted-foreground mt-2">
                Question spread is estimated from chapter weightage{" "}
                {chapterWeightsExact ? "(official weightage available)" : "— no official weightage published, estimated by periods"}.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">
                  Sets (anti-cheating variants)
                </span>
                <div className="flex items-center gap-3">
                  <button
                    className="sk-btn sk-btn-ghost !px-3"
                    onClick={() => setSetsCount((p) => Math.max(1, p - 1))}
                    disabled={setsCount <= 1 || (deliveryMode !== "M1" && deliveryMode !== "M4")}
                    aria-label="Fewer sets"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="sk-well px-5 py-2 text-center min-w-[86px]">
                    <span className="text-[17px] font-bold tabular">{setsCount}</span>
                    <span className="text-[11px] text-muted-foreground ml-1.5">set{setsCount > 1 ? "s" : ""}</span>
                  </div>
                  <button
                    className="sk-btn sk-btn-ghost !px-3"
                    onClick={() => setSetsCount((p) => Math.min(4, p + 1))}
                    disabled={setsCount >= 4 || (deliveryMode !== "M1" && deliveryMode !== "M4")}
                    aria-label="More sets"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {setsCount > 1 && (deliveryMode === "M1" || deliveryMode === "M4") && (
                    <span className="text-[11px] text-muted-foreground">
                      {SET_LETTERS.slice(0, setsCount).map((l) => `${l}·${SET_FLAVORS[l].split(" ")[0]}`).join(" / ")}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2 block">Delivery mode</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {DELIVERY_MODES.map((m) => (
                    <button
                      key={m.id}
                      className={`sk-segment-item !text-[11px] ${deliveryMode === m.id ? "sk-segment-item-active" : ""}`}
                      onClick={() => {
                        setDeliveryMode(m.id);
                        if (m.id === "M2" || m.id === "M3") setSetsCount(1);
                      }}
                      aria-pressed={deliveryMode === m.id}
                      title={m.hint}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10.5px] text-muted-foreground mt-1.5 leading-snug">
                  {DELIVERY_MODES.find((m) => m.id === deliveryMode)?.hint}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3 · generate */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-[15px]">Review &amp; generate</h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                Questions are written only from the selected chapters, with a private step-wise marking scheme.
              </p>
            </div>

            <dl className="sk-well p-4 text-[12.5px] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Board</dt><dd className="font-semibold">{selBoard?.name ?? boardCode}{yearLabel ? ` · ${yearLabel}` : ""}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Level</dt><dd className="font-semibold">{gradeName}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Subject</dt><dd className="font-semibold">{subjectName} · {language}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Paper</dt><dd className="font-semibold tabular">{totalMarks} marks · {durationMin} min · {difficulty}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Blueprint</dt><dd className="font-semibold">{sections.map((s) => `${s.count}×${s.type}(${s.marksEach})`).join(" + ")}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-muted-foreground">Delivery</dt><dd className="font-semibold">{deliveryMode === "M1" || deliveryMode === "M4" ? `${setsCount} set${setsCount > 1 ? "s" : ""}` : "single paper"} · {deliveryMode}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Chapters</dt><dd className="font-semibold leading-relaxed">{chapterNames.join(" · ")}{subTopicCount > 0 ? ` — ${subTopicCount} sub-topics` : ""}</dd></div>
            </dl>

            {generating ? (
              <div className="space-y-2">
                <ProgressCycle labels={PAPER_GEN_MESSAGES} />
                {genSetTotal > 1 && (
                  <p className="text-[12px] text-muted-foreground text-center">
                    Building {genSetTotal} sets — {PAPER_GEN_MESSAGES[genMsgIdx % PAPER_GEN_MESSAGES.length].toLowerCase()}
                  </p>
                )}
              </div>
            ) : gen ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ProvenancePill provenance={edited ? "AI draft + tutor edits" : gen.sets[gen.activeSet]?.provenance ?? "AI draft"} />
                    <span className="sk-pill sk-pill-grey"><Clock className="w-3 h-3" /> {(gen.generationMs / 1000).toFixed(1)}s</span>
                    {gen.sets.length > 1 && (
                      <span className="sk-pill sk-pill-blue"><Layers className="w-3 h-3" /> {gen.sets.length} sets, same blueprint</span>
                    )}
                    {(deliveryMode === "M3" || deliveryMode === "M4") && (
                      <span className="sk-pill sk-pill-blue"><Shuffle className="w-3 h-3" /> shuffled per student</span>
                    )}
                    <span className="text-[12px] text-muted-foreground">Draft ready — final look on the next step.</span>
                  </div>
                  <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={generate} disabled={generating}>
                    <RefreshCw className="w-3.5 h-3.5" /> {gen.sets.length > 1 ? "Regenerate all sets" : "Regenerate"}
                  </button>
                </div>
                <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 -mt-1">
                  <Pencil className="w-3.5 h-3.5 shrink-0" />
                  Not happy with a question? Regenerate it, pick from the bank, or write your own — only that question changes.
                </p>
                {gen.sets.length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {gen.sets.map((s, i) => (
                      <button
                        key={s.label}
                        className={`sk-chip ${gen.activeSet === i ? "sk-chip-active" : ""}`}
                        onClick={() => setGen((p) => (p ? { ...p, activeSet: i } : p))}
                        aria-pressed={gen.activeSet === i}
                      >
                        Set {s.label} · {SET_FLAVORS[s.label] ?? "variant"}
                      </button>
                    ))}
                  </div>
                )}
                <div className="sk-card p-4 max-h-[420px] overflow-y-auto sk-scroll">
                  <PaperDoc
                    title=""
                    board={selBoard?.name ?? boardCode}
                    grade={gradeName}
                    subject={subjectName}
                    config={previewConfig}
                    content={gen.sets[gen.activeSet]?.contentJson ?? gen.sets[0].contentJson}
                    header={header}
                    onAction={handleAction}
                    actionBusy={actionBusy}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <button className="sk-btn sk-btn-orange sk-btn-lg" onClick={generate}>
                  <Sparkles className="w-4 h-4" /> {setsCount > 1 && (deliveryMode === "M1" || deliveryMode === "M4") ? `Generate ${setsCount} sets with AI` : "Generate with AI"}
                </button>
                <p className="text-[11.5px] text-muted-foreground max-w-sm text-center">
                  If the AI is busy, a deterministic question bank builds the paper from chapter templates — always labelled honestly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 4 · preview & save */}
        {step === 4 && gen && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-[15px]">Name it &amp; save</h3>
              {edited && <ProvenancePill provenance="AI draft + tutor edits" />}
            </div>
            <p className="text-[12.5px] text-muted-foreground -mt-2.5">
              Saved as a draft — the answer key stays private to your account.
            </p>

            {/* paper details & letterhead */}
            <div className="sk-card p-4 sm:p-5 space-y-4">
              <div>
                <h4 className="font-bold text-[14px] flex items-center gap-1.5">
                  <LayoutTemplate className="w-4 h-4 text-brand-navy" /> Paper details &amp; letterhead
                </h4>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Choose how the printed paper looks — your institute, exam title and logo appear on screen and in the PDF.
                </p>
              </div>
              <LetterheadEditor header={header} onChange={setHeader} paperTitle={title} />
            </div>

            <div>
              <label htmlFor="paper-title" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Paper title
              </label>
              <input
                id="paper-title"
                className="sk-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Half-Yearly Mathematics — Class 8 CBSE"
                maxLength={120}
              />
            </div>
            <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 -mt-2.5">
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              Still editable — tweak any question below; the answer key follows automatically.
            </p>
            {gen.sets.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {gen.sets.map((s, i) => (
                  <button
                    key={s.label}
                    className={`sk-chip ${gen.activeSet === i ? "sk-chip-active" : ""}`}
                    onClick={() => setGen((p) => (p ? { ...p, activeSet: i } : p))}
                    aria-pressed={gen.activeSet === i}
                  >
                    Set {s.label} · {SET_FLAVORS[s.label] ?? "variant"}
                  </button>
                ))}
                <span className="text-[11px] text-muted-foreground">Editing applies to the active set.</span>
              </div>
            )}
            <div className="sk-card p-4 max-h-[480px] overflow-y-auto sk-scroll">
              <PaperDoc
                title={title}
                board={selBoard?.name ?? boardCode}
                grade={gradeName}
                subject={subjectName}
                config={previewConfig}
                content={gen.sets[gen.activeSet]?.contentJson ?? gen.sets[0].contentJson}
                header={header}
                onAction={handleAction}
                actionBusy={actionBusy}
              />
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
            {step === 1 && chapterNames.length === 0 && (
              <span className="text-[11.5px] text-muted-foreground hidden sm:block">Select at least one chapter to continue</span>
            )}
            {step === 2 && !marksBalanced && (
              <span className="text-[11.5px] text-muted-foreground hidden sm:block">Balance the marks to continue</span>
            )}
            {step === 4 && gen ? (
              <>
                <button className="sk-btn sk-btn-ghost" onClick={downloadDraft} disabled={saving || !gen}>
                  <Printer className="w-3.5 h-3.5" /> Download PDF
                </button>
                <button className="sk-btn sk-btn-primary" onClick={save} disabled={saving || !title.trim()}>
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save to Library
                </button>
              </>
            ) : (
              <button
                className="sk-btn sk-btn-primary"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                disabled={!canNext}
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* per-question edit dialog (steps 3 + 4) */}
      <QuestionEditDialog
        open={!!editCtx}
        onOpenChange={(o) => {
          if (!o) {
            setEditTarget(null);
            setActionBusy(null);
          }
        }}
        initialTab={editTarget?.tab ?? "regen"}
        ctx={editCtx}
        onReplace={(q) => editTarget && replaceQuestion(editTarget.si, editTarget.qi, q)}
        onBusyChange={(b) => setActionBusy(b && editTarget ? `${editTarget.si}:${editTarget.qi}` : null)}
      />
    </div>
  );
}

/* ============================================================
 * Main view — library + builder
 * ============================================================ */
export function TPapers() {
  const setView = useAppStore((s) => s.setView);

  /* consume context.fromPlan (set by the lesson-plan Convert action) once */
  const prefillRef = useRef<Prefill | null>(null);
  if (prefillRef.current === null) {
    const fp = useAppStore.getState().context.fromPlan as Partial<Prefill> | undefined;
    prefillRef.current =
      fp && typeof fp.board === "string" && typeof fp.grade === "string" && typeof fp.subject === "string"
        ? { board: fp.board, grade: fp.grade, subject: fp.subject, chapters: Array.isArray(fp.chapters) ? fp.chapters : [] }
        : null;
  }
  const [mode, setMode] = useState<"library" | "builder">(prefillRef.current ? "builder" : "library");

  useEffect(() => {
    if (prefillRef.current) setView("t-papers", { fromPlan: undefined });
  }, [setView]);

  /* library */
  const [papers, setPapers] = useState<PaperRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const loadPapers = useCallback(async () => {
    setListError(null);
    try {
      setPapers(await api<PaperRow[]>("/api/studio/papers"));
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load your question papers.");
      setPapers([]);
    }
  }, []);
  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  /* students for sharing */
  const [students, setStudents] = useState<StudioStudent[] | null>(null);
  useEffect(() => {
    api<StudioStudent[]>("/api/studio/students")
      .then(setStudents)
      .catch(() => setStudents([]));
  }, []);

  /* preview */
  const [preview, setPreview] = useState<PaperRow | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSet, setPreviewSet] = useState(0); // active set tab in the preview dialog

  /* preview editing (local editable copy, saved via PATCH) */
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState<PaperContent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editHeader, setEditHeader] = useState<PaperHeader>(() => normalizeHeader(null));
  const [editTarget, setEditTarget] = useState<{ si: number; qi: number; tab: EditTab } | null>(null);
  /* which SET of a multi-set paper (M1/M4) the editing session targets — edits
     are written back into configJson.sets[editSetIdx], not just the top-level copy */
  const [editSetIdx, setEditSetIdx] = useState(0);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  /* set allotment (M1/M4 + M3 shuffle) */
  const [allotStrategy, setAllotStrategy] = useState("seating");
  const [allotSeed, setAllotSeed] = useState(2026);
  const [allotBusy, setAllotBusy] = useState(false);
  const [allotMap, setAllotMap] = useState<Record<string, number> | null>(null);

  const previewSets: SavedSet[] = useMemo(() => {
    const sets = preview?.configJson?.sets;
    if (sets?.length) return sets;
    return preview ? [{ label: "A", flavor: null, contentJson: preview.contentJson, answerKeyJson: preview.answerKeyJson }] : [];
  }, [preview]);
  const previewSetCount = previewSets.length;
  const activePreviewSet = previewSets[Math.min(previewSet, previewSetCount - 1)] ?? previewSets[0];
  const deliveryOf = (preview?.configJson?.deliveryMode ?? "M1") as "M1" | "M2" | "M3" | "M4";
  const isShuffle = deliveryOf === "M3" || deliveryOf === "M4";

  const editKey = useMemo(() => (editContent ? syncAnswerKey(editContent) : null), [editContent]);

  /* reset the editing session whenever the dialog closes */
  useEffect(() => {
    if (previewOpen) return;
    setEditing(false);
    setEditContent(null);
    setEditTarget(null);
    setActionBusy(null);
    setDetailsOpen(false);
    setPreviewSet(0);
    setAllotMap(null);
  }, [previewOpen]);

  /* seed the allotment editor from the saved allotment when the dialog opens */
  useEffect(() => {
    if (!preview || !previewOpen) return;
    const saved = preview.allotmentJson;
    if (saved?.strategy) setAllotStrategy(saved.strategy);
    if (typeof saved?.seed === "number") setAllotSeed(saved.seed);
    if (saved?.map && Object.keys(saved.map).length) setAllotMap(saved.map);
  }, [preview, previewOpen]);

  const startEditing = () => {
    if (!preview) return;
    // clone the ACTIVE set's content — multi-set papers keep each set in configJson.sets
    setEditContent(cloneContent(activePreviewSet.contentJson ?? preview.contentJson));
    setEditTitle(preview.title);
    setEditHeader(normalizeHeader(preview.headerJson));
    setEditSetIdx(Math.min(previewSet, Math.max(previewSetCount - 1, 0)));
    setEditTarget(null);
    setActionBusy(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditContent(null);
    setEditTarget(null);
    setActionBusy(null);
    setDetailsOpen(false);
  };

  const saveEdits = async () => {
    if (!preview || !editContent) return;
    setSaveBusy(true);
    try {
      const newKey = syncAnswerKey(editContent);
      const savedSets = preview.configJson?.sets;
      /* multi-set storage: write the edited set back into configJson.sets and keep
         the top-level mirror in sync when set 0 (or the only set) was edited */
      const isSetStorage = !!savedSets?.length;
      const mirrorTop = !isSetStorage || editSetIdx === 0;
      await api(`/api/studio/papers/${preview.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || preview.title,
          ...(isSetStorage
            ? {
                configJson: {
                  ...preview.configJson,
                  sets: savedSets!.map((s, i) =>
                    i === editSetIdx ? { ...s, contentJson: editContent, answerKeyJson: newKey } : s
                  ),
                },
              }
            : {}),
          ...(mirrorTop ? { contentJson: editContent, answerKeyJson: newKey } : {}),
          headerJson: editHeader,
        }),
      }, 30_000);
      toast({
        title: "Paper updated",
        description: previewSetCount > 1
          ? `Set ${previewSets[editSetIdx]?.label ?? "?"} saved — the answer key was rebuilt to match.`
          : "Your changes were saved — the answer key was rebuilt to match.",
      });
      const rows = await api<PaperRow[]>("/api/studio/papers");
      setPapers(rows);
      setPreview(rows.find((p) => p.id === preview.id) ?? null);
      setEditing(false);
      setEditContent(null);
      setEditTarget(null);
    } catch (e) {
      toast({
        title: "Could not save changes",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  /* per-question editing inside the preview */
  const replacePreviewQuestion = useCallback((si: number, qi: number, q: PaperQuestion) => {
    setEditContent((prev) => {
      if (!prev) return prev;
      const secs = (prev.sections ?? []).map((s, x) =>
        x === si ? { ...s, questions: (s.questions ?? []).map((old, y) => (y === qi ? q : old)) } : s
      );
      return { ...prev, sections: secs };
    });
  }, []);

  const handlePreviewAction = (si: number, qi: number, action: "regen" | "bank" | "edit") => {
    setEditTarget({ si, qi, tab: action === "edit" ? "write" : action });
  };

  const previewEditCtx = useMemo<QuestionEditCtx | null>(() => {
    if (!preview || !editContent || !editTarget) return null;
    const s = editContent.sections?.[editTarget.si];
    const q = s?.questions?.[editTarget.qi];
    if (!s || !q) return null;
    const exclude = (editContent.sections ?? []).flatMap((sec, x) =>
      (sec.questions ?? []).filter((_, y) => !(x === editTarget.si && y === editTarget.qi)).map((qq) => qq.q)
    );
    return {
      board: preview.board, grade: preview.grade, subject: preview.subject,
      chapter: q.chapter || preview.chapters[0] || preview.subject,
      type: s.type, marksEach: s.marksEach,
      difficulty: normalizeDifficulty(q.difficulty, preview.configJson?.difficulty),
      current: q, exclude,
    };
  }, [preview, editContent, editTarget]);

  /* share */
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const sharePaper = async (studentIds: string[]) => {
    if (!preview) return;
    setShareBusy(true);
    try {
      await api(`/api/studio/papers/${preview.id}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentIds }),
      });
      toast({
        title: `Paper shared with ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`,
        description: `“${preview.title}” was sent in-app — the answer key stays private to you.`,
      });
      setShareOpen(false);
      const rows = await api<PaperRow[]>("/api/studio/papers");
      setPreview(rows.find((p) => p.id === preview.id) ?? null);
      loadPapers();
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

  /* branded PDF download — paper / answer key (header + edits + active set aware) */
  const pdfBusy = useRef(false);
  const downloadPdf = async (includeAnswers: boolean) => {
    if (!preview || pdfBusy.current) return;
    const useEdit = editing && !!editContent;
    const activeSet = activePreviewSet;
    pdfBusy.current = true;
    try {
      const setBase = useEdit && editContent
        ? { contentJson: editContent, answerKeyJson: editKey ?? syncAnswerKey(editContent) }
        : { contentJson: activeSet.contentJson, answerKeyJson: activeSet.answerKeyJson };
      await pdfQuestionPaper(
        {
          title: useEdit ? (editTitle.trim() || preview.title) : preview.title,
          board: preview.board,
          grade: preview.grade,
          subject: preview.subject,
          chapters: preview.chapters,
          config: preview.configJson ?? { totalMarks: 0, durationMin: 0 },
          content: setBase.contentJson,
          answerKey: setBase.answerKeyJson,
          provenance: preview.provenance,
          createdAt: preview.createdAt,
          header: useEdit ? editHeader : normalizeHeader(preview.headerJson),
          kind: (preview.kind as "paper") ?? "paper",
          setLabel: previewSetCount > 1 ? `Set ${activeSet.label}` : undefined,
        },
        { includeAnswers }
      );
      toast({
        title: includeAnswers ? "Answer key PDF downloaded" : "Question paper PDF downloaded",
        description: previewSetCount > 1 ? `Set ${activeSet.label} — same blueprint, distinct questions.` : "Branded A4 PDF with your letterhead — ready to print.",
      });
    } catch {
      toast({ title: "Could not build the PDF", variant: "destructive" });
    } finally {
      pdfBusy.current = false;
    }
  };

  /* per-student shuffled copy (M3/M4) — reproducible from (paper, student, seed) */
  const downloadStudentCopy = async (student: StudioStudent) => {
    if (!preview || pdfBusy.current) return;
    pdfBusy.current = true;
    try {
      const setIdx = allotMap?.[student.id] ?? previewSet;
      const base = previewSets[Math.min(setIdx, previewSetCount - 1)] ?? previewSets[0];
      const seed = preview.allotmentJson?.seed ?? allotSeed;
      const shuffled: PaperContent = {
        ...base.contentJson,
        sections: (base.contentJson.sections ?? []).map((s) => ({
          ...s,
          questions: shuffledForStudent(s.questions ?? [], preview.id, student.id, hashSeed(String(seed))),
        })),
      };
      await pdfQuestionPaper(
        {
          title: preview.title,
          board: preview.board,
          grade: preview.grade,
          subject: preview.subject,
          chapters: preview.chapters,
          config: preview.configJson ?? { totalMarks: 0, durationMin: 0 },
          content: shuffled,
          header: normalizeHeader(preview.headerJson),
          kind: (preview.kind as "paper") ?? "paper",
          setLabel: previewSetCount > 1 ? `Set ${base.label}` : undefined,
          studentName: student.name,
        },
        { includeAnswers: false }
      );
      toast({
        title: `${student.name}'s copy downloaded`,
        description: `Unique order for this student — reproducible from (paper, student, seed ${seed}).`,
      });
    } catch {
      toast({ title: "Could not build the student copy", variant: "destructive" });
    } finally {
      pdfBusy.current = false;
    }
  };

  /* allotment engine — assign sets, then persist via PATCH allotmentJson */
  const runAllotment = async () => {
    if (!preview || !students?.length) return;
    setAllotBusy(true);
    try {
      const ids = students.map((s) => s.id);
      const map = allotSets(allotStrategy, ids, previewSetCount, allotSeed);
      setAllotMap(map);
      await api(`/api/studio/papers/${preview.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          allotmentJson: { strategy: allotStrategy, seed: allotSeed, mode: deliveryOf, map, savedAt: new Date().toISOString() },
        }),
      });
      toast({
        title: `Sets allotted to ${ids.length} student${ids.length === 1 ? "" : "s"}`,
        description: `${ALLOTMENT_STRATEGIES.find((s) => s.id === allotStrategy)?.label} · seed ${allotSeed} — saved with the paper for audit.`,
      });
      loadPapers();
    } catch (e) {
      toast({
        title: "Could not save the allotment",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAllotBusy(false);
    }
  };

  const sharedCount = useMemo(() => preview?.sharedWith?.length ?? 0, [preview]);

  /* ------- render ------- */
  if (mode === "builder") {
    return (
      <PaperBuilder
        prefill={prefillRef.current}
        onDone={() => {
          setMode("library");
          loadPapers();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Question Paper Studio</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {papers
              ? `${papers.length} paper${papers.length === 1 ? "" : "s"} in your library · board-style sets with private answer keys`
              : "Loading your library…"}
          </p>
        </div>
        <button className="sk-btn sk-btn-orange" onClick={() => setMode("builder")}>
          <FileQuestion className="w-4 h-4" /> New paper
        </button>
      </div>

      {listError && (
        <div className="sk-callout sk-callout-danger">
          {listError} —{" "}
          <button className="underline font-semibold" onClick={loadPapers}>retry</button>
        </div>
      )}

      {!papers ? (
        <LoadingView label="Loading your question papers…" />
      ) : papers.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={FileStack}
            title="No question papers yet"
            sub="Build a blueprint-balanced paper from verified chapters — the answer key stays private to you."
            action={
              <button className="sk-btn sk-btn-orange" onClick={() => setMode("builder")}>
                <FileQuestion className="w-4 h-4" /> New paper
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {papers.map((p) => {
            const cfg = p.configJson ?? { totalMarks: 0, durationMin: 0, sections: [] };
            return (
              <article
                key={p.id}
                className="sk-card p-5 space-y-3.5 flex flex-col cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(20,36,107,0.12)]"
                onClick={() => {
                  setPreview(p);
                  setPreviewOpen(true);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setPreview(p);
                    setPreviewOpen(true);
                  }
                }}
                aria-label={`Open question paper ${p.title}`}
              >
                <div>
                  <h3 className="font-bold text-[14px] leading-snug line-clamp-2">{p.title}</h3>
                  <div className="text-[11.5px] text-muted-foreground mt-1">
                    {p.chapters.slice(0, 2).join(", ")}
                    {p.chapters.length > 2 ? ` +${p.chapters.length - 2} more` : p.chapters.length === 0 ? "No chapters" : ""}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="sk-pill sk-pill-navy">{p.board}</span>
                  <span className="sk-pill sk-pill-grey">{p.grade}</span>
                  <span className="sk-pill sk-pill-grey">{p.subject}</span>
                  {p.kind && p.kind !== "paper" && (
                    <span className="sk-pill sk-pill-orange">
                      {p.kind === "worksheet" ? "Worksheet" : p.kind === "assessment" ? "Assessment" : p.kind === "homework" ? "Homework" : p.kind === "ppt" ? "Slide outline" : p.kind}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="sk-pill sk-pill-blue tabular">{cfg.totalMarks} marks</span>
                  <span className="sk-pill sk-pill-grey tabular">
                    <Clock className="w-3 h-3" /> {cfg.durationMin} min
                  </span>
                  {cfg.difficulty && <DifficultyPill difficulty={cfg.difficulty} />}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <StudioStatusPill status={p.status} />
                  <ProvenancePill provenance={p.provenance} />
                  <span className="sk-pill sk-pill-grey">
                    <Layers className="w-3 h-3" /> {cfg.setsCount ?? 1} set{(cfg.setsCount ?? 1) > 1 ? "s" : ""} · {cfg.deliveryMode ?? "M1"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11.5px] text-muted-foreground mt-auto pt-1 border-t border-dashed border-border">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> {(p.sharedWith ?? []).length} shared
                  </span>
                  <span>{fromNow(p.createdAt)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* -------- preview dialog -------- */}
      <Dialog open={previewOpen && !!preview} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {preview ? (
            <>
              <div className="p-5 pb-4 border-b border-border shrink-0">
                <DialogHeader className="text-left space-y-2">
                  <DialogTitle className="text-[17px] leading-snug pr-8">
                    {editing ? (editTitle.trim() || preview.title) : preview.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">Question paper preview with answer key</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <span className="sk-pill sk-pill-navy">{preview.board}</span>
                  <span className="sk-pill sk-pill-grey">{preview.grade}</span>
                  <span className="sk-pill sk-pill-grey">{preview.subject}</span>
                  <span className="sk-pill sk-pill-blue tabular">{preview.configJson?.totalMarks} marks</span>
                  <span className="sk-pill sk-pill-grey tabular">
                    <Clock className="w-3 h-3" /> {preview.configJson?.durationMin} min
                  </span>
                  <StudioStatusPill status={preview.status} />
                  <ProvenancePill provenance={preview.provenance} />
                  <span className="sk-pill sk-pill-grey">
                    <Layers className="w-3 h-3" /> {preview.configJson?.setsCount ?? 1} set{(preview.configJson?.setsCount ?? 1) > 1 ? "s" : ""} · {preview.configJson?.deliveryMode ?? "M1"}
                  </span>
                  {sharedCount > 0 && (
                    <span className="sk-pill sk-pill-green">
                      <Users className="w-3 h-3" /> {sharedCount} student{sharedCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {editing && <span className="sk-pill sk-pill-orange">Unsaved changes</span>}
                </div>
              </div>

              <Tabs defaultValue="paper" className="flex-1 min-h-0 flex flex-col gap-0">
                <TabsList className="mx-5 mt-3 shrink-0 self-start">
                  <TabsTrigger value="paper">Paper</TabsTrigger>
                  <TabsTrigger value="key">
                    <Lock className="w-3.5 h-3.5" /> Answer key
                  </TabsTrigger>
                  {(previewSetCount > 1 || isShuffle) && (
                    <TabsTrigger value="allot">
                      <Users className="w-3.5 h-3.5" /> Allot sets
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="paper" className="flex-1 min-h-0 overflow-y-auto sk-scroll p-5 pt-4 mt-0">
                  {previewSetCount > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {previewSets.map((s, i) => (
                        <button
                          key={s.label}
                          className={`sk-chip ${previewSet === i ? "sk-chip-active" : ""}`}
                          onClick={() => {
                            // edits target one set at a time — don't switch underneath them
                            if (editing && i !== previewSet) {
                              toast({
                                title: `You're editing Set ${previewSets[editSetIdx]?.label ?? "?"}`,
                                description: "Save or cancel your changes before switching to another set.",
                              });
                              return;
                            }
                            setPreviewSet(i);
                          }}
                          aria-pressed={previewSet === i}
                        >
                          Set {s.label} · {SET_FLAVORS[s.label] ?? "variant"}
                          {editing && editSetIdx === i && " ✎"}
                        </button>
                      ))}
                    </div>
                  )}
                  <PaperDoc
                    title={editing ? editTitle : ""}
                    board={preview.board}
                    grade={preview.grade}
                    subject={preview.subject}
                    config={preview.configJson ?? { totalMarks: 0, durationMin: 0, sections: [] }}
                    content={editing && editContent ? editContent : (activePreviewSet.contentJson ?? { instructions: "", sections: [] })}
                    header={editing ? editHeader : normalizeHeader(preview.headerJson)}
                    onAction={editing ? handlePreviewAction : undefined}
                    actionBusy={editing ? actionBusy : null}
                  />
                </TabsContent>
                <TabsContent value="key" className="flex-1 min-h-0 overflow-y-auto sk-scroll p-5 pt-4 mt-0">
                  <AnswerKeyDoc
                    paper={
                      editing && editContent
                        ? { ...preview, contentJson: editContent, answerKeyJson: editKey ?? syncAnswerKey(editContent) }
                        : { ...preview, contentJson: activePreviewSet.contentJson, answerKeyJson: activePreviewSet.answerKeyJson }
                    }
                  />
                </TabsContent>
                {(previewSetCount > 1 || isShuffle) && (
                  <TabsContent value="allot" className="flex-1 min-h-0 overflow-y-auto sk-scroll p-5 pt-4 mt-0">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-[14px] flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-brand-navy" /> Allot sets to students
                        </h4>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {previewSetCount > 1
                            ? `${previewSetCount} sets (A–${previewSets[previewSetCount - 1].label}), same blueprint, distinct questions. Adjacent students never share a set with the seating-aware rule.`
                            : "Single paper, shuffled per student — every copy is reproducible from (paper, student, seed)."}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="allot-strategy" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Strategy
                          </label>
                          <select
                            id="allot-strategy"
                            className="sk-input"
                            value={allotStrategy}
                            onChange={(e) => setAllotStrategy(e.target.value)}
                          >
                            {ALLOTMENT_STRATEGIES.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                          <p className="text-[10.5px] text-muted-foreground mt-1">
                            {ALLOTMENT_STRATEGIES.find((s) => s.id === allotStrategy)?.hint}
                          </p>
                        </div>
                        <div>
                          <label htmlFor="allot-seed" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Seed (audit / reproducibility)
                          </label>
                          <input
                            id="allot-seed"
                            type="number"
                            className="sk-input"
                            value={allotSeed}
                            min={1}
                            onChange={(e) => setAllotSeed(Number(e.target.value) || 1)}
                          />
                          <p className="text-[10.5px] text-muted-foreground mt-1">Stored with the paper — the exact same draw can be reproduced.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={runAllotment} disabled={allotBusy || !students?.length}>
                          {allotBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Dices className="w-3.5 h-3.5" />}
                          Allot sets to {students?.length ?? 0} student{(students?.length ?? 0) === 1 ? "" : "s"}
                        </button>
                        {allotMap && (
                          <span className="text-[11.5px] text-[#156F4C] font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> Allotment saved with the paper
                          </span>
                        )}
                      </div>
                      {allotMap && (
                        <div className="sk-card-flat p-4 max-h-[300px] overflow-y-auto sk-scroll">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="py-1.5 pr-3 font-semibold">Student</th>
                                <th className="py-1.5 pr-3 font-semibold">Set</th>
                                <th className="py-1.5 font-semibold text-right">Copy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(students ?? []).map((st) => {
                                const idx = allotMap[st.id] ?? 0;
                                return (
                                  <tr key={st.id} className="border-b border-dashed border-border/60 last:border-0">
                                    <td className="py-1.5 pr-3 font-semibold">{st.name}</td>
                                    <td className="py-1.5 pr-3">
                                      {allotStrategy === "manual" ? (
                                        <select
                                          className="sk-input !w-auto !py-1 text-[11.5px]"
                                          value={idx}
                                          onChange={(e) => setAllotMap((p) => ({ ...(p ?? {}), [st.id]: Number(e.target.value) }))}
                                          aria-label={`Set for ${st.name}`}
                                        >
                                          {previewSets.map((s, i) => (
                                            <option key={s.label} value={i}>Set {s.label}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="sk-pill sk-pill-blue">Set {previewSets[Math.min(idx, previewSetCount - 1)]?.label ?? "A"}</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-right">
                                      <button
                                        className="sk-btn sk-btn-ghost sk-btn-sm !text-[11px]"
                                        onClick={() => downloadStudentCopy(st)}
                                        title={isShuffle ? "Per-student shuffled copy (M3/M4)" : "Printed copy for this student"}
                                      >
                                        <Printer className="w-3.5 h-3.5" /> PDF
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                )}
              </Tabs>

              <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur p-3 sm:px-5 flex flex-wrap items-center gap-2">
                {editing ? (
                  <>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setDetailsOpen(true)}>
                      <LayoutTemplate className="w-3.5 h-3.5" /> Paper details
                    </button>
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">Edits apply to this paper only — students receive the updated version.</span>
                      <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={cancelEditing} disabled={saveBusy}>
                        Cancel
                      </button>
                      <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={saveEdits} disabled={saveBusy}>
                        {saveBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save changes
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={startEditing}>
                      <Pencil className="w-3.5 h-3.5" /> Edit paper
                    </button>
                    <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => downloadPdf(false)}>
                      <Printer className="w-3.5 h-3.5" /> Paper PDF
                    </button>
                    <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => downloadPdf(true)}>
                      <Lock className="w-3.5 h-3.5" /> Answer key PDF
                    </button>
                    <div className="ml-auto flex items-center gap-2.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">Students receive the paper only — the answer key stays private.</span>
                      <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => setShareOpen(true)}>
                        <Send className="w-3.5 h-3.5" /> Send to Students
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* paper details (letterhead) dialog — editing mode */}
      <Dialog open={detailsOpen} onOpenChange={(o) => !saveBusy && setDetailsOpen(o)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto sk-scroll">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Paper details &amp; letterhead</DialogTitle>
            <DialogDescription>How this paper looks on screen and in the printed PDF.</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="pv-title" className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground mb-1.5 block">
              Paper title (library name)
            </label>
            <input
              id="pv-title"
              className="sk-input"
              value={editTitle}
              maxLength={120}
              placeholder={preview?.title ?? "Paper title"}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <LetterheadEditor header={editHeader} onChange={setEditHeader} paperTitle={editTitle} />
          <div className="flex justify-end">
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setDetailsOpen(false)}>
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* per-question edit dialog — preview editing mode */}
      <QuestionEditDialog
        open={!!previewEditCtx}
        onOpenChange={(o) => {
          if (!o) {
            setEditTarget(null);
            setActionBusy(null);
          }
        }}
        initialTab={editTarget?.tab ?? "regen"}
        ctx={previewEditCtx}
        onReplace={(q) => editTarget && replacePreviewQuestion(editTarget.si, editTarget.qi, q)}
        onBusyChange={(b) => setActionBusy(b && editTarget ? `${editTarget.si}:${editTarget.qi}` : null)}
      />

      {/* share dialog */}
      <ShareStudentsDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        students={students}
        title="Send the paper to students"
        description={preview ? `Share “${preview.title}” — students receive the paper only; the answer key never leaves your account.` : ""}
        busy={shareBusy}
        onConfirm={sharePaper}
      />
    </div>
  );
}
