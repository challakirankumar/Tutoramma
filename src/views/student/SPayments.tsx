"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { kwd, dateOf, PAYMENT_STATE_PILL } from "@/lib/format";
import { pdfInvoice } from "@/lib/pdf";
import {
  Receipt,
  Download,
  Wallet,
  Lock,
  RefreshCw,
  ShieldAlert,
  Banknote,
  CreditCard,
} from "lucide-react";

/* ---------------- types ---------------- */
interface Booking {
  id: string;
  title: string;
  mode: string;
  state: string;
  startAt: string;
  payment: {
    id: string;
    status: string;
    method: string;
    purpose: string;
    sessionFee: number;
    platformFee: number;
    total: number;
    createdAt: string;
    invoiceNo: string | null;
    invoiceIssuedAt: string | null;
  } | null;
}

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", applepay: "Apple Pay", wallet: "Wallet" };

/* ---------------- view ---------------- */
export function SPayments() {
  const { user } = useAppStore();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");

  const downloadReceipt = async (inv: Booking) => {
    const p = inv.payment!;
    try {
      await pdfInvoice({
        invoiceNo: p.invoiceNo ?? "—",
        issuedAt: p.invoiceIssuedAt ?? p.createdAt,
        status: p.status,
        billedTo: user?.name ?? "Student",
        billedEmail: user?.email,
        description: inv.title,
        mode: inv.mode,
        method: METHOD_LABEL[p.method] ?? p.method,
        sessionFee: p.sessionFee,
        platformFee: p.platformFee,
        total: p.total,
      });
      toast({ title: "Receipt downloaded", description: `${p.invoiceNo ?? "Invoice"} — branded PDF saved.` });
    } catch {
      toast({ title: "Could not build the receipt PDF", variant: "destructive" });
    }
  };

  const load = () => {
    getJson<Booking[]>("/api/bookings")
      .then((d) => {
        setError("");
        setBookings(d);
      })
      .catch((e) => setError(e.message || "Couldn't load your invoices."));
  };

  useEffect(load, []);

  const invoices = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => b.payment)
        .sort((a, b) => new Date(b.payment!.createdAt).getTime() - new Date(a.payment!.createdAt).getTime()),
    [bookings]
  );

  const totals = useMemo(() => {
    let spent = 0;
    let escrow = 0;
    let refunded = 0;
    for (const inv of invoices) {
      const p = inv.payment!;
      if (["held", "released"].includes(p.status)) spent += p.total;
      if (p.status === "held") escrow += p.total;
      if (p.status === "refunded") refunded += p.total;
    }
    return { spent, escrow, refunded };
  }, [invoices]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your invoices"
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
  if (!bookings) return <LoadingView label="Loading your invoices…" />;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Invoices</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Every payment you make is held in escrow and released only after the session is done.
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <Receipt className="w-3 h-3" /> {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* ---------- summary ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Total spent" value={kwd(totals.spent)} sub={`${invoices.length} paid sessions`} icon={Banknote} tone="navy" />
        <KpiCard label="In escrow now" value={kwd(totals.escrow)} sub="Released after check-out" icon={Lock} tone="royal" />
        <KpiCard label="Refunded" value={kwd(totals.refunded)} sub="Cancellations & batch refunds" icon={Wallet} tone="green" />
      </div>

      {/* ---------- invoices table ---------- */}
      {invoices.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            sub="When you book a session or join a group, your invoices and receipts will appear here."
          />
        </div>
      ) : (
        <>
          {/* desktop table */}
          <div className="sk-card p-5 hidden md:block">
            <div className="overflow-x-auto sk-scroll">
              <table className="w-full text-[13px] min-w-[640px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="text-left py-2.5 pr-3 font-bold">Invoice</th>
                    <th className="text-left py-2.5 pr-3 font-bold">Date</th>
                    <th className="text-left py-2.5 pr-3 font-bold">Description</th>
                    <th className="text-left py-2.5 pr-3 font-bold">Method</th>
                    <th className="text-right py-2.5 pr-3 font-bold">Amount</th>
                    <th className="text-left py-2.5 pr-3 font-bold">Status</th>
                    <th className="text-right py-2.5 font-bold">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const p = inv.payment!;
                    const pill = pillFor(PAYMENT_STATE_PILL, p.status);
                    return (
                      <tr key={inv.id} className="border-b border-border/60 last:border-0 hover:bg-white/50 transition-colors">
                        <td className="py-3 pr-3 font-bold tabular text-brand-navy">{p.invoiceNo ?? "—"}</td>
                        <td className="py-3 pr-3 text-muted-foreground tabular">{dateOf(p.invoiceIssuedAt ?? p.createdAt)}</td>
                        <td className="py-3 pr-3 font-semibold max-w-[220px] truncate" title={inv.title}>
                          {inv.title}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">{METHOD_LABEL[p.method] ?? p.method}</td>
                        <td className="py-3 pr-3 text-right tabular font-bold">{kwd(p.total)}</td>
                        <td className="py-3 pr-3">
                          <StatusPill tone={pill.cls}>{pill.label}</StatusPill>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            className="sk-btn sk-btn-ghost sk-btn-sm"
                            onClick={() => downloadReceipt(inv)}
                          >
                            <Download className="w-3.5 h-3.5" /> Receipt
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* mobile cards */}
          <div className="md:hidden space-y-3">
            {invoices.map((inv) => {
              const p = inv.payment!;
              const pill = pillFor(PAYMENT_STATE_PILL, p.status);
              return (
                <div key={inv.id} className="sk-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[13.5px] tabular text-brand-navy">{p.invoiceNo ?? "—"}</div>
                      <div className="text-[12px] font-semibold truncate mt-0.5">{inv.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {dateOf(p.invoiceIssuedAt ?? p.createdAt)} · {METHOD_LABEL[p.method] ?? p.method}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-[14.5px] tabular">{kwd(p.total)}</div>
                      <div className="mt-1.5">
                        <StatusPill tone={pill.cls}>{pill.label}</StatusPill>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/60 flex justify-end">
                    <button
                      className="sk-btn sk-btn-ghost sk-btn-sm"
                      onClick={() => downloadReceipt(inv)}
                    >
                      <Download className="w-3.5 h-3.5" /> Receipt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sk-callout sk-callout-info flex gap-2.5">
            <CreditCard className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">How escrow works:</span> your payment is held safely by Tutor Amma — the tutor
              is paid only after the session check-out and a 24-hour dispute window. Session fee + 8% platform fee are shown
              on every invoice.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
