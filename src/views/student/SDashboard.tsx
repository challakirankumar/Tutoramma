"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { KpiCard } from "@/components/shared/KpiCard";
import { toast } from "@/hooks/use-toast";
import { timeOf, dateOf, untilLabel, MODE_LABEL } from "@/lib/format";
import {
  CalendarClock,
  Zap,
  BookOpenCheck,
  Flame,
  Video,
  MapPin,
  Search,
  Users,
  Trophy,
  MessageSquare,
  CalendarDays,
  RefreshCw,
  ShieldAlert,
  Target,
  Link2,
  GraduationCap,
  Star,
} from "lucide-react";

/* ---------------- types ---------------- */
interface DashData {
  student: { id: string; name: string; grade: string; board: string; school: string };
  xp: number;
  level: number;
  streak: number;
  daysToExam: number | null;
  examDate: string | null;
  sprintTopics: string[];
  suggestedPlan: string;
  kpis: { upcomingSessions: number; homeworkDue: number; xp: number; streak: number };
  nextBooking: {
    id: string;
    title: string;
    subject: string;
    mode: string;
    startAt: string;
    endAt: string;
    meetUrl: string | null;
    addressId: string | null;
    tutor: { id: string; name: string; color: string; phone: string | null } | null;
  } | null;
  passport: { subject: string; avg: number; topics: { topic: string; mastery: number }[] }[];
  leaderboard: { rank: number; id: string; name: string; color: string; xp: number; level: number; isMe: boolean }[];
}
interface HomeworkRow {
  id: string;
  title: string;
  subject: string;
  dueAt: string;
  xp: number;
  status: string;
}
interface BookingRow {
  id: string;
  mode: string;
  address: { id: string; label: string; area: string; line1: string } | null;
}

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const XP_PER_LEVEL = 400;

const SHORTCUTS: { id: string; label: string; icon: typeof Search; tone: string }[] = [
  { id: "s-find", label: "Find Tutors", icon: Search, tone: "#14246B" },
  { id: "s-groups", label: "Group Classes", icon: Users, tone: "#1F9D68" },
  { id: "s-homework", label: "Homework", icon: BookOpenCheck, tone: "#F47B20" },
  { id: "s-rewards", label: "Rewards", icon: Trophy, tone: "#E0A20C" },
  { id: "s-messages", label: "Messages", icon: MessageSquare, tone: "#315BE5" },
  { id: "s-timetable", label: "Timetable", icon: CalendarDays, tone: "#9A7EDB" },
];

