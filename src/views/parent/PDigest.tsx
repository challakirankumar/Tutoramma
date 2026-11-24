"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { Newspaper, MessageCircle, Copy, Printer, CalendarDays, BookOpen, Timer, Layers, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Digest {
  childId: string;
  name: string;
  grade: string;
  from: string;
  to: string;
  sessions: { id: string; subject: string; title: string; tutor: string; at: string; state: string; mode: string }[];
  attended: number;
  topics: string[];
  homework: { total: number; done: number; items: { title: string; subject: string; status: string; score: number | null; dueAt: string }[] };
  tests: { title: string; pct: number; at: string }[];
  quizAvg: number | null;
  focusMin: number;
  cards: number;
  maya: number;
  next: { subject: string; tutor: string; at: string; mode: string } | null;
  highlights: string[];
  nextStep: string;
  share: string;
}

/** Weekly Parent Digest / Progress Reel (spec §30). */
export function PDigest() {
  const [children, setChildren] = useState<{ id: string; name: string; grade: string }[]>([]);
  const [child, setChild] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [d, setD] = useState<Digest | null | undefined>(undefined);
  const load = useCallback((cid: string, w: number) => {
    setD(undefined);
    fetch(`/api/parent/digest?weeks=${w}${cid ? `&childId=${cid}` : ""}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setChildren(j.data.children);
      setD(j.data.digest);
      if (j.data.digest) setChild(j.data.digest.childId);
    }).catch(() => setD(null));
  }, []);
  useEffect(() => load("", 1), [load]);

  const range = d ? `${new Date(d.from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(d.to).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "";

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="core"
        icon={Newspaper}
        title="Weekly Digest"
        subtitle="Attendance, topics, homework and habits — in plain language, ready to share on WhatsApp."
        pills={range ? [{ label: range, tone: "info" }] : []}
        actions={
          <>
            {children.length > 1 && <select className="sk-input !w-auto !py-2 !rounded-full" value={child} onChange={(e) => load(e.target.value, weeks)}>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            <div className="sk-segment">{[1, 4].map((w) => <button key={w} className={clsx("sk-segment-item", weeks === w && "sk-segment-item-active")} onClick={() => { setWeeks(w); load(child, w); }}>{w === 1 ? "Week" : "Month reel"}</button>)}</div>
          </>
        }
      />
      {d === undefined ? <LoadingView /> : d === null ? <div className="sk-card p-4"><EmptyState icon={Newspaper} title="No child linked yet" sub="Add a child in My Children to receive a weekly digest." /></div> : (
        <>
          <div className="rounded-[24px] p-6 sm:p-8 text-white relative overflow-hidden" id="digest-card" style={{ background: "radial-gradient(600px 300px at 90% 0%, rgba(242,107,29,.35), transparent 60%), linear-gradient(135deg,#1B2F79,#142366 55%,#0E1A52)" }}>
            <div className="text-[11px] font-bold tracking-[.16em] text-[#FFC27A]">{weeks === 1 ? "THIS WEEK" : "THIS MONTH"} · {range.toUpperCase()}</div>
            <div className="font-display text-[32px] sm:text-[40px] font-extrabold leading-tight mt-1">{d.name.split(" ")[0]}&apos;s {weeks === 1 ? "week" : "month"} in learning</div>
            <div className="flex flex-wrap gap-2 mt-4">{d.highlights.length ? d.highlights.map((h) => <span key={h} className="px-3 py-1.5 rounded-full bg-white/12 border border-white/15 text-[13px] font-semibold">{h}</span>) : <span className="text-white/70 text-[13px]">A quiet week — no sessions recorded yet.</span>}</div>
            {d.topics.length > 0 && <div className="mt-4 text-[14px] text-white/80">Covered: <b className="text-white">{d.topics.slice(0, 5).join(" · ")}</b></div>}
            <div className="mt-5 rounded-2xl bg-white/10 p-4 flex items-start gap-3"><Sparkles className="w-5 h-5 text-[#FFC27A] shrink-0 mt-0.5" /><div><div className="text-[12px] font-bold text-[#FFC27A]">NEXT STEP</div><div className="text-[14.5px]">{d.nextStep}</div></div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1FAF5B] text-white text-[13px] font-bold" href={`https://wa.me/?text=${encodeURIComponent(d.share)}`} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" /> Share on WhatsApp</a>
            <HeaderButton onClick={() => { navigator.clipboard.writeText(d.share); toast({ title: "Digest copied" }); }}><Copy className="w-3.5 h-3.5" /> Copy text</HeaderButton>
            <HeaderButton onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</HeaderButton>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AccentKpi label="Sessions attended" value={`${d.attended}/${d.sessions.length}`} tone="navy" />
            <AccentKpi label="Homework done" value={`${d.homework.done}/${d.homework.total}`} tone="green" />
            <AccentKpi label="Quiz average" value={d.quizAvg != null ? `${d.quizAvg}%` : "—"} />
            <AccentKpi label="Focus minutes" value={d.focusMin} tone="purple" sub={`${d.cards} flashcards · ${d.maya} AI tutor chats`} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="sk-card p-5">
              <div className="text-[15px] font-extrabold text-[#142366] flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Sessions</div>
              {!d.sessions.length ? <p className="text-[12.5px] text-muted-foreground mt-2">No sessions in this period.</p> : d.sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2.5 border-b last:border-0 text-[13px]" style={{ borderColor: "var(--border)" }}>
                  <span className="w-12 text-[11.5px] text-muted-foreground">{new Date(s.at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}</span>
                  <div className="flex-1 min-w-0"><b className="truncate block">{s.title}</b><span className="text-[11.5px] text-muted-foreground">{s.tutor} · {s.mode}</span></div>
                  <span className={clsx("px-2 py-[2px] rounded-full text-[10.5px] font-bold capitalize", ["completed", "released"].includes(s.state) ? "bg-[#E6F6EE] text-[#1F7A55]" : "bg-[#EEF2FA] text-[#57627F]")}>{s.state.replace("_", " ")}</span>
                </div>
              ))}
              {d.next && <div className="mt-3 rounded-xl bg-[#FFF6EE] p-3 text-[12.5px] flex items-center gap-2"><ArrowRight className="w-4 h-4 text-[#F26B1D]" /> Next: <b>{d.next.subject}</b> with {d.next.tutor} · {new Date(d.next.at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>}
            </div>
            <div className="space-y-4">
              <div className="sk-card p-5">
                <div className="text-[15px] font-extrabold text-[#142366] flex items-center gap-2"><BookOpen className="w-4 h-4" /> Homework</div>
                {!d.homework.items.length ? <p className="text-[12.5px] text-muted-foreground mt-2">No homework due.</p> : d.homework.items.map((h, k) => (
                  <div key={k} className="flex justify-between py-2 border-b last:border-0 text-[13px]" style={{ borderColor: "var(--border)" }}><span>{h.title}</span><span className={h.status === "assigned" ? "text-[#D9580E] font-semibold" : "text-[#1F7A55] font-semibold"}>{h.status === "graded" && h.score != null ? `${h.score}/100` : h.status}</span></div>
                ))}
              </div>
              <div className="sk-card p-5">
                <div className="text-[15px] font-extrabold text-[#142366] flex items-center gap-2"><Timer className="w-4 h-4" /> Study habits</div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="sk-well p-2.5"><div className="text-[18px] font-extrabold tabular">{d.focusMin}</div><div className="text-[10.5px] text-muted-foreground">focus min</div></div>
                  <div className="sk-well p-2.5"><div className="text-[18px] font-extrabold tabular flex items-center justify-center gap-1"><Layers className="w-4 h-4" />{d.cards}</div><div className="text-[10.5px] text-muted-foreground">cards</div></div>
                  <div className="sk-well p-2.5"><div className="text-[18px] font-extrabold tabular">{d.tests.length}</div><div className="text-[10.5px] text-muted-foreground">quizzes</div></div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
