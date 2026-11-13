"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { kwd, minutesToLabel, WEEKDAYS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CalendarDays, Loader2, MapPin, Plus, RefreshCw, ShieldAlert, ShieldCheck, Star, Users, Video,
} from "lucide-react";

/* ---------------- types ---------------- */
interface Batch {
  id: string;
  title: string;
  subject: string;
  board: string;
  grade: string;
  tutorId: string;
  tutorName: string;
  tutorColor: string;
  schedule: string;
  dayPattern: { day: number; start: number; end: number }[];
  minSeats: number;
  maxSeats: number;
  seatsFilled: number;
  pricePerSeat: number;
  mode: string;
  venue: string | null;
  status: string;
  startDate: string;
  rating: number;
  instituteOwned: boolean;
}

interface TutorOption {
  id: string;
  name: string;
  color: string;
  headline: string;
}

const BOARDS = ["CBSE", "ICSE", "IGCSE", "IB-MYP", "AMERICAN", "TN-STATE"];
const BOARD_LABELS: Record<string, string> = { "TN-STATE": "Tamil Nadu State Board" };
const GRADES = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const FULL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

/* ---------------- view ---------------- */
export function IBatches() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    tutorId: "",
    subject: "",
    board: "CBSE",
    grade: "Grade 8",
    title: "",
    schedule: "",
    day: "2",
    startTime: "17:00",
    endTime: "18:15",
    minSeats: "4",
    maxSeats: "12",
    pricePerSeat: "2500",
    mode: "online",
    venue: "",
  });

  const load = useCallback(() => {
    setError("");
    getJson<Batch[]>("/api/institute/batches")
      .then(setBatches)
      .catch((e) => setError(e.message || "Couldn't load batches."));
  }, []);

  useEffect(() => {
    load();
    getJson<TutorOption[]>("/api/institute/tutors")
      .then((list) => {
        setTutors(list);
        setForm((f) => (f.tutorId ? f : { ...f, tutorId: list[0]?.id ?? "" }));
      })
      .catch(() => setTutors([]));
  }, [load]);

  const minSeats = parseInt(form.minSeats, 10);
  const maxSeats = parseInt(form.maxSeats, 10);
  const price = parseFloat(form.pricePerSeat);
  const startMin = timeToMinutes(form.startTime);
  const endMin = timeToMinutes(form.endTime);
  const patternValid = Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin;

  const formValid =
    !!form.tutorId &&
    form.title.trim().length > 2 &&
    form.subject.trim().length > 0 &&
    BOARDS.includes(form.board) &&
    GRADES.includes(form.grade) &&
    form.schedule.trim().length > 2 &&
    Number.isInteger(minSeats) &&
    minSeats >= 1 &&
    minSeats <= 30 &&
    Number.isInteger(maxSeats) &&
    maxSeats >= minSeats &&
    maxSeats <= 60 &&
    Number.isFinite(price) &&
    price >= 250 &&
    price <= 10000 &&
    (form.mode === "online" || form.venue.trim().length > 2) &&
    patternValid;

  const createBatch = async () => {
    if (!formValid) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/institute/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tutorId: form.tutorId,
          subject: form.subject.trim(),
          board: form.board,
          grade: form.grade,
          title: form.title.trim(),
          schedule: form.schedule.trim(),
          dayPattern: [{ day: parseInt(form.day, 10), start: startMin, end: endMin }],
          minSeats,
          maxSeats,
          pricePerSeat: price,
          mode: form.mode,
          venue: form.mode === "venue" ? form.venue.trim() : undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.error) throw new Error(json?.error?.message || "Batch creation failed.");
      toast({
        title: "Batch created",
        description: `“${form.title.trim()}” is live and open for seat bookings — it confirms at ${minSeats} seats.`,
      });
      setOpen(false);
      setForm((f) => ({ ...f, title: "", subject: "", schedule: "", venue: "" }));
      load();
    } catch (e) {
      toast({ title: "Couldn't create the batch", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load batches"
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
  if (!batches) return <LoadingView label="Loading academy batches…" />;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Batches</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Your academy's group classes — seats are escrow-protected and auto-refunded if a batch never confirms.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="sk-pill sk-pill-navy">
            <Users className="w-3 h-3" /> {batches.length} batch{batches.length === 1 ? "" : "es"}
          </span>
          <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => setOpen(true)} disabled={tutors.length === 0}>
            <Plus className="w-3.5 h-3.5" /> Create batch
          </button>
        </div>
      </div>

      {/* ---------- batch cards ---------- */}
      {batches.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Users}
            title="No academy batches yet"
            sub="Create your first group batch — pick an academy tutor, set the weekly slot and seat price, and open it for bookings."
            action={
              <button className="sk-btn sk-btn-orange" onClick={() => setOpen(true)} disabled={tutors.length === 0}>
                <Plus className="w-4 h-4" /> Create your first batch
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {batches.map((b) => {
            const pct = Math.min(100, Math.round((b.seatsFilled / b.maxSeats) * 100));
            const belowMin = b.seatsFilled < b.minSeats;
            const needsMore = Math.max(0, b.minSeats - b.seatsFilled);
            const pattern = b.dayPattern
              .map((p) => `${WEEKDAYS[p.day] ?? ""} ${minutesToLabel(p.start)}–${minutesToLabel(p.end)}`)
              .join(" · ");
            return (
              <div key={b.id} className="sk-card p-5 flex flex-col gap-3.5">
                {/* title + pills */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-[15px] leading-snug">{b.title}</h3>
                    {b.rating > 0 ? (
                      <span className="flex items-center gap-1 shrink-0 text-[12px] font-semibold tabular">
                        <Star className="w-3.5 h-3.5 text-[#E8A20C] fill-[#E8A20C]" /> {b.rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-muted-foreground shrink-0">New</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="sk-pill sk-pill-navy">{b.subject}</span>
                    <span className="sk-pill sk-pill-grey">{b.grade}</span>
                    <span className="sk-pill sk-pill-grey">{BOARD_LABELS[b.board] ?? b.board}</span>
                  </div>
                </div>

                {/* tutor */}
                <div className="flex items-center gap-2.5">
                  <AvatarTile name={b.tutorName} color={b.tutorColor} size={34} />
                  <div className="min-w-0">
                    <div className="font-semibold text-[13px] truncate">{b.tutorName}</div>
                    <div className="text-[11px] text-muted-foreground">Academy tutor</div>
                  </div>
                </div>

                {/* schedule + mode */}
                <div className="space-y-1.5 text-[12.5px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 shrink-0 text-brand-navy" />
                    <span className="truncate">{b.schedule}</span>
                  </div>
                  {pattern && <div className="text-[11px] pl-6">{pattern}</div>}
                  <div className="flex items-center gap-2">
                    {b.mode === "venue" ? (
                      <>
                        <MapPin className="w-4 h-4 shrink-0 text-brand-orange" />
                        <span className="truncate">{b.venue ?? "Venue to be announced"}</span>
                      </>
                    ) : (
                      <>
                        <Video className="w-4 h-4 shrink-0 text-[#315BE5]" />
                        <span>Online — join link before each class</span>
                      </>
                    )}
                  </div>
                </div>

                {/* seats */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5 text-[12px]">
                    <span className="font-semibold">
                      {b.seatsFilled} of {b.maxSeats} seats
                    </span>
                    {b.status === "confirmed" ? (
                      <span className="sk-pill sk-pill-green">
                        <ShieldCheck className="w-3 h-3" /> Confirmed
                      </span>
                    ) : b.status === "closed" ? (
                      <StatusPill tone="grey">Closed</StatusPill>
                    ) : belowMin ? (
                      <span className="sk-pill sk-pill-red">Needs {needsMore} more</span>
                    ) : (
                      <span className="sk-pill sk-pill-orange">Ready to confirm</span>
                    )}
                  </div>
                  <div className="sk-progress-track">
                    <div
                      className="sk-progress-fill"
                      style={{
                        width: `${Math.max(4, pct)}%`,
                        ...(b.status === "confirmed"
                          ? {}
                          : belowMin
                            ? { background: "linear-gradient(180deg,#E96A75,#C03342)" }
                            : {}),
                      }}
                      role="progressbar"
                      aria-valuenow={b.seatsFilled}
                      aria-valuemin={0}
                      aria-valuemax={b.maxSeats}
                      aria-label={`${b.seatsFilled} of ${b.maxSeats} seats filled`}
                    />
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-1">
                    Confirms at {b.minSeats} seats · auto-refund if it never fills
                  </div>
                </div>

                {/* price */}
                <div className="flex items-center justify-between gap-3 pt-1 mt-auto border-t border-border/70">
                  <div>
                    <div className="font-extrabold text-[15px] tabular text-brand-navy">{kwd(b.pricePerSeat)}</div>
                    <div className="text-[10.5px] text-muted-foreground">per seat · escrow protected</div>
                  </div>
                  <StatusPill tone={b.status === "confirmed" ? "green" : b.status === "closed" ? "grey" : "orange"} dot={false}>
                    {b.status === "confirmed" ? "Running" : b.status === "closed" ? "Closed" : "Filling"}
                  </StatusPill>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- create batch dialog ---------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sk-scroll">
          <DialogHeader>
            <DialogTitle>Create a batch</DialogTitle>
            <DialogDescription>
              Open a group class led by one of your academy tutors. It goes live immediately and confirms once the minimum
              seats fill.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[12px] font-semibold" htmlFor="batch-tutor">Academy tutor</label>
              <select
                id="batch-tutor"
                className="sk-input mt-1 w-full"
                value={form.tutorId}
                onChange={(e) => setForm({ ...form, tutorId: e.target.value })}
              >
                {tutors.length === 0 && <option value="">No academy tutors</option>}
                {tutors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.headline}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[12px] font-semibold" htmlFor="batch-title">Batch title</label>
              <Input
                id="batch-title"
                className="sk-input mt-1"
                placeholder="IGCSE Maths Booster — Grade 9"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold" htmlFor="batch-subject">Subject</label>
              <Input
                id="batch-subject"
                className="sk-input mt-1"
                placeholder="Mathematics"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold" htmlFor="batch-board">Board</label>
              <select
                id="batch-board"
                className="sk-input mt-1 w-full"
                value={form.board}
                onChange={(e) => setForm({ ...form, board: e.target.value })}
              >
                {BOARDS.map((b) => (
                  <option key={b} value={b}>{BOARD_LABELS[b] ?? b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold" htmlFor="batch-grade">Grade</label>
              <select
                id="batch-grade"
                className="sk-input mt-1 w-full"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold" htmlFor="batch-mode">Mode</label>
              <select
                id="batch-mode"
                className="sk-input mt-1 w-full"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                <option value="online">Online</option>
                <option value="venue">At a venue</option>
              </select>
            </div>
            {form.mode === "venue" && (
              <div className="sm:col-span-2">
                <label className="text-[12px] font-semibold" htmlFor="batch-venue">Venue address</label>
                <Input
                  id="batch-venue"
                  className="sk-input mt-1"
                  placeholder="BrightSparks Academy, Anna Nagar"
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="text-[12px] font-semibold" htmlFor="batch-schedule">Schedule description</label>
              <Input
                id="batch-schedule"
                className="sk-input mt-1"
                placeholder="Tuesdays 17:00–18:15"
                value={form.schedule}
                onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold" htmlFor="batch-day">Weekday</label>
              <select
                id="batch-day"
                className="sk-input mt-1 w-full"
                value={form.day}
                onChange={(e) => setForm({ ...form, day: e.target.value })}
              >
                {FULL_WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>{d}s</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold" htmlFor="batch-start">Starts</label>
                <Input
                  id="batch-start"
                  type="time"
                  className="sk-input mt-1"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="batch-end">Ends</label>
                <Input
                  id="batch-end"
                  type="time"
                  className="sk-input mt-1"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold" htmlFor="batch-min">Min seats</label>
                <Input
                  id="batch-min"
                  type="number"
                  min={1}
                  max={30}
                  className="sk-input mt-1 tabular"
                  value={form.minSeats}
                  onChange={(e) => setForm({ ...form, minSeats: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="batch-max">Max seats</label>
                <Input
                  id="batch-max"
                  type="number"
                  min={1}
                  max={60}
                  className="sk-input mt-1 tabular"
                  value={form.maxSeats}
                  onChange={(e) => setForm({ ...form, maxSeats: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-semibold" htmlFor="batch-price">Price per seat (₹)</label>
              <Input
                id="batch-price"
                className="sk-input mt-1 tabular"
                inputMode="decimal"
                placeholder="2500"
                value={form.pricePerSeat}
                onChange={(e) => setForm({ ...form, pricePerSeat: e.target.value })}
              />
            </div>
            {form.minSeats !== "" && form.maxSeats !== "" && Number.isInteger(maxSeats) && Number.isInteger(minSeats) && maxSeats < minSeats && (
              <p className="sm:col-span-2 text-[11.5px] text-destructive">Maximum seats must be at least the minimum.</p>
            )}
            {form.startTime && form.endTime && !patternValid && (
              <p className="sm:col-span-2 text-[11.5px] text-destructive">End time must be after the start time.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!formValid || submitting} onClick={createBatch}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
