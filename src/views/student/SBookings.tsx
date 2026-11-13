"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { kwd, dateTimeOf, MODE_LABEL, BOOKING_STATE_PILL, untilLabel } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ClipboardCheck,
  Video,
  MapPin,
  Users,
  Star,
  RefreshCw,
  ShieldAlert,
  Hourglass,
  XCircle,
  Link2,
  CalendarClock,
  FileText,
} from "lucide-react";

/* ---------------- types ---------------- */
interface Booking {
  id: string;
  title: string;
  subject: string;
  board: string;
  grade: string;
  mode: string;
  state: string;
  startAt: string;
  endAt: string;
  sessionFee: number;
  platformFee: number;
  total: number;
  meetUrl: string | null;
  batchId: string | null;
  rating: number | null;
  reviewComment: string | null;
  policySnapshot: string;
  tutor: { id: string; name: string; color: string; phone: string | null } | null;
  address: { id: string; label: string; area: string } | null;
  payment: { id: string; status: string; invoiceNo: string | null; total: number } | null;
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

/** Refund preview from the booking's policy snapshot (freeCancelHours, default 12). */
function refundPreview(b: Booking): { percent: number; amount: number; freeHours: number; note: string } {
  let freeHours = 12;
  try {
    const p = JSON.parse(b.policySnapshot || "{}");
    if (typeof p.freeCancelHours === "number") freeHours = p.freeCancelHours;
  } catch {
    /* keep default */
  }
  const hoursUntil = (new Date(b.startAt).getTime() - Date.now()) / 3_600_000;
  const held = b.payment && ["held", "created"].includes(b.payment.status);
  const percent = !held ? 0 : hoursUntil >= freeHours ? 100 : 50;
  const amount = Math.round(((b.payment?.total ?? b.total) * percent) / 100);
  const note = !held
    ? "No payment is held for this booking."
    : hoursUntil >= freeHours
      ? `100% refund — you're cancelling more than ${freeHours}h before the session.`
      : `50% refund — less than ${freeHours}h to the session (late-cancellation split).`;
  return { percent, amount, freeHours, note };
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="w-3.5 h-3.5" style={{ width: 14, height: 14, color: i <= rating ? "#E8A20C" : undefined, fill: i <= rating ? "#E8A20C" : "none" }} />
      ))}
    </span>
  );
}

