"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarClock,
  Check,
  Gavel,
  GraduationCap,
  Radio,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";

import { KpiCard } from "@/components/shared/KpiCard";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView, SectionTitle } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { BOOKING_STATE_PILL, MODE_LABEL, STAGE_PILL, WEEKDAYS, dateTimeOf, fromNow, kwd, timeOf } from "@/lib/format";

interface OverviewData {
  kpis: {
    students: number;
    tutors: number;
    pendingVerifications: number;
    activeBookings: number;
    liveHomeSessions: number;
    gmv: number;
    openDisputes: number;
    openAlerts: number;
  };
  weeklyBookings: { day: number; count: number }[];
  gmvTrend: { label: string; value: number }[];
  modeSplit: { mode: string; count: number }[];
  liveSessions: {
    bookingId: string;
    stage: string;
    sosActive: boolean;
    startAt: string;
    subject: string;
    tutorName: string;
    tutorColor: string;
    studentName: string;
    studentColor: string;
    destArea: string;
  }[];
  recentAudit: {
    id: string;
    actorName: string;
    actorRole: string;
    action: string;
    resource: string;
    detail: string;
    severity: string;
    createdAt: string;
  }[];
  alerts: { id: string; type: string; severity: string; message: string; acknowledged: boolean; createdAt: string }[];
  recentBookings: {
    id: string;
    title: string;
    subject: string;
    mode: string;
    state: string;
    startAt: string;
    total: number;
    tutorName: string;
    tutorColor: string;
    studentName: string;
    studentColor: string;
  }[];
}

const NAVY = "#14246B";
const ROYAL = "#315BE5";
const ORANGE = "#F47B20";
const GREEN = "#1F9D68";
const MODE_COLORS: Record<string, string> = { online: NAVY, home: ORANGE, group: GREEN, venue: GREEN };

const SEVERITY_PILL: Record<string, { label: string; cls: "red" | "orange" | "blue" }> = {
  critical: { label: "Critical", cls: "red" },
  warning: { label: "Warning", cls: "orange" },
  info: { label: "Info", cls: "blue" },
};

/** Paise → compact ₹ chart-axis label (₹XL for lakhs, ₹XK for thousands). */
function gmvAxisLabel(v: number): string {
  const rupees = v / 100;
  if (rupees >= 100000) return `₹${Math.round(rupees / 100000)}L`;
  if (rupees >= 1000) return `₹${Math.round(rupees / 1000)}K`;
  return `₹${Math.round(rupees)}`;
}