/* ---------------- view ---------------- */
export function SDashboard() {
  const { user, setView } = useAppStore();
  const [data, setData] = useState<DashData | null>(null);
  const [due, setDue] = useState<HomeworkRow[]>([]);
  const [addresses, setAddresses] = useState<Record<string, BookingRow["address"]>>({});
  const [error, setError] = useState("");
  const [passportSubject, setPassportSubject] = useState("");
  const [joined, setJoined] = useState(false);

  const load = () => {
    Promise.all([
      getJson<DashData>("/api/student/dashboard"),
      getJson<{ homework: HomeworkRow[] }>("/api/homework"),
      getJson<(BookingRow & { [k: string]: unknown })[]>("/api/bookings"),
    ])
      .then(([dash, hw, bookings]) => {
        setError("");
        setData(dash);
        setDue(hw.homework.filter((h) => h.status === "assigned"));
        const addrMap: Record<string, BookingRow["address"]> = {};
        for (const b of bookings) if (b.address) addrMap[b.address.id] = b.address;
        setAddresses(addrMap);
        setPassportSubject((prev) => prev || dash.passport[0]?.subject || "");
      })
      .catch((e) => setError(e.message || "Couldn't load your dashboard."));
  };

  useEffect(load, []);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your dashboard"
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
  if (!data) return <LoadingView label="Loading your learning home…" />;

  const first = (user?.name ?? data.student.name).split(" ")[0];
  const nextB = data.nextBooking;
  const nextWhen = nextB
    ? `${dateOf(nextB.startAt) === dateOf(new Date()) ? "Today" : dateOf(nextB.startAt)} · ${timeOf(nextB.startAt)}`
    : "—";
  const xpIntoLevel = data.xp - (data.level - 1) * XP_PER_LEVEL;
  const xpPct = Math.min(100, Math.round((xpIntoLevel / XP_PER_LEVEL) * 100));
  const passport = data.passport.find((p) => p.subject === passportSubject) ?? data.passport[0];
  const nextArea = nextB?.addressId ? addresses[nextB.addressId]?.area : null;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">
            {greeting()}, {first}! <span className="inline-block">🔑</span>
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {data.student.grade} · {data.student.board} · {data.student.school}
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <Star className="w-3 h-3" /> Level {data.level} · {data.xp.toLocaleString()} XP
        </span>
      </div>

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Next class"
          value={nextB ? nextWhen : "None booked"}
          sub={nextB ? nextB.title : "Find a tutor to get started"}
          icon={CalendarClock}
          tone="royal"
        />
        <KpiCard
          label="XP / Level"
          value={`${data.xp.toLocaleString()} XP`}
          sub={`Level ${data.level} · ${Math.max(0, XP_PER_LEVEL - xpIntoLevel)} XP to Level ${data.level + 1}`}
          icon={Zap}
          tone="navy"
        />
        <KpiCard
          label="Homework due"
          value={String(data.kpis.homeworkDue)}
          sub={data.kpis.homeworkDue ? "Finish on time for XP" : "All caught up!"}
          icon={BookOpenCheck}
          tone="royal"
        />
        <KpiCard
          label="Streak"
          value={`${data.streak} day${data.streak === 1 ? "" : "s"}`}
          sub="Practice daily to grow it"
          icon={Flame}
          tone="orange"
        />
      </div>

      {/* ---------- next class ---------- */}
      <div className="sk-card p-5">
        {nextB ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              <AvatarTile name={nextB.tutor?.name ?? "Tutor"} color={nextB.tutor?.color ?? "#14246B"} size={48} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="sk-pill sk-pill-navy">{nextB.subject}</span>
                  <span className="sk-pill sk-pill-grey">{MODE_LABEL[nextB.mode] ?? nextB.mode}</span>
                </div>
                <div className="font-bold text-[15px] mt-1 truncate">{nextB.title}</div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">
                  with {nextB.tutor?.name ?? "your tutor"} · {nextWhen} – {timeOf(nextB.endAt)}
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-start sm:items-end gap-2">
              {nextB.mode === "online" ? (
                <>
                  <button
                    className="sk-btn sk-btn-orange"
                    onClick={() => {
                      setJoined(true);
                      toast({
                        title: "Joining class…",
                        description: "Your online classroom is opening (demo).",
                      });
                    }}
                  >
                    <Video className="w-4 h-4" /> Join class
                  </button>
                  {joined && nextB.meetUrl && (
                    <a
                      href={nextB.meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="sk-well rounded-xl px-3 py-2 text-[11.5px] flex items-center gap-2 max-w-full"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0 text-brand-navy" />
                      <span className="truncate">{nextB.meetUrl}</span>
                    </a>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <MapPin className="w-4 h-4 text-brand-orange" />
                    {nextArea ? (
                      <span>
                        Home visit · <span className="font-semibold text-foreground">{nextArea}</span>
                      </span>
                    ) : (
                      <span>Home visit · address shared with your tutor</span>
                    )}
                  </div>
                  <span className="sk-pill sk-pill-green">OTP check-in protected</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="No upcoming classes"
            sub="Book a verified tutor and your next session will appear here."
            action={
              <button className="sk-btn sk-btn-primary" onClick={() => setView("s-find")}>
                <Search className="w-4 h-4" /> Find a tutor
              </button>
            }
          />
        )}
      </div>

      {/* ---------- passport + exam sprint ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* learning passport */}
        <div className="sk-card p-5 lg:col-span-2">
          <SectionTitle
            title="Learning Passport"
            sub="Mastery per topic — updated after every session and quick test"
            right={<span className="sk-pill sk-pill-blue"><GraduationCap className="w-3 h-3" /> {data.passport.length} subjects</span>}
          />
          {data.passport.length === 0 ? (
            <EmptyState icon={Target} title="Passport is empty" sub="Topics unlock as you attend sessions and take tests." />
          ) : (
            <>
              <div className="sk-segment mt-4 overflow-x-auto max-w-full sk-scroll">
                {data.passport.map((p) => (
                  <button
                    key={p.subject}
                    className={`sk-segment-item ${passportSubject === p.subject ? "sk-segment-item-active" : ""}`}
                    onClick={() => setPassportSubject(p.subject)}
                  >
                    {p.subject}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-3.5 max-h-72 overflow-y-auto sk-scroll pr-1">
                {passport?.topics.map((t) => {
                  const weak = t.mastery < 60;
                  return (
                    <div key={t.topic}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[13px] font-semibold truncate">{t.topic}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {weak && <span className="sk-pill sk-pill-orange">Focus</span>}
                          <span className="text-[12px] font-bold tabular">{t.mastery}%</span>
                        </span>
                      </div>
                      <div className="sk-progress-track">
                        <div
                          className={`sk-progress-fill ${weak ? "sk-progress-fill-orange" : ""}`}
                          style={{ width: `${Math.max(3, t.mastery)}%` }}
                          role="progressbar"
                          aria-valuenow={t.mastery}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${t.topic} mastery`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* exam sprint */}
        <div className="sk-card p-5 flex flex-col">
          <SectionTitle title="Exam Sprint" sub="Your finals countdown" />
          {data.daysToExam == null ? (
            <EmptyState icon={Target} title="No exam date set" sub="Add your exam date with your tutor to unlock a sprint plan." />
          ) : (
            <div className="mt-4 flex flex-col gap-3.5 flex-1">
              <div className="sk-well rounded-2xl p-4 text-center">
                <div className="text-[30px] font-extrabold tabular text-brand-navy leading-none">{data.daysToExam}</div>
                <div className="text-[11.5px] text-muted-foreground mt-1.5">days to your exam</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.sprintTopics.map((t) => (
                  <span key={t} className="sk-pill sk-pill-orange">
                    <Target className="w-3 h-3" /> {t}
                  </span>
                ))}
              </div>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">{data.suggestedPlan}</p>
              <button
                className="sk-btn sk-btn-ghost mt-auto"
                onClick={() =>
                  toast({
                    title: "Sprint plan added",
                    description: "Focus sessions for your weak topics were added to your timetable plan (demo).",
                  })
                }
              >
                <CalendarDays className="w-4 h-4" /> Add sprint plan to timetable
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- homework due + shortcuts ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="sk-card p-5 lg:col-span-2">
          <SectionTitle
            title="Homework due"
            sub={due.length ? `${due.length} task${due.length === 1 ? "" : "s"} waiting for you` : "Nothing pending — nice work!"}
            right={
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("s-homework")}>
                View all
              </button>
            }
          />
          {due.length === 0 ? (
            <EmptyState icon={BookOpenCheck} title="All clear" sub="New homework appears here the moment your tutor assigns it." />
          ) : (
            <div className="mt-3 divide-y divide-border">
              {due.slice(0, 4).map((h) => (
                <button
                  key={h.id}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-white/60 rounded-xl px-2 -mx-2 transition-colors"
                  onClick={() => setView("s-homework")}
                >
                  <div className="sk-avatar shrink-0" style={{ width: 36, height: 36, borderRadius: 11, fontSize: 14, background: "linear-gradient(180deg,#FFA24D,#E76E0F)" }}>
                    <BookOpenCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[13.5px] truncate">{h.title}</div>
                    <div className="text-[11.5px] text-muted-foreground">{h.subject}</div>
                  </div>
                  <span className="sk-pill sk-pill-blue shrink-0 hidden sm:inline-flex">+{h.xp} XP</span>
                  <span className="sk-pill sk-pill-orange shrink-0">{untilLabel(h.dueAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* quick nav */}
        <div className="sk-card p-5">
          <SectionTitle title="Quick actions" sub="Jump straight in" />
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            {SHORTCUTS.map((s) => (
              <button
                key={s.id}
                className="sk-well rounded-2xl p-3 flex flex-col items-center gap-2 hover:brightness-[0.98] active:scale-[0.98] transition"
                onClick={() => setView(s.id)}
              >
                <span
                  className="sk-avatar"
                  style={{ width: 34, height: 34, borderRadius: 11, fontSize: 15, background: `linear-gradient(180deg, ${s.tone}dd, ${s.tone})` }}
                >
                  <s.icon className="w-4 h-4" />
                </span>
                <span className="text-[11.5px] font-semibold text-center leading-tight">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- leaderboard teaser ---------- */}
      <div className="sk-card p-5">
        <SectionTitle
          title="Class leaderboard"
          sub="Top XP earners this term"
          right={
            <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("s-rewards")}>
              <Trophy className="w-3.5 h-3.5" /> Rewards
            </button>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
          {data.leaderboard.slice(0, 6).map((row) => (
            <div
              key={row.id}
              className={`flex items-center gap-3 p-3 rounded-2xl ${
                row.isMe ? "text-white shadow-md" : "sk-well"
              }`}
              style={row.isMe ? { background: "linear-gradient(180deg,#33549E,#14246B)" } : undefined}
            >
              <span
                className={`sk-avatar shrink-0 ${row.rank <= 3 ? "" : "opacity-90"}`}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  fontSize: 13,
                  background:
                    row.rank === 1
                      ? "linear-gradient(180deg,#FFD86B,#E8A20C)"
                      : row.rank === 2
                        ? "linear-gradient(180deg,#D8DEEB,#AAB6D0)"
                        : row.rank === 3
                          ? "linear-gradient(180deg,#E8A87C,#C07840)"
                          : `linear-gradient(180deg, ${row.color}dd, ${row.color})`,
                }}
              >
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`font-semibold text-[13px] truncate ${row.isMe ? "text-white" : ""}`}>
                  {row.name.split(" ")[0]} {row.name.split(" ").slice(-1)[0]?.[0]}.
                  {row.isMe && <span className="sk-pill sk-pill-orange ml-2">You</span>}
                </div>
                <div className={`text-[11px] ${row.isMe ? "text-white/75" : "text-muted-foreground"}`}>
                  Level {row.level} · {row.xp.toLocaleString()} XP
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
