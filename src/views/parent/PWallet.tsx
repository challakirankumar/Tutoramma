"use client";

import { useEffect, useState } from "react";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { kwd, dateOf, fromNow, PAYMENT_STATE_PILL } from "@/lib/format";
import { pdfInvoice } from "@/lib/pdf";
import { useAppStore } from "@/stores/app-store";
import {
  Wallet,
  Lock,
  TrendingUp,
  ArrowDownToLine,
  Users,
  Info,
  Download,
  Receipt,
  ArrowRightLeft,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

/* ---------- types ---------- */
interface LedgerRow {
  id: string;
  account: string;
  accountLabel: string;
  debit: number;
  credit: number;
  memo: string;
  at: string;
  method: string;
  status: string;
  context: string;
  studentName: string | null;
  invoiceNo: string | null;
}
interface InvoiceRow {
  id: string;
  number: string;
  amount: number;
  status: string;
  issuedAt: string;
  context: string;
  method: string;
  mode: string | null;
  paymentStatus: string;
  sessionFee: number;
  platformFee: number;
}
interface WalletData {
  wallet: { available: number; escrow: number; currency: string };
  ledger: LedgerRow[];
  invoices: InvoiceRow[];
  totals: { totalSpent: number; escrowHeld: number; payments: number };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const ACCOUNT_TONE: Record<string, "grey" | "blue" | "navy" | "green" | "orange"> = {
  payer_cash: "grey",
  escrow: "blue",
  platform_revenue: "navy",
  tutor_payable: "green",
  refunds: "orange",
};

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", applepay: "Apple Pay", wallet: "Wallet" };

export function PWallet() {
  const { user } = useAppStore();
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getJson<WalletData>("/api/wallet")
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load your wallet."));
  }, []);

  const retry = () => {
    setError("");
    getJson<WalletData>("/api/wallet")
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load your wallet."));
  };

  /* real branded PDF invoice (same builder as the student receipts) */
  const downloadInvoice = async (inv: InvoiceRow) => {
    try {
      await pdfInvoice({
        invoiceNo: inv.number,
        issuedAt: inv.issuedAt,
        status: inv.paymentStatus,
        billedTo: user?.name ?? "Parent",
        billedEmail: user?.email,
        description: inv.context,
        mode: inv.mode ?? "—",
        method: METHOD_LABEL[inv.method] ?? inv.method,
        sessionFee: inv.sessionFee,
        platformFee: inv.platformFee,
        total: inv.amount,
      });
      toast({ title: "Invoice downloaded", description: `${inv.number} — branded PDF saved to your device.` });
    } catch {
      toast({ title: "Could not build the invoice PDF", variant: "destructive" });
    }
  };

  if (error && !data) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your wallet"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary" onClick={retry}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading your wallet…" />;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Wallet &amp; Invoices</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Every rupee is accounted for — escrow holds, refunds and invoices in one ledger.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="sk-btn sk-btn-primary"
            onClick={() =>
              toast({ title: "Add funds", description: "Wallet top-up is simulated in this demo — UPI top-up coming soon." })
            }
          >
            <ArrowDownToLine className="w-4 h-4" /> Add funds
          </button>
          <button
            className="sk-btn sk-btn-ghost"
            onClick={() =>
              toast({
                title: "Split link sent",
                description: "Payment split link sent to co-parent via WhatsApp — demo.",
              })
            }
          >
            <Users className="w-4 h-4" /> Split with co-parent
          </button>
        </div>
      </div>

      {/* ---------- balance trio ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sk-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" /> Available
          </div>
          <div className="text-[26px] font-extrabold tabular mt-1.5 tracking-tight">{kwd(data.wallet.available)}</div>
          <p className="text-[11.5px] text-muted-foreground mt-1">Ready to spend on future sessions</p>
        </div>
        <div className="sk-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Lock className="w-3.5 h-3.5" /> In escrow
          </div>
          <div className="text-[26px] font-extrabold tabular mt-1.5 tracking-tight text-brand-navy">{kwd(data.wallet.escrow)}</div>
          <p className="text-[11.5px] text-muted-foreground mt-1">Held for booked sessions · released after check-out</p>
        </div>
        <div className="sk-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" /> Total spent
          </div>
          <div className="text-[26px] font-extrabold tabular mt-1.5 tracking-tight text-brand-orange">
            {kwd(data.totals.totalSpent)}
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1">{data.totals.payments} payments to date</p>
        </div>
      </div>

      {/* ---------- escrow explainer ---------- */}
      <div className="sk-callout sk-callout-info flex gap-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">How escrow works —</span> your payment is held safely by Tutor Amma the moment
          you book. Funds release to the tutor only after the session is checked out and the 24-hour dispute window
          closes. Cancellations more than 12 hours ahead are refunded in full.
        </div>
      </div>

      {/* ---------- transactions ---------- */}
      <div className="sk-card p-5">
        <SectionTitle
          title="Transactions"
          sub="Double-entry ledger — money in, escrow holds and releases"
          right={<span className="sk-pill sk-pill-grey"><ArrowRightLeft className="w-3 h-3" /> {data.ledger.length} entries</span>}
        />
        {data.ledger.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions yet" sub="Payments appear here the moment you book a session." />
        ) : (
          <div className="mt-3 divide-y divide-border/70 max-h-[420px] overflow-y-auto sk-scroll">
            {data.ledger.map((e) => (
              <div key={e.id} className="py-3 flex items-start gap-3 first:pt-1">
                <div
                  className={`sk-avatar shrink-0 flex items-center justify-center ${
                    e.account === "escrow"
                      ? "bg-gradient-to-b from-[#33549E] to-[#14246B] text-white"
                      : e.account === "tutor_payable" || e.account === "refunds"
                        ? "bg-gradient-to-b from-[#46BD85] to-[#1F9D68] text-white"
                        : "bg-gradient-to-b from-[#E4E9F4] to-[#D4DCEC] text-[#7C88A8]"
                  }`}
                  style={{ width: 36, height: 36, borderRadius: 11 }}
                >
                  {e.account === "escrow" ? (
                    <Lock className="w-4 h-4" />
                  ) : e.account === "tutor_payable" || e.account === "refunds" ? (
                    <ArrowDownToLine className="w-4 h-4" />
                  ) : (
                    <ArrowRightLeft className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold truncate">{e.memo || e.context}</span>
                    <span className={`sk-pill sk-pill-${ACCOUNT_TONE[e.account] ?? "grey"}`}>{e.accountLabel}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">
                    {e.context}
                    {e.invoiceNo ? ` · ${e.invoiceNo}` : ""} · {fromNow(e.at)}
                  </div>
                </div>
                <div className="text-right shrink-0 tabular">
                  {e.debit > 0 ? (
                    <div className="text-[13.5px] font-bold text-[#C03342]">−{kwd(e.debit)}</div>
                  ) : (
                    <div className="text-[13.5px] font-bold text-[#156F4C]">+{kwd(e.credit)}</div>
                  )}
                  <div className="text-[10.5px] text-muted-foreground uppercase">{e.method}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- invoices ---------- */}
      <div className="sk-card p-5">
        <SectionTitle title="Invoices" sub="Official receipts for every payment — kept for your records" />
        {data.invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" />
        ) : (
          <div className="mt-3 divide-y divide-border/70 max-h-96 overflow-y-auto sk-scroll">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="py-3 flex items-center gap-3 first:pt-1">
                <div className="sk-avatar bg-gradient-to-b from-[#FFA24D] to-[#E76E0F] text-white shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 11 }}>
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-bold">{inv.number}</span>
                    <StatusPill tone={pillFor(PAYMENT_STATE_PILL, inv.status === "paid" ? "succeeded" : inv.status).cls}>
                      {pillFor(PAYMENT_STATE_PILL, inv.status === "paid" ? "succeeded" : inv.status).label}
                    </StatusPill>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                    {inv.context} · {dateOf(inv.issuedAt)} · {inv.method.toUpperCase()}
                  </div>
                </div>
                <span className="text-[13.5px] font-extrabold tabular shrink-0">{kwd(inv.amount)}</span>
                <button
                  className="sk-btn sk-btn-ghost sk-btn-sm shrink-0"
                  onClick={() => downloadInvoice(inv)}
                  aria-label={`Download invoice ${inv.number} as PDF`}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
