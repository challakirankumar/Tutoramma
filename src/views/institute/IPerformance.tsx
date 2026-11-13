"use client";

import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gauge, RefreshCw, ShieldAlert, Star, Users } from "lucide-react";

/* ---------------- types ---------------- */
interface PerfRow {
  id: string;
  title: string;
  subject: string;
  fillPercent: number;
  attendancePercent: number | null; // null = no classes held yet
  rating: number;
  sessionsHeld: number;
  avgMastery: number | null; // null = no learning-passport data
  started: boolean;
}

interface PerfData {
  data: PerfRow[];
  summary: {
    avgFill: number;
    avgAttendance: number | null;
    avgRating: number;
    avgMastery: number | null;
    totalStudents: number;
  };
}

/* ---------------- view ---------------- */
export function IPerformance() {
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/institute/performance", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json?.error) throw new Error(json?.error?.message || "Couldn't load performance.");
        setPerf({ data: json.data as PerfRow[], summary: json.summary as PerfData["summary"] });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load performance.");
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Performance unavailable"
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
  if (!perf) return <LoadingView label="Measuring batch performance…" />;

  const s = perf.summary;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Performance</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Seat fill, attendance and mastery health across every academy batch — real numbers only.
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <Gauge className="w-3 h-3" /> {perf.data.length} batch{perf.data.length === 1 ? "" : "es"}
        </span>
      </div>

      {/* ---------- summary KPIs ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Avg fill rate" value={`${s.avgFill}%`} sub="seats filled vs capacity" icon={Users} tone="navy" />
        <KpiCard
          label="Avg attendance"
          value={s.avgAttendance === null ? "—" : `${s.avgAttendance}%`}
          sub={s.avgAttendance === null ? "first classes will populate attendance" : "across batches with held classes"}
          icon={Gauge}
          tone="royal"
        />
        <KpiCard
          label="Avg rating"
          value={s.avgRating > 0 ? s.avgRating.toFixed(1) : "—"}
          sub={s.avgRating > 0 ? "parent & student reviews" : "no reviews yet"}
          icon={Star}
          tone="orange"
        />
        <KpiCard
          label="Avg mastery"
          value={s.avgMastery === null ? "—" : `${s.avgMastery}%`}
          sub={s.avgMastery === null ? "learning passports fill this in" : "learning passport of seated students"}
          icon={Gauge}
          tone="green"
        />
        <KpiCard label="Students learning" value={s.totalStudents} sub="seats filled across batches" icon={Users} tone="navy" />
      </div>

      {/* ---------- per-batch table ---------- */}
      {perf.data.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Gauge}
            title="No batches to measure yet"
            sub="Create an academy batch — fill, attendance and mastery tracking starts with the first session."
          />
        </div>
      ) : (
        <section className="sk-card p-0 overflow-hidden" aria-label="Batch performance">
          <div className="p-5 pb-3">
            <h2 className="text-[16px] font-bold tracking-tight">Batch scorecard</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Sorted by seat fill · attendance is averaged across held classes</p>
          </div>
          <div className="overflow-x-auto sk-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Fill</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead className="hidden sm:table-cell">Sessions held</TableHead>
                  <TableHead className="hidden md:table-cell">Avg mastery</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="font-semibold text-[13px] truncate max-w-[260px]">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {r.subject}
                          {!r.started && <span className="text-brand-orange"> · starts soon</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="w-[110px] space-y-1">
                        <div className="text-[12px] font-semibold tabular">{r.fillPercent}%</div>
                        <div className="sk-progress-track">
                          <div
                            className={`sk-progress-fill ${r.fillPercent >= 60 ? "sk-progress-fill-green" : "sk-progress-fill-orange"}`}
                            style={{ width: `${Math.max(4, r.fillPercent)}%` }}
                            role="progressbar"
                            aria-valuenow={r.fillPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${r.title} fill ${r.fillPercent}%`}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.attendancePercent !== null ? (
                        <div className="w-[110px] space-y-1">
                          <div className="text-[12px] font-semibold tabular">{r.attendancePercent}%</div>
                          <div className="sk-progress-track">
                            <div
                              className={`sk-progress-fill ${r.attendancePercent >= 90 ? "sk-progress-fill-green" : "sk-progress-fill-orange"}`}
                              style={{ width: `${Math.max(4, r.attendancePercent)}%` }}
                              role="progressbar"
                              aria-valuenow={r.attendancePercent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${r.title} attendance ${r.attendancePercent}%`}
                            />
                          </div>
                        </div>
                      ) : r.started ? (
                        <StatusPill tone="grey">No classes yet</StatusPill>
                      ) : (
                        <StatusPill tone="grey">Starts soon</StatusPill>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular text-[12.5px] text-muted-foreground">{r.sessionsHeld}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.avgMastery !== null ? (
                        <span className="text-[12.5px] tabular font-semibold">{r.avgMastery}%</span>
                      ) : (
                        <span className="text-muted-foreground text-[12.5px]" title="No learning-passport data for seated students yet">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.rating > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold tabular">
                          <Star className="w-3.5 h-3.5 text-[#E8A20C] fill-[#E8A20C]" /> {r.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[12.5px]">No reviews yet</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-5 py-3 border-t border-border/70 text-[11px] text-muted-foreground">
            Attendance is measured from each batch's ended live classes (present + late). Mastery is averaged from the
            learning passports of students holding seats — empty cells mean there's no data yet, never a guess.
          </div>
        </section>
      )}
    </div>
  );
}
