"use client";

import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { dateOf, kwd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, BadgeCheck, FileDown, Landmark, Loader2, Lock, PiggyBank, Printer, TrendingUp, Wallet } from "lucide-react";
import { pdfEarnings, downloadCsv } from "@/lib/pdf";
import { useAppStore } from "@/stores/app-store";

interface EarningsData {
  series: { weekStart: string; label: string; amount: number }[];
  totals: { lifetime: number; thisMonth: number; escrowHeld: number; pendingPayouts: number; walletAvailable: number };
  payouts: { id: string; amount: number; status: string; bankMask: string; requestedAt: string; paidAt: string | null }[];
}

interface WalletBankInfo {
  bankMask: string;
  bankVerified: boolean;
  pendingPayout: number;
}

const PAYOUT_STATE_PILL: Record<string, { label: string; cls: "green" | "orange" | "grey" | "blue" }> = {
  pending: { label: "Pending", cls: "orange" },
  processing: { label: "Processing", cls: "blue" },
  paid: { label: "Paid", cls: "green" },
};

export function TEarnings() {
  const { user } = useAppStore();
  const [data, setData] = useState<EarningsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bank, setBank] = useState<WalletBankInfo | null>(null);
  const [ibanText, setIbanText] = useState("");
  const [bankNameText, setBankNameText] = useState("");
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tutor/earnings");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load earnings.");
      setData(json.data as EarningsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load earnings.");
    }
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && !json?.error && json?.data?.wallet) {
        setBank({
          bankMask: json.data.wallet.bankMask ?? "",
          bankVerified: !!json.data.wallet.bankVerified,
          pendingPayout: json.data.wallet.pendingPayout ?? 0,
        });
      }
    } catch {
      /* bank card simply stays hidden until the wallet loads */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPayout = () => {
    if (data) setAmountText((data.totals.walletAvailable / 100).toFixed(2));
    setPayoutOpen(true);
  };

  const amountPaise = Math.round((parseFloat(amountText) || 0) * 100);
  const minPaise = 50000;
  const amountValid =
    !!data && Number.isFinite(amountPaise) && amountPaise >= minPaise && amountPaise <= data.totals.walletAvailable;

  const submitPayout = async () => {
    if (!amountValid || !data) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tutor/payouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: amountPaise }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Payout request failed.");
      toast({
        title: "Payout requested",
        description: `${kwd(amountPaise)} is on its way to ${json?.data?.bankMask ?? "your bank"} — transfers land within 2 business days.`,
      });
      setPayoutOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Payout on hold", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const verifyBank = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/wallet/verify-bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iban: ibanText.trim(), bankName: bankNameText.trim() || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.error) throw new Error(json?.error?.message || "Bank verification failed.");
      toast({
        title: "Bank account verified ✓",
        description: `${json.data.bankMask} is ready for payouts.`,
      });
      setIbanText("");
      setBankNameText("");
      await load();
    } catch (e) {
      toast({ title: "Couldn't verify bank account", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const ibanValid = /^\d{9,18}\s*(?:·|•)?\s*[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ibanText.trim());

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={Wallet}
          title="Earnings unavailable"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={load}>
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Counting your earnings…" />;

  const maxWeek = Math.max(...data.series.map((s) => s.amount));
  const chartData = data.series.map((s) => ({ ...s, inr: s.amount / 100 }));

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Earnings & payouts</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Net of the 8% platform fee · escrow releases 24h after each session
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="sk-btn sk-btn-ghost sk-btn-sm"
            onClick={async () => {
              if (!data) return;
              try {
                await pdfEarnings({
                  tutorName: user?.name ?? "Tutor",
                  totals: data.totals,
                  series: data.series,
                  payouts: data.payouts,
                });
                toast({ title: "Statement PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
              } catch {
                toast({ title: "Could not build the PDF", variant: "destructive" });
              }
            }}
          >
            <Printer className="w-3.5 h-3.5" /> Statement PDF
          </button>
          <button
            className="sk-btn sk-btn-ghost sk-btn-sm"
            onClick={() => {
              if (!data) return;
              downloadCsv(
                "TutorAmma_Earnings",
                ["Week", "Net (₹)"],
                data.series.map((s) => [s.label, (s.amount / 100).toFixed(2)])
              );
              toast({ title: "CSV exported", description: "Opens directly in Excel or Google Sheets." });
            }}
          >
            <FileDown className="w-3.5 h-3.5" /> Excel (CSV)
          </button>
          <button
            className="sk-btn sk-btn-orange sk-btn-sm"
            onClick={openPayout}
            disabled={bank !== null && !bank.bankVerified}
            title={bank !== null && !bank.bankVerified ? "Verify your bank account first" : undefined}
          >
            <Banknote className="w-3.5 h-3.5" /> Request payout
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Lifetime earnings" value={kwd(data.totals.lifetime)} sub="released to date" icon={TrendingUp} tone="navy" />
        <KpiCard label="This month" value={kwd(data.totals.thisMonth)} sub="calendar month to date" icon={PiggyBank} tone="green" />
        <KpiCard label="In escrow" value={kwd(data.totals.escrowHeld)} sub="held until check-out + 24h" icon={Lock} tone="orange" />
        <KpiCard label="Pending payout" value={kwd(data.totals.pendingPayouts)} sub="in transit to your bank" icon={Landmark} tone="royal" />
      </div>

      {/* chart + explainer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <section className="lg:col-span-2 sk-card p-5 space-y-3" aria-label="Weekly net earnings">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight">Net earnings — last 8 weeks</h2>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">Best week highlighted in orange</p>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7694" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B7694" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}`}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "rgba(49,91,229,0.06)" }}
                  formatter={(value: number | string) => [kwd(Number(value) * 100), "Net earnings"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E3E9F4",
                    boxShadow: "0 8px 30px rgba(20,36,107,.12)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="inr" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {chartData.map((s, i) => (
                    <Cell key={i} fill={s.amount === maxWeek && s.amount > 0 ? "#F47B20" : "#14246B"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="sk-card p-5 space-y-3" aria-label="Bank account">
          <h2 className="text-[16px] font-bold tracking-tight flex items-center gap-2">
            <Landmark className="w-4 h-4 text-brand-orange" /> Bank account
          </h2>
          {bank === null ? (
            <div className="sk-well p-3 text-[12px] text-muted-foreground">Loading bank details…</div>
          ) : bank.bankVerified ? (
            <div className="sk-well p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-[13.5px] truncate">{bank.bankMask || "Verified bank account"}</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">Payouts are sent to this account</div>
              </div>
              <span className="sk-pill sk-pill-green shrink-0">
                <BadgeCheck className="w-3 h-3" /> Verified
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="sk-callout sk-callout-info text-[11.5px]">
                Add and verify a bank account before requesting a payout — account number + IFSC, we store it masked.
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="bank-iban">
                  Account no. + IFSC
                </label>
                <Input
                  id="bank-iban"
                  className="sk-input mt-1 tabular uppercase"
                  placeholder="50100xxxxxx · SBIN0001234"
                  value={ibanText}
                  onChange={(e) => setIbanText(e.target.value)}
                  autoComplete="off"
                />
                {ibanText !== "" && !ibanValid && (
                  <p className="text-[11.5px] text-destructive mt-1">9–18 digit account number followed by the 11-character IFSC (e.g. 501001234567 · SBIN0001234).</p>
                )}
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="bank-name">
                  Bank name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="bank-name"
                  className="sk-input mt-1"
                  placeholder="SBI"
                  value={bankNameText}
                  onChange={(e) => setBankNameText(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button className="sk-btn sk-btn-primary w-full" disabled={!ibanValid || verifying} onClick={verifyBank}>
                {verifying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    <BadgeCheck className="w-3.5 h-3.5" /> Verify bank account
                  </>
                )}
              </button>
            </div>
          )}
        </section>

        <section className="sk-card p-5 space-y-3" aria-label="How escrow works">
          <h2 className="text-[16px] font-bold tracking-tight">How escrow works</h2>
          <ol className="space-y-2.5 text-[12.5px] text-muted-foreground leading-relaxed list-decimal list-inside">
            <li>Parents pay upfront by UPI or card — funds sit in escrow, never with the family.</li>
            <li>After the session (OTP check-out for home visits), the dispute window runs 24 hours.</li>
            <li>Your net fee then releases to your wallet, minus the 8% platform fee the family pays on top.</li>
            <li>Request a payout any time — minimum ₹500.00, usually landed in 2 business days.</li>
          </ol>
          <div className="sk-well p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Wallet available now</span>
              <span className="font-bold tabular text-[14px]">{kwd(data.totals.walletAvailable)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Pending payout (in transit)</span>
              <span className="font-bold tabular text-[14px] text-brand-orange">{kwd(bank?.pendingPayout ?? 0)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* payouts */}
      <section className="sk-card p-0 overflow-hidden" aria-label="Payout history">
        <div className="p-5 pb-3">
          <h2 className="text-[16px] font-bold tracking-tight">Payout history</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{data.payouts.length} payout request{data.payouts.length === 1 ? "" : "s"} to date</p>
        </div>
        {data.payouts.length === 0 ? (
          <div className="pb-6">
            <EmptyState icon={Landmark} title="No payouts yet" sub="Request your first payout once at least ₹500.00 is available." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payouts.map((p) => {
                const pill = PAYOUT_STATE_PILL[p.status] ?? { label: p.status, cls: "grey" as const };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold tabular">{kwd(p.amount)}</TableCell>
                    <TableCell>
                      <StatusPill tone={pill.cls}>{pill.label}</StatusPill>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12.5px]">{p.bankMask}</TableCell>
                    <TableCell className="text-muted-foreground tabular text-[12.5px]">{dateOf(p.requestedAt)}</TableCell>
                    <TableCell className="text-right tabular text-[12.5px] text-muted-foreground">
                      {p.paidAt ? dateOf(p.paidAt) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {/* payout dialog */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a payout</DialogTitle>
            <DialogDescription>
              Transfers go to your verified bank account and usually land within 2 business days. Minimum ₹500.00.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="sk-well p-3 flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Available in wallet</span>
              <span className="font-bold tabular">{kwd(data.totals.walletAvailable)}</span>
            </div>
            {bank?.bankVerified ? (
              <div className="sk-well p-3 flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-muted-foreground">Transfer to</span>
                <span className="font-semibold truncate flex items-center gap-1.5">
                  {bank.bankMask || "Verified bank account"} <BadgeCheck className="w-3.5 h-3.5 text-[#1F9D68] shrink-0" />
                </span>
              </div>
            ) : (
              <div className="sk-callout sk-callout-info text-[11.5px]">
                Add and verify a bank account before requesting a payout — see the Bank account card.
              </div>
            )}
            <div>
              <label className="text-[12px] font-semibold" htmlFor="payout-amount">
                Amount (₹)
              </label>
              <Input
                id="payout-amount"
                className="sk-input mt-1 tabular"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0.00"
              />
              {amountText !== "" && !amountValid && (
                <p className="text-[11.5px] text-destructive mt-1.5">
                  {amountPaise < minPaise
                    ? "Minimum payout is ₹500.00."
                    : `Amount exceeds your available ${kwd(data.totals.walletAvailable)}.`}
                </p>
              )}
            </div>
            <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Payouts pause automatically while a dispute is open on one of your bookings.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPayoutOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!amountValid || submitting || (bank !== null && !bank.bankVerified)} onClick={submitPayout}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />} Request{" "}
              {amountValid ? kwd(amountPaise) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