/* ---------------- view ---------------- */
export function SBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [busy, setBusy] = useState("");

  /* cancel dialog */
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  /* review dialog */
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const load = () => {
    setError("");
    getJson<Booking[]>("/api/bookings")
      .then(setBookings)
      .catch((e) => setError(e.message || "Couldn't load your bookings."));
  };

  useEffect(load, []);

  const states = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings ?? []) counts.set(b.state, (counts.get(b.state) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [bookings]);

  const filtered = (bookings ?? []).filter((b) => !stateFilter || b.state === stateFilter);

  const doCancel = async () => {
    if (!cancelTarget) return;
    setBusy(cancelTarget.id);
    try {
      const res = await postJson<{ refund: { amount: number; percent: number; note: string } }>(
        `/api/bookings/${cancelTarget.id}/cancel`,
        {}
      );
      toast({
        title: "Booking cancelled",
        description:
          res.refund.amount > 0
            ? `${kwd(res.refund.amount)} (${res.refund.percent}%) is being refunded to your family wallet.`
            : "Any held payment follows the refund policy automatically.",
      });
      setCancelTarget(null);
      load();
    } catch (e) {
      toast({
        title: "Couldn't cancel this booking",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  const doReview = async () => {
    if (!reviewTarget) return;
    setBusy(reviewTarget.id);
    try {
      await postJson("/api/reviews", {
        bookingId: reviewTarget.id,
        rating: reviewStars,
        comment: reviewText.trim() || undefined,
      });
      toast({
        title: "Thanks for the review! ⭐",
        description: `You rated “${reviewTarget.title}” ${reviewStars}/5 — your tutor has been notified.`,
      });
      setReviewTarget(null);
      setReviewText("");
      setReviewStars(5);
      load();
    } catch (e) {
      toast({
        title: "Couldn't submit review",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your bookings"
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
  if (!bookings) return <LoadingView label="Loading your bookings…" />;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">My Bookings</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            1:1 sessions and group seats — all payments protected by escrow.
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <ClipboardCheck className="w-3 h-3" /> {bookings.length} total
        </span>
      </div>

      {/* ---------- state filters ---------- */}
      <div className="flex flex-wrap gap-1.5">
        <button className={`sk-chip ${stateFilter === "" ? "sk-chip-active" : ""}`} onClick={() => setStateFilter("")}>
          All · {bookings.length}
        </button>
        {states.map(([s, n]) => {
          const pill = pillFor(BOOKING_STATE_PILL, s);
          return (
            <button
              key={s}
              className={`sk-chip ${stateFilter === s ? "sk-chip-active" : ""}`}
              onClick={() => setStateFilter(stateFilter === s ? "" : s)}
            >
              {pill.label} · {n}
            </button>
          );
        })}
      </div>

      {/* ---------- list ---------- */}
      {filtered.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={CalendarClock}
            title={stateFilter ? "No bookings in this state" : "No bookings yet"}
            sub={
              stateFilter
                ? "Try another filter, or clear it to see everything."
                : "When you book a tutor, your sessions will appear here with join links, addresses and receipts."
            }
            action={
              !stateFilter ? null : (
                <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setStateFilter("")}>
                  Clear filter
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const state = pillFor(BOOKING_STATE_PILL, b.state);
            const upcoming = ["requested", "accepted", "in_progress"].includes(b.state) && new Date(b.endAt).getTime() > Date.now();
            const canReview = ["completed", "released"].includes(b.state);
            const preview = refundPreview(b);
            return (
              <div key={b.id} className="sk-card p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* left: identity */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <AvatarTile name={b.tutor?.name ?? "Tutor"} color={b.tutor?.color ?? "#14246B"} size={46} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[14.5px] truncate">{b.title}</span>
                        {b.batchId && (
                          <span className="sk-pill sk-pill-green">
                            <Users className="w-3 h-3" /> Group
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{b.tutor?.name ?? "Tutor"}</span>
                        <span>·</span>
                        <span>{dateTimeOf(b.startAt)}</span>
                        {upcoming && <span className="sk-pill sk-pill-blue">{untilLabel(b.startAt)}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <StatusPill tone={b.mode === "home" ? "orange" : b.mode === "group" ? "green" : "navy"} dot={false}>
                          {b.mode === "online" ? <Video className="w-3 h-3" /> : b.mode === "home" ? <MapPin className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                          {MODE_LABEL[b.mode] ?? b.mode}
                        </StatusPill>
                        <StatusPill tone={state.cls}>{state.label}</StatusPill>
                        {b.address && (
                          <span className="text-[11.5px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {b.address.area}
                          </span>
                        )}
                        {b.meetUrl && b.state === "accepted" && new Date(b.startAt).getTime() < Date.now() + 36e5 && (
                          <a
                            href={b.meetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="sk-pill sk-pill-blue"
                            title={b.meetUrl}
                          >
                            <Link2 className="w-3 h-3" /> Join link
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* right: price + actions */}
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end shrink-0">
                    <div className="text-right">
                      <div className="font-extrabold text-[15px] tabular text-brand-navy">{kwd(b.total)}</div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {b.payment?.invoiceNo ? `${b.payment.invoiceNo} · ` : ""}escrow protected
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.state === "requested" && (
                        <span className="sk-pill sk-pill-grey">
                          <Hourglass className="w-3 h-3" /> Awaiting tutor
                        </span>
                      )}
                      {b.state === "accepted" && upcoming && (
                        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setCancelTarget(b)}>
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                      {canReview &&
                        (b.rating != null ? (
                          <span className="flex items-center gap-1.5">
                            <Stars rating={b.rating} />
                            <span className="sk-pill sk-pill-grey">Reviewed</span>
                          </span>
                        ) : (
                          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setReviewTarget(b)}>
                            <Star className="w-3.5 h-3.5" /> Leave a review
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- cancel dialog ---------- */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          {cancelTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <XCircle className="w-4.5 h-4.5 text-[#D64550]" style={{ width: 18, height: 18 }} /> Cancel this session?
                </DialogTitle>
                <DialogDescription>
                  “{cancelTarget.title}” · {dateTimeOf(cancelTarget.startAt)} with {cancelTarget.tutor?.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="sk-well rounded-2xl p-4 space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid (escrow)</span>
                    <span className="font-semibold tabular">{kwd(cancelTarget.payment?.total ?? cancelTarget.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Refund</span>
                    <span className="font-extrabold tabular text-[#1F9D68]">
                      {kwd(refundPreview(cancelTarget).amount)} ({refundPreview(cancelTarget).percent}%)
                    </span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground leading-relaxed pt-1">{refundPreview(cancelTarget).note}</div>
                </div>
                <div className="sk-callout sk-callout-warn">
                  Free cancellation until {refundPreview(cancelTarget).freeHours}h before the session starts — later
                  cancellations split the amount 50/50 with your tutor.
                </div>
                <div className="flex justify-end gap-2">
                  <button className="sk-btn sk-btn-ghost" onClick={() => setCancelTarget(null)}>
                    Keep session
                  </button>
                  <button className="sk-btn sk-btn-danger" disabled={busy === cancelTarget.id} onClick={doCancel}>
                    {busy === cancelTarget.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Cancelling…
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" /> Cancel & refund
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- review dialog ---------- */}
      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent className="max-w-md">
          {reviewTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Star className="w-4.5 h-4.5 text-[#E8A20C] fill-[#E8A20C]" style={{ width: 18, height: 18 }} /> How was your session?
                </DialogTitle>
                <DialogDescription>
                  “{reviewTarget.title}” with {reviewTarget.tutor?.name} — your review helps other families choose well.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      className="transition-transform hover:scale-110 active:scale-95 p-1"
                      onClick={() => setReviewStars(i)}
                      aria-label={`Rate ${i} star${i === 1 ? "" : "s"}`}
                    >
                      <Star
                        className="w-8 h-8"
                        style={{ color: i <= reviewStars ? "#E8A20C" : "#AAB6D0", fill: i <= reviewStars ? "#E8A20C" : "none" }}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  className="sk-input min-h-24"
                  placeholder="What went well? (optional)"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  aria-label="Review comment"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Reviews are visible to other parents and students.
                  </span>
                  <button className="sk-btn sk-btn-orange" disabled={busy === reviewTarget.id} onClick={doReview}>
                    {busy === reviewTarget.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        <Star className="w-4 h-4" /> Submit review
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
