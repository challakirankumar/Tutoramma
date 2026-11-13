"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ShieldQuestion } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BOOKING_STATE_PILL, MODE_LABEL, WEEKDAYS, dateOf, minutesToLabel } from "@/lib/format";

interface CellSession {
  startMin: number;
  endMin: number;
  subject: string;
  board: string;
  studentName: string;
  mode: string;
  title: string;
  state: string;
}

interface TutorRow {
  userId: string;
  name: string;
  color: string;
  load: number;
  cells: { count: number; sessions: CellSession[] }[];
}

interface TimetableData {
  weekStart: string;
  weekEnd: string;
  tutors: TutorRow[];
  totals: { tutors: number; sessions: number };
}

const MODE_PILL: Record<string, { label: string; cls: "navy" | "orange" | "green" }> = {
  online: { label: "Online 1:1", cls: "navy" },
  home: { label: "Home visit", cls: "orange" },
  group: { label: "Group class", cls: "green" },
  venue: { label: "Venue group", cls: "green" },
};

type ModeFilter = "all" | "online" | "home" | "group";

const matchesMode = (m: string, f: ModeFilter) => f === "all" || m === f || (f === "group" && m === "venue");

export function ATimetable() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [error, setError] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [boardFilter, setBoardFilter] = useState("");
  const [cell, setCell] = useState<{ tutor: TutorRow; day: number; sessions: CellSession[] } | null>(null);

  useEffect(() => {
    fetch("/api/admin/timetable")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "Failed to load the master timetable.");
        return json.data as TimetableData;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the master timetable."));
  }, []);

  const boards = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const t of data.tutors) for (const c of t.cells) for (const s of c.sessions) set.add(s.board);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const keep = (s: CellSession) =>
      matchesMode(s.mode, modeFilter) && (!boardFilter || s.board === boardFilter);
    return {
      ...data,
      tutors: data.tutors.map((t) => ({
        ...t,
        cells: t.cells.map((c) => {
          const sessions = c.sessions.filter(keep);
          return { count: sessions.length, sessions };
        }),
        load: t.cells.reduce((sum, c) => sum + c.sessions.filter(keep).length, 0),
      })),
      totals: {
        tutors: data.tutors.length,
        sessions: data.tutors.reduce(
          (sum, t) => sum + t.cells.reduce((s, c) => s + c.sessions.filter(keep).length, 0),
          0
        ),
      },
    };
  }, [data, modeFilter, boardFilter]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Timetable unavailable" sub={error} />
      </div>
    );
  }
  if (!filtered) return <LoadingView label="Loading master timetable…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Master Timetable</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {filtered.totals.tutors} tutors · {filtered.totals.sessions} sessions this week · week of {dateOf(filtered.weekStart)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by mode">
          {(["all", "online", "home", "group"] as ModeFilter[]).map((f) => (
            <button
              key={f}
              className={`sk-chip text-[12px] ${modeFilter === f ? "sk-chip-active" : ""}`}
              onClick={() => setModeFilter(f)}
            >
              {f === "all" ? "All modes" : MODE_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* board filter chips */}
      {boards.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by board">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Board:</span>
          <button
            className={`sk-chip text-[12px] ${boardFilter === "" ? "sk-chip-active" : ""}`}
            onClick={() => setBoardFilter("")}
          >
            All boards
          </button>
          {boards.map((b) => (
            <button
              key={b}
              className={`sk-chip text-[12px] ${boardFilter === b ? "sk-chip-active" : ""}`}
              onClick={() => setBoardFilter(b)}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* legend */}
      <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-muted-foreground">
        <span className="font-semibold">Weekly load:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-md bg-[#E8ECF5] dark:bg-[#232C50] border" /> 0 sessions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-md" style={{ background: "rgba(49,91,229,0.25)", border: "1px solid rgba(49,91,229,0.5)" }} /> 1–2 light
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-md" style={{ background: "rgba(244,123,32,0.3)", border: "1px solid rgba(244,123,32,0.6)" }} /> 3+ heavy
        </span>
        <span>· click a cell to see the day's sessions</span>
      </div>

      {filtered.tutors.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState icon={CalendarRange} title="No approved tutors yet" sub="Once tutors are verified, their weekly load appears here." />
        </div>
      ) : (
        <div className="sk-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold sticky left-0 bg-[#F5F7FC] dark:bg-[#161D3B] z-10">Tutor</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className="px-3 py-2.5 font-semibold text-center">
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-semibold text-center">Load</th>
                </tr>
              </thead>
              <tbody>
                {filtered.tutors.map((t) => (
                  <tr key={t.userId} className="border-t">
                    <td className="px-4 py-2 sticky left-0 bg-white dark:bg-[#121A38] z-10">
                      <div className="flex items-center gap-2">
                        <AvatarTile name={t.name} color={t.color} size={28} />
                        <span className="font-medium truncate max-w-[130px]">{t.name}</span>
                      </div>
                    </td>
                    {t.cells.map((c, day) => {
                      const empty = c.count === 0;
                      const light = c.count > 0 && c.count <= 2;
                      return (
                        <td key={day} className="px-2 py-2 text-center">
                          <button
                            className="w-10 h-9 rounded-lg text-[13px] font-bold tabular transition-transform hover:scale-105 disabled:hover:scale-100"
                            style={
                              empty
                                ? { background: "rgba(148,163,184,0.12)", color: "#B6C0D6", cursor: "default" }
                                : light
                                  ? { background: "rgba(49,91,229,0.22)", color: "#22357F", border: "1px solid rgba(49,91,229,0.45)" }
                                  : { background: "rgba(244,123,32,0.28)", color: "#9A4E0B", border: "1px solid rgba(244,123,32,0.55)" }
                            }
                            disabled={empty}
                            onClick={() => setCell({ tutor: t, day, sessions: c.sessions })}
                            aria-label={`${t.name} — ${WEEKDAYS[day]}: ${c.count} sessions`}
                          >
                            {c.count}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <StatusPill tone={t.load >= 3 ? "orange" : t.load > 0 ? "blue" : "grey"}>{t.load}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* cell dialog */}
      <Dialog open={!!cell} onOpenChange={(o) => setCell(o ? cell : null)}>
        <DialogContent className="sm:max-w-md">
          {cell && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[15px]">
                  {cell.tutor.name} · {WEEKDAYS[cell.day]}
                </DialogTitle>
                <DialogDescription>
                  {cell.sessions.length} session{cell.sessions.length === 1 ? "" : "s"} scheduled
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto sk-scroll pr-1">
                {cell.sessions.map((s, i) => {
                  const st = pillFor(BOOKING_STATE_PILL, s.state);
                  const md = MODE_PILL[s.mode] ?? { label: MODE_LABEL[s.mode] ?? s.mode, cls: "grey" as const };
                  return (
                    <div key={i} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold tabular text-[13px]">
                          {minutesToLabel(s.startMin)} – {minutesToLabel(s.endMin)}
                        </span>
                        <div className="flex gap-1.5">
                          <StatusPill tone={md.cls}>{md.label}</StatusPill>
                          <StatusPill tone={st.cls}>{st.label}</StatusPill>
                        </div>
                      </div>
                      <div className="text-[12.5px] font-semibold mt-1.5">{s.title}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {s.subject} · {s.board} · {s.studentName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
