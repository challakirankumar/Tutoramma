"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { KpiCard } from "@/components/shared/KpiCard";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { kwd, dateTimeOf, untilLabel, fromNow, MODE_LABEL } from "@/lib/format";
import {
  CalendarCheck,
  Gauge,
  Zap,
  Flame,
  Search,
  Award,
  Target,
  ClipboardCheck,
  BookOpenCheck,
  ShieldAlert,
  RefreshCw,
  ChevronRight,
  GraduationCap,
} from "lucide-react";

/* ---------- types ---------- */
interface ChildPack {
  id: string;
  name: string;
  color: string;
  profile: { grade: string; board: string; school: string };
  xp: number;
  level: number;
  streak: number;
  attendancePct: number | null;
  completedSessions: number;
  missedSessions: number;
  mastery: { subject: string; avg: number; topics: { topic: string; mastery: number }[] }[];
  masteryAvg: number | null;
  recentTests: { id: string; title: string; subject: string; score: number; total: number; takenAt: string }[];
  upcoming: {
    id: string;
    title: string;
    subject: string;
    mode: string;
    startAt: string;
    endAt: string;
    tutor: { id: string; name: string; avatarColor: string } | null;
  }[];
  goals: string[];
  badges: string[];
  weakTopics: string[];
  examDate: string | null;
}
interface ChildrenData {
  children: ChildPack[];
  addresses: { id: string; label: string; area: string; line1: string }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

export function PChildren() {
  const { context, setView } = useAppStore();
  const [data, setData] = useState<ChildrenData | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>("");

  const load = () => {
    setError("");
    getJson<ChildrenData>("/api/parent/children")
      .then((d) => {
        setData(d);
        setSelected((prev) => prev || d.children[0]?.id || "");
      })
      .catch((e) => setError(e.message || "Could not load your children."));
  };

  useEffect(load, []);
  useEffect(() => {
    const ctxChild = typeof context.childId === "string" ? context.childId : "";
    if (ctxChild) setSelected(ctxChild);
  }, [context.childId]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load progress"
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
  if (!data) return <LoadingView label="Loading your children's progress…" />;

  if (data.children.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <div className="sk-card p-6">
          <EmptyState
            icon={GraduationCap}
            title="No children linked to your account"
            sub="Student accounts created with your email appear here automatically."
          />
        </div>
      </div>
    );
  }

  const child = data.children.find((c) => c.id === selected) ?? data.children[0];
  const examDays = child.examDate ? Math.ceil((new Date(child.examDate).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-5">
      <PageHeader onBook={() => setView("p-find")} />

      {/* ---------- child switcher ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.children.map((c) => {
          const active = c.id === child.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`sk-card p-4 flex items-center gap-3 text-left transition-all hover:-translate-y-0.5 ${
                active ? "ring-2 ring-[#14246B] ring-offset-2 ring-offset-background" : ""
              }`}
              aria-pressed={active}
            >
              <AvatarTile name={c.name} color={c.color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[13.5px] truncate">{c.name}</div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  {c.profile.grade} · {c.profile.board}
                </div>
              </div>
              {active && <ChevronRight className="w-4 h-4 text-brand-navy shrink-0" />}
            </button>
          );
        })}
        <button
          className="sk-card p-4 flex items-center gap-3 text-left border-dashed hover:-translate-y-0.5 transition-all"
          onClick={() => setView("p-find")}
        >
          <div className="sk-avatar bg-gradient-to-b from-[#FFA24D] to-[#E76E0F] text-white flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Search className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[13.5px]">Book extra session</div>
            <div className="text-[11.5px] text-muted-foreground">Find a verified tutor</div>
          </div>
        </button>
      </div>

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Attendance"
          value={child.attendancePct !== null ? `${child.attendancePct}%` : "—"}
          sub={`${child.completedSessions} completed · ${child.missedSessions} missed`}
          icon={ClipboardCheck}
          tone="navy"
        />
        <KpiCard
          label="Mastery average"
          value={child.masteryAvg !== null ? `${child.masteryAvg}%` : "—"}
          sub={`${child.mastery.reduce((s, m) => s + m.topics.length, 0)} passport topics`}
          icon={Gauge}
          tone="royal"
        />
        <KpiCard label="XP · Level" value={`${child.xp} XP`} sub={`Level ${child.level}`} icon={Zap} tone="orange" />
        <KpiCard
          label="Streak"
          value={`${child.streak} days`}
          sub={examDays !== null && examDays > 0 ? `${examDays} days to exam` : "Keep it going!"}
          icon={Flame}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ---------- mastery by subject ---------- */}
        <div className="xl:col-span-2 sk-card p-5">
          <SectionTitle
            title="Mastery by subject"
            sub="Learning passport — updated after every session, test and homework"
          />
          {child.mastery.length === 0 ? (
            <EmptyState icon={Gauge} title="No mastery data yet" sub="Topics appear as your child completes sessions." />
          ) : (
            <div className="space-y-5 mt-4 max-h-[430px] overflow-y-auto sk-scroll pr-1">
              {child.mastery.map((m) => (
                <div key={m.subject}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-[13px]">{m.subject}</span>
                    <span className="sk-pill sk-pill-blue">{m.avg}% avg</span>
                  </div>
                  <div className="space-y-2.5">
                    {m.topics.map((t) => (
                      <div key={t.topic}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="text-muted-foreground truncate pr-3">{t.topic}</span>
                          <span className="font-semibold tabular shrink-0">{t.mastery}%</span>
                        </div>
                        <div className="sk-progress-track">
                          <div
                            className={`sk-progress-fill ${t.mastery >= 75 ? "sk-progress-fill-green" : t.mastery < 55 ? "sk-progress-fill-orange" : ""}`}
                            style={{ width: `${t.mastery}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- right column: tests, upcoming, goals, badges ---------- */}
        <div className="space-y-4">
          <div className="sk-card p-5">
            <SectionTitle title="Recent tests" sub="Latest assessments across subjects" />
            {child.recentTests.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No tests yet" />
            ) : (
              <ul className="space-y-3 mt-3.5">
                {child.recentTests.map((t) => {
                  const pct = Math.round((t.score / t.total) * 100);
                  return (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-2 text-[12.5px] mb-1">
                        <span className="font-semibold truncate">{t.title}</span>
                        <span className="tabular font-bold shrink-0">
                          {t.score}/{t.total}
                        </span>
                      </div>
                      <div className="sk-progress-track">
                        <div
                          className={`sk-progress-fill ${pct >= 75 ? "sk-progress-fill-green" : pct < 50 ? "sk-progress-fill-orange" : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {t.subject} · {fromNow(t.takenAt)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="sk-card p-5">
            <SectionTitle title="Upcoming sessions" sub="Confirmed with tutors" />
            {child.upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Nothing booked"
                sub="Find a tutor to keep the momentum going."
                action={
                  <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => setView("p-find")}>
                    <Search className="w-3.5 h-3.5" /> Find a tutor
                  </button>
                }
              />
            ) : (
              <ul className="space-y-2.5 mt-3.5">
                {child.upcoming.map((u) => (
                  <li key={u.id} className="sk-well p-3 flex items-center gap-3">
                    <AvatarTile name={u.tutor?.name ?? "Tutor"} color={u.tutor?.avatarColor ?? "#315BE5"} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold truncate">{u.subject} · {u.tutor?.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {dateTimeOf(u.startAt)} · {MODE_LABEL[u.mode] ?? u.mode}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-brand-navy shrink-0">{untilLabel(u.startAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sk-card p-5">
            <SectionTitle title="Goals" sub="Set with the tutor, checked weekly" />
            {child.goals.length === 0 ? (
              <EmptyState icon={Target} title="No goals set yet" />
            ) : (
              <ul className="space-y-2 mt-3.5">
                {child.goals.map((g, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
                    <Target className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sk-card p-5">
            <SectionTitle title="Badges" sub="Earned through XP and streaks" />
            {child.badges.length === 0 ? (
              <EmptyState icon={Award} title="No badges yet" sub="Badges unlock as XP grows." />
            ) : (
              <div className="flex flex-wrap gap-2 mt-3.5">
                {child.badges.map((b) => (
                  <span key={b} className="sk-pill sk-pill-orange">
                    <Award className="w-3 h-3" /> {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ onBook }: { onBook: () => void }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">My Children</h1>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Progress, mastery and goals for each child — straight from their sessions, tests and homework.
        </p>
      </div>
      <button className="sk-btn sk-btn-orange" onClick={onBook}>
        <BookOpenCheck className="w-4 h-4" /> Book extra session
      </button>
    </div>
  );
}
