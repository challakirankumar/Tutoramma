"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Landmark, PiggyBank, RefreshCw, RotateCcw, ShieldQuestion, TrendingUp } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { PAYMENT_STATE_PILL, dateOf, dateTimeOf, fromNow, kwd } from "@/lib/format";

interface PaymentRow {
  id: string;
  createdAt: string;
  purpose: string;
  method: string;
  provider: string;
  sessionFee: number;
  platformFee: number;
  total: number;
  status: string;
  refunded: number;
  bookingTitle: string | null;
  payerName: string;
  payerColor: string;
  tutorName: string | null;
  tutorColor: string | null;
  invoiceNo: string | null;
}

interface LedgerRow {
  id: string;
  account: string;
  debit: number;
  credit: number;
  memo: string;
  createdAt: string;
  paymentId: string;
}

interface PayoutRow {
  id: string;
  tutorId: string;
  tutorName: string;
  tutorColor: string;
  amount: number;
  status: string;
  bankMask: string;
  createdAt: string;
  paidAt: string | null;
}

interface PaymentsData {
  summary: { escrowHeld: number; released: number; platformRevenue: number; pendingPayouts: number; pendingPayoutCount: number };
  payments: PaymentRow[];
  ledger: LedgerRow[];
  payouts: PayoutRow[];
}

const METHOD_PILL: Record<string, { label: string; cls: "navy" | "green" | "grey" }> = {
  upi: { label: "UPI", cls: "navy" },
  card: { label: "Card", cls: "green" },
  applepay: { label: "Apple Pay", cls: "grey" },
  wallet: { label: "Wallet", cls: "green" },
};

const ACCOUNT_PILL: Record<string, { label: string; cls: "grey" | "blue" | "navy" | "green" | "orange" }> = {
  payer_cash: { label: "payer_cash", cls: "grey" },
  escrow: { label: "escrow", cls: "blue" },
  platform_revenue: { label: "platform_revenue", cls: "navy" },
  tutor_payable: { label: "tutor_payable", cls: "green" },
  refunds: { label: "refunds", cls: "orange" },
};

const PAYOUT_PILL: Record<string, { label: string; cls: "orange" | "blue" | "green" }> = {
  pending: { label: "Pending", cls: "orange" },
  processing: { label: "Processing", cls: "blue" },
  paid: { label: "Paid", cls: "green" },
};

