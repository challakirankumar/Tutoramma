"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { kwd, fromNow } from "@/lib/format";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BadgeCheck, Bell, CalendarCheck, ChevronRight, GraduationCap, LayoutDashboard, ShieldAlert,
  Star, TrendingUp, Users,
} from "lucide-react";

/* ---------------- types ---------------- */
interface DashData {
  academy: { name: string; city: string; about: string; verified: boolean; since: string };
  kpis: {
    tutors: number;
    batches: number;
    seatsFilled: number;
    seatsTotal: number;
    revenueTotal: number;
    pendingPayout: number;
  };
  revenueSeries: { label: string; gross: number; net: number }[];
  batchFill: { id: string; title: string; subject: string; filled: number; max: number; percent: number; status: string }[];
  tutorUtilisation: { id: string; name: string; color: string; sessions: number; utilisation: number; verified: boolean; rating: number }[];
  alerts: { id: string; title: string; body: string; type: string; createdAt: string }[];
}

/* ---------------- view ---------------- */
export function IDashboard() {
  const setView = useAppStore((s) => s.setView);
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/institute/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message || "Could not load the academy dashboard.");
      setData(json.data as DashData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the academy dashboard.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Dashboard unavailable"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={load}>
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading your academy…" />;

  const chartData = data.revenueSeries.map((m) => ({ ...m, grossInr: m.gross / 100, netInr: m.net / 100 }));

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Academy Dashboard</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {data.academy.name} · {data.academy.city}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data.academy.verified ? (
            <span className="sk-pill sk-pill-green">
              <BadgeCheck className="w-3 h-3" /> Verified academy
            </span>
          ) : (
            <span className="sk-pill sk-pill-orange">Verification pending</span>
          )}
          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("i-batches")}>
            Manage batches <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Academy tutors" value={data.kpis.tutors} sub="individually verified" icon={GraduationCap} tone="navy" />
        <KpiCard label="Active batches" value={data.kpis.batches} sub="open + confirmed groups" icon={CalendarCheck} tone="royal" />
        <KpiCard
          label="Seats filled"
          value={data.kpis.seatsFilled}
          sub={`of ${data.kpis.seatsTotal} seats across batches`}
          icon={Users}
          tone="orange"
        />
        <KpiCard label="Net revenue" value={kwd(data.kpis.revenueTotal)} sub="released, net of platform fees" icon={TrendingUp} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ---------- left column: revenue + batch fill ---------- */}
        <div className="lg:col-span-2 space-y-5">
          {/* revenue chart */}
          <section className="sk-card p-5 space-y-3" aria-label="Monthly revenue">
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-[16px] font-bold tracking-tight">Revenue — last 6 months</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">Gross collections vs net to the academy</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: "#14246B" }} /> Gross
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: "#F47B20" }} /> Net
                </span>
              </div>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7694" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7694" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    cursor={{ fill: "rgba(49,91,229,0.06)" }}
                    formatter={(value: number | string, name: string) => [kwd(Number(value) * 100), name === "grossInr" ? "Gross" : "Net to academy"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E3E9F4", boxShadow: "0 8px 30px rgba(20,36,107,.12)", fontSize: 12 }}
                  />
                  <Bar dataKey="grossInr" fill="#14246B" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="netInr" fill="#F47B20" radius={[5, 5, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* batch fill */}
          <section className="sk-card p-5 space-y-3.5" aria-label="Batch seat fill">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-bold tracking-tight">Batch seat fill</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">Confirmed batches in green · open batches still filling</p>
              </div>
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("i-batches")}>
                All batches <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {data.batchFill.length === 0 ? (
              <EmptyState icon={Users} title="No batches yet" sub="Create your first academy batch to start collecting seats." />
            ) : (
              <ul className="space-y-3.5">
                {data.batchFill.map((b) => {
                  return (
                    <li key={b.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] truncate">{b.title}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {b.subject} · {b.filled} of {b.max} seats
                          </div>
                        </div>
                        {b.status === "confirmed" ? (
                          <StatusPill tone="green">Confirmed</StatusPill>
                        ) : b.status === "closed" ? (
                          <StatusPill tone="grey">Closed</StatusPill>
                        ) : (
                          <StatusPill tone="orange">Open</StatusPill>
                        )}
                      </div>
                      <div className="sk-progress-track">
                        <div
                          className={`sk-progress-fill ${b.status === "confirmed" ? "sk-progress-fill-green" : "sk-progress-fill-orange"}`}
                          style={{ width: `${Math.max(4, b.percent)}%` }}
                          role="progressbar"
                          aria-valuenow={b.filled}
                          aria-valuemin={0}
                          aria-valuemax={b.max}
                          aria-label={`${b.filled} of ${b.max} seats filled`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ---------- right column: alerts + tutor utilisation ---------- */}
        <div className="space-y-5">
          {/* alerts feed */}
          <section className="sk-card p-5 space-y-3.5" aria-label="Latest alerts">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-bold tracking-tight flex items-center gap-2">
                <Bell className="w-4 h-4 text-brand-orange" /> Alerts
              </h2>
              <span className="text-[11px] text-muted-foreground">latest {data.alerts.length}</span>
            </div>
            {data.alerts.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Nothing needs your attention right now.</p>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto sk-scroll">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex gap-2.5">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: "#F47B20", boxShadow: "0 0 4px rgba(244,123,32,.6)" }} />
                    <div className="min-w-0">
                      <div className="font-semibold text-[12.5px] leading-snug">{a.title}</div>
                      <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">{a.body}</p>
                      <div className="text-[10.5px] text-muted-foreground mt-1">{fromNow(a.createdAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* tutor utilisation */}
          <section className="sk-card p-5 space-y-3.5" aria-label="Tutor utilisation">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-bold tracking-tight">Tutor utilisation</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">Weekly sessions vs a 10-session week</p>
              </div>
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("i-tutors")}>
                <LayoutDashboard className="w-3.5 h-3.5" /> Details
              </button>
            </div>
            {data.tutorUtilisation.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No academy tutors yet" sub="Invite verified tutors to your academy to see utilisation here." />
            ) : (
              <ul className="space-y-3.5">
                {data.tutorUtilisation.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <AvatarTile name={t.name} color={t.color} size={36} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[12.5px] truncate inline-flex items-center gap-1.5">
                          {t.name}
                          {t.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#1F9D68]" />}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular shrink-0">
                          {t.sessions} session{t.sessions === 1 ? "" : "s"}/wk
                        </span>
                      </div>
                      <div className="sk-progress-track">
                        <div
                          className={`sk-progress-fill ${t.utilisation >= 60 ? "sk-progress-fill-green" : "sk-progress-fill-orange"}`}
                          style={{ width: `${Math.max(4, t.utilisation)}%` }}
                          role="progressbar"
                          aria-valuenow={t.utilisation}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${t.name} utilisation ${t.utilisation}%`}
                        />
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[11.5px] font-semibold tabular shrink-0">
                      <Star className="w-3 h-3 text-[#E8A20C] fill-[#E8A20C]" /> {t.rating.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
