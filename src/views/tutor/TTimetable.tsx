"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { MODE_LABEL, WEEKDAYS, minutesToLabel } from "@/lib/format";
import { CalendarRange, Car, Clock, PencilLine, Printer } from "lucide-react";
import { pdfTimetable } from "@/lib/pdf";

interface BookingItem {
  id: string;
  title: string;
  subject: string;
  mode: string;
  state: string;
  startAt: string;
  endAt: string;
  student?: { id: string; name: string; avatarColor?: string; color?: string };
}

interface BatchItem {
  id: string;
  tutorId: string;
  title: string;
  subject: string;
  dayPattern: string;
  seatsFilled: number;
  maxSeats: number;
  mode: string;
  schedule: string;
}

interface AvailabilityData {
  weekly: { day: number; blocks: { start: number; end: number }[] }[];
  travelBufferMin: number;
}

interface Block {
  key: string;
  start: number;
  end: number;
  title: string;
  sub: string;
  mode: "online" | "home" | "group";
  state?: string;
}

const DAY_START = 8 * 60; // 08:00
const DAY_END = 22 * 60; // 22:00
const PX_PER_MIN = 52 / 60;

function minutesOf(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Greedy column packer for overlapping blocks. */
function packOverlaps(items: Block[]): (Block & { col: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (Block & { col: number; cols: number })[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    const placed = cluster.map((it) => {
      let col = colEnds.findIndex((e) => e <= it.start);
      if (col === -1) col = colEnds.length;
      colEnds[col] = it.end;
      return { it, col };
    });
    for (const p of placed) out.push({ ...p.it, col: p.col, cols: colEnds.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

const MODE_STYLE: Record<Block["mode"], { bg: string; label: string }> = {
  online: { bg: "linear-gradient(180deg,#33549E,#14246B)", label: "Online 1:1" },
  home: { bg: "linear-gradient(180deg,#FFA24D,#E97414)", label: "Home visit" },
  group: { bg: "linear-gradient(180deg,#46BD85,#1F9D68)", label: "Group class" },
};

export function TTimetable() {
  const { setView, user } = useAppStore();
  const [bookings, setBookings] = useState<BookingItem[] | null>(null);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [bRes, aRes, batchRes] = await Promise.all([
        fetch("/api/bookings"),
        fetch("/api/tutor/availability"),
        fetch("/api/batches").catch(() => null),
      ]);
      const bJson = await bRes.json();
      if (!bRes.ok) throw new Error(bJson?.error?.message || "Could not load the timetable.");
      setBookings((Array.isArray(bJson?.data) ? bJson.data : []) as BookingItem[]);
      if (aRes.ok) {
        const aJson = await aRes.json();
        setAvailability({ weekly: aJson?.data?.weekly ?? [], travelBufferMin: aJson?.data?.travelBufferMin ?? 15 });
      }
      if (batchRes && batchRes.ok) {
        const batchJson = await batchRes.json();
        setBatches((Array.isArray(batchJson?.data) ? batchJson.data : []) as BatchItem[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the timetable.");
      setBookings([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const week = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - now.getDay()); // Sunday
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    return { start, days, todayIndex: now.getDay() };
  }, []);

  const dayBlocks = useMemo(() => {
    if (!bookings) return Array.from({ length: 7 }, () => [] as Block[]);
    const weekEnd = new Date(week.days[6]);
    weekEnd.setDate(weekEnd.getDate() + 1);
    const inWeek = bookings.filter((b) => {
      if (!["accepted", "in_progress", "completed", "released"].includes(b.state)) return false;
      const d = new Date(b.startAt);
      return d >= week.start && d < weekEnd;
    });
    const byDay: Block[][] = Array.from({ length: 7 }, () => []);
    for (const b of inWeek) {
      const d = new Date(b.startAt);
      const dayIdx = d.getDay();
      const start = minutesOf(b.startAt);
      const endRaw = minutesOf(b.endAt);
      // handle sessions that spill past midnight — keep them on the start day
      const end = endRaw > start ? endRaw : Math.min(DAY_END, start + 45);
      byDay[dayIdx].push({
        key: b.id,
        start,
        end,
        title: b.subject,
        sub: b.student?.name ?? "Student",
        mode: (b.mode === "home" ? "home" : b.mode === "group" ? "group" : "online") as Block["mode"],
        state: b.state,
      });
    }
    // my group batches (weekly pattern)
    for (const batch of batches.filter((x) => x.tutorId === user?.id)) {
      try {
        const pattern = JSON.parse(batch.dayPattern || "[]") as { day: number; start: number; end: number }[];
        for (const slot of pattern) {
          if (slot.day < 0 || slot.day > 6) continue;
          byDay[slot.day].push({
            key: batch.id + "-" + slot.day,
            start: slot.start,
            end: slot.end,
            title: batch.subject + " group",
            sub: `${batch.seatsFilled}/${batch.maxSeats} seats`,
            mode: "group",
          });
        }
      } catch {
        /* skip malformed pattern */
      }
    }
    return byDay;
  }, [bookings, batches, week, user?.id]);

  const availByDay = useMemo(() => {
    const map = new Map<number, { start: number; end: number }[]>();
    for (const w of availability?.weekly ?? []) map.set(w.day, w.blocks);
    return map;
  }, [availability]);

  const travelPairs = useMemo(() => {
    // consecutive home visits on the same day with a gap under 2h get a travel chip
    const pairs: { day: number; at: number; gap: number }[] = [];
    dayBlocks.forEach((blocks, day) => {
      const homes = blocks.filter((b) => b.mode === "home").sort((a, b) => a.start - b.start);
      for (let i = 0; i < homes.length - 1; i++) {
        const gap = homes[i + 1].start - homes[i].end;
        if (gap > 0 && gap < 120) pairs.push({ day, at: homes[i].end + gap / 2, gap });
      }
    });
    return pairs;
  }, [dayBlocks]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = week.todayIndex >= 0 && nowMin >= DAY_START && nowMin <= DAY_END;
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN;
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);
  const totalSessions = dayBlocks.reduce((s, d) => s + d.length, 0);
  const rangeLabel = `${week.days[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${week.days[6].toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Weekly timetable</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {rangeLabel} · {totalSessions} session{totalSessions === 1 ? "" : "s"} + group batches · travel-chained home visits
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="sk-btn sk-btn-ghost sk-btn-sm"
            onClick={async () => {
              try {
                const flat = dayBlocks.flatMap((blocks, day) =>
                  blocks.map((b) => ({
                    day,
                    startMin: b.start,
                    endMin: b.end,
                    subject: b.title,
                    mode: b.mode,
                    tutor: b.sub,
                    title: b.title,
                  }))
                );
                await pdfTimetable({ ownerName: user?.name ?? "Tutor", weekLabel: rangeLabel, blocks: flat });
                toast({ title: "Timetable PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
              } catch {
                toast({ title: "Could not build the PDF", variant: "destructive" });
              }
            }}
          >
            <Printer className="w-3.5 h-3.5" /> Print timetable
          </button>
          <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setView("t-availability")}>
            <PencilLine className="w-3.5 h-3.5" /> Edit availability
          </button>
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

      {!bookings ? (
        <LoadingView label="Building your week…" />
      ) : totalSessions === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={CalendarRange}
            title="Nothing on this week's board"
            sub="Accepted sessions and group batches for this week will appear here. Check Requests to grow your week."
            action={
              <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setView("t-requests")}>
                Review requests
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* legend */}
          <div className="flex items-center gap-2.5 flex-wrap text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[4px]" style={{ background: MODE_STYLE.online.bg }} /> Online 1:1
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[4px]" style={{ background: MODE_STYLE.home.bg }} /> Home visit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[4px]" style={{ background: MODE_STYLE.group.bg }} /> Group batch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-[4px] border border-[#C9D7F8]"
                style={{ background: "repeating-linear-gradient(135deg, rgba(49,91,229,.10) 0 4px, rgba(49,91,229,.03) 4px 8px)" }}
              />{" "}
              Availability
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="sk-pill sk-pill-orange !py-0.5 !px-2">
                <Car className="w-3 h-3" /> Travel
              </span>{" "}
              buffer {availability?.travelBufferMin ?? 15} min between home visits
            </span>
          </div>

          {/* grid */}
          <div className="sk-card p-4 overflow-x-auto sk-scroll">
            <div className="min-w-[900px]">
              {/* day headers */}
              <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: "56px repeat(7, minmax(112px, 1fr))" }}>
                <div />
                {week.days.map((d, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-2 py-1.5 text-center ${i === week.todayIndex ? "bg-[#EDF2FE] border border-[#C9D7F8]" : ""}`}
                  >
                    <div className={`text-[11px] font-semibold uppercase tracking-wide ${i === week.todayIndex ? "text-brand-navy" : "text-muted-foreground"}`}>
                      {WEEKDAYS[i]}
                    </div>
                    <div className={`text-[14px] font-bold tabular ${i === week.todayIndex ? "text-brand-navy" : ""}`}>
                      {d.getDate()}
                    </div>
                  </div>
                ))}
              </div>

              {/* body */}
              <div className="grid gap-1.5 relative" style={{ gridTemplateColumns: "56px repeat(7, minmax(112px, 1fr))" }}>
                {/* hour labels */}
                <div className="relative" style={{ height: gridHeight }}>
                  {hours.map((h) => (
                    <div key={h} className="absolute right-1 text-[10.5px] text-muted-foreground tabular -translate-y-1/2" style={{ top: (h - DAY_START) * PX_PER_MIN }}>
                      {minutesToLabel(h)}
                    </div>
                  ))}
                </div>

                {week.days.map((_, dayIdx) => {
                  const blocks = packOverlaps(
                    dayBlocks[dayIdx].filter((b) => b.end > DAY_START && b.start < DAY_END).map((b) => ({
                      ...b,
                      start: Math.max(b.start, DAY_START),
                      end: Math.min(b.end, DAY_END),
                    }))
                  );
                  const avail = (availByDay.get(dayIdx) ?? []).filter((x) => x.end > DAY_START && x.start < DAY_END);
                  const travel = travelPairs.filter((t) => t.day === dayIdx);
                  return (
                    <div
                      key={dayIdx}
                      className={`relative rounded-xl border ${dayIdx === week.todayIndex ? "border-[#C9D7F8] bg-[#F6F9FF]" : "border-border bg-[#FBFCFE]"}`}
                      style={{ height: gridHeight }}
                    >
                      {/* hour lines */}
                      {hours.map((h) => (
                        <div key={h} className="absolute left-0 right-0 border-t border-dashed border-[#E3E9F4]" style={{ top: (h - DAY_START) * PX_PER_MIN }} />
                      ))}

                      {/* availability stripes */}
                      {avail.map((a, i) => (
                        <div
                          key={"av" + i}
                          className="absolute left-0 right-0 rounded-lg"
                          style={{
                            top: (a.start - DAY_START) * PX_PER_MIN,
                            height: Math.max(6, (a.end - a.start) * PX_PER_MIN),
                            background: "repeating-linear-gradient(135deg, rgba(49,91,229,.10) 0 5px, rgba(49,91,229,.03) 5px 10px)",
                            border: "1px dashed rgba(49,91,229,.25)",
                          }}
                          title={`Available ${minutesToLabel(a.start)} – ${minutesToLabel(a.end)}`}
                        />
                      ))}

                      {/* now line */}
                      {showNow && dayIdx === week.todayIndex && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top: (nowMin - DAY_START) * PX_PER_MIN }}
                        >
                          <div className="h-[2px] bg-[#F47B20] rounded-full" />
                        </div>
                      )}

                      {/* travel chips */}
                      {travel.map((t, i) => (
                        <button
                          key={"tv" + i}
                          className="absolute z-10 left-1/2 -translate-x-1/2 -translate-y-1/2 sk-pill sk-pill-orange !py-0.5 !px-2 !text-[10px] whitespace-nowrap"
                          style={{ top: (t.at - DAY_START) * PX_PER_MIN }}
                          title={`Gap between home visits — scheduler reserves your ${availability?.travelBufferMin ?? 15} min travel buffer`}
                          onClick={() =>
                            toast({
                              title: "Travel buffer",
                              description: `The scheduler chains home visits with a ${availability?.travelBufferMin ?? 15}-minute buffer — you can tune it in Availability.`,
                            })
                          }
                        >
                          🚗 Travel {availability?.travelBufferMin ?? 15} min
                        </button>
                      ))}

                      {/* session blocks */}
                      {blocks.map((b) => (
                        <button
                          key={b.key}
                          className="absolute z-10 rounded-lg px-1.5 py-1 text-left overflow-hidden text-white shadow-md hover:brightness-110 transition"
                          style={{
                            top: (b.start - DAY_START) * PX_PER_MIN,
                            height: Math.max(18, (b.end - b.start) * PX_PER_MIN - 2),
                            left: `calc(${(b.col / b.cols) * 100}% + 2px)`,
                            width: `calc(${100 / b.cols}% - 4px)`,
                            background: MODE_STYLE[b.mode].bg,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,.3), 0 2px 6px rgba(20,36,107,.25)",
                          }}
                          onClick={() =>
                            toast({
                              title: b.title,
                              description: `${minutesToLabel(b.start)} – ${minutesToLabel(b.end)} · ${b.sub} · ${MODE_STYLE[b.mode].label}`,
                            })
                          }
                        >
                          <div className="text-[10px] font-bold leading-tight truncate">{b.title}</div>
                          {(b.end - b.start) * PX_PER_MIN > 30 && (
                            <div className="text-[9.5px] opacity-90 leading-tight truncate">{b.sub}</div>
                          )}
                          {(b.end - b.start) * PX_PER_MIN > 52 && (
                            <div className="text-[9px] opacity-80 leading-tight tabular">{minutesToLabel(b.start)}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sk-callout sk-callout-info flex items-start gap-2">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Blocks show your confirmed sessions and group batches for this week. Home visits are chained to minimise
              travel — the scheduler uses your buffer between visits, and availability windows show as pale stripes.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
