"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { timeOf, dateOf, untilLabel, dateTimeOf, MODE_LABEL, WEEKDAYS } from "@/lib/format";
import {
  CalendarDays,
  Video,
  MapPin,
  Users,
  ShieldAlert,
  RefreshCw,
  ChevronRight,
  Clock,
  Printer,
} from "lucide-react";
import { pdfTimetable } from "@/lib/pdf";
import { toast } from "@/hooks/use-toast";

/* ---------- types ---------- */
interface BookingRow {
  id: string;
  title: string;
  subject: string;
  mode: string;
  state: string;
  startAt: string;
  endAt: string;
  tutor?: { id?: string; name?: string; color?: string };
  student?: { id?: string; name?: string; color?: string };
}
interface ChildLite {
  id: string;
  name: string;
  color: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const CHILD_PALETTE = ["#14246B", "#F47B20", "#315BE5", "#1F9D68", "#9A7EDB", "#E06A9B"];

function sundayOf(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function PTimetable() {
  const { setView, user } = useAppStore();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [children, setChildren] = useState<ChildLite[]>([]);
  const [error, setError] = useState("");
  const [childFilter, setChildFilter] = useState("all");
  const [weekOffset, setWeekOffset] = useState(0);

  const load = () => {
    setError("");
    getJson<BookingRow[]>("/api/bookings")
      .then((d) => setBookings(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message || "Couldn't load the timetable."));
  };

  useEffect(load, []);
  useEffect(() => {
    getJson<{ children: ChildLite[] }>("/api/parent/children")
      .then((d) => setChildren(d.children ?? []))
      .catch(() => setChildren([]));
  }, []);

  // child color = palette by index (Aarav navy, Ananya orange, …)
  const childColor = useMemo(() => {
    const map = new Map<string, string>();
    children.forEach((c, i) => map.set(c.id, CHILD_PALETTE[i % CHILD_PALETTE.length]));
    return map;
  }, [children]);
  const colorFor = (id?: string) => (id && childColor.get(id)) || "#315BE5";

  const weekStart = useMemo(() => {
    const s = sundayOf(new Date());
    s.setDate(s.getDate() + weekOffset * 7);
    return s;
  }, [weekOffset]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart]
  );

  const active = (bookings ?? []).filter((b) => ["accepted", "in_progress"].includes(b.state));

  const weekBookings = active.filter((b) => {
    if (childFilter !== "all" && b.student?.id !== childFilter) return false;
    const t = new Date(b.startAt).getTime();
    return t >= weekStart.getTime() && t < weekStart.getTime() + 7 * 86_400_000;
  });

  const byDay = weekDays.map((day) =>
    weekBookings
      .filter((b) => new Date(b.startAt).getDay() === day.getDay())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  );

  const upcoming = active
    .filter((b) => new Date(b.startAt).getTime() > Date.now() && (childFilter === "all" || b.student?.id === childFilter))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 6);

  const todayIdx = weekOffset === 0 ? new Date().getDay() : -1;

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load the timetable"
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
  if (!bookings) return <LoadingView label="Loading the family timetable…" />;

  const weekLabel =
    weekOffset === 0
      ? "This week"
      : weekOffset === 1
        ? "Next week"
        : `${dateOf(weekStart)} – ${dateOf(new Date(weekStart.getTime() + 6 * 86_400_000))}`;

