"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { KpiCard } from "@/components/shared/KpiCard";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import {
  kwd,
  timeOf,
  dateOf,
  dateTimeOf,
  fromNow,
  untilLabel,
  MODE_LABEL,
  STAGE_PILL,
} from "@/lib/format";
import {
  CalendarCheck,
  Lock,
  Wallet,
  Home as HomeIcon,
  BookOpenCheck,
  Flame,
  ShieldCheck,
  MapPin,
  Search,
  ClipboardList,
  Receipt,
  FileText,
  Bell,
  RefreshCw,
  ShieldAlert,
  ChevronRight,
  Star,
} from "lucide-react";

/* ---------- types ---------- */
interface ChildCard {
  id: string;
  name: string;
  color: string;
  grade: string;
  board: string;
  school: string;
  xp: number;
  level: number;
  streak: number;
  masteryAvg: number | null;
  topicCount: number;
  homeworkDue: number;
  lastTest: { title: string; subject: string; score: number; total: number; takenAt: string } | null;
  nextBooking: {
    id: string;
    title: string;
    subject: string;
    mode: string;
    startAt: string;
    endAt: string;
    tutor: { id: string; name: string; avatarColor: string };
  } | null;
}
interface HomeSessionCard {
  sessionId: string;
  stage: string;
  startAt: string;
  endAt: string;
  subject: string;
  title: string;
  tutor: { id: string; name: string; avatarColor: string } | null;
  student: { id: string; name: string; avatarColor: string } | null;
  destArea: string;
}
interface DashData {
  children: ChildCard[];
  kpis: { activeBookings: number; escrowHeld: number; monthSpend: number; homeSessionsThisWeek: number };
  homeSessions: HomeSessionCard[];
  alerts: { id: string; type: string; severity: string; message: string; at: string }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const SEVERITY_TONE: Record<string, { tone: "red" | "orange" | "grey"; label: string }> = {
  critical: { tone: "red", label: "Critical" },
  warning: { tone: "orange", label: "Warning" },
  info: { tone: "grey", label: "Info" },
};

export function PDashboard() {
  const { user, setView } = useAppStore();
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getJson<DashData>("/api/parent/dashboard")
      .then((d) => setData(d))
      .catch((e) => setError(e.message || "Could not load your dashboard."));
  }, []);

  const retry = () => {
    setError("");
    getJson<DashData>("/api/parent/dashboard")
      .then((d) => setData(d))
      .catch((e) => setError(e.message || "Could not load your dashboard."));
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";

  if (error && !data) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your dashboard"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary" onClick={retry}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading your family dashboard…" />;

  const todayStr = new Date().toDateString();
  const todayHome = data.homeSessions.filter((s) => new Date(s.startAt).toDateString() === todayStr);
  const liveNow = todayHome.find((s) => s.stage === "enroute" || s.stage === "in_progress") ?? null;
  const laterToday = !liveNow ? todayHome[0] ?? null : null;
  const kidNames =
    data.children.length > 0
      ? data.children.map((c) => c.name.split(" ")[0]).join(" and ")
      : "your children";

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Welcome back, {firstName}</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Here's how {kidNames} {data.children.length === 1 ? "is" : "are"} doing this week — sessions, safety and spend at
            a glance.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="sk-btn sk-btn-orange" onClick={() => setView("p-find")}>
            <Search className="w-4 h-4" /> Find a tutor
          </button>
          <button className="sk-btn sk-btn-ghost" onClick={() => setView("p-bookings")}>
            <ClipboardList className="w-4 h-4" /> Bookings
          </button>
        </div>
      </div>

      {/* ---------- family KPIs ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active bookings"
          value={data.kpis.activeBookings}
          sub="requested · accepted · live"
          icon={CalendarCheck}
          tone="navy"
        />
        <KpiCard
          label="Escrow held"
          value={kwd(data.kpis.escrowHeld)}
          sub="released after each session"
          icon={Lock}
          tone="royal"
        />
        <KpiCard
          label="This month spend"
          value={kwd(data.kpis.monthSpend)}
          sub={new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          icon={Wallet}
          tone="orange"
        />
        <KpiCard
          label="Home visits today"
          value={todayHome.length}
          sub="OTP check-in · live tracking"
          icon={HomeIcon}
          tone="green"
        />
      </div>

      {/* ---------- children + safety ---------- */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <SectionTitle title="Your children" sub="Tap a card for the full progress view" />
          {data.children.length === 0 ? (
            <div className="sk-card p-4">
              <EmptyState
                icon={BookOpenCheck}
                title="No children linked yet"
                sub="Student accounts linked to your email will appear here."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.children.map((c) => {
                const nb = c.nextBooking;
                return (
                  <div key={c.id} className="sk-card p-5">
                    <div className="flex items-start gap-3">
                      <AvatarTile name={c.name} color={c.color} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[15px]">{c.name}</span>
                          <span className="sk-pill sk-pill-grey">{c.grade}</span>
                          <span className="sk-pill sk-pill-blue">{c.board}</span>
                        </div>
                        <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{c.school}</p>
                      </div>
                    </div>

                    <div className="sk-well p-3 mt-3.5 text-[12.5px]">
                      {nb ? (
                        <div className="flex items-center gap-2">
                          <CalendarCheck className="w-4 h-4 text-brand-navy shrink-0" />
                          <span className="min-w-0">
                            <span className="font-semibold">{nb.subject}</span> with {nb.tutor.name} ·{" "}
                            {MODE_LABEL[nb.mode] ?? nb.mode}
                            <span className="text-muted-foreground">
                              {" "}
                              — {dateOf(nb.startAt)}, {timeOf(nb.startAt)} ({untilLabel(nb.startAt)})
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarCheck className="w-4 h-4 shrink-0" /> No upcoming sessions booked
                        </div>
                      )}
                    </div>

                    <div className="mt-3.5">
                      <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wide">
                          Learning passport
                        </span>
                        <span className="font-bold tabular">
                          {c.masteryAvg !== null ? `${c.masteryAvg}% avg` : "No topics yet"}
                        </span>
                      </div>
                      <div className="sk-progress-track">
                        <div className="sk-progress-fill" style={{ width: `${c.masteryAvg ?? 0}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="sk-pill sk-pill-orange">
                          <BookOpenCheck className="w-3 h-3" /> {c.homeworkDue} homework due
                        </span>
                        <span className="sk-pill sk-pill-green">
                          <Flame className="w-3 h-3" /> {c.streak}-day streak
                        </span>
                        {c.lastTest && (
                          <span className="sk-pill sk-pill-navy">
                            <Star className="w-3 h-3" /> Last test {c.lastTest.score}/{c.lastTest.total}
                          </span>
                        )}
                      </div>
                      <button
                        className="sk-btn sk-btn-ghost sk-btn-sm"
                        onClick={() => setView("p-children", { childId: c.id })}
                      >
                        View progress <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* safety today */}
        <div className="space-y-4">
          <SectionTitle title="Safety today" sub="Home visits under live supervision" />
          {liveNow ? (
            <div className="sk-card p-5 border-[#F5CFA0]" style={{ background: "linear-gradient(180deg, #FFF9F0, #FFFDF9)" }}>
              <div className="flex items-center justify-between gap-2">
                <StatusPill tone={pillFor(STAGE_PILL, liveNow.stage).cls}>
                  {pillFor(STAGE_PILL, liveNow.stage).label}
                </StatusPill>
                <span className="text-[11.5px] text-muted-foreground">{untilLabel(liveNow.startAt)}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <AvatarTile name={liveNow.tutor?.name ?? "Tutor"} color={liveNow.tutor?.avatarColor ?? "#14246B"} size={42} />
                <div className="min-w-0">
                  <div className="font-bold text-[14px]">{liveNow.tutor?.name}</div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {liveNow.subject} · {liveNow.student?.name} · {timeOf(liveNow.startAt)}
                  </div>
                </div>
              </div>
              <div className="sk-well p-2.5 mt-3 text-[12px] flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-brand-orange shrink-0" />
                <span>{liveNow.destArea || "Home visit"} · OTP check-in &amp; 150 m geofence active</span>
              </div>
              <button className="sk-btn sk-btn-orange w-full mt-3" onClick={() => setView("p-tracking")}>
                <MapPin className="w-4 h-4" /> Open live tracking
              </button>
            </div>
          ) : laterToday ? (
            <div className="sk-card p-5">
              <div className="flex items-center justify-between gap-2">
                <StatusPill tone={pillFor(STAGE_PILL, laterToday.stage).cls}>
                  {pillFor(STAGE_PILL, laterToday.stage).label}
                </StatusPill>
                <span className="text-[11.5px] text-muted-foreground">starts {timeOf(laterToday.startAt)}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <AvatarTile name={laterToday.tutor?.name ?? "Tutor"} color={laterToday.tutor?.avatarColor ?? "#14246B"} size={42} />
                <div className="min-w-0">
                  <div className="font-bold text-[14px]">{laterToday.tutor?.name}</div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {laterToday.subject} · {laterToday.student?.name} · {timeOf(laterToday.startAt)}
                  </div>
                </div>
              </div>
              <div className="sk-well p-2.5 mt-3 text-[12px] flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#1F9D68] shrink-0" />
                <span>{laterToday.destArea || "Home visit"} · tracking activates automatically 15 min before</span>
              </div>
              <button className="sk-btn sk-btn-primary w-full mt-3" onClick={() => setView("p-tracking")}>
                <MapPin className="w-4 h-4" /> Open live tracking
              </button>
            </div>
          ) : (
            <div className="sk-card p-5">
              <div className="sk-callout sk-callout-info flex gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">No home visits in progress</div>
                  <div className="mt-0.5">
                    Tracking activates automatically 15 minutes before each home session — you'll get a notification when
                    the tutor is on the way.
                  </div>
                </div>
              </div>
              <button className="sk-btn sk-btn-ghost w-full mt-3" onClick={() => setView("p-safety")}>
                <ShieldCheck className="w-4 h-4" /> Review safety &amp; consent
              </button>
            </div>
          )}

          {/* recent alerts */}
          <SectionTitle title="Recent alerts" sub="Latest safety events for your family" />
          <div className="sk-card p-2">
            {data.alerts.length === 0 ? (
              <EmptyState icon={Bell} title="No alerts" sub="Safety notifications for your family will appear here." />
            ) : (
              <ul className="divide-y divide-border/70 max-h-80 overflow-y-auto sk-scroll">
                {data.alerts.map((a) => {
                  const sev = SEVERITY_TONE[a.severity] ?? SEVERITY_TONE.info;
                  return (
                    <li key={a.id} className="p-3 flex items-start gap-2.5">
                      <span className={`sk-pill sk-pill-${sev.tone} mt-0.5`}>{sev.label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] leading-snug">{a.message}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{fromNow(a.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ---------- quick actions ---------- */}
      <div className="sk-card p-4">
        <SectionTitle title="Quick actions" sub="Jump straight to what parents need most" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
          {[
            { icon: Search, label: "Find a tutor", view: "p-find", cls: "sk-btn-orange" },
            { icon: ClipboardList, label: "Manage bookings", view: "p-bookings", cls: "" },
            { icon: Receipt, label: "Wallet & invoices", view: "p-wallet", cls: "" },
            { icon: FileText, label: "Weekly reports", view: "p-reports", cls: "" },
            { icon: ShieldCheck, label: "Safety & consent", view: "p-safety", cls: "" },
          ].map((a) => (
            <button
              key={a.view}
              className={`sk-btn ${a.cls || "sk-btn-ghost"} w-full flex-col !gap-1.5 !py-4`}
              onClick={() => setView(a.view)}
            >
              <a.icon className="w-5 h-5" />
              <span className="text-[12px]">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