export function AOverview() {
  const setView = useAppStore((s) => s.setView);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [ackBusy, setAckBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load overview.");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ackAlert = async (id: string) => {
    setAckBusy(id);
    try {
      const res = await fetch("/api/admin/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alertId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not acknowledge alert.");
      setData((d) =>
        d
          ? {
              ...d,
              kpis: { ...d.kpis, openAlerts: Math.max(0, d.kpis.openAlerts - 1) },
              alerts: d.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
            }
          : d
      );
      toast({ title: "Alert acknowledged", description: "Logged to the audit trail." });
    } catch (e) {
      toast({ title: "Could not acknowledge", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAckBusy("");
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldAlert} title="Overview unavailable" sub={error} />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading operations overview…" />;

  const { kpis } = data;
  const weekBars = data.weeklyBookings.map((b) => ({ name: WEEKDAYS[b.day], count: b.count }));
  const modeData = data.modeSplit.map((m) => ({ name: MODE_LABEL[m.mode] ?? m.mode, value: m.count, mode: m.mode }));
  const openAlerts = data.alerts.filter((a) => !a.acknowledged);

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Operations Overview</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Marketplace health for {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openAlerts.length > 0 && (
            <StatusPill tone="orange">
              {openAlerts.length} unacknowledged alert{openAlerts.length > 1 ? "s" : ""}
            </StatusPill>
          )}
          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("a-verification")}>
            Verification queue <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard label="Students" value={kpis.students} sub="registered learners" icon={GraduationCap} tone="navy" />
        <KpiCard label="Tutors" value={kpis.tutors} sub="on the platform" icon={Users} tone="royal" />
        <KpiCard label="Pending verifications" value={kpis.pendingVerifications} sub="awaiting review" icon={BadgeCheck} tone="orange" />
        <KpiCard
          label="Live home sessions"
          value={kpis.liveHomeSessions}
          sub={kpis.liveHomeSessions > 0 ? "tutors in the field" : "none right now"}
          icon={Radio}
          tone={kpis.liveHomeSessions > 0 ? "red" : "navy"}
        />
        <KpiCard label="Active bookings" value={kpis.activeBookings} sub="accepted + in progress" icon={CalendarClock} tone="royal" />
        <KpiCard label="GMV" value={kwd(kpis.gmv)} sub="escrow + released" icon={Wallet} tone="green" />
        <KpiCard label="Open disputes" value={kpis.openDisputes} sub="needs resolution" icon={Gavel} tone={kpis.openDisputes > 0 ? "red" : "green"} />
        <KpiCard label="Open alerts" value={kpis.openAlerts} sub="safety + ops" icon={AlertTriangle} tone={kpis.openAlerts > 0 ? "orange" : "green"} />
      </div>

      {/* live now strip */}
      <div className="sk-card p-4">
        <SectionTitle
          title="Live now — home tuition"
          sub="Home sessions on the board with safety stage"
          right={
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setView("a-safety")}>
              Open safety console <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        />
        {data.liveSessions.length === 0 ? (
          <div className="text-[12.5px] text-muted-foreground py-3">No home sessions on the board right now.</div>
        ) : (
          <div className="flex flex-wrap gap-2.5 mt-3">
            {data.liveSessions.map((s) => {
              const stage = pillFor(STAGE_PILL, s.stage);
              return (
                <div key={s.bookingId} className="flex items-center gap-2.5 rounded-2xl border bg-white/70 dark:bg-transparent px-3 py-2">
                  <AvatarTile name={s.tutorName} color={s.tutorColor} size={30} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold truncate">
                      {s.tutorName} → {s.studentName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.subject} · {s.destArea || "—"} · {timeOf(s.startAt)}
                    </div>
                  </div>
                  <StatusPill tone={stage.cls}>{stage.label}</StatusPill>
                  {s.sosActive && (
                    <StatusPill tone="red" className="animate-pulse">
                      SOS active
                    </StatusPill>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="sk-card p-4">
          <SectionTitle title="Bookings this week" sub="Sessions per weekday" />
          <div className="h-[190px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekBars} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v}`, "Bookings"]} />
                <Bar dataKey="count" fill={NAVY} radius={[6, 6, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sk-card p-4">
          <SectionTitle title="GMV trend" sub="Last 6 weeks (escrow + released)" />
          <div className="h-[190px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.gmvTrend} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ROYAL} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ROYAL} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => gmvAxisLabel(Number(v))} />
                <Tooltip formatter={(v) => [kwd(Number(v)), "GMV"]} />
                <Area type="monotone" dataKey="value" stroke={NAVY} strokeWidth={2.2} fill="url(#gmvFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sk-card p-4">
          <SectionTitle title="Bookings by mode" sub="All-time split" />
          <div className="h-[150px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={modeData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={3}>
                  {modeData.map((m) => (
                    <Cell key={m.mode} fill={MODE_COLORS[m.mode] ?? ROYAL} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} bookings`, String(name)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
            {modeData.map((m) => (
              <span key={m.mode} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: MODE_COLORS[m.mode] ?? ROYAL }} />
                {m.name} · {m.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* feeds */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="sk-card p-4 xl:col-span-1">
          <SectionTitle title="Safety & ops alerts" sub="Latest 6 · acknowledge to clear" />
          <div className="mt-3 space-y-2.5 max-h-96 overflow-y-auto sk-scroll pr-1">
            {data.alerts.length === 0 && <div className="text-[12.5px] text-muted-foreground py-2">No alerts — all clear.</div>}
            {data.alerts.map((a) => {
              const sev = SEVERITY_PILL[a.severity] ?? SEVERITY_PILL.info;
              return (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill tone={sev.cls}>{sev.label}</StatusPill>
                    <span className="text-[11px] text-muted-foreground">{fromNow(a.createdAt)}</span>
                    {a.acknowledged ? (
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Check className="w-3.5 h-3.5 text-[#1F9D68]" /> Acknowledged
                      </span>
                    ) : (
                      <button className="sk-btn sk-btn-ghost sk-btn-sm ml-auto" disabled={ackBusy === a.id} onClick={() => ackAlert(a.id)}>
                        {ackBusy === a.id ? "…" : "Acknowledge"}
                      </button>
                    )}
                  </div>
                  <p className="text-[12.5px] leading-relaxed mt-1.5">{a.message}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sk-card p-4">
          <SectionTitle title="Recent activity" sub="Append-only audit trail" />
          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto sk-scroll pr-1">
            {data.recentAudit.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 rounded-xl border p-2.5">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ background: e.severity === "critical" ? "#C03342" : e.severity === "warning" ? ORANGE : GREEN }}
                />
                <div className="min-w-0">
                  <div className="text-[12.5px]">
                    <span className="font-semibold">{e.actorName}</span>
                    <span className="text-muted-foreground"> ({e.actorRole}) · </span>
                    <span className="font-mono text-[11.5px] text-[#315BE5]">{e.action}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{e.resource}</div>
                  {e.detail && <div className="text-[11.5px] text-muted-foreground/90 mt-0.5">{e.detail}</div>}
                  <div className="text-[10.5px] text-muted-foreground/70 mt-0.5">{dateTimeOf(e.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sk-card p-4">
          <SectionTitle
            title="Latest bookings"
            sub="Most recent 5"
            right={
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("a-bookings")}>
                All bookings <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto sk-scroll pr-1">
            {data.recentBookings.map((b) => {
              const state = pillFor(BOOKING_STATE_PILL, b.state);
              return (
                <div key={b.id} className="flex items-center gap-2.5 rounded-xl border p-2.5">
                  <AvatarTile name={b.tutorName} color={b.tutorColor} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold truncate">{b.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {b.studentName} · {MODE_LABEL[b.mode] ?? b.mode} · {dateTimeOf(b.startAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] font-bold tabular">{kwd(b.total, 2)}</div>
                    <StatusPill tone={state.cls}>{state.label}</StatusPill>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <BookOpenCheck className="w-4 h-4" />
        Every admin action — approvals, refunds, payouts — is written to the immutable audit trail and visible under Audit.
      </div>
    </div>
  );
}
