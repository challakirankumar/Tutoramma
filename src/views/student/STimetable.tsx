"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { minutesToLabel, WEEKDAYS, MODE_LABEL } from "@/lib/format";
import {
  CalendarDays,
  Video,
  MapPin,
  Users,
  RefreshCw,
  ShieldAlert,
  Info,
  Printer,
} from "lucide-react";
import { pdfTimetable } from "@/lib/pdf";
import { useAppStore } from "@/stores/app-store";

/* ---------------- types ---------------- */
interface Booking {
  id: string;
  title: string;
  subject: string;
  mode: string;
  state: string;
  startAt: string;
  endAt: string;
  batchId: string | null;
  tutor: { id: string; name: string; color: string } | null;
}
interface Batch {
  id: string;
  subject: string;
  mode: string;
  dayPattern: { day: number; start: number; end: number }[];
  tutor: { id: string; name: string; color: string };
  joined: boolean;
}
interface Block {
  key: string;
  day: number;
  startMin: number;
  endMin: number;
  subject: string;
  mode: string;
  tutor: string;
  title: string;
}

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const HOURS = [15, 16, 17, 18, 19, 20, 21];
const ACTIVE_STATES = ["accepted", "in_progress", "completed"];

const MODE_STYLE: Record<string, { bg: string; icon: typeof Video }> = {
  online: { bg: "linear-gradient(180deg,#33549E,#14246B)", icon: Video },
  home: { bg: "linear-gradient(180deg,#FFA24D,#E76E0F)", icon: MapPin },
  group: { bg: "linear-gradient(180deg,#46BD85,#1F9D68)", icon: Users },
};

