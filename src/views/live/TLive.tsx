"use client";

/**
 * Tutor Amma — Live Classes (tutor).
 * Schedule digital classrooms for batches / sections, create shareable
 * join links (delivered to the batch's students + parents), host the
 * meeting with full controls, and review attendance afterwards.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { pdfAttendance } from "@/lib/pdf";
import { clsx } from "clsx";
import {
  Video, Plus, CalendarClock, Users, Link2, Copy, RefreshCw, ShieldAlert, Radio,
  Play, Clock, X, Check, Loader2, Presentation, MessageSquare, ShieldCheck, FileDown, BookOpen,
} from "lucide-react";

/* ---------------- types ---------------- */
interface AttendanceRow {
  name: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
  durationMin: number;
  status: string;
}
interface LiveClassRow {
  id: string;
  title: string;
  subject: string;
  board: string | null;
  grade: string | null;
  agenda: string;
  batchId: string | null;
  batchTitle: string | null;
  scheduledAt: string;
  durationMin: number;
  code: string;
  slug: string;
  hostKey?: string;
  waitingRoom: boolean;
  allowChat: boolean;
  status: string;
  notifiedCount: number;
  attendance: { attendees?: AttendanceRow[] };
  tutor: { id: string; name: string; color: string };
  isOwner: boolean;
}
interface BatchRow {
  id: string;
  title: string;
  subject: string;
  grade: string;
  board: string;
  seatsFilled: number;
  maxSeats: number;
  tutorId: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------------- view ---------------- */
export function TLive() {
  const { user, setClassroom } = useAppStore();
  const [classes, setClasses] = useState<LiveClassRow[] | null>(null);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [hasLessonPlans, setHasLessonPlans] = useState(false);

  /* one-time check — if the tutor has saved lesson plans, hint that slides
   * can be generated from them inside the class (Slides tab) */
  useEffect(() => {
    fetch("/api/studio/lesson-plans", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setHasLessonPlans(Array.isArray(json?.data) && json.data.length > 0))
      .catch(() => setHasLessonPlans(false));
  }, []);

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

  const upcoming = useMemo(() => (classes ?? []).filter((c) => c.status !== "ended"), [classes]);
  const past = useMemo(() => (classes ?? []).filter((c) => c.status === "ended"), [classes]);

  const copyLink = (c: LiveClassRow) => {
    const link = `${window.location.origin}/?join=${c.slug}`;
    navigator.clipboard
      .writeText(link)
      .then(() => toast({ title: "Join link copied!", description: `Anyone with this link can join ${c.title}.` }))
      .catch(() => toast({ title: "Copy failed", description: link, variant: "destructive" }));
  };

  const startClass = (c: LiveClassRow) => {
    if (!c.hostKey) {
      toast({ title: "Host key missing", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }
    setClassroom({ slug: c.slug, role: "host", hostKey: c.hostKey });
  };

  const downloadAttendance = async (c: LiveClassRow) => {
    const attendees = c.attendance?.attendees ?? [];
    if (!attendees.length) {
      toast({ title: "No attendance was recorded for this class" });
      return;
    }
    try {
      await pdfAttendance({
        className: c.title,
        subject: c.subject,
        tutorName: c.tutor.name,
        scheduledAt: c.scheduledAt,
        endedAt: null,
        attendees,
      });
      toast({ title: "Attendance PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
    } catch {
      toast({ title: "Could not build the PDF", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Live Classes</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Schedule digital classrooms for your batches — waiting-room admission, screen sharing, slides, polls, Q&A and live quizzes.
          </p>
        </div>
        <button className="sk-btn sk-btn-orange" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> Schedule live class
        </button>
      </div>

      {hasLessonPlans && (
        <div className="sk-callout sk-callout-info flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 shrink-0" />
          <span className="text-[12.5px]">
            Tip: load slides from a saved lesson plan inside the class — open <span className="font-bold">Slides → Load from Lesson Plan</span> once you&apos;re hosting.
          </span>
        </div>
      )}

      {error && (
        <div className="sk-callout sk-callout-danger flex items-center justify-between">
          <span>{error}</span>
          <button className="underline font-semibold" onClick={load}>retry</button>
        </div>
      )}

      {!classes ? (
        <LoadingView label="Loading your live classes…" />
      ) : (
        <>
          {/* feature strip */}
          <div className="sk-card p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { icon: ShieldCheck, t: "Waiting room", d: "You admit every student" },
                { icon: Presentation, t: "Slides & screen", d: "Present anything live" },
                { icon: MessageSquare, t: "Chat · Polls · Q&A", d: "Engage the whole class" },
                { icon: Video, t: "Live quizzes", d: "From your paper studio" },
              ].map((x) => (
                <div key={x.t} className="sk-well p-3 flex flex-col items-center gap-1">
                  <x.icon className="w-4 h-4 text-brand-navy" />
                  <span className="text-[11.5px] font-bold">{x.t}</span>
                  <span className="text-[10.5px] text-muted-foreground">{x.d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* upcoming / live */}
          {upcoming.length === 0 && past.length === 0 ? (
            <div className="sk-card p-6">
              <EmptyState
                icon={Video}
                title="No live classes scheduled"
                sub="Schedule one for a batch — every student in that class gets the join link instantly."
                action={
                  <button className="sk-btn sk-btn-primary" onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4" /> Schedule your first class
                  </button>
                }
              />
            </div>
          ) : upcoming.length === 0 ? (
            <div className="sk-callout sk-callout-info flex items-center justify-between gap-3 flex-wrap">
              <span>No upcoming live classes — schedule one for a batch and students get the link instantly.</span>
              <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Schedule live class
              </button>
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
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {c.subject}{c.grade ? ` · ${c.grade}` : ""}{c.batchTitle ? ` · ${c.batchTitle}` : ""}
                        </p>
                      </div>
                      {live ? (
                        <span className="sk-pill sk-pill-red shrink-0"><Radio className="w-3 h-3" /> Live now</span>
                      ) : (
                        <span className="sk-pill sk-pill-blue shrink-0"><CalendarClock className="w-3 h-3" /> Scheduled</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <span className="sk-pill sk-pill-grey"><Clock className="w-3 h-3" /> {new Date(c.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="sk-pill sk-pill-grey">{c.durationMin} min</span>
                      <span className="sk-pill sk-pill-grey">Code {c.code}</span>
                      {c.notifiedCount > 0 && (
                        <span className="sk-pill sk-pill-green"><Users className="w-3 h-3" /> {c.notifiedCount} invited</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-dashed border-border flex-wrap">
                      <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => copyLink(c)}>
                        <Link2 className="w-3.5 h-3.5" /> Copy link
                      </button>
                      <button className={clsx("sk-btn sk-btn-sm ml-auto", live ? "sk-btn-primary" : "sk-btn-success")} onClick={() => startClass(c)}>
                        {live ? <Play className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                        {live ? "Rejoin as host" : "Start class"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* past classes */}
          {past.length > 0 && (
            <div>
              <h2 className="text-[15px] font-bold mb-3">Completed classes</h2>
              <div className="sk-card p-2 divide-y">
                {past.map((c) => {
                  const attendees = c.attendance?.attendees ?? [];
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold truncate">{c.title}</div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {c.subject} · {new Date(c.scheduledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {attendees.length} attended
                        </div>
                      </div>
                      {attendees.length > 0 && (
                        <div className="hidden sm:flex -space-x-1.5">
                          {attendees.slice(0, 5).map((a, i) => (
                            <span key={i} className="sk-avatar w-7 h-7 !rounded-full border-2 border-white text-[9px]" style={{ background: a.role === "host" ? "linear-gradient(180deg,#33549E,#14246B)" : "linear-gradient(180deg,#F47B20,#E76E0F)" }}>
                              {a.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}
                            </span>
                          ))}
                        </div>
                      )}
                      <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => downloadAttendance(c)}>
                        <FileDown className="w-3.5 h-3.5" /> Attendance
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateClassDialog
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- create dialog ---------------- */
function CreateClassDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAppStore();
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: "",
    subject: "",
    batchId: "",
    agenda: "",
    scheduledAt: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
    durationMin: 60,
    waitingRoom: true,
    allowChat: true,
    notify: true,
  });

  useEffect(() => {
    getJson<BatchRow[]>("/api/batches")
      .then((all) => setBatches(all.filter((b) => b.tutorId === user?.id)))
      .catch(() => setBatches([]));
  }, [user?.id]);

  /* prefill subject from the chosen batch */
  const chosenBatch = batches?.find((b) => b.id === form.batchId);
  useEffect(() => {
    if (chosenBatch && !form.subject) {
      const subject = chosenBatch.subject;
      setForm((f) => (f.subject ? f : { ...f, subject }));
    }
  }, [form.batchId, form.subject, chosenBatch]);

  const submit = async () => {
    if (!form.title.trim() || !form.subject.trim()) {
      toast({ title: "Title and subject are required" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/live-classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          board: chosenBatch?.board,
          grade: chosenBatch?.grade,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not schedule the class.");
      toast({
        title: "Live class scheduled ✓",
        description: json.data.notifiedCount
          ? `Join details sent to ${json.data.notifiedCount} students & parents of the batch.`
          : "Copy the join link and share it with your students.",
      });
      onDone();
    } catch (e) {
      toast({ title: "Could not schedule", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(14,26,82,.45)" }} role="dialog" aria-modal>
      <div className="sk-card w-full max-w-lg max-h-[90vh] overflow-y-auto sk-scroll p-5" style={{ boxShadow: "0 24px 70px rgba(20,36,107,.35)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-extrabold">Schedule a live class</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">Students of the selected batch receive the join link instantly.</p>
          </div>
          <button className="p-1.5 rounded-xl hover:bg-[var(--accent)]" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 mt-4">
          <div>
            <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="lc-title">Class title</label>
            <input id="lc-title" className="sk-input mt-1" placeholder="e.g. Fractions — revision before finals" value={form.title} maxLength={90} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="lc-subject">Subject</label>
              <input id="lc-subject" className="sk-input mt-1" placeholder="Mathematics" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="lc-duration">Duration (minutes)</label>
              <input id="lc-duration" type="number" min={15} max={300} step={15} className="sk-input mt-1" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) || 60 })} />
            </div>
          </div>

          <div>
            <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="lc-batch">Class / section (batch)</label>
            <select id="lc-batch" className="sk-input mt-1" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
              <option value="">— No batch (share the link manually) —</option>
              {(batches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} · {b.subject} · {b.grade} ({b.seatsFilled}/{b.maxSeats} seats)
                </option>
              ))}
            </select>
            {batches && batches.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">Tip: create a Group Class first to auto-invite a whole section.</p>
            )}
          </div>

          <div>
            <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="lc-when">Starts at</label>
            <input id="lc-when" type="datetime-local" className="sk-input mt-1" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>

          <div>
            <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="lc-agenda">Agenda (optional)</label>
            <textarea id="lc-agenda" className="sk-input mt-1 !h-20 resize-none" placeholder="What will you cover? Visible to students when they join." value={form.agenda} maxLength={600} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </div>

          <div className="sk-well p-3.5 space-y-2.5">
            {[
              { key: "waitingRoom" as const, label: "Waiting room", desc: "Students wait until you admit them" },
              { key: "allowChat" as const, label: "In-class chat", desc: "Let students message during class" },
              { key: "notify" as const, label: "Send invitations now", desc: "Notify the batch's students & parents" },
            ].map((opt) => (
              <button key={opt.key} className="w-full flex items-center gap-3 text-left" onClick={() => setForm({ ...form, [opt.key]: !form[opt.key] })} role="switch" aria-checked={form[opt.key]}>
                <span className={clsx("w-10 h-6 rounded-full relative transition-colors shrink-0", form[opt.key] ? "bg-[#1F9D68]" : "bg-[#C9D3E8]")}>
                  <span className={clsx("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", form[opt.key] ? "left-[18px]" : "left-0.5")} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold">{opt.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-5">
          <button className="sk-btn sk-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="sk-btn sk-btn-primary ml-auto" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            Schedule class
          </button>
        </div>
      </div>
    </div>
  );
}
