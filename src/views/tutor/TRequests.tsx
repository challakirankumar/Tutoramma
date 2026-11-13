"use client";

import { useCallback, useEffect, useState } from "react";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { MODE_LABEL, dateTimeOf, kwd, untilLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, Inbox, MapPin, RefreshCw, X } from "lucide-react";

interface RequestBooking {
  id: string;
  title: string;
  subject: string;
  board: string;
  grade: string;
  mode: string;
  startAt: string;
  endAt: string;
  state: string;
  sessionFee: number;
  platformFee: number;
  total: number;
  student?: { id: string; name: string; color?: string; avatarColor?: string };
  address?: { area: string; line1: string } | null;
  destArea?: string | null;
}

const DECLINE_REASONS = [
  "Schedule conflict",
  "Outside my travel radius",
  "Fully booked that day",
  "Topic needs a different specialist",
  "Other",
];

export function TRequests() {
  const [items, setItems] = useState<RequestBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<RequestBooking | null>(null);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);

  const load = useCallback(async () => {
    setError(null);
    try {
      // primary: shared bookings endpoint (tutor-scoped)
      const res = await fetch("/api/bookings?state=requested");
      if (res.ok) {
        const json = await res.json();
        const list: RequestBooking[] = Array.isArray(json?.data) ? json.data : [];
        setItems(list.filter((b) => b.state === "requested"));
        return;
      }
      throw new Error("primary");
    } catch {
      // fallback: tutor dashboard payload carries the full pending list
      try {
        const res = await fetch("/api/tutor/dashboard");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "Could not load requests.");
        setItems((json?.data?.requests ?? []) as RequestBooking[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load requests.");
        setItems([]);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async (b: RequestBooking) => {
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}/accept`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "Could not accept the request.");
      toast({
        title: "Request accepted",
        description: `${b.student?.name ?? "Student"}'s ${b.subject} session is confirmed for ${dateTimeOf(b.startAt)}.`,
      });
      await load();
    } catch (e) {
      toast({ title: "Accept failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (b: RequestBooking, why: string) => {
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}/decline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: why }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "Could not decline the request.");
      toast({
        title: "Request declined",
        description: `${b.student?.name ?? "Student"} has been notified — reason: ${why}.`,
      });
      setDeclineFor(null);
      await load();
    } catch (e) {
      toast({ title: "Decline failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = (b: RequestBooking) => b.student?.name ?? "Student";
  const colorOf = (b: RequestBooking) => b.student?.avatarColor ?? b.student?.color ?? "#315BE5";
  const areaOf = (b: RequestBooking) => b.address?.area ?? b.destArea ?? null;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Booking requests</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {items ? `${items.length} pending request${items.length === 1 ? "" : "s"}` : "Loading requests…"} · requests expire after 24h
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="sk-callout sk-callout-danger">
          {error} —{" "}
          <button className="underline font-semibold" onClick={load}>
            retry
          </button>
        </div>
      )}

      {!items ? (
        <LoadingView label="Loading requests…" />
      ) : items.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Inbox}
            title="No pending requests"
            sub="No pending requests — your availability looks great! New requests from parents will appear here."
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((b) => (
            <li key={b.id} className="sk-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarTile name={nameOf(b)} color={colorOf(b)} size={44} />
                  <div className="min-w-0">
                    <div className="font-bold text-[14.5px] truncate">{nameOf(b)}</div>
                    <div className="text-[12px] text-muted-foreground truncate">{b.title}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusPill tone="grey" dot={false}>{b.subject}</StatusPill>
                  <StatusPill tone="grey" dot={false}>{b.board} · {b.grade}</StatusPill>
                  <StatusPill tone={b.mode === "home" ? "orange" : "navy"} dot={false}>
                    {MODE_LABEL[b.mode] ?? b.mode}
                  </StatusPill>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sk-well p-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Requested time</div>
                  <div className="text-[13px] font-bold mt-0.5 tabular">{dateTimeOf(b.startAt)}</div>
                  <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {untilLabel(b.startAt)}
                  </div>
                </div>
                <div className="sk-well p-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Price breakdown</div>
                  <div className="text-[12px] mt-1 space-y-0.5 tabular">
                    <div className="flex justify-between"><span>Parent pays</span><span>{kwd(b.total)}</span></div>
                    <div className="flex justify-between"><span>Platform fee (8%)</span><span>−{kwd(b.platformFee)}</span></div>
                    <div className="flex justify-between font-bold"><span>Your net</span><span>{kwd(b.sessionFee)}</span></div>
                  </div>
                </div>
                <div className="sk-well p-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {b.mode === "home" ? "Visit location" : "Meeting"}
                  </div>
                  {b.mode === "home" ? (
                    <div className="text-[12.5px] mt-1 inline-flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-orange" />
                      <span>{areaOf(b) ?? "Address shared after acceptance"}</span>
                    </div>
                  ) : (
                    <div className="text-[12.5px] mt-1 text-muted-foreground">Secure classroom link is generated on acceptance.</div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground mr-1">Quick decline:</span>
                  {DECLINE_REASONS.slice(0, 3).map((r) => (
                    <button
                      key={r}
                      className="sk-chip !py-1 !px-2.5 !text-[11px]"
                      disabled={busyId === b.id}
                      onClick={() => decline(b, r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={busyId === b.id} onClick={() => setDeclineFor(b)}>
                    <X className="w-3.5 h-3.5" /> Decline…
                  </button>
                  <button className="sk-btn sk-btn-success sk-btn-sm" disabled={busyId === b.id} onClick={() => accept(b)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* decline dialog */}
      <Dialog open={!!declineFor} onOpenChange={(o) => !o && setDeclineFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline request</DialogTitle>
            <DialogDescription>
              {declineFor
                ? `${nameOf(declineFor)} will be notified with the reason you pick. This helps us match them with another tutor.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {DECLINE_REASONS.map((r) => (
              <button
                key={r}
                className={`w-full text-left sk-well p-3 text-[13px] font-semibold ${reason === r ? "!border-[#F47B20] !shadow-[inset_0_0_0_1.5px_#F47B20]" : ""}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busyId === declineFor?.id}
              onClick={() => declineFor && decline(declineFor, reason)}
            >
              Send decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
