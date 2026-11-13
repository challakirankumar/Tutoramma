"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  Trophy,
  Zap,
  Flame,
  Lock,
  RefreshCw,
  ShieldAlert,
  Medal,
  Eye,
  Target,
} from "lucide-react";

/* ---------------- types ---------------- */
interface DashData {
  xp: number;
  level: number;
  streak: number;
  badges: string[];
  leaderboardOptIn: boolean;
  leaderboard: { rank: number; id: string; name: string; color: string; xp: number; level: number; isMe: boolean }[];
}

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const XP_PER_LEVEL = 400;
const BADGE_POOL = [
  "Homework Hero",
  "7-Day Streak",
  "Quick Thinker",
  "Rising Star",
  "Science Star",
  "Maths Whiz",
  "Perfect Score",
  "Team Player",
  "Bookworm",
  "Exam Ready",
  "Goal Getter",
  "Level 5 Club",
];

function anonymize(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0] ?? "Student";
  const initial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : "";
  return `${first} ${initial}`.trim();
}

/* ---------------- view ---------------- */
export function SRewards() {
  const { user } = useAppStore();
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState("");
  const [optIn, setOptIn] = useState(false); // default OFF — the leaderboard is opt-in
  const [savingOptIn, setSavingOptIn] = useState(false);

  const load = () => {
    getJson<DashData>("/api/student/dashboard")
      .then((d) => {
        setError("");
        setData(d);
        setOptIn(!!d.leaderboardOptIn);
      })
      .catch((e) => setError(e.message || "Couldn't load your rewards."));
  };

  useEffect(load, []);

  const toggleOptIn = async (v: boolean) => {
    const prev = optIn;
    setOptIn(v);
    setSavingOptIn(true);
    try {
      const res = await fetch("/api/student/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaderboardOptIn: v }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) throw new Error(json?.error?.message || "Couldn't update your visibility.");
      toast({
        title: v ? "You're on the board 🏆" : "You're now hidden",
        description: v
          ? "Classmates can see your first name and XP on the leaderboard."
          : "Your name is hidden — your XP still counts privately.",
      });
      load();
    } catch (e) {
      setOptIn(prev);
      toast({
        title: "Couldn't update visibility",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingOptIn(false);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your rewards"
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
  if (!data) return <LoadingView label="Loading your rewards…" />;

  const xpIntoLevel = data.xp - (data.level - 1) * XP_PER_LEVEL;
  const xpPct = Math.min(100, Math.round((xpIntoLevel / XP_PER_LEVEL) * 100));
  const unlocked = new Set(data.badges);
  const locked = BADGE_POOL.filter((b) => !unlocked.has(b));

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Rewards</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Earn XP for homework, tests and classes — level up and unlock badges.
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <Trophy className="w-3 h-3" /> Level {data.level}
        </span>
      </div>

      {/* ---------- XP hero ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="sk-card p-6 lg:col-span-2 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#33549E 0%,#1B2F79 55%,#14246B 100%)" }}
        >
          <div className="flex items-center gap-5 relative z-10">
            <div
              className="sk-avatar shrink-0"
              style={{ width: 74, height: 74, borderRadius: 24, fontSize: 20, background: "linear-gradient(180deg,#FFD86B,#E8A20C)" }}
              aria-label={`Level ${data.level}`}
            >
              <span className="text-[#5C3A00]">L{data.level}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[19px] font-extrabold">
                {data.xp.toLocaleString()} XP <span className="text-white/70 text-[13px] font-semibold">total</span>
              </div>
              <div className="text-[12.5px] text-white/75 mt-0.5">
                {Math.max(0, XP_PER_LEVEL - xpIntoLevel)} XP to Level {data.level + 1}
              </div>
              <div className="mt-3" style={{ backgroundColor: "rgba(255,255,255,0.16)", height: 10, borderRadius: 999, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(4, xpPct)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(180deg,#FFD86B,#F5A623)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
                    transition: "width .5s cubic-bezier(.22,1,.36,1)",
                  }}
                  role="progressbar"
                  aria-valuenow={xpPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress to level ${data.level + 1}`}
                />
              </div>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className="sk-pill sk-pill-orange">
                  <Zap className="w-3 h-3" /> {xpPct}% to next level
                </span>
                <span className="sk-pill sk-pill-green">
                  <Medal className="w-3 h-3" /> {unlocked.size} badge{unlocked.size === 1 ? "" : "s"} earned
                </span>
              </div>
            </div>
          </div>
          <Trophy className="absolute -right-5 -bottom-7 w-44 h-44 text-white/[0.07] rotate-[-12deg]" />
        </div>

        {/* streak */}
        <div className="sk-card p-6 flex flex-col items-center justify-center text-center gap-2.5">
          <div
            className="sk-avatar"
            style={{ width: 62, height: 62, borderRadius: 20, background: "linear-gradient(180deg,#FFA24D,#E76E0F)" }}
          >
            <Flame className="w-8 h-8" />
          </div>
          <div className="text-[24px] font-extrabold tabular leading-none">{data.streak}</div>
          <div className="text-[12.5px] text-muted-foreground -mt-1">day streak</div>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Submit homework or take a quick test every day to keep the flame alive.
          </p>
        </div>
      </div>

      {/* ---------- badges ---------- */}
      <div className="sk-card p-5">
        <SectionTitle
          title="Badges"
          sub={`${unlocked.size} earned · ${locked.length} to go`}
          right={<span className="sk-pill sk-pill-grey"><Target className="w-3 h-3" /> {BADGE_POOL.length} total</span>}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mt-4">
          {BADGE_POOL.map((b) => {
            const has = unlocked.has(b);
            return (
              <div
                key={b}
                className={`rounded-2xl p-3.5 flex flex-col items-center gap-2 text-center ${
                  has ? "sk-card-flat" : "sk-well opacity-80"
                }`}
              >
                <span
                  className="sk-avatar"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: has
                      ? ["#14246B", "#F47B20", "#1F9D68", "#315BE5", "#E8A20C"][b.length % 5]
                      : "linear-gradient(180deg,#D4DCEC,#AAB8D8)",
                  }}
                >
                  {has ? <Medal className="w-5 h-5" /> : <Lock className="w-4 h-4 text-[#57627F]" />}
                </span>
                <span className={`text-[11.5px] font-semibold leading-tight ${has ? "" : "text-muted-foreground"}`}>{b}</span>
                {!has && <span className="text-[10px] text-muted-foreground">Locked</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- leaderboard ---------- */}
      <div className="sk-card p-5">
        <SectionTitle
          title="Class Leaderboard"
          sub="Top XP earners across Tutor Amma this term"
          right={
            <label className="flex items-center gap-2.5 cursor-pointer select-none" aria-label="Appear on the leaderboard">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-[12px] font-semibold">Appear on the leaderboard</span>
              <Switch checked={optIn} onCheckedChange={toggleOptIn} disabled={savingOptIn} />
            </label>
          }
        />
        <p className="text-[11.5px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
          <Lock className="w-3 h-3" />
          The leaderboard is opt-in — only students who choose to appear are listed. Only first name + initial is ever
          shown — never your photo, school or contact details. You can opt out any time.
        </p>
        {!optIn && (
          <div className="sk-well px-3 py-2 mt-3 text-[12px] text-muted-foreground inline-flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            You're currently not listed. Flip the switch above to appear on the class leaderboard.
          </div>
        )}
        {data.leaderboard.length === 0 ? (
          <div className="sk-well px-4 py-3.5 mt-4 text-[12.5px] text-muted-foreground">
            No classmates are on the board yet — the leaderboard is opt-in, so it fills up as students choose to appear.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto sk-scroll">
            <table className="w-full text-[13px] min-w-[460px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left py-2.5 pr-3 font-bold">Rank</th>
                  <th className="text-left py-2.5 pr-3 font-bold">Student</th>
                  <th className="text-right py-2.5 pr-3 font-bold">Level</th>
                  <th className="text-right py-2.5 font-bold">XP</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((row) => {
                  const me = row.isMe;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border/60 ${me ? "text-white" : ""}`}
                      style={me ? { background: "linear-gradient(90deg,#33549E,#14246B)" } : undefined}
                    >
                      <td className="py-2.5 pr-3">
                        {row.rank <= 3 ? (
                          <span
                            className="sk-avatar"
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 9,
                              fontSize: 11,
                              background:
                                row.rank === 1
                                  ? "linear-gradient(180deg,#FFD86B,#E8A20C)"
                                  : row.rank === 2
                                    ? "linear-gradient(180deg,#D8DEEB,#AAB6D0)"
                                    : "linear-gradient(180deg,#E8A87C,#C07840)",
                              color: "#3A2A00",
                            }}
                          >
                            {row.rank}
                          </span>
                        ) : (
                          <span className="tabular font-semibold">{row.rank}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold">
                        {anonymize(row.name)}
                        {me && <span className="sk-pill sk-pill-orange ml-2">You</span>}
                      </td>
                      <td className={`py-2.5 pr-3 text-right tabular ${me ? "" : "text-muted-foreground"}`}>L{row.level}</td>
                      <td className="py-2.5 text-right tabular font-bold">{row.xp.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {user && !data.leaderboard.some((r) => r.isMe) && (
          <p className="text-[11.5px] text-muted-foreground mt-3">
            {optIn
              ? "Keep earning XP — the top 8 students make the board, and you're closing in!"
              : "Your XP still counts privately — opt in above whenever you'd like to compete publicly."}
          </p>
        )}
      </div>
    </div>
  );
}
