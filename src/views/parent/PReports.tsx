"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { toast } from "@/hooks/use-toast";
import { dateOf } from "@/lib/format";
import {
  FileText,
  Sparkles,
  Mail,
  Target,
  ChevronRight,
  ShieldAlert,
  RefreshCw,
  CalendarCheck,
  ClipboardCheck,
  BookOpenCheck,
  Bot,
  ListChecks,
  Printer,
  Clock,
  BadgeCheck,
} from "lucide-react";
import { pdfProgressReport } from "@/lib/pdf";

/* ---------- types ---------- */
interface ReportContent {
  summary: string;
  highlights: string[];
  focus: string[];
  score: number | null;
  attendance: string;
  label: string;
  fallback?: boolean;
}
interface ChildReport {
  childId: string;
  childName: string;
  firstName: string;
  grade: string;
  board: string;
  color: string;
  report: {
    id: string;
    weekStart: string;
    approvedAt: string | null;
    tutorName: string;
    content: ReportContent | null;
  } | null;
  preparing: boolean;
  stats: { sessionsCompleted: number; assessments: number; homeworkGraded: number };
}
interface ReportsData {
  weekStart: string;
  children: ChildReport[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

/** Markdown-lite renderer: paragraphs (\n\n) + bullet lines starting with - • *. */
function ReportBody({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => {
        const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
        const bullets = lines.filter((l) => /^[-•*]\s+/.test(l));
        if (bullets.length > 0 && bullets.length === lines.length) {
          return (
            <ul key={i} className="space-y-1.5">
              {bullets.map((b, j) => (
                <li key={j} className="flex items-start gap-2 text-[13px] leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F47B20] mt-1.5 shrink-0" />
                  {b.replace(/^[-•*]\s+/, "")}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-relaxed">
            {lines.map((l, j) => (
              <span key={j}>
                {/^[-•*]\s+/.test(l) ? l.replace(/^[-•*]\s+/, "") : l}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function PReports() {
  const { context } = useAppStore();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [chosen, setChosen] = useState(""); // user's explicit pick (overrides deep-link context)
  const [nonce, setNonce] = useState(0);

  // selection derives from: user pick → deep-link context → first child
  const ctxChildId = typeof context.childId === "string" ? context.childId : "";
  const children = data?.children ?? [];
  const selected = chosen || ctxChildId || children[0]?.childId || "";
  const child = children.find((c) => c.childId === selected) ?? children[0] ?? null;

  useEffect(() => {
    getJson<ReportsData>("/api/parent/reports")
      .then((d) => {
        setData(d);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.message || "Couldn't load reports."));
  }, [nonce]);

  if (!data) {
    if (loadError) {
      return (
        <div className="sk-card p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Couldn't load reports"
            sub={loadError}
            action={
              <button className="sk-btn sk-btn-primary" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            }
          />
        </div>
      );
    }
    return <LoadingView label="Loading weekly reports…" />;
  }

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        <Header />
        <div className="sk-card p-6">
          <EmptyState
            icon={FileText}
            title="No children linked yet"
            sub="Weekly progress reports appear once your children start taking sessions."
          />
        </div>
      </div>
    );
  }

  const report = child?.report ?? null;
  const content = report?.content ?? null;
  const rangeTo = report ? new Date(new Date(report.weekStart).getTime() + 7 * 86400000).toISOString() : "";

  return (
    <div className="space-y-5">
      <Header />

      {/* ---------- child selector ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children.map((c) => {
          const active = c.childId === child?.childId;
          return (
            <button
              key={c.childId}
              onClick={() => setChosen(c.childId)}
              className={`sk-card p-4 flex items-center gap-3 text-left transition-all hover:-translate-y-0.5 ${
                active ? "ring-2 ring-[#14246B] ring-offset-2 ring-offset-background" : ""
              }`}
              aria-pressed={active}
            >
              <AvatarTile name={c.childName} color={c.color} size={38} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[13.5px] truncate">{c.childName}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {c.grade} · {c.board}
                </div>
              </div>
              {c.preparing && (
                <span className="sk-pill sk-pill-orange shrink-0" title="This week's report is with the tutor">
                  <Clock className="w-3 h-3" /> Preparing
                </span>
              )}
              {active && <ChevronRight className="w-4 h-4 text-brand-navy shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* ---------- preparing banner ---------- */}
      {child?.preparing && (
        <div
          className="rounded-2xl border border-[#F5D9B8] bg-[#FFF7EC] px-4 py-3.5 flex items-start gap-3"
          role="status"
        >
          <Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#B0620A]" />
          <div className="text-[13px] leading-relaxed text-[#7A5010]">
            <span className="font-bold">This week's report is being prepared by the tutor</span> — you'll be notified when
            it's approved.
          </div>
        </div>
      )}

      {/* ---------- report card (approved content only) ---------- */}
      <div className="sk-card p-6">
        {!report || !content ? (
          <EmptyState
            icon={FileText}
            title="No approved report yet"
            sub={
              child?.preparing
                ? `${child?.firstName}'s tutor is drafting this week's report — it appears here the moment it's approved.`
                : "As soon as your tutor approves a weekly report, it lands here in full."
            }
          />
        ) : (
          <>
            {/* header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-[17px] font-extrabold tracking-tight">Weekly Progress Report — {child?.childName}</h2>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {child?.grade} · {child?.board} · week of {dateOf(report.weekStart)} – {dateOf(rangeTo)} · with{" "}
                  {report.tutorName}
                </p>
              </div>
              <span className="sk-pill sk-pill-green">
                <BadgeCheck className="w-3 h-3" /> Approved by tutor
                {report.approvedAt ? ` · ${dateOf(report.approvedAt)}` : ""}
              </span>
            </div>

            {/* stats strip */}
            <div className="grid grid-cols-3 gap-2.5 mt-4">
              <div className="sk-well p-3 text-center">
                <CalendarCheck className="w-4 h-4 mx-auto text-brand-navy" />
                <div className="text-[16px] font-extrabold tabular mt-1">{child?.stats.sessionsCompleted}</div>
                <div className="text-[10.5px] text-muted-foreground">sessions this week</div>
              </div>
              <div className="sk-well p-3 text-center">
                <ClipboardCheck className="w-4 h-4 mx-auto text-brand-orange" />
                <div className="text-[16px] font-extrabold tabular mt-1">{child?.stats.assessments}</div>
                <div className="text-[10.5px] text-muted-foreground">assessments (14d)</div>
              </div>
              <div className="sk-well p-3 text-center">
                <BookOpenCheck className="w-4 h-4 mx-auto text-[#1F9D68]" />
                <div className="text-[16px] font-extrabold tabular mt-1">{child?.stats.homeworkGraded}</div>
                <div className="text-[10.5px] text-muted-foreground">homework graded</div>
              </div>
            </div>

            {/* body */}
            <div className="sk-well p-5 mt-5">
              <SectionTitle
                title="Report"
                sub={
                  content.fallback
                    ? "Structured from this week's session data — reviewed and approved by the tutor"
                    : "Drafted by AI from this week's session data, then reviewed and approved by the tutor"
                }
              />
              <div className="mt-4 text-foreground">
                <ReportBody text={content.summary} />
              </div>
              {(content.attendance || content.score !== null) && (
                <div className="flex items-center gap-2 flex-wrap mt-4">
                  {content.attendance && (
                    <span className="sk-pill sk-pill-grey">
                      <ClipboardCheck className="w-3 h-3" /> {content.attendance}
                    </span>
                  )}
                  {content.score !== null && (
                    <span className="sk-pill sk-pill-navy">Mastery confidence {content.score}/100</span>
                  )}
                </div>
              )}
            </div>

            {/* highlights & focus */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="sk-card-flat p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#156F4C]">
                  <Sparkles className="w-3.5 h-3.5" /> Highlights
                </div>
                <ul className="space-y-2 mt-2.5">
                  {content.highlights.length > 0 ? (
                    content.highlights.map((s, i) => (
                      <li key={i} className="sk-pill sk-pill-green !whitespace-normal !leading-relaxed text-left w-fit max-w-full">
                        {s}
                      </li>
                    ))
                  ) : (
                    <li className="text-[12.5px] text-muted-foreground">No highlights recorded this week.</li>
                  )}
                </ul>
              </div>
              <div className="sk-card-flat p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#A45A0C]">
                  <Target className="w-3.5 h-3.5" /> Focus areas
                </div>
                <ul className="space-y-2 mt-2.5">
                  {content.focus.length > 0 ? (
                    content.focus.map((s, i) => (
                      <li key={i} className="sk-pill sk-pill-orange !whitespace-normal !leading-relaxed text-left w-fit max-w-full">
                        {s}
                      </li>
                    ))
                  ) : (
                    <li className="text-[12.5px] text-muted-foreground">Nothing flagged — steady week.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* tutor-approval note */}
            <div className="sk-callout sk-callout-info flex gap-2.5 mt-4">
              <FileText className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                Reports are drafted from session notes and test results, then approved by the tutor before you see them.
                Nothing here is shared outside your family and the tutor.
              </div>
            </div>

            {/* actions */}
            <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
              <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> Reports never share your child's personal identifiers — first names only.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="sk-btn sk-btn-primary"
                  onClick={async () => {
                    if (!child || !content || !report) return;
                    try {
                      await pdfProgressReport({
                        childName: child.childName,
                        grade: child.grade,
                        board: child.board,
                        rangeFrom: report.weekStart,
                        rangeTo,
                        label: "Tutor approved",
                        stats: child.stats,
                        strengths: content.highlights,
                        focusAreas: content.focus,
                        nextSteps: [],
                        body: content.summary,
                      });
                      toast({ title: "Report PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
                    } catch {
                      toast({ title: "Could not build the PDF", variant: "destructive" });
                    }
                  }}
                >
                  <Printer className="w-4 h-4" /> Download PDF
                </button>
                <button
                  className="sk-btn sk-btn-ghost"
                  onClick={() =>
                    toast({
                      title: "Report emailed",
                      description: `Weekly report for ${child?.firstName} sent to your inbox (demo).`,
                    })
                  }
                >
                  <Mail className="w-4 h-4" /> Email me
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">Weekly Reports</h1>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          A warm, honest summary of each child's week — drafted from sessions, tests and homework, then approved by
          the tutor before it reaches you.
        </p>
      </div>
      <span className="sk-pill sk-pill-navy">
        <ListChecks className="w-3 h-3" /> Tutor-approved only
      </span>
    </div>
  );
}
