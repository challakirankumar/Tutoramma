"use client";

import { useEffect, useState } from "react";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { toast } from "@/hooks/use-toast";
import { kwd, minutesToLabel, WEEKDAYS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users,
  CalendarDays,
  Video,
  MapPin,
  Star,
  ShieldCheck,
  RefreshCw,
  ShieldAlert,
  Info,
  BadgeCheck,
  Hourglass,
  LogOut,
  Activity,
  Banknote,
} from "lucide-react";

/* ---------------- types ---------------- */
interface MySeat {
  status: string; // joined | waitlist | refunded | left
  position: number | null;
  paymentHeld: boolean;
  amount: number | null;
  policyLabel: string | null;
}
interface Batch {
  id: string;
  tutorId: string;
  tutor: { id: string; name: string; color: string };
  subject: string;
  board: string;
  grade: string;
  title: string;
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
  joined: boolean;
  mySeat: MySeat | null;
  waitlistCount: number;
  sessionsHeld: number;
  attendancePercent: number | null;
}

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

function dayPatternLabel(pattern: { day: number; start: number; end: number }[]): string {
  if (!pattern.length) return "";
  return pattern
    .map((p) => `${WEEKDAYS[p.day] ?? ""} ${minutesToLabel(p.start)}–${minutesToLabel(p.end)}`)
    .join(" · ");
}

/* destructive outline button (leave batch) */
const leaveBtnCls =
  "inline-flex items-center gap-1.5 rounded-[10px] border border-[#F2B8BE] bg-gradient-to-b from-white to-[#FDF1F2] px-3 py-1.5 text-[12px] font-bold text-[#C03342] shadow-[0_1px_2px_rgba(20,36,107,0.08)] transition-all hover:from-white hover:to-[#FDE3E5] active:translate-y-px disabled:opacity-55 disabled:cursor-not-allowed";

