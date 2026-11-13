"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { BOOKING_STATE_PILL, MODE_LABEL, dateOf, kwd, timeOf } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarRange, DoorOpen, ListChecks, Loader2, Search, Video, X, UserX } from "lucide-react";

interface BookingRow {
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
  meetUrl: string | null;
  topics?: string | null;
  rating?: number | null;
  student?: { id: string; name: string; color?: string; avatarColor?: string };
  address?: { area: string } | null;
  homeStage?: string | null;
}

const STATE_FILTERS = ["all", "requested", "accepted", "in_progress", "completed", "released", "cancelled", "declined", "no_show"];
const MODE_FILTERS = ["all", "online", "home", "group"];

/* destructive outline button (mark no-show) */
const noShowBtnCls =
  "inline-flex items-center gap-1.5 rounded-[10px] border border-[#F2B8BE] bg-gradient-to-b from-white to-[#FDF1F2] px-3 py-1.5 text-[12px] font-bold text-[#C03342] shadow-[0_1px_2px_rgba(20,36,107,0.08)] transition-all hover:from-white hover:to-[#FDE3E5] active:translate-y-px disabled:opacity-55 disabled:cursor-not-allowed";

function parseTopics(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function TBookings() {
  const { setView } = useAppStore();
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summaryFor, setSummaryFor] = useState<BookingRow | null>(null);
  const [noShowFor, setNoShowFor] = useState<BookingRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load bookings.");
      const list: BookingRow[] = Array.isArray(json?.data) ? json.data : [];
      setRows(list.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (b: BookingRow, action: "accept" | "decline") => {
    setBusyId(b.id + action);
    try {
      const res = await fetch(`/api/bookings/${b.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: action === "decline" ? JSON.stringify({ reason: "Managed from bookings list" }) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || `Could not ${action} this booking.`);
      toast({
        title: action === "accept" ? "Booking accepted" : "Booking declined",
        description: action === "accept" ? "The student and parent have been notified." : "The family has been notified with your reason.",
      });
      await load();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const markNoShow = async (b: BookingRow) => {
    setBusyId(b.id + "noshow");
    try {
      const res = await fetch(`/api/bookings/${b.id}/no-show`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "Could not mark the no-show.");
      toast({
        title: "No-show recorded",
        description: json?.data?.released
          ? `${kwd(json.data.released)} held in escrow was released to your wallet per the no-show policy.`
          : "The booking was marked as a no-show and the family was notified.",
      });
      setNoShowFor(null);
      await load();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((b) => {
      if (stateFilter !== "all" && b.state !== stateFilter) return false;
      if (modeFilter !== "all" && b.mode !== modeFilter) return false;
      if (q && !(b.student?.name ?? "").toLowerCase().includes(q) && !b.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, stateFilter, modeFilter, query]);

  const nameOf = (b: BookingRow) => b.student?.name ?? "Student";
  const colorOf = (b: BookingRow) => b.student?.avatarColor ?? b.student?.color ?? "#315BE5";

  const actionsFor = (b: BookingRow) => {
    const noShowBtn = ["accepted", "in_progress"].includes(b.state) ? (
      <button
        className={noShowBtnCls}
        disabled={!!busyId}
        onClick={() => setNoShowFor(b)}
        aria-label={`Mark ${b.title} as a no-show`}
      >
        <UserX className="w-3.5 h-3.5" /> No-show
      </button>
    ) : null;

    if (b.state === "requested") {
      return (
        <div className="flex items-center justify-end gap-1.5">
          <button className="sk-btn sk-btn-success sk-btn-sm" disabled={!!busyId} onClick={() => respond(b, "accept")}>
            Accept
          </button>
          <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!busyId} onClick={() => respond(b, "decline")}>
            Decline
          </button>
        </div>
      );
    }
    if (b.state === "accepted" && b.mode === "online") {
      return (
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="sk-btn sk-btn-orange sk-btn-sm"
            onClick={() => toast({ title: "Classroom link opening (demo)", description: b.meetUrl ?? "Link will appear once generated." })}
          >
            <Video className="w-3.5 h-3.5" /> Start class
          </button>
          {noShowBtn}
        </div>
      );
    }
    if (b.state === "accepted" && b.mode === "home") {
      return (
        <div className="flex items-center justify-end gap-1.5">
          <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setView("t-homevisits", { sessionId: b.id })}>
            <DoorOpen className="w-3.5 h-3.5" /> Check-in
          </button>
          {noShowBtn}
        </div>
      );
    }
    if (b.state === "in_progress") {
      return <div className="flex items-center justify-end gap-1.5">{noShowBtn}</div>;
    }
    if (["completed", "released"].includes(b.state)) {
      return (
        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setSummaryFor(b)}>
          <ListChecks className="w-3.5 h-3.5" /> View summary
        </button>
      );
    }
    return <span className="text-[11.5px] text-muted-foreground">—</span>;
  };

  const summaryTopics = parseTopics(summaryFor?.topics);

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">All bookings</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {rows ? `${rows.length} total bookings` : "Loading…"} · every session, request and visit in one place
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="sk-input !pl-9" placeholder="Search student or topic…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {/* filters */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATE_FILTERS.map((s) => {
            const pill = s === "all" ? { label: "All states" } : BOOKING_STATE_PILL[s];
            return (
              <button
                key={s}
                className={`sk-chip !py-1 !px-2.5 !text-[11.5px] ${stateFilter === s ? "sk-chip-active" : ""}`}
                onClick={() => setStateFilter(s)}
              >
                {pill?.label ?? s}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {MODE_FILTERS.map((m) => (
            <button
              key={m}
              className={`sk-chip !py-1 !px-2.5 !text-[11.5px] ${modeFilter === m ? "sk-chip-active" : ""}`}
              onClick={() => setModeFilter(m)}
            >
              {m === "all" ? "All modes" : MODE_LABEL[m] ?? m}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="sk-callout sk-callout-danger">
          {error} —{" "}
          <button className="underline font-semibold" onClick={load}>
            retry
          </button>
        </div>
      )}

      {!rows ? (
        <LoadingView label="Loading bookings…" />
      ) : filtered.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={CalendarRange}
            title="No bookings match"
            sub={rows.length === 0 ? "You have no bookings yet — they'll appear here once families book you." : "Try clearing the filters or search."}
          />
        </div>
      ) : (
        <>
          {/* table (md+) */}
          <div className="sk-card p-0 overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Your net</TableHead>
                  <TableHead className="text-right">Parent pays</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const pill = pillFor(BOOKING_STATE_PILL, b.state);
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <AvatarTile name={nameOf(b)} color={colorOf(b)} size={32} />
                          <div>
                            <div className="font-semibold text-[13px]">{nameOf(b)}</div>
                            <div className="text-[11px] text-muted-foreground">{b.grade} · {b.board}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="font-semibold text-[12.5px] truncate">{b.title}</div>
                        <div className="text-[11px] text-muted-foreground">{b.subject}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-[12.5px] font-semibold tabular">{dateOf(b.startAt)}</div>
                        <div className="text-[11px] text-muted-foreground tabular">{timeOf(b.startAt)} – {timeOf(b.endAt)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={b.mode === "home" ? "orange" : b.mode === "group" ? "green" : "navy"} dot={false}>
                          {MODE_LABEL[b.mode] ?? b.mode}
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={pill.cls}>{pill.label}</StatusPill>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular text-[12.5px]">{kwd(b.sessionFee)}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular text-[12.5px]">{kwd(b.total)}</TableCell>
                      <TableCell className="text-right">{actionsFor(b)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* cards (mobile) */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((b) => {
              const pill = pillFor(BOOKING_STATE_PILL, b.state);
              return (
                <li key={b.id} className="sk-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarTile name={nameOf(b)} color={colorOf(b)} size={36} />
                      <div className="min-w-0">
                        <div className="font-semibold text-[13px] truncate">{nameOf(b)}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{b.title}</div>
                      </div>
                    </div>
                    <StatusPill tone={pill.cls}>{pill.label}</StatusPill>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-muted-foreground">
                    <StatusPill tone={b.mode === "home" ? "orange" : b.mode === "group" ? "green" : "navy"} dot={false}>
                      {MODE_LABEL[b.mode] ?? b.mode}
                    </StatusPill>
                    <span className="tabular">{dateOf(b.startAt)} · {timeOf(b.startAt)}</span>
                    <span className="tabular">Net {kwd(b.sessionFee)}</span>
                  </div>
                  <div className="flex justify-end">{actionsFor(b)}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* session summary dialog */}
      <Dialog open={!!summaryFor} onOpenChange={(o) => !o && setSummaryFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session summary</DialogTitle>
            <DialogDescription>
              {summaryFor ? `${summaryFor.title} · ${nameOf(summaryFor)} · ${dateOf(summaryFor.startAt)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {summaryFor && (
            <div className="space-y-3">
              <div className="sk-well p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Topics covered</div>
                {summaryTopics.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {summaryTopics.map((t) => (
                      <span key={t} className="sk-pill sk-pill-green">{t}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground mt-1">
                    No topic checkout was recorded for this session.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="sk-well p-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Your net</div>
                  <div className="text-[14px] font-bold tabular mt-0.5">{kwd(summaryFor.sessionFee)}</div>
                </div>
                <div className="sk-well p-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Family rating</div>
                  <div className="text-[14px] font-bold mt-0.5">
                    {summaryFor.rating ? "★".repeat(summaryFor.rating) + "☆".repeat(5 - summaryFor.rating) : "Not rated"}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setSummaryFor(null)}>
              <X className="w-3.5 h-3.5" /> Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* no-show confirmation dialog */}
      <Dialog open={!!noShowFor} onOpenChange={(o) => !o && setNoShowFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark “{noShowFor?.title}” as a no-show?</DialogTitle>
            <DialogDescription>
              {noShowFor ? `${nameOf(noShowFor)} · ${dateOf(noShowFor.startAt)} · ${timeOf(noShowFor.startAt)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="sk-callout sk-callout-danger text-[12.5px]">
            Per the no-show policy, any payment held in escrow for this session is released to you immediately and the
            family is notified. Only mark a no-show if the student didn't attend — the family can dispute it within 24
            hours and our team will review the case.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setNoShowFor(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!!busyId} onClick={() => noShowFor && markNoShow(noShowFor)}>
              {busyId?.endsWith("noshow") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
              Mark no-show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
