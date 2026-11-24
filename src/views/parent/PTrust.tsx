"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { exportBrandedExcel } from "@/lib/excel";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, ShieldCheck, CheckCircle2, Clock, MapPin, AlertTriangle, FileSpreadsheet, Star, Briefcase, Bot, Trash2 } from "lucide-react";

interface Trust {
  tutors: {
    id: string;
    name: string;
    color: string;
    headline: string;
    status: string;
    rating: number;
    reviews: number;
    sessionsDone: number;
    trustScore: number;
    badges: string[];
    proofs: { label: string; issuer: string | null; status: string; at: string }[];
    experience: { role: string; org: string; confirmed: boolean }[];
    subjects: string[];
    sessionsWithFamily: number;
  }[];
  visits: {
    id: string;
    tutor: string;
    child: string;
    subject: string;
    area: string;
    scheduled: string;
    stage: string;
    onMyWayAt: string | null;
    checkedInAt: string | null;
    checkedOutAt: string | null;
    minutes: number | null;
    bookedMinutes: number;
    alerts: { type: string; message: string; at: string }[];
    sos: boolean;
  }[];
  summary: { verifiedTutors: number; totalTutors: number; visits: number; otpCompliance: number | null; avgMinutes: number | null; alerts: number };
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—");

/** Parent Trust Dashboard — verification proofs, visit history and AI-tutor transcripts in one view. */
export function PTrust() {
  const [tab, setTab] = useState("tutors");
  const [d, setD] = useState<Trust | null>(null);
  useEffect(() => {
    fetch("/api/parent/trust", { cache: "no-store" }).then((r) => r.json()).then((j) => setD(j?.data ?? null)).catch(() => {});
  }, []);

  const exportVisits = () =>
    d &&
    exportBrandedExcel({
      fileName: "home-visit-log",
      title: "Home-visit log · check-in and check-out",
      subtitle: `Family visit history · generated ${new Date().toLocaleString("en-IN")}`,
      columns: [
        { header: "Date", key: "date", width: 14 },
        { header: "Tutor", key: "tutor", width: 22 },
        { header: "Child", key: "child", width: 18 },
        { header: "Subject", key: "subject", width: 14 },
        { header: "Area", key: "area", width: 20 },
        { header: "On my way", key: "omw", width: 12 },
        { header: "Check-in (OTP)", key: "in", width: 14 },
        { header: "Check-out (OTP)", key: "out", width: 14 },
        { header: "Minutes", key: "min", width: 10, type: "number" },
        { header: "Alerts", key: "alerts", width: 10, type: "number" },
      ],
      rows: d.visits.map((v) => ({ date: new Date(v.scheduled).toLocaleDateString("en-IN"), tutor: v.tutor, child: v.child, subject: v.subject, area: v.area, omw: fmt(v.onMyWayAt), in: fmt(v.checkedInAt), out: fmt(v.checkedOutAt), min: v.minutes ?? 0, alerts: v.alerts.length })),
      totals: { date: "Totals", min: "SUM", alerts: "SUM" },
    });

  if (!d) return <LoadingView label="Gathering verification proofs…" />;

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="safety"
        icon={BadgeCheck}
        trail={["Safety"]}
        title="Parent Trust Dashboard"
        subtitle="Verification proofs, visit history and check-in / check-out logs for everyone who teaches your children."
        pills={[{ label: "Verified data", tone: "verified" }]}
        actions={<HeaderButton onClick={exportVisits}><FileSpreadsheet className="w-3.5 h-3.5" /> Export visit log</HeaderButton>}
        tabs={[
          { id: "tutors", label: "Tutors & proofs", count: d.tutors.length },
          { id: "visits", label: "Visit history", count: d.visits.length },
          { id: "ai", label: "AI Tutor transcripts" },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AccentKpi label="Verified tutors" value={`${d.summary.verifiedTutors}/${d.summary.totalTutors}`} tone="green" />
        <AccentKpi label="Home visits" value={d.summary.visits} />
        <AccentKpi label="OTP check-in compliance" value={d.summary.otpCompliance == null ? "—" : `${d.summary.otpCompliance}%`} tone="navy" sub={d.summary.otpCompliance == null ? "no completed visits yet" : undefined} />
        <AccentKpi label="Safety alerts" value={d.summary.alerts} tone={d.summary.alerts ? "red" : "green"} sub={d.summary.avgMinutes ? `avg visit ${d.summary.avgMinutes} min` : undefined} />
      </div>

      {tab === "tutors" ? (
        d.tutors.length === 0 ? (
          <div className="sk-card p-4"><EmptyState icon={ShieldCheck} title="No tutors yet" sub="Book a session and the tutor's proofs appear here." /></div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {d.tutors.map((t) => (
              <div key={t.id} className="sk-card p-5">
                <div className="flex items-start gap-3">
                  <span className="sk-avatar" style={{ width: 46, height: 46, borderRadius: 14, background: t.color, fontSize: 15 }}>{t.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-[#142366] flex items-center gap-1.5">{t.name} {t.status === "approved" && <BadgeCheck className="w-4 h-4 text-[#1F9D6B]" />}</div>
                    <div className="text-[12px] text-muted-foreground truncate">{t.headline}</div>
                    <div className="text-[11.5px] mt-1 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-0.5"><Star className="w-3.5 h-3.5 text-[#E8A20C] fill-[#E8A20C]" /> {t.rating.toFixed(1)} ({t.reviews})</span>
                      <span>Trust score {t.trustScore}</span>
                      <span>{t.sessionsWithFamily} sessions with your family</span>
                    </div>
                  </div>
                </div>
                <div className="text-[12px] font-bold mt-4 mb-1.5">Verification proofs <span className="font-normal text-muted-foreground">· documents stay private</span></div>
                <div className="space-y-1.5">
                  {t.proofs.length === 0 && <div className="text-[12px] text-muted-foreground">No documents on file.</div>}
                  {t.proofs.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12.5px]">
                      {p.status === "verified" ? <CheckCircle2 className="w-4 h-4 text-[#1F9D6B]" /> : <Clock className="w-4 h-4 text-[#E9A04B]" />}
                      <span className="flex-1">{p.label}{p.issuer ? ` · ${p.issuer}` : ""}</span>
                      <span className={clsx("text-[11px]", p.status === "verified" ? "text-[#1F7A55]" : "text-[#A86A12]")}>{p.status === "verified" ? `verified ${new Date(p.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : p.status}</span>
                    </div>
                  ))}
                </div>
                {t.experience.length > 0 && (
                  <>
                    <div className="text-[12px] font-bold mt-4 mb-1.5">Experience</div>
                    {t.experience.slice(0, 3).map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12.5px]">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> <span className="flex-1">{e.role} · {e.org}</span>
                        {e.confirmed && <span className="sk-pill sk-pill-green !text-[10px]">Confirmed by employer</span>}
                      </div>
                    ))}
                  </>
                )}
                {t.badges.length > 0 && <div className="flex flex-wrap gap-1.5 mt-4">{t.badges.map((b) => <span key={b} className="sk-pill sk-pill-navy !text-[10.5px]">{b}</span>)}</div>}
              </div>
            ))}
          </div>
        )
      ) : tab === "visits" ? (
        <div className="sk-card p-0 overflow-hidden">
          {d.visits.length === 0 ? (
            <EmptyState icon={MapPin} title="No home visits yet" />
          ) : (
            <div className="overflow-x-auto sk-scroll">
              <table className="w-full text-[12.5px] min-w-[820px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                    {["Date", "Visit", "Area", "On my way", "Check-in", "Check-out", "Duration", "Safety"].map((h) => <th key={h} className="text-left px-3 py-2.5">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.visits.map((v) => (
                    <tr key={v.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-3 whitespace-nowrap">{new Date(v.scheduled).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                      <td className="px-3 py-3"><b className="text-[#142366]">{v.tutor}</b><div className="text-[11px] text-muted-foreground">{v.child} · {v.subject}</div></td>
                      <td className="px-3 py-3">{v.area}</td>
                      <td className="px-3 py-3">{fmt(v.onMyWayAt)}</td>
                      <td className="px-3 py-3">{v.checkedInAt ? <span className="text-[#1F7A55] font-semibold">✓ {fmt(v.checkedInAt)} · OTP</span> : "—"}</td>
                      <td className="px-3 py-3">{v.checkedOutAt ? <span className="text-[#1F7A55] font-semibold">✓ {fmt(v.checkedOutAt)} · OTP</span> : v.stage === "in_progress" ? <span className="text-[#22357F]">In session</span> : "—"}</td>
                      <td className="px-3 py-3 tabular">{v.minutes != null ? `${v.minutes}/${v.bookedMinutes} min` : `— /${v.bookedMinutes} min`}</td>
                      <td className="px-3 py-3">
                        {v.sos ? <span className="sk-pill sk-pill-red !text-[10px]">SOS logged</span> : v.alerts.length ? (
                          <span className="inline-flex items-center gap-1 text-[#A86A12]" title={v.alerts.map((a) => a.message).join("\n")}><AlertTriangle className="w-3.5 h-3.5" /> {v.alerts.length} alert{v.alerts.length > 1 ? "s" : ""}</span>
                        ) : <span className="text-[#1F7A55]">No alerts</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <AiTranscripts />
      )}
    </div>
  );
}

function AiTranscripts() {
  const [list, setList] = useState<{ id: string; studentName: string; topic: string; understanding: number; flagged: boolean; updatedAt: string; transcript: { role: string; text: string }[] }[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => fetch("/api/ai-tutor", { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j?.data ?? [])).catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);
  if (!list) return <LoadingView />;
  if (!list.length) return <div className="sk-card p-4"><EmptyState icon={Bot} title="No AI Tutor conversations yet" sub="When your child talks to Maya, the transcript appears here. You can delete any conversation." /></div>;
  return (
    <div className="space-y-2.5">
      {list.map((s) => (
        <div key={s.id} className={clsx("sk-card p-4", s.flagged && "border-[#F6CFCF]")}>
          <div className="flex items-center gap-3">
            <button className="flex-1 min-w-0 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <div className="font-bold text-[#142366] truncate">{s.studentName} · {s.topic || "Doubt session"}</div>
              <div className="text-[11.5px] text-muted-foreground">{new Date(s.updatedAt).toLocaleString("en-IN")} · understanding {s.understanding}%</div>
            </button>
            {s.flagged && <span className="sk-pill sk-pill-red !text-[10px]">Wellbeing alert</span>}
            <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={async () => { if (!confirm("Delete this transcript and the AI's memory of it?")) return; await fetch(`/api/ai-tutor?id=${s.id}`, { method: "DELETE" }); toast({ title: "Deleted" }); void load(); }} aria-label="Delete transcript"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {open === s.id && (
            <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              {s.transcript.map((t, i) => <div key={i} className="text-[12.5px]"><b className={t.role === "maya" ? "text-[#6D4AE0]" : "text-[#142366]"}>{t.role === "maya" ? "Maya" : s.studentName.split(" ")[0]}:</b> {t.text}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