export function APayments() {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [error, setError] = useState("");
  const [refund, setRefund] = useState<PaymentRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load payments.");
      setData(json.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openRefund = (p: PaymentRow) => {
    setAmount(((p.total - p.refunded) / 100).toFixed(2));
    setReason("");
    setRefund(p);
  };

  const submitRefund = async () => {
    if (!refund) return;
    const paiseAmount = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(paiseAmount) || paiseAmount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (paiseAmount > refund.total - refund.refunded) {
      toast({ title: "Amount exceeds the refundable balance", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "A refund reason is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/payments/refund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: refund.id, amount: paiseAmount, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Refund failed.");
      toast({
        title: `Refunded ${kwd(paiseAmount)}`,
        description: `${refund.payerName}'s wallet credited · ledger balanced · payment marked ${json.data.status.replace("_", " ")}.`,
      });
      setRefund(null);
      await load();
    } catch (e) {
      toast({ title: "Refund failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approvePayout = async (p: PayoutRow) => {
    setPayoutBusy(p.id);
    try {
      const res = await fetch(`/api/admin/payouts/${p.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Payout approval failed.");
      toast({ title: `Payout approved — ${kwd(p.amount)}`, description: `${p.tutorName} · ${p.bankMask} · wallet balance adjusted.` });
      await load();
    } catch (e) {
      toast({ title: "Payout failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setPayoutBusy("");
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Payments unavailable" sub={error} />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading escrow & payments…" />;

  const { summary } = data;
  const cards = [
    { label: "Held in escrow", value: kwd(summary.escrowHeld), sub: "awaiting session completion", icon: PiggyBank, tone: "blue" as const },
    { label: "Released to tutors", value: kwd(summary.released), sub: "after dispute windows", icon: TrendingUp, tone: "green" as const },
    { label: "Platform revenue", value: kwd(summary.platformRevenue), sub: "8% commission on released", icon: Landmark, tone: "navy" as const },
    { label: "Pending payouts", value: kwd(summary.pendingPayouts), sub: `${summary.pendingPayoutCount} request${summary.pendingPayoutCount === 1 ? "" : "s"} awaiting approval`, icon: Banknote, tone: "orange" as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Payments & Escrow</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Double-entry ledger · escrow releases · refunds · tutor payouts — all money moves are logged to the audit trail.
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* escrow summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="sk-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="w-4 h-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">{c.label}</span>
            </div>
            <div className="text-[20px] font-extrabold tabular mt-1.5">{c.value}</div>
            <div className="text-[11.5px] text-muted-foreground mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments ({data.payments.length})</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payouts">Payouts ({data.payouts.length})</TabsTrigger>
        </TabsList>

        {/* payments tab */}
        <TabsContent value="payments" className="mt-4">
          <div className="sk-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Invoice</th>
                    <th className="px-3 py-2.5 font-semibold">Payer → Tutor</th>
                    <th className="px-3 py-2.5 font-semibold">Purpose</th>
                    <th className="px-3 py-2.5 font-semibold">Method</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => {
                    const st = pillFor(PAYMENT_STATE_PILL, p.status);
                    const md = METHOD_PILL[p.method] ?? { label: p.method, cls: "grey" as const };
                    const refundable = p.total - p.refunded;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="font-semibold">{dateOf(p.createdAt)}</div>
                          <div className="text-[11px] text-muted-foreground">{fromNow(p.createdAt)}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground whitespace-nowrap">{p.invoiceNo ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <AvatarTile name={p.payerName} color={p.payerColor} size={22} />
                            <span className="font-medium">{p.payerName}</span>
                          </div>
                          {p.tutorName && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <AvatarTile name={p.tutorName} color={p.tutorColor ?? "#315BE5"} size={22} />
                              <span className="text-muted-foreground">{p.tutorName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <div className="truncate">{p.bookingTitle ?? (p.purpose === "batch_seat" ? "Group seat" : "Session")}</div>
                          <div className="text-[11px] text-muted-foreground">{p.purpose === "batch_seat" ? "Batch seat" : "Booking"}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={md.cls}>{md.label}</StatusPill>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="font-bold tabular">{kwd(p.total, 2)}</div>
                          {p.refunded > 0 && <div className="text-[10.5px] text-[#C03342]">−{kwd(p.refunded, 2)} refunded</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={st.cls}>{st.label}</StatusPill>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {["held", "released"].includes(p.status) && refundable > 0 ? (
                            <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => openRefund(p)}>
                              <RotateCcw className="w-3.5 h-3.5" /> Refund
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ledger tab */}
        <TabsContent value="ledger" className="mt-4">
          <div className="sk-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Time</th>
                    <th className="px-3 py-2.5 font-semibold">Account</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Debit</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Credit</th>
                    <th className="px-3 py-2.5 font-semibold">Memo</th>
                    <th className="px-4 py-2.5 font-semibold">Payment ref</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((l) => {
                    const acc = ACCOUNT_PILL[l.account] ?? { label: l.account, cls: "grey" as const };
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{dateTimeOf(l.createdAt)}</td>
                        <td className="px-3 py-2">
                          <StatusPill tone={acc.cls} dot={false}>
                            {acc.label}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-2 text-right tabular font-semibold">{l.debit > 0 ? kwd(l.debit, 2) : ""}</td>
                        <td className="px-3 py-2 text-right tabular font-semibold text-[#1F9D68]">{l.credit > 0 ? kwd(l.credit, 2) : ""}</td>
                        <td className="px-3 py-2 max-w-[220px]">
                          <div className="truncate text-muted-foreground">{l.memo}</div>
                        </td>
                        <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">{l.paymentId.slice(0, 10)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* payouts tab */}
        <TabsContent value="payouts" className="mt-4">
          <div className="sk-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Tutor</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                    <th className="px-3 py-2.5 font-semibold">Bank</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Requested</th>
                    <th className="px-3 py-2.5 font-semibold">Paid</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <AvatarTile name={p.tutorName} color={p.tutorColor} size={26} />
                          <span className="font-medium">{p.tutorName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular">{kwd(p.amount)}</td>
                      <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{p.bankMask}</td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const ps = PAYOUT_PILL[p.status] ?? { label: p.status, cls: "grey" as const };
                          return <StatusPill tone={ps.cls}>{ps.label}</StatusPill>;
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{dateOf(p.createdAt)} · {fromNow(p.createdAt)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.paidAt ? dateOf(p.paidAt) : "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        {p.status === "pending" ? (
                          <button className="sk-btn sk-btn-primary sk-btn-sm" disabled={payoutBusy === p.id} onClick={() => approvePayout(p)}>
                            {payoutBusy === p.id ? "Approving…" : "Approve"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* refund dialog */}
      <Dialog open={!!refund} onOpenChange={(o) => !busy && setRefund(o ? refund : null)}>
        <DialogContent className="sm:max-w-md">
          {refund && (
            <>
              <DialogHeader>
                <DialogTitle>Issue refund</DialogTitle>
                <DialogDescription>
                  {refund.payerName} · {refund.invoiceNo ?? "no invoice"} · refundable balance{" "}
                  <span className="font-semibold text-foreground">{kwd(refund.total - refund.refunded)}</span>. The amount is credited
                  to the payer's wallet and balanced in the ledger.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] font-semibold" htmlFor="refund-amount">
                    Amount (₹) — max {(refund.total - refund.refunded) / 100}
                  </label>
                  <input
                    id="refund-amount"
                    className="sk-input w-full mt-1 tabular"
                    type="number"
                    min="0"
                    max={(refund.total - refund.refunded) / 100}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold" htmlFor="refund-reason">
                    Reason (required)
                  </label>
                  <textarea
                    id="refund-reason"
                    className="sk-input w-full mt-1 min-h-[70px]"
                    placeholder="e.g. Session shortened — goodwill partial refund"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={busy} onClick={() => setRefund(null)}>
                  Cancel
                </button>
                <button className="sk-btn sk-btn-orange sk-btn-sm" disabled={busy} onClick={submitRefund}>
                  {busy ? "Processing…" : "Confirm refund"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
