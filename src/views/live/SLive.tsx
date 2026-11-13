"use client";

/**
 * Tutor Amma — Live Classes (student).
 * See every live class scheduled for your group batches, join the running
 * room with one tap (waiting room until the teacher admits you), or open
 * a class via a link / join code.
 */
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { clsx } from "clsx";
import {
  Video, Radio, CalendarClock, Clock, Play, ShieldCheck, RefreshCw, Link2, Loader2, Users,
} from "lucide-react";

interface AttendanceRow { name: string; role: string; joinedAt: string; leftAt: string | null; durationMin: number; status: string }
interface LiveClassRow {
  id: string;
  title: string;
  subject: string;
  grade: string | null;
  agenda: string;
  batchTitle: string | null;
  scheduledAt: string;
  durationMin: number;
  code: string;
  slug: string;
  status: string;
  waitingRoom: boolean;
  attendance: { attendees?: AttendanceRow[] };
  tutor: { id: string; name: string; color: string };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

export function SLive() {
  const { user, setClassroom } = useAppStore();
  const [classes, setClasses] = useState<LiveClassRow[] | null>(null);
  const [error, setError] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  const load = useCallback(() => {
    getJson<LiveClassRow[]>("/api/live-classes")
      .then((d) => {
        setError("");
        setClasses(d);
      })
      .catch((e) => setError(e.message || "Couldn't load your live classes."));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const join = (c: LiveClassRow) => setClassroom({ slug: c.slug, role: "participant" });

  const openLink = async () => {
    const raw = linkInput.trim();
    if (!raw) return;
    setLinkBusy(true);
    try {
      /* accept a full link, a bare slug, or a TA-XXXXXX code */
      let key = raw;
      try {
        const u = new URL(raw);
        key = u.searchParams.get("join") || u.pathname.split("/").pop() || raw;
      } catch {}
      const res = await fetch(`/api/live-classes/join/${encodeURIComponent(key)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "That link or code isn't valid.");
      setClassroom({ slug: json.data.slug, role: "participant" });
    } catch (e) {
      toast({ title: "Couldn't open that class", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLinkBusy(false);
    }
  };

  const upcoming = (classes ?? []).filter((c) => c.status !== "ended");
  const past = (classes ?? []).filter((c) => c.status === "ended" && (c.attendance?.attendees?.some((a) => a.name === user?.name) ?? false));

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Live Classes</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Digital classrooms from your tutors — video, chat, polls, Q&A and live quizzes, all inside Tutor Amma.
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="sk-callout sk-callout-danger flex items-center justify-between">
          <span>{error}</span>
          <button className="underline font-semibold" onClick={load}>retry</button>
        </div>
      )}

      {/* join with link / code */}
      <div className="sk-card p-4">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="sk-input !pl-9"
              placeholder="Got a class link or a TA-XXXXXX code from your teacher? Paste it here…"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openLink()}
            />
          </div>
          <button className="sk-btn sk-btn-primary" onClick={openLink} disabled={linkBusy}>
            {linkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Join class
          </button>
        </div>
      </div>

      {!classes ? (
        <LoadingView label="Loading your live classes…" />
      ) : upcoming.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Video}
            title="No live classes yet"
            sub="When your tutor schedules a digital classroom for one of your group classes, it appears here with a Join button."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((c) => {
            const live = c.status === "live";
            return (
              <article key={c.id} className={clsx("sk-card p-5 space-y-3", live && "ring-2 ring-[#C03342] ring-offset-2 ring-offset-background")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-extrabold truncate">{c.title}</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.tutor.color }} />
                      {c.tutor.name}{c.grade ? ` · ${c.grade}` : ""}{c.batchTitle ? ` · ${c.batchTitle}` : ""}
                    </p>
                  </div>
                  {live ? (
                    <span className="sk-pill sk-pill-red shrink-0"><Radio className="w-3 h-3" /> Live now</span>
                  ) : (
                    <span className="sk-pill sk-pill-blue shrink-0"><CalendarClock className="w-3 h-3" /> Scheduled</span>
                  )}
                </div>

                {c.agenda && <p className="text-[12.5px] leading-relaxed text-muted-foreground">{c.agenda}</p>}

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="sk-pill sk-pill-grey"><Clock className="w-3 h-3" /> {new Date(c.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="sk-pill sk-pill-grey">{c.durationMin} min</span>
                  {c.waitingRoom && <span className="sk-pill sk-pill-green"><ShieldCheck className="w-3 h-3" /> Waiting room</span>}
                </div>

                <div className="pt-1 border-t border-dashed border-border flex justify-end">
                  <button className={clsx("sk-btn sk-btn-sm", live ? "sk-btn-primary" : "sk-btn-ghost")} onClick={() => join(c)}>
                    <Play className="w-3.5 h-3.5" /> {live ? "Join now" : "Open room"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-[15px] font-bold mb-3">Classes you attended</h2>
          <div className="sk-card p-2 divide-y">
            {past.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{c.title}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {c.subject} · {new Date(c.scheduledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {c.tutor.name}
                  </div>
                </div>
                <span className="sk-pill sk-pill-green"><Users className="w-3 h-3" /> Attended</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
