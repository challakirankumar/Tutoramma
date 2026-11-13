"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Layers, Timer, CalendarClock, ArrowRight, Sparkles } from "lucide-react";

interface Pulse {
  due: number;
  focusToday: number;
  streak: number;
  planDone: number;
  planTotal: number;
  todayTasks: number;
  examName?: string;
  daysLeft?: number;
}

/** Student dashboard strip: due flashcards, focus minutes and today's revision tasks at a glance. */
export function LearningPulse() {
  const { setView } = useAppStore();
  const [p, setP] = useState<Pulse | null>(null);

  useEffect(() => {
    const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => r.json()).then((j) => j?.data).catch(() => null);
    Promise.all([get("/api/flashcards"), get("/api/focus"), get("/api/planner")]).then(([f, fo, pl]) => {
      const today = new Date().toISOString().slice(0, 10);
      const plan = pl?.plan;
      const day = plan?.days?.find((d: { date: string }) => d.date === today);
      setP({
        due: f?.totals?.due ?? 0,
        focusToday: fo?.todayMinutes ?? 0,
        streak: fo?.streak ?? 0,
        planDone: plan?.progress?.done ?? 0,
        planTotal: plan?.progress?.total ?? 0,
        todayTasks: day ? day.tasks.filter((t: { done: boolean }) => !t.done).length : 0,
        examName: plan?.examName,
        daysLeft: plan ? Math.max(0, Math.ceil((new Date(plan.examDate).getTime() - Date.now()) / 86400000)) : undefined,
      });
    });
  }, []);

  if (!p) return <div className="h-[92px] rounded-[18px] ta-shimmer" aria-hidden />;

  const tiles = [
    {
      id: "s-flashcards",
      icon: Layers,
      tone: "linear-gradient(180deg,#5A83F0,#315BE5)",
      title: p.due ? `${p.due} cards due` : "Cards all caught up",
      sub: p.due ? "Review now before you forget" : "Make a new deck from any chapter",
    },
    {
      id: "s-focus",
      icon: Timer,
      tone: "linear-gradient(180deg,#FFA24D,#E76E0F)",
      title: `${p.focusToday} min focused today`,
      sub: p.streak ? `${p.streak}-day focus streak 🔥` : "Start a 25-minute block",
    },
    {
      id: "s-planner",
      icon: CalendarClock,
      tone: "linear-gradient(180deg,#46BD85,#1F9D68)",
      title: p.examName ? `${p.daysLeft} days to ${p.examName}` : "Plan your exam revision",
      sub: p.examName ? `${p.todayTasks} task${p.todayTasks === 1 ? "" : "s"} left today · ${p.planTotal ? Math.round((p.planDone / p.planTotal) * 100) : 0}% done` : "Smart day-by-day schedule",
    },
  ];

  return (
    <div className="sk-card p-4">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Sparkles className="w-4 h-4 text-[#F47B20]" />
        <span className="text-[13px] font-bold">Learning pulse</span>
        <span className="text-[11px] text-muted-foreground">— your study toolkit at a glance</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {tiles.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} className="sk-card-flat !rounded-2xl p-3 flex items-center gap-3 text-left hover:border-[#B9C6E4] transition-colors group">
            <span className="sk-avatar shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: t.tone }}>
              <t.icon className="w-[18px] h-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold truncate">{t.title}</span>
              <span className="block text-[11.5px] text-muted-foreground truncate">{t.sub}</span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>
    </div>
  );
}
