"use client";

/**
 * Tutor Amma — Live Classes (parent).
 * Full visibility of the digital classrooms scheduled for your children's
 * batches: what, when, who teaches, and whether attendance was recorded.
 */
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { clsx } from "clsx";
import { Video, Radio, CalendarClock, Clock, RefreshCw, Users, CheckCircle2, Eye } from "lucide-react";

interface LiveClassRow {
  id: string;
  title: string;
  subject: string;
  grade: string | null;
  batchTitle: string | null;
  scheduledAt: string;
  durationMin: number;
  code: string;
  slug: string;
  status: string;
  attendance: { attendees?: { name: string; role: string; durationMin: number; status: string }[] };
  tutor: { id: string; name: string; color: string };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

export function PLive() {
  const { setClassroom } = useAppStore();
  const [classes, setClasses] = useState<LiveClassRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getJson<LiveClassRow[]>("/api/live-classes")
      .then((d) => {
        setError("");
        setClasses(d);
      })
      .catch((e) => setError(e.message || "Couldn't load live classes."));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const upcoming = (classes ?? []).filter((c) => c.status !== "ended");
  const past = (classes ?? []).filter((c) => c.status === "ended");

  /* enter the classroom as a read-only observer (video/chat/polls/Q&A view-only) */
  const observe = (c: LiveClassRow) => {
    const cls = { slug: c.slug, role: "participant" as const, observer: true };
    setClassroom(cls);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Live Classes</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Digital classrooms scheduled for your children — safe, teacher-controlled rooms with attendance.
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

      {!classes ? (
        <LoadingView label="Loading live classes…" />
      ) : (
        <>
          {upcoming.length === 0 ? (
            <div className="sk-card p-6">
              <EmptyState
                icon={Video}
                title="No live classes scheduled"
                sub="When your children's tutors schedule digital classrooms, they'll appear here with the full schedule."
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="sk-pill sk-pill-grey"><Clock className="w-3 h-3" /> {new Date(c.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="sk-pill sk-pill-grey">{c.durationMin} min</span>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground border-t border-dashed border-border pt-2.5">
                      Students join the classroom — the teacher admits each one from a waiting room and has full moderation controls. Parents can observe a live class read-only.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span title={live ? "Watch this class read-only — no mic, camera or chat" : "Observe is available once the class is live"}>
                        <button
                          className={clsx("sk-btn sk-btn-sm", live ? "sk-btn-primary" : "sk-btn-ghost opacity-60")}
                          disabled={!live}
                          onClick={() => observe(c)}
                          aria-label={live ? `Observe ${c.title} read-only` : `Observe ${c.title} — available when live`}
                        >
                          <Eye className="w-3.5 h-3.5" /> {live ? "Observe live" : "Observe (when live)"}
                        </button>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h2 className="text-[15px] font-bold mb-3">Completed classes</h2>
              <div className="sk-card p-2 divide-y">
                {past.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold truncate">{c.title}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {c.subject} · {new Date(c.scheduledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {c.tutor.name}
                      </div>
                    </div>
                    <span className="sk-pill sk-pill-grey"><Users className="w-3 h-3" /> {c.attendance?.attendees?.length ?? 0} attended</span>
                    <span className="sk-pill sk-pill-green"><CheckCircle2 className="w-3 h-3" /> Ended</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