/* ---------------- view ---------------- */
export function SGroups() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState("");
  const [leaving, setLeaving] = useState("");
  const [confirmLeave, setConfirmLeave] = useState<Batch | null>(null);

  const load = () => {
    setError("");
    getJson<Batch[]>("/api/batches?include=cancelled")
      .then(setBatches)
      .catch((e) => setError(e.message || "Couldn't load group classes."));
  };

  useEffect(load, []);

  const join = async (b: Batch) => {
    setJoining(b.id);
    try {
      const res = await postJson<{ waitlisted?: boolean; position?: number }>(`/api/batches/${b.id}/join`, {});
      if (res?.waitlisted) {
        toast({
          title: `You're on the waitlist — #${res.position}`,
          description: `We'll move you into “${b.title}” automatically if a seat opens.`,
        });
      } else {
        toast({
          title: "Seat confirmed 🎉",
          description: `You're in “${b.title}” — ${b.schedule}. Seat payment is held safely in escrow until the batch is confirmed.`,
        });
      }
      load();
    } catch (e) {
      toast({
        title: "Couldn't join this group",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setJoining("");
    }
  };

  const leaveWaitlist = async (b: Batch) => {
    setLeaving(b.id);
    try {
      await postJson(`/api/batches/${b.id}/leave`, {});
      toast({ title: "Left the waitlist", description: `You left the waitlist for “${b.title}”.` });
      load();
    } catch (e) {
      toast({
        title: "Couldn't leave the waitlist",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLeaving("");
    }
  };

  const leaveBatch = async () => {
    if (!confirmLeave) return;
    const b = confirmLeave;
    setLeaving(b.id);
    try {
      const res = await postJson<{ left: string; refund?: { amount: number } }>(`/api/batches/${b.id}/leave`, {});
      const refunded = res?.refund?.amount ?? 0;
      toast({
        title: "You left the batch",
        description:
          refunded > 0
            ? `Your ${kwd(refunded)} seat fee held in escrow was refunded in full to your wallet.`
            : `You're no longer seated in “${b.title}”.`,
      });
      setConfirmLeave(null);
      load();
    } catch (e) {
      toast({
        title: "Couldn't leave this batch",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLeaving("");
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load group classes"
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
  if (!batches) return <LoadingView label="Loading group classes…" />;

  const active = batches.filter((b) => b.status !== "cancelled");
  const cancelled = batches.filter((b) => b.status === "cancelled");

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Group Classes</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Small-group learning at a friendly price — same verified tutors, same escrow safety.
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <Users className="w-3 h-3" /> {active.length} open group{active.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* ---------- explainer ---------- */}
      <div className="sk-callout sk-callout-info flex gap-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">How groups work:</span> each batch needs its minimum number of seats before it's
          confirmed. Your seat payment sits in escrow meanwhile — if the group doesn't fill up, you're auto-refunded in
          full. If a group is full, you can join the waitlist and we'll notify you when a seat opens.
        </div>
      </div>

      {/* ---------- batches ---------- */}
      {batches.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Users}
            title="No group classes right now"
            sub="New batches open every term — check back soon, or book a 1:1 session from Find Tutors."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {batches.map((b) => {
            const pct = Math.min(100, Math.round((b.seatsFilled / b.maxSeats) * 100));
            const belowMin = b.seatsFilled < b.minSeats;
            const needsMore = Math.max(0, b.minSeats - b.seatsFilled);
            const full = b.seatsFilled >= b.maxSeats;
            const pattern = dayPatternLabel(b.dayPattern);
            const isCancelled = b.status === "cancelled";
            const mySeat = b.mySeat;
            return (
              <div
                key={b.id}
                className={`sk-card p-5 flex flex-col gap-3.5 ${isCancelled ? "opacity-65 saturate-50" : ""}`}
              >
                {/* title + pills */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-[15px] leading-snug">{b.title}</h3>
                    {b.rating > 0 && (
                      <span className="flex items-center gap-1 shrink-0 text-[12px] font-semibold tabular">
                        <Star className="w-3.5 h-3.5 text-[#E8A20C] fill-[#E8A20C]" /> {b.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="sk-pill sk-pill-navy">{b.subject}</span>
                    <span className="sk-pill sk-pill-grey">{b.grade}</span>
                    <span className="sk-pill sk-pill-grey">{b.board}</span>
                    {isCancelled && (
                      <span className="sk-pill sk-pill-red">
                        <ShieldAlert className="w-3 h-3" /> Auto-refunded — minimum not met
                      </span>
                    )}
                    {b.sessionsHeld > 0 && b.attendancePercent !== null && (
                      <span className="sk-pill sk-pill-blue">
                        <Activity className="w-3 h-3" /> {b.attendancePercent}% attendance · {b.sessionsHeld}{" "}
                        {b.sessionsHeld === 1 ? "session" : "sessions"}
                      </span>
                    )}
                  </div>
                </div>

                {/* tutor */}
                <div className="flex items-center gap-2.5">
                  <AvatarTile name={b.tutor.name} color={b.tutor.color} size={34} />
                  <div className="min-w-0">
                    <div className="font-semibold text-[13px] truncate flex items-center gap-1.5">
                      {b.tutor.name}
                      <BadgeCheck className="w-3.5 h-3.5 text-[#1F9D68]" />
                    </div>
                    <div className="text-[11px] text-muted-foreground">Verified tutor</div>
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
                      {full && b.waitlistCount > 0 && (
                        <span className="text-muted-foreground font-normal"> · {b.waitlistCount} on the waitlist</span>
                      )}
                    </span>
                    {isCancelled ? (
                      <span className="sk-pill sk-pill-grey">Cancelled</span>
                    ) : b.status === "confirmed" ? (
                      <span className="sk-pill sk-pill-green">
                        <ShieldCheck className="w-3 h-3" /> Confirmed
                      </span>
                    ) : (
                      <span className="sk-pill sk-pill-orange">Needs {needsMore} more</span>
                    )}
                  </div>
                  <div className="sk-progress-track">
                    <div
                      className={`sk-progress-fill ${isCancelled ? "sk-progress-fill-orange" : belowMin ? "sk-progress-fill-orange" : "sk-progress-fill-green"}`}
                      style={{ width: `${Math.max(4, pct)}%` }}
                      role="progressbar"
                      aria-valuenow={b.seatsFilled}
                      aria-valuemin={0}
                      aria-valuemax={b.maxSeats}
                      aria-label={`${b.seatsFilled} of ${b.maxSeats} seats filled`}
                    />
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-1">
                    {isCancelled
                      ? `Needed ${b.minSeats} seats to run — held fees were refunded in full`
                      : `Confirms at ${b.minSeats} seats · auto-refund if it never fills`}
                  </div>
                </div>

                {/* price + action */}
                <div className="flex items-center justify-between gap-3 pt-1 mt-auto border-t border-border/70">
                  <div>
                    <div className="font-extrabold text-[15px] tabular text-brand-navy">{kwd(b.pricePerSeat)}</div>
                    <div className="text-[10.5px] text-muted-foreground">per seat · escrow protected</div>
                  </div>

                  {isCancelled ? (
                    mySeat?.status === "refunded" ? (
                      <span className="sk-pill sk-pill-green">
                        <Banknote className="w-3 h-3" /> Seat refunded ✓
                      </span>
                    ) : (
                      <span className="sk-pill sk-pill-grey">Closed</span>
                    )
                  ) : mySeat?.status === "joined" ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="sk-pill sk-pill-green">
                        <BadgeCheck className="w-3 h-3" /> Joined ✓
                      </span>
                      <button
                        className={leaveBtnCls}
                        disabled={leaving === b.id}
                        onClick={() => setConfirmLeave(b)}
                        aria-label={`Leave ${b.title}`}
                      >
                        {leaving === b.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                        Leave batch
                      </button>
                    </div>
                  ) : mySeat?.status === "waitlist" ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="sk-pill sk-pill-orange">
                        <Hourglass className="w-3 h-3" /> On waitlist — #{mySeat.position ?? "—"}
                      </span>
                      <button
                        className="sk-btn sk-btn-ghost sk-btn-sm"
                        disabled={leaving === b.id}
                        onClick={() => leaveWaitlist(b)}
                        aria-label={`Leave the waitlist for ${b.title}`}
                      >
                        {leaving === b.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Leaving…
                          </>
                        ) : (
                          <>
                            <LogOut className="w-3.5 h-3.5" /> Leave waitlist
                          </>
                        )}
                      </button>
                    </div>
                  ) : full ? (
                    <button className="sk-btn sk-btn-orange sk-btn-sm" disabled={joining === b.id} onClick={() => join(b)}>
                      {joining === b.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Joining…
                        </>
                      ) : (
                        <>
                          <Hourglass className="w-3.5 h-3.5" /> Join waitlist
                        </>
                      )}
                    </button>
                  ) : (
                    <button className="sk-btn sk-btn-orange sk-btn-sm" disabled={joining === b.id} onClick={() => join(b)}>
                      {joining === b.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Joining…
                        </>
                      ) : (
                        <>
                          <Users className="w-3.5 h-3.5" /> Join group
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- cancelled batches note ---------- */}
      {cancelled.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" /> {cancelled.length} batch{cancelled.length === 1 ? "" : "es"} shown
          muted {cancelled.length === 1 ? "was" : "were"} auto-refunded — minimum seats not met. Refunded seats are
          marked for transparency.
        </p>
      )}

      {/* ---------- leave batch confirmation ---------- */}
      <Dialog open={!!confirmLeave} onOpenChange={(o) => !o && setConfirmLeave(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave “{confirmLeave?.title}”?</DialogTitle>
            <DialogDescription>
              You'll give up your seat in this group class. If the batch is confirmed and drops below its minimum,
              it reopens — and the next student on the waitlist moves in automatically.
            </DialogDescription>
          </DialogHeader>
          {confirmLeave?.mySeat?.paymentHeld ? (
            <div className="sk-well p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-muted-foreground">Seat fee held in escrow</span>
                <span className="font-bold tabular">{kwd(confirmLeave.mySeat.amount ?? 0)}</span>
              </div>
              {confirmLeave.mySeat.policyLabel && (
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-muted-foreground">Refund policy</span>
                  <span className="font-semibold text-right">{confirmLeave.mySeat.policyLabel}</span>
                </div>
              )}
              <p className="text-[11.5px] text-muted-foreground">
                Leaving now refunds your held seat fee in full to your wallet — money is back instantly.
              </p>
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              No seat fee is currently held for this batch — leaving is free.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmLeave(null)}>
              Keep my seat
            </Button>
            <Button variant="destructive" disabled={leaving === confirmLeave?.id} onClick={leaveBatch}>
              {leaving === confirmLeave?.id ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              Leave batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
