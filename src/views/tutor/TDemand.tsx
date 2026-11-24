"use client";

import { useEffect, useState } from "react";
import { ModuleHeader, AccentKpi } from "@/components/shared/ModuleHeader";
import { LoadingView } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { Flame, TrendingUp, CalendarPlus } from "lucide-react";

interface D {
  days: string[];
  bands: string[];
  grid: number[][];
  myGrid: number[][];
  max: number;
  subjects: { name: string; demand: number; tutors: number; homeShare: number; ratio: number }[];
  hot: { day: string; band: string; count: number }[];
  open: { day: string; band: string; count: number }[];
  bookings: number;
}

/** Tutor Demand Heatmap (spec §30): where and when families book, against tutor supply. */
export function TDemand() {
  const { setView } = useAppStore();
  const [d, setD] = useState<D | null>(null);
  useEffect(() => {
    fetch("/api/tutor/demand", { cache: "no-store" }).then((r) => r.json()).then((j) => setD(j.data)).catch(() => {});
  }, []);
  if (!d) return <LoadingView label="Reading marketplace demand…" />;
  const shade = (n: number) => {
    const t = n / d.max;
    return t === 0 ? "#F1F4FA" : t < 0.25 ? "#FFE3CF" : t < 0.5 ? "#FFC191" : t < 0.75 ? "#FB9452" : "#F26B1D";
  };
  return (
    <div className="space-y-5">
      <ModuleHeader group="money" icon={Flame} title="Demand Heatmap" subtitle="Which subjects and time slots families book across Tutor Amma — and where tutors are scarce. Aggregated; no family data is shown." pills={[{ label: "Last 120 days", tone: "info" }]} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AccentKpi label="Bookings analysed" value={d.bookings} tone="navy" />
        <AccentKpi label="Hottest slot" value={d.hot[0] ? `${d.hot[0].day}` : "—"} sub={d.hot[0]?.band} />
        <AccentKpi label="Most underserved" value={d.subjects[0]?.name ?? "—"} sub={d.subjects[0] ? `${d.subjects[0].ratio} bookings per tutor` : undefined} tone="red" />
        <AccentKpi label="Open slots for you" value={d.open.length} tone="green" sub="high demand, you're free" />
      </div>
      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-4">
        <div className="sk-card p-5">
          <div className="text-[15px] font-extrabold text-[#142366]">When families book</div>
          <div className="mt-4 overflow-x-auto sk-scroll">
            <table className="w-full min-w-[480px] border-separate border-spacing-1.5 text-[11.5px]">
              <thead><tr><th />{d.bands.map((b) => <th key={b} className="font-bold text-muted-foreground text-center">{b}</th>)}</tr></thead>
              <tbody>
                {d.days.map((day, di) => (
                  <tr key={day}>
                    <td className="font-bold text-muted-foreground pr-2">{day}</td>
                    {d.grid[di].map((n, bi) => (
                      <td key={bi} className="h-11 rounded-xl text-center font-bold relative" style={{ background: shade(n), color: n / d.max > 0.5 ? "#fff" : "#7A3B12" }} title={`${n} bookings`}>
                        {n || ""}
                        {d.myGrid[di][bi] > 0 && <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-[#142366]" title="You teach here" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">Less {["#F1F4FA", "#FFE3CF", "#FFC191", "#FB9452", "#F26B1D"].map((c) => <span key={c} className="w-4 h-4 rounded" style={{ background: c }} />)} More · <span className="w-1.5 h-1.5 rounded-full bg-[#142366]" /> your sessions</div>
        </div>
        <div className="space-y-4">
          <div className="sk-card p-5">
            <div className="text-[15px] font-extrabold text-[#142366] flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Demand vs supply by subject</div>
            <div className="space-y-2.5 mt-3">
              {d.subjects.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-[12.5px]"><b>{s.name}</b><span className="text-muted-foreground">{s.demand} bookings · {s.tutors} active tutor{s.tutors === 1 ? "" : "s"}</span></div>
                  <div className="h-2 rounded-full bg-[#EEF2FA] mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.ratio / Math.max(...d.subjects.map((x) => x.ratio))) * 100)}%`, background: s.ratio >= 3 ? "#F26B1D" : "#142366" }} /></div>
                  {s.homeShare > 0 && <div className="text-[10.5px] text-muted-foreground mt-0.5">{s.homeShare}% home visits</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="sk-card p-5">
            <div className="text-[15px] font-extrabold text-[#142366]">Suggested open slots</div>
            {!d.open.length ? <p className="text-[12.5px] text-muted-foreground mt-2">You already cover the busiest slots — nice.</p> : (
              <ul className="mt-2 space-y-1.5 text-[13px]">{d.open.map((o) => <li key={o.day + o.band} className="flex justify-between"><span>{o.day} · {o.band}</span><span className="text-[#D9580E] font-semibold">{o.count} bookings</span></li>)}</ul>
            )}
            <button className="sk-btn sk-btn-sm sk-btn-primary mt-3" onClick={() => setView("t-availability")}><CalendarPlus className="w-3.5 h-3.5" /> Open these in my availability</button>
          </div>
        </div>
      </div>
    </div>
  );
}
