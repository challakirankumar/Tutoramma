"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Download, Search, ShieldQuestion } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { BOOKING_STATE_PILL, MODE_LABEL, PAYMENT_STATE_PILL, dateOf, dateTimeOf, kwd, timeOf } from "@/lib/format";

interface AdminBooking {
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
  rating: number | null;
  reviewComment: string | null;
  topics: string | null;
  policySnapshot: string;
  addressArea: string | null;
  tutor: { name: string; color: string };
  student: { name: string; color: string };
  paymentStatus: string | null;
  paymentMethod: string | null;
  invoiceNo: string | null;
  createdAt: string;
}

const MODE_PILL: Record<string, { label: string; cls: "navy" | "orange" | "green" }> = {
  online: { label: "Online 1:1", cls: "navy" },
  home: { label: "Home visit", cls: "orange" },
  group: { label: "Group class", cls: "green" },
};

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", applepay: "Apple Pay", wallet: "Wallet" };

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ABookings() {
  const [rows, setRows] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState("");
  const [mode, setMode] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (stateF: string, modeF: string, query: string) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateF) params.set("state", stateF);
      if (modeF) params.set("mode", modeF);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/bookings?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load bookings.");
      if (id === reqId.current) {
        setRows(json.data as AdminBooking[]);
        setError("");
      }
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "Failed to load bookings.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(state, mode, debouncedQ);
  }, [load, state, mode, debouncedQ]);

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = ["Date", "Time", "Student", "Tutor", "Subject", "Grade", "Mode", "State", "Total (₹)", "Payment", "Invoice"];
    const lines = rows.map((b) => [
      dateOf(b.startAt),
      timeOf(b.startAt),
      b.student.name,
      b.tutor.name,
      b.subject,
      b.grade,
      MODE_LABEL[b.mode] ?? b.mode,
      b.state,
      (b.total / 100).toFixed(2),
      b.paymentStatus ?? "",
      b.invoiceNo ?? "",
    ]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tutor-amma-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${rows.length} bookings downloaded.` });
  };

  const stateOptions = Object.keys(BOOKING_STATE_PILL);
  const selectedPolicy = selected ? parseJson<Record<string, unknown>>(selected.policySnapshot, {}) : {};
  const selectedTopics = selected ? parseJson<string[]>(selected.topics, []) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">All Bookings</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {loading ? "Loading…" : `${rows.length} booking${rows.length === 1 ? "" : "s"}`} · newest first · click a row for the full record
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* filter bar */}
      <div className="sk-card p-3 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="sk-input w-full pl-9"
            placeholder="Search student, tutor or session title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search bookings"
          />
        </div>
        <select className="sk-input w-auto" value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
          <option value="">All states</option>
          {stateOptions.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATE_PILL[s].label}
            </option>
          ))}
        </select>
        <select className="sk-input w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Filter by mode">
          <option value="">All modes</option>
          <option value="online">Online 1:1</option>
          <option value="home">Home visit</option>
          <option value="group">Group class</option>
        </select>
      </div>

      {error ? (
        <div className="sk-card p-6">
          <EmptyState icon={ShieldQuestion} title="Bookings unavailable" sub={error} />
        </div>
      ) : loading && rows.length === 0 ? (
        <LoadingView label="Loading bookings…" />
      ) : rows.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState icon={CalendarDays} title="No bookings match" sub="Try clearing the filters or searching for a different name." />
        </div>
      ) : (
        <div className="sk-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Student</th>
                  <th className="px-3 py-2.5 font-semibold">Tutor</th>
                  <th className="px-3 py-2.5 font-semibold">Session</th>
                  <th className="px-3 py-2.5 font-semibold">Mode</th>
                  <th className="px-3 py-2.5 font-semibold">State</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const st = pillFor(BOOKING_STATE_PILL, b.state);
                  const pay = b.paymentStatus ? pillFor(PAYMENT_STATE_PILL, b.paymentStatus) : null;
                  const md = MODE_PILL[b.mode] ?? { label: MODE_LABEL[b.mode] ?? b.mode, cls: "grey" as const };
                  return (
                    <tr
                      key={b.id}
                      className="border-t cursor-pointer transition-colors hover:bg-[#F5F7FC]/70 dark:hover:bg-white/5"
                      onClick={() => setSelected(b)}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-semibold">{dateOf(b.startAt)}</div>
                        <div className="text-[11px] text-muted-foreground">{timeOf(b.startAt)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <AvatarTile name={b.student.name} color={b.student.color} size={26} />
                          <span className="font-medium truncate max-w-[120px]">{b.student.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <AvatarTile name={b.tutor.name} color={b.tutor.color} size={26} />
                          <span className="font-medium truncate max-w-[120px]">{b.tutor.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{b.subject}</span>
                          <StatusPill tone="grey">{b.grade}</StatusPill>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={md.cls}>{md.label}</StatusPill>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={st.cls}>{st.label}</StatusPill>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular whitespace-nowrap">{kwd(b.total, 2)}</td>
                      <td className="px-4 py-2.5">
                        {pay ? <StatusPill tone={pay.cls}>{pay.label}</StatusPill> : <span className="text-muted-foreground text-[11.5px]">Unpaid</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => setSelected(o ? selected : null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[16px]">{selected.title}</DialogTitle>
                <DialogDescription>
                  {selected.board} · {selected.grade} · booked {dateTimeOf(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <AvatarTile name={selected.student.name} color={selected.student.color} size={32} />
                  <span className="text-[13px] font-semibold">{selected.student.name}</span>
                  <span className="text-muted-foreground text-[12px]">with</span>
                  <AvatarTile name={selected.tutor.name} color={selected.tutor.color} size={32} />
                  <span className="text-[13px] font-semibold">{selected.tutor.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-[12.5px]">
                  <div className="sk-well rounded-xl p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Schedule</div>
                    <div className="mt-1 font-semibold">{dateOf(selected.startAt)} · {timeOf(selected.startAt)} – {timeOf(selected.endAt)}</div>
                    <div className="text-muted-foreground mt-1">{MODE_LABEL[selected.mode] ?? selected.mode}{selected.addressArea ? ` · ${selected.addressArea}` : ""}</div>
                  </div>
                  <div className="sk-well rounded-xl p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Price breakdown</div>
                    <div className="mt-1 flex justify-between"><span>Session fee</span><span className="tabular">{kwd(selected.sessionFee, 2)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Platform fee (8%)</span><span className="tabular">{kwd(selected.platformFee, 2)}</span></div>
                    <div className="flex justify-between font-bold mt-0.5 border-t pt-1"><span>Total</span><span className="tabular">{kwd(selected.total, 2)}</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                  {(() => {
                    const st = pillFor(BOOKING_STATE_PILL, selected.state);
                    const pay = selected.paymentStatus ? pillFor(PAYMENT_STATE_PILL, selected.paymentStatus) : null;
                    const md = MODE_PILL[selected.mode] ?? { label: MODE_LABEL[selected.mode] ?? selected.mode, cls: "grey" as const };
                    return (
                      <>
                        <StatusPill tone={st.cls}>{st.label}</StatusPill>
                        <StatusPill tone={md.cls}>{md.label}</StatusPill>
                        {pay && <StatusPill tone={pay.cls}>{pay.label}</StatusPill>}
                        {selected.paymentMethod && <StatusPill tone="grey">{METHOD_LABEL[selected.paymentMethod] ?? selected.paymentMethod}</StatusPill>}
                        {selected.invoiceNo && <span className="font-mono text-[11.5px] text-muted-foreground">{selected.invoiceNo}</span>}
                      </>
                    );
                  })()}
                </div>

                {Object.keys(selectedPolicy).length > 0 && (
                  <div className="rounded-xl border p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Policy snapshot</div>
                    <div className="text-[12px] text-muted-foreground mt-1 space-y-0.5">
                      {Object.entries(selectedPolicy).map(([k, v]) => (
                        <div key={k}>
                          · {k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}: <span className="font-medium text-foreground">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTopics.length > 0 && (
                  <div className="rounded-xl border p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Topics covered</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedTopics.map((t) => (
                        <StatusPill key={t} tone="green">{t}</StatusPill>
                      ))}
                    </div>
                  </div>
                )}

                {selected.rating && (
                  <div className="rounded-xl border p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Review · {selected.rating}/5
                    </div>
                    {selected.reviewComment && <p className="text-[12.5px] mt-1 italic">“{selected.reviewComment}”</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
