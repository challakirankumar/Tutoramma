"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { kwd, dateTimeOf, untilLabel, MODE_LABEL, BOOKING_STATE_PILL, PAYMENT_STATE_PILL } from "@/lib/format";
import {
  ClipboardList,
  Video,
  MapPin,
  Star,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Ban,
  Lock,
  Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/* ---------- types (defensive against the shared /api/bookings contract) ---------- */
interface BookingRow {
  id: string;
  title: string;
  subject: string;
  board?: string;
  grade?: string;
  mode: string;
  state: string;
  startAt: string;
  endAt: string;
  sessionFee?: number;
  platformFee?: number;
  total?: number;
  rating?: number | null;
  reviewComment?: string | null;
  meetUrl?: string | null;
  policySnapshot?: string | Record<string, unknown>;
  tutor?: { id?: string; name?: string; color?: string; phone?: string };
  student?: { id?: string; name?: string; color?: string };
  address?: { label?: string; area?: string } | null;
  payment?: { status?: string } | string | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}
async function postAction<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

function paymentStatus(b: BookingRow): string | null {
  if (!b.payment) return null;
  return typeof b.payment === "string" ? b.payment : b.payment.status ?? null;
}
function policyOf(b: BookingRow): { freeCancelHours?: number; lateCancelSplit?: string } {
  const p = b.policySnapshot;
  if (typeof p === "string") {
    try {
      return JSON.parse(p || "{}");
    } catch {
      return {};
    }
  }
  return (p as Record<string, unknown>) ?? {};
}

const STATE_GROUPS: Record<string, string[]> = {
  Requested: ["requested"],
  Accepted: ["accepted", "in_progress"],
  Completed: ["completed", "released"],
  Cancelled: ["cancelled", "declined", "no_show", "disputed"],
};

export function PBookings() {
  const { setView } = useAppStore();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState("");
  const [childFilter, setChildFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    setError("");
    getJson<BookingRow[]>("/api/bookings")
      .then((d) => setBookings(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message || "Couldn't load bookings."));
  };

  useEffect(load, []);

  const children = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    (bookings ?? []).forEach((b) => {
      if (b.student?.id && b.student?.name) {
        map.set(b.student.id, { id: b.student.id, name: b.student.name, color: b.student.color ?? "#315BE5" });
      }
    });
    return Array.from(map.values());
  }, [bookings]);

  const filtered = (bookings ?? []).filter((b) => {
    if (childFilter !== "all" && b.student?.id !== childFilter) return false;
    if (stateFilter !== "all" && !STATE_GROUPS[stateFilter]?.includes(b.state)) return false;
    return true;
  });

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await postAction(`/api/bookings/${cancelTarget.id}/cancel`);
      toast({
        title: "Booking cancelled",
        description: "Any escrowed funds are refunded per the cancellation policy.",
      });
      setCancelTarget(null);
      load();
    } catch (e) {
      toast({
        title: "Couldn't cancel",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const cancelPreview = (b: BookingRow): { tone: "info" | "warn"; text: string } => {
    const pay = paymentStatus(b);
    const free = policyOf(b).freeCancelHours ?? 12;
    const split = policyOf(b).lateCancelSplit ?? "50/50";
    const hoursLeft = (new Date(b.startAt).getTime() - Date.now()) / 3_600_000;
    if (!pay || pay === "created" || pay === "failed") {
      return { tone: "info", text: "No payment has been captured for this session — nothing to refund." };
    }
    if (pay === "held" && hoursLeft > free) {
      return {
        tone: "info",
        text: `You're cancelling more than ${free} hours ahead — 100% of ${kwd(b.total ?? 0)} is refunded from escrow to your card.`,
      };
    }
    if (pay === "held") {
      return {
        tone: "warn",
        text: `This is a late cancellation (under ${free} hours before start). Per policy, the refund is split ${split} between you and the tutor for their prepared time.`,
      };
    }
    return { tone: "info", text: "This session was already settled — refunds are handled by support." };
  };

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Bookings</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Every session across your children — with escrow status, live tracking and the cancellation policy in one
            place.
          </p>
        </div>
        <button className="sk-btn sk-btn-orange" onClick={() => setView("p-find")}>
          <Search className="w-4 h-4" /> Book a session
        </button>
      </div>

      {error ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Couldn't load bookings"
            sub={error}
            action={
              <button className="sk-btn sk-btn-primary" onClick={load}>
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            }
          />
        </div>
      ) : !bookings ? (
        <LoadingView label="Loading your bookings…" />
      ) : (
        <>
          {/* ---------- filters ---------- */}
          <div className="sk-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-12 shrink-0">Child</span>
              <button
                className={`sk-chip ${childFilter === "all" ? "sk-chip-active" : ""}`}
                onClick={() => setChildFilter("all")}
              >
                All
              </button>
              {children.map((c) => (
                <button
                  key={c.id}
                  className={`sk-chip ${childFilter === c.id ? "sk-chip-active" : ""}`}
                  onClick={() => setChildFilter(c.id)}
                >
                  {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-12 shrink-0">State</span>
              <button
                className={`sk-chip ${stateFilter === "all" ? "sk-chip-active" : ""}`}
                onClick={() => setStateFilter("all")}
              >
                All
              </button>
              {Object.keys(STATE_GROUPS).map((s) => (
                <button
                  key={s}
                  className={`sk-chip ${stateFilter === s ? "sk-chip-active" : ""}`}
                  onClick={() => setStateFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- list ---------- */}
          {filtered.length === 0 ? (
            <div className="sk-card p-6">
              <EmptyState
                icon={ClipboardList}
                title="No bookings here"
                sub="When you book sessions for your children they'll appear in this list."
                action={
                  <button className="sk-btn sk-btn-orange" onClick={() => setView("p-find")}>
                    <Search className="w-4 h-4" /> Find a tutor
                  </button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filtered
                .slice()
                .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
                .map((b) => {
                  const state = pillFor(BOOKING_STATE_PILL, b.state);
                  const pay = paymentStatus(b);
                  const payPill = pay ? pillFor(PAYMENT_STATE_PILL, pay) : null;
                  const upcoming = new Date(b.startAt).getTime() > Date.now();
                  const cancellable = ["requested", "accepted"].includes(b.state) && upcoming;
                  const canTrack = b.mode === "home" && ["accepted", "in_progress"].includes(b.state);
                  return (
                    <div key={b.id} className="sk-card p-5">
                      <div className="flex items-start gap-3">
                        <AvatarTile name={b.student?.name ?? "Child"} color={b.student?.color ?? "#F47B20"} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[14px]">{b.title}</span>
                            <StatusPill tone={state.cls}>{state.label}</StatusPill>
                          </div>
                          <div className="text-[11.5px] text-muted-foreground mt-0.5">
                            {b.student?.name} · {b.tutor?.name} · {dateTimeOf(b.startAt)}
                            {upcoming ? ` (${untilLabel(b.startAt)})` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-extrabold tabular text-[14px]">{kwd(b.total ?? 0)}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            fee {kwd(b.sessionFee ?? 0, 2)} + 8%
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-3">
                        <span className="sk-pill sk-pill-blue">{MODE_LABEL[b.mode] ?? b.mode}</span>
                        <span className="sk-pill sk-pill-grey">{b.subject}</span>
                        {payPill && (
                          <span className="sk-pill sk-pill-grey">
                            <Lock className="w-3 h-3" /> {payPill.label}
                          </span>
                        )}
                        {b.rating ? (
                          <span className="sk-pill sk-pill-orange">
                            <Star className="w-3 h-3" style={{ fill: "currentColor" }} /> {b.rating}/5
                          </span>
                        ) : (
                          ["released", "completed"].includes(b.state) && (
                            <span className="sk-pill sk-pill-grey">Ask {b.student?.name?.split(" ")[0] ?? "your child"} to rate</span>
                          )
                        )}
                      </div>

                      {b.reviewComment && (
                        <p className="text-[12px] text-muted-foreground italic mt-2.5 leading-snug">“{b.reviewComment}”</p>
                      )}

                      <div className="flex items-center gap-2 mt-3.5 flex-wrap">
                        {canTrack && (
                          <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setView("p-tracking")}>
                            <MapPin className="w-3.5 h-3.5" /> Track live
                          </button>
                        )}
                        {b.mode === "online" && b.meetUrl && ["accepted", "in_progress"].includes(b.state) && (
                          <span className="sk-pill sk-pill-navy">
                            <Video className="w-3 h-3" /> Link ready
                          </span>
                        )}
                        {b.address?.area && (
                          <span className="text-[11.5px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {b.address.area}
                          </span>
                        )}
                        <div className="flex-1" />
                        {cancellable && (
                          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setCancelTarget(b)}>
                            <XCircle className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}

      {/* ---------- cancel dialog ---------- */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md w-[95vw]">
          {cancelTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Ban className="w-4.5 h-4.5 text-[#C03342]" /> Cancel this session?
                </DialogTitle>
                <DialogDescription>
                  {cancelTarget.title} · {cancelTarget.student?.name} · {dateTimeOf(cancelTarget.startAt)}
                </DialogDescription>
              </DialogHeader>

              {(() => {
                const p = cancelPreview(cancelTarget);
                return (
                  <div className={`sk-callout sk-callout-${p.tone === "warn" ? "warn" : "info"} mt-2 flex gap-2`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>{p.text}</div>
                  </div>
                );
              })()}

              <div className="sk-well p-3 mt-3 text-[12px] text-muted-foreground">
                {cancelTarget.tutor?.name} will be notified immediately and the slot reopens for other families. Cancel
                fees follow the policy shown at booking time.
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button className="sk-btn sk-btn-ghost" onClick={() => setCancelTarget(null)} disabled={cancelling}>
                  Keep session
                </button>
                <button className="sk-btn sk-btn-danger" onClick={confirmCancel} disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Confirm cancellation"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
