"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Gavel, RotateCcw, Scale, ShieldQuestion } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { BOOKING_STATE_PILL, MODE_LABEL, PAYMENT_STATE_PILL, dateTimeOf, fromNow, kwd } from "@/lib/format";

interface DisputeRow {
  id: string;
  reason: string;
  status: string;
  resolution: string | null;
  raisedBy: string;
  createdAt: string;
  booking: {
    id: string;
    title: string;
    subject: string;
    board: string;
    grade: string;
    mode: string;
    state: string;
    startAt: string;
    total: number;
    tutor: { name: string; color: string };
    student: { name: string; color: string };
    payment: { id: string; status: string; total: number } | null;
  } | null;
}

const DISPUTE_PILL: Record<string, { label: string; cls: "red" | "orange" | "green" }> = {
  open: { label: "Open", cls: "red" },
  investigating: { label: "Investigating", cls: "orange" },
  resolved: { label: "Resolved", cls: "green" },
};

export function ADisputes() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{ dispute: DisputeRow; action: "resolve" | "refund" } | null>(null);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/disputes")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "Failed to load disputes.");
        return json.data as DisputeRow[];
      })
      .then(setDisputes)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load disputes."))
      .finally(() => setLoading(false));
  }, []);

  const openDialog = (dispute: DisputeRow, action: "resolve" | "refund") => {
    setResolution("");
    setDialog({ dispute, action });
  };

  const submit = async () => {
    if (!dialog) return;
    if (!resolution.trim()) {
      toast({ title: "A resolution note is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/disputes/${dialog.dispute.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: dialog.action, resolution: resolution.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not resolve the dispute.");
      setDisputes((list) =>
        list.map((d) => (d.id === dialog.dispute.id ? { ...d, status: "resolved", resolution: resolution.trim() } : d))
      );
      toast({
        title: dialog.action === "refund" ? `Dispute resolved — ${kwd(json.data.refundAmount)} refunded (30%)` : "Dispute resolved",
        description:
          dialog.action === "refund"
            ? "Payer wallet credited, booking marked refunded, both parties notified."
            : "Resolution recorded and written to the audit trail.",
      });
      setDialog(null);
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingView label="Loading disputes…" />;
  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Disputes unavailable" sub={error} />
      </div>
    );
  }

  const open = disputes.filter((d) => d.status !== "resolved").length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Disputes</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {open > 0 ? `${open} open dispute${open > 1 ? "s" : ""} need attention` : "All disputes are resolved"} ·
            {" "}resolutions are logged and refund decisions move real money.
          </p>
        </div>
      </div>

      {disputes.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState icon={Scale} title="No disputes on record" sub="When a parent or student raises a dispute, it lands here with full booking context." />
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => {
            const st = DISPUTE_PILL[d.status] ?? { label: d.status, cls: "grey" as const };
            const canRefund = !!d.booking?.payment;
            return (
              <article key={d.id} className="sk-card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <StatusPill tone={st.cls}>{st.label}</StatusPill>
                    <span className="text-[11.5px] text-muted-foreground">
                      Raised by {d.raisedBy} · {fromNow(d.createdAt)}
                    </span>
                  </div>
                  {d.status !== "resolved" && (
                    <div className="flex gap-2">
                      <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => openDialog(d, "resolve")}>
                        <CheckCircle2 className="w-4 h-4" /> Resolve
                      </button>
                      <button
                        className="sk-btn sk-btn-orange sk-btn-sm"
                        disabled={!canRefund}
                        title={canRefund ? "Resolve and refund 30% of the payment" : "No captured payment on this booking"}
                        onClick={() => openDialog(d, "refund")}
                      >
                        <RotateCcw className="w-4 h-4" /> Resolve + refund 30%
                      </button>
                    </div>
                  )}
                </div>

                {/* booking context */}
                {d.booking && (
                  <div className="mt-3 flex items-center gap-3 flex-wrap rounded-xl border p-3">
                    <AvatarTile name={d.booking.tutor.name} color={d.booking.tutor.color} size={34} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{d.booking.tutor.name} → {d.booking.student.name}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {d.booking.subject} · {d.booking.board} · {d.booking.grade} · {MODE_LABEL[d.booking.mode] ?? d.booking.mode} ·{" "}
                        {dateTimeOf(d.booking.startAt)}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-[14px] font-extrabold tabular">{kwd(d.booking.total, 2)}</div>
                        <div className="text-[10.5px] text-muted-foreground">booking value</div>
                      </div>
                      {(() => {
                        const bs = pillFor(BOOKING_STATE_PILL, d.booking.state);
                        return <StatusPill tone={bs.cls}>{bs.label}</StatusPill>;
                      })()}
                    </div>
                  </div>
                )}

                <div className="mt-3 grid md:grid-cols-[1fr,260px] gap-3">
                  <div className="sk-well rounded-xl p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Gavel className="w-3.5 h-3.5" /> Reason
                    </div>
                    <p className="text-[12.5px] mt-1 leading-relaxed">{d.reason}</p>
                    {d.resolution && (
                      <p className="text-[12.5px] mt-2 pt-2 border-t text-[#1F9D68] dark:text-green-400">
                        <span className="font-semibold">Resolution:</span> {d.resolution}
                      </p>
                    )}
                  </div>
                  <div className="sk-well rounded-xl p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Payment</div>
                    {d.booking?.payment ? (
                      <div className="mt-1.5 space-y-1.5 text-[12.5px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Captured</span>
                          <span className="font-bold tabular">{kwd(d.booking.payment.total)}</span>
                        </div>
                        {(() => {
                          const ps = pillFor(PAYMENT_STATE_PILL, d.booking.payment.status);
                          return (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Status</span>
                              <StatusPill tone={ps.cls}>{ps.label}</StatusPill>
                            </div>
                          );
                        })()}
                        <div className="text-[11px] text-muted-foreground">
                          30% refund would return <span className="font-semibold text-foreground">{kwd(Math.round(d.booking.payment.total * 0.3))}</span> to the payer.
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground mt-1.5">
                        No payment was captured on this booking — resolve without a refund.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* resolution dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => !busy && setDialog(o ? dialog : null)}>
        <DialogContent className="sm:max-w-md">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.action === "refund" ? "Resolve + refund 30%" : "Resolve dispute"}
                </DialogTitle>
                <DialogDescription>
                  {dialog.action === "refund"
                    ? `The payer receives ${kwd(Math.round((dialog.dispute.booking?.payment?.total ?? 0) * 0.3))} (30%) in their wallet, the booking is marked refunded and both parties are notified.`
                    : "Record the outcome for both parties. No money moves — the booking stays as is."}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                className="sk-input min-h-[90px]"
                placeholder="Resolution note shared with both parties (required)…"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
              <DialogFooter className="gap-2">
                <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button
                  className={`sk-btn sk-btn-sm ${dialog.action === "refund" ? "sk-btn-orange" : "sk-btn-primary"}`}
                  disabled={busy}
                  onClick={submit}
                >
                  {busy ? "Saving…" : dialog.action === "refund" ? "Confirm refund & resolve" : "Confirm resolution"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
