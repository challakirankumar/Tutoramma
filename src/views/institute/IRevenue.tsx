"use client";

import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { dateOf, kwd } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, BadgeCheck, Landmark, Loader2, Lock, PiggyBank, RefreshCw, ShieldAlert, TrendingUp, Wallet } from "lucide-react";

/* ---------------- types ---------------- */
interface RevenueData {
  breakdown: { gross: number; platformFee: number; net: number; released: number; held: number };
  byMonth: { label: string; gross: number; net: number }[];
  payouts: { id: string; amount: number; status: string; bankMask: string; createdAt: string; paidAt: string | null }[];
  payoutSummary: { available: number; pending: number; paidOut: number };
  disputesHeld: number;
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

/* ---------------- view ---------------- */
export function IRevenue() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [error, setError] = useState("");
  const [amountText, setAmountText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bank, setBank] = useState<WalletBankInfo | null>(null);
  const [ibanText, setIbanText] = useState("");
  const [bankNameText, setBankNameText] = useState("");
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(() => {
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/institute/revenue", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json?.error) throw new Error(json?.error?.message || "Couldn't load revenue.");
        setData(json.data as RevenueData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load revenue.");
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
        /* bank section simply shows the verify form until the wallet loads */
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const amount = parseFloat(amountText);
  const amountValid =
    !!data && Number.isFinite(amount) && amount >= 500 && Math.round(amount * 100) <= data.payoutSummary.available;

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
        description: `${json.data.bankMask} is ready for academy payouts.`,
      });
      setIbanText("");
      setBankNameText("");
      load();
    } catch (e) {
      toast({ title: "Couldn't verify bank account", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const ibanValid = /^\d{9,18}\s*(?:·|•)?\s*[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ibanText.trim());

  const requestPayout = async () => {
    if (!amountValid || !data) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/institute/revenue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.error) throw new Error(json?.error?.message || "Payout request failed.");
      toast({
        title: "Bulk payout requested",
        description: `${kwd(json.data.amount)} is being prepared for ${bank?.bankMask || "your verified bank"} — transfers usually land within 2 business days.`,
      });
      setAmountText("");
      load();
    } catch (e) {
      toast({ title: "Payout on hold", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Revenue unavailable"
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
  if (!data) return <LoadingView label="Counting academy revenue…" />;

  const chartData = data.byMonth.map((m) => ({ ...m, grossInr: m.gross / 100, netInr: m.net / 100 }));

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Revenue &amp; Payouts</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Seat collections and sessions across all academy tutors · net of the 8% platform fee
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <Lock className="w-3 h-3" /> {kwd(data.breakdown.held)} in escrow
        </span>
      </div>

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Gross collected" value={kwd(data.breakdown.gross)} sub="released + escrow, all tutors" icon={TrendingUp} tone="navy" />
        <KpiCard label="Platform fees" value={kwd(data.breakdown.platformFee)} sub="8% paid by families" icon={PiggyBank} tone="orange" />
        <KpiCard label="Net to academy" value={kwd(data.breakdown.net)} sub="after platform fees" icon={Wallet} tone="green" />
        <KpiCard
          label="Available for payout"
          value={kwd(data.payoutSummary.available)}
          sub={`after ${kwd(data.payoutSummary.paidOut)} paid out`}
          icon={Banknote}
          tone="royal"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ---------- monthly chart ---------- */}
        <section className="lg:col-span-2 sk-card p-5 space-y-3" aria-label="Monthly collections">
          <div className="flex items-end justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight">Collections — last 6 months</h2>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">Gross seat collections vs net to the academy</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: "#14246B" }} /> Gross
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: "#F47B20" }} /> Net
              </span>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7694" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7694" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: "rgba(49,91,229,0.06)" }}
                  formatter={(value: number | string, name: string) => [kwd(Number(value) * 100), name === "grossInr" ? "Gross" : "Net to academy"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E3E9F4", boxShadow: "0 8px 30px rgba(20,36,107,.12)", fontSize: 12 }}
                />
                <Bar dataKey="grossInr" fill="#14246B" radius={[5, 5, 0, 0]} maxBarSize={22} />
                <Bar dataKey="netInr" fill="#F47B20" radius={[5, 5, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ---------- request payout card ---------- */}
        <section className="sk-card p-5 space-y-3.5" aria-label="Request bulk payout">
          <h2 className="text-[16px] font-bold tracking-tight flex items-center gap-2">
            <Landmark className="w-4 h-4 text-brand-orange" /> Request bulk payout
          </h2>
          <div className="sk-well p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Available balance</span>
              <span className="font-bold tabular">{kwd(data.payoutSummary.available)}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Pending payout (in transit)</span>
              <span className="font-bold tabular text-brand-orange">{kwd(bank?.pendingPayout ?? 0)}</span>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold" htmlFor="payout-amount">
              Amount (₹)
            </label>
            <Input
              id="payout-amount"
              className="sk-input mt-1 tabular"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
            {amountText !== "" && !amountValid && (
              <p className="text-[11.5px] text-destructive mt-1.5">
                {Number.isFinite(amount) && amount < 500
                  ? "Minimum payout is ₹500.00."
                  : `Amount exceeds your available ${kwd(data.payoutSummary.available)}.`}
              </p>
            )}
          </div>

          {/* bank account — verified state or inline verification */}
          {bank === null ? (
            <div className="sk-well p-3 text-[12px] text-muted-foreground">Loading bank details…</div>
          ) : bank.bankVerified ? (
            <div className="sk-well p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank account</div>
                <div className="font-bold text-[13.5px] truncate mt-0.5">{bank.bankMask || "Verified bank account"}</div>
              </div>
              <span className="sk-pill sk-pill-green shrink-0">
                <BadgeCheck className="w-3 h-3" /> Verified
              </span>
            </div>
          ) : (
            <div className="sk-well p-3 space-y-2.5">
              <div className="text-[11.5px] text-muted-foreground">
                Add and verify a bank account before requesting a payout — payouts are sent only to verified accounts.
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="academy-bank-iban">
                  Account no. + IFSC
                </label>
                <Input
                  id="academy-bank-iban"
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
                <label className="text-[12px] font-semibold" htmlFor="academy-bank-name">
                  Bank name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="academy-bank-name"
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

          <button
            className="sk-btn sk-btn-orange w-full"
            disabled={!amountValid || submitting || (bank !== null && !bank.bankVerified)}
            onClick={requestPayout}
            title={bank !== null && !bank.bankVerified ? "Add and verify a bank account before requesting a payout." : undefined}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Requesting…
              </>
            ) : (
              <>
                <Banknote className="w-3.5 h-3.5" /> Request payout {amountValid ? `of ${kwd(Math.round(amount * 100))}` : ""}
              </>
            )}
          </button>
          {bank !== null && !bank.bankVerified && (
            <p className="text-[11.5px] text-brand-orange font-semibold">Verify your bank account above to enable payouts.</p>
          )}
          <div className="text-[11.5px] text-muted-foreground flex items-start gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Payouts are held while disputes are open. {kwd(data.payoutSummary.pending)} is already in transit to your bank.
          </div>
        </section>
      </div>

      {/* ---------- payouts table ---------- */}
      <section className="sk-card p-0 overflow-hidden" aria-label="Payout history">
        <div className="p-5 pb-3">
          <h2 className="text-[16px] font-bold tracking-tight">Payout history</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {data.payouts.length} payout request{data.payouts.length === 1 ? "" : "s"} to date · {kwd(data.payoutSummary.paidOut)} settled
          </p>
        </div>
        {data.payouts.length === 0 ? (
          <div className="pb-6">
            <EmptyState icon={Landmark} title="No payouts yet" sub="Request your first bulk payout once revenue is available." />
          </div>
        ) : (
          <div className="overflow-x-auto sk-scroll">
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
                      <TableCell className="text-muted-foreground tabular text-[12.5px]">{dateOf(p.createdAt)}</TableCell>
                      <TableCell className="text-right tabular text-[12.5px] text-muted-foreground">
                        {p.paidAt ? dateOf(p.paidAt) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