/* ---------------- view ---------------- */
export function STimetable() {
  const { user } = useAppStore();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    Promise.all([getJson<Booking[]>("/api/bookings"), getJson<Batch[]>("/api/batches")])
      .then(([bk, bt]) => {
        setError("");
        setBookings(bk);
        setBatches(bt);
      })
      .catch((e) => setError(e.message || "Couldn't load your timetable."));
  };

  useEffect(load, []);

  /* week window: Sunday 00:00 → Saturday 23:59 (local) */
  const week = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }, []);

  const blocks = useMemo<Block[]>(() => {
    if (!bookings || !batches) return [];
    const out: Block[] = [];
    for (const b of bookings) {
      const s = new Date(b.startAt);
      if (!ACTIVE_STATES.includes(b.state)) continue;
      if (s < week.start || s >= week.end) continue;
      const e = new Date(b.endAt);
      out.push({
        key: b.id,
        day: s.getDay(),
        startMin: s.getHours() * 60 + s.getMinutes(),
        endMin: Math.max(e.getHours() * 60 + e.getMinutes(), s.getHours() * 60 + s.getMinutes() + 30),
        subject: b.subject,
        mode: b.mode,
        tutor: b.tutor?.name?.split(" ")[0] ?? "Tutor",
        title: b.title,
      });
    }
    for (const batch of batches) {
      if (!batch.joined) continue;
      for (const p of batch.dayPattern ?? []) {
        out.push({
          key: `${batch.id}-${p.day}`,
          day: p.day,
          startMin: p.start,
          endMin: p.end,
          subject: batch.subject,
          mode: "group",
          tutor: batch.tutor?.name?.split(" ")[0] ?? "Tutor",
          title: `${batch.subject} group`,
        });
      }
    }
    return out.sort((a, b) => a.day - b.day || a.startMin - b.startMin);
  }, [bookings, batches, week]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your timetable"
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
  if (!bookings || !batches) return <LoadingView label="Loading your weekly timetable…" />;

  const today = new Date().getDay();
  const weekLabel = `${week.start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(week.end.getTime() - 1).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;

  const dayBlocks = (day: number) => blocks.filter((b) => b.day === day);

  const renderBlock = (b: Block, compact = false) => {
    const style = MODE_STYLE[b.mode] ?? MODE_STYLE.online;
    const Icon = style.icon;
    return (
      <div
        key={b.key}
        className="rounded-xl px-2.5 py-2 text-white shadow-sm min-w-0"
        style={{ background: style.bg }}
        title={`${b.title} · ${b.tutor} · ${MODE_LABEL[b.mode] ?? b.mode}`}
      >
        <div className="flex items-center gap-1.5 text-[10.5px] font-bold tabular opacity-90">
          <Icon className="w-3 h-3 shrink-0" />
          {minutesToLabel(b.startMin)}–{minutesToLabel(b.endMin)}
        </div>
        <div className="text-[12px] font-bold truncate mt-0.5">{b.subject}</div>
        {!compact && <div className="text-[10.5px] opacity-85 truncate">with {b.tutor}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Timetable</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Your week of {weekLabel} — classes from {minutesToLabel(HOURS[0] * 60)} to {minutesToLabel((HOURS[HOURS.length - 1] + 1) * 60)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="sk-btn sk-btn-ghost sk-btn-sm"
            onClick={async () => {
              try {
                await pdfTimetable({ ownerName: user?.name ?? "Student", weekLabel, blocks });
                toast({ title: "Timetable PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
              } catch {
                toast({ title: "Could not build the PDF", variant: "destructive" });
              }
            }}
          >
            <Printer className="w-3.5 h-3.5" /> Print timetable
          </button>
          <span className="sk-pill sk-pill-navy">
            <CalendarDays className="w-3 h-3" /> {blocks.length} session{blocks.length === 1 ? "" : "s"} this week
          </span>
        </div>
      </div>

      {/* ---------- legend ---------- */}
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: MODE_STYLE.online.bg }} /> Online 1:1
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: MODE_STYLE.home.bg }} /> Home visit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: MODE_STYLE.group.bg }} /> Group class
        </span>
        <span className="text-muted-foreground ml-auto flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Read-only — changes go through your tutor
        </span>
      </div>

      {/* ---------- desktop grid ---------- */}
      <div className="sk-card p-4 overflow-x-auto sk-scroll hidden lg:block">
        {blocks.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No classes this week"
            sub="Book a session or join a group and it will show up here automatically."
          />
        ) : (
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[52px_repeat(7,1fr)] gap-1">
              {/* day header row */}
              <div />
              {WEEKDAYS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center rounded-xl py-2 ${
                    i === today ? "text-white shadow-md" : "sk-well"
                  }`}
                  style={i === today ? { background: "linear-gradient(180deg,#33549E,#14246B)" } : undefined}
                >
                  <div className={`text-[12px] font-extrabold ${i === today ? "" : "text-brand-navy"}`}>{d}</div>
                  <div className={`text-[10.5px] tabular ${i === today ? "text-white/75" : "text-muted-foreground"}`}>
                    {new Date(week.start.getTime() + i * 86400000).getDate()}
                    {i === today && <span className="ml-1 font-bold">· Today</span>}
                  </div>
                </div>
              ))}

              {/* hour rows */}
              {HOURS.map((h) => (
                <div key={h} className="contents">
                  <div className="text-[11px] font-semibold text-muted-foreground text-right pr-2 pt-1.5 tabular">
                    {minutesToLabel(h * 60)}
                  </div>
                  {WEEKDAYS.map((_, day) => {
                    const cell = dayBlocks(day).filter((b) => Math.floor(b.startMin / 60) === h);
                    const isToday = day === today;
                    return (
                      <div
                        key={day}
                        className={`rounded-xl min-h-[58px] p-1 flex flex-col gap-1 ${
                          isToday ? "bg-[#315BE5]/[0.06] ring-1 ring-[#315BE5]/25" : "bg-[#F3F6FC] dark:bg-[#141B36]"
                        }`}
                      >
                        {cell.map((b) => renderBlock(b))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- mobile: stacked day cards ---------- */}
      <div className="lg:hidden space-y-3">
        {blocks.length === 0 ? (
          <div className="sk-card p-6">
            <EmptyState
              icon={CalendarDays}
              title="No classes this week"
              sub="Book a session or join a group and it will show up here automatically."
            />
          </div>
        ) : (
          WEEKDAYS.map((d, i) => {
            const dayList = dayBlocks(i);
            if (!dayList.length) return null;
            return (
              <div key={d} className="sk-card p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className={`font-extrabold text-[14px] ${i === today ? "text-brand-navy" : ""}`}>
                    {d} {new Date(week.start.getTime() + i * 86400000).getDate()}
                  </span>
                  {i === today && <span className="sk-pill sk-pill-navy">Today</span>}
                </div>
                <div className="space-y-2">
                  {dayList.map((b) => renderBlock(b, true))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