  const printBlocks = weekBookings.map((b) => {
    const s = new Date(b.startAt);
    const e = new Date(b.endAt);
    return {
      day: s.getDay(),
      startMin: s.getHours() * 60 + s.getMinutes(),
      endMin: Math.max(e.getHours() * 60 + e.getMinutes(), s.getHours() * 60 + s.getMinutes() + 30),
      subject: b.subject,
      mode: b.mode,
      tutor: b.tutor?.name ?? "Tutor",
      title: `${b.title}${b.student?.name ? ` — ${b.student.name.split(" ")[0]}` : ""}`,
    };
  });

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Family Timetable</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            One calendar for every child's confirmed sessions — colour-coded per child.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="sk-btn sk-btn-ghost sk-btn-sm"
            onClick={async () => {
              try {
                await pdfTimetable({ ownerName: user?.name ? `${user.name} (family)` : "Family", weekLabel, blocks: printBlocks });
                toast({ title: "Timetable PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
              } catch {
                toast({ title: "Could not build the PDF", variant: "destructive" });
              }
            }}
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <div className="flex items-center gap-1.5 sk-segment p-1">
            <button className="sk-segment-item sk-segment-item-active px-3 py-1.5" onClick={() => setWeekOffset(0)}>
              This week
            </button>
            <button className="sk-segment-item px-3 py-1.5" onClick={() => setWeekOffset(1)}>
              Next week
            </button>
          </div>
        </div>
      </div>

      {/* ---------- child filter + legend ---------- */}
      <div className="sk-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Show</span>
          <button
            className={`sk-chip ${childFilter === "all" ? "sk-chip-active" : ""}`}
            onClick={() => setChildFilter("all")}
          >
            All children
          </button>
          {children.map((c) => (
            <button
              key={c.id}
              className={`sk-chip ${childFilter === c.id ? "sk-chip-active" : ""}`}
              onClick={() => setChildFilter(c.id)}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: colorFor(c.id) }} />
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-muted-foreground">
          {children.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorFor(c.id) }} />
              {c.name.split(" ")[0]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-[#C3CDE6]" /> requested/past (not shown)
          </span>
        </div>
      </div>

      {/* ---------- weekly grid ---------- */}
      <div className="sk-card p-4">
        <SectionTitle
          title={weekLabel}
          sub={`${dateOf(weekStart)} – ${dateOf(new Date(weekStart.getTime() + 6 * 86_400_000))} · confirmed sessions only`}
        />
        <div className="overflow-x-auto sk-scroll mt-3.5 -mx-1 px-1">
          <div className="grid grid-cols-7 min-w-[820px] gap-2">
            {weekDays.map((day, i) => {
              const isToday = i === todayIdx;
              return (
                <div key={i} className="min-w-0">
                  <div
                    className={`text-center rounded-xl py-2 mb-2 ${isToday ? "" : "sk-well"}`}
                    style={isToday ? { background: "linear-gradient(180deg,#33549E,#14246B)", color: "#fff", boxShadow: "0 3px 8px rgba(20,36,107,.35)" } : undefined}
                  >
                    <div className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? "" : "text-muted-foreground"}`}>
                      {WEEKDAYS[i]}
                    </div>
                    <div className="text-[13px] font-extrabold tabular">{day.getDate()}</div>
                  </div>
                  <div className="space-y-2">
                    {byDay[i].length === 0 ? (
                      <div className="sk-well h-16 flex items-center justify-center text-[10.5px] text-muted-foreground/70">
                        —
                      </div>
                    ) : (
                      byDay[i].map((b) => {
                        const color = colorFor(b.student?.id);
                        return (
                          <div
                            key={b.id}
                            className="rounded-xl p-2.5 border"
                            style={{
                              background: `linear-gradient(180deg, ${color}14, ${color}0a)`,
                              borderColor: `${color}55`,
                            }}
                          >
                            <div className="flex items-center gap-1 text-[10.5px] font-bold tabular" style={{ color }}>
                              <Clock className="w-3 h-3" />
                              {timeOf(b.startAt)}–{timeOf(b.endAt)}
                            </div>
                            <div className="text-[11.5px] font-bold mt-1 leading-tight">{b.subject}</div>
                            <div className="text-[10.5px] text-muted-foreground mt-0.5 leading-tight">
                              {b.tutor?.name?.split(" ")[0]} · {b.mode === "home" ? "Home" : b.mode === "group" ? "Group" : "Online"}
                            </div>
                            <div className="flex items-center gap-1 mt-1.5">
                              <span
                                className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                                style={{ background: color }}
                              >
                                {b.student?.name?.split(" ")[0]}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {weekBookings.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title={`Nothing scheduled ${weekOffset === 0 ? "this week" : "that week"} yet`}
            sub="Confirmed sessions appear here automatically — try Next week, or book a new session."
            action={
              <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => setView("p-find")}>
                Book a session
              </button>
            }
          />
        )}
      </div>

      {/* ---------- upcoming list ---------- */}
      <div className="sk-card p-5">
        <SectionTitle title="Coming up next" sub="The next confirmed sessions across the family" />
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No upcoming sessions" sub="Book a session to fill the week." />
        ) : (
          <ul className="divide-y divide-border/70 mt-1">
            {upcoming.map((b) => (
              <li key={b.id} className="py-3 flex items-center gap-3 first:pt-2 last:pb-0">
                <span className="w-2 h-9 rounded-full shrink-0" style={{ background: colorFor(b.student?.id) }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">
                    {b.subject} · {b.title}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="font-semibold">{b.student?.name}</span>·<span>{b.tutor?.name}</span>·
                    <span className="flex items-center gap-1">
                      {b.mode === "home" ? <MapPin className="w-3 h-3" /> : b.mode === "group" ? <Users className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                      {MODE_LABEL[b.mode] ?? b.mode}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-bold">{dateTimeOf(b.startAt).split(" · ")[0]}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {timeOf(b.startAt)} · {untilLabel(b.startAt)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sk-callout sk-callout-info flex gap-2.5">
        <CalendarDays className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Requested sessions only appear once the tutor accepts. Keep an eye on{" "}
          <button className="underline font-semibold" onClick={() => setView("p-bookings")}>
            Bookings
          </button>{" "}
          for pending requests.
        </div>
      </div>
    </div>
  );
}
