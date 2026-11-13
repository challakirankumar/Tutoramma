"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { KpiCard } from "@/components/shared/KpiCard";
import { SectionTitle, EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { BOOKING_STATE_PILL, MODE_LABEL, STAGE_PILL, dateTimeOf, kwd, timeOf, untilLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarCheck, CalendarX2, Car, CheckCircle2, ChevronRight, ClipboardList, Clock, DoorOpen, Inbox,
  MapPin, NotebookPen, PackageOpen, Star, Target, TrendingUp, Video, Wallet, X,
} from "lucide-react";

interface DashBooking {
  id: string;
  title: string;
  subject: string;
  board: string;
  grade: string;
  mode: string;
  startAt: string;
  endAt: string;
  state: string;
  meetUrl: string | null;
  sessionFee: number;
  platformFee: number;
  total: number;
  student: { id: string; name: string; avatarColor: string };
  homeStage: string | null;
  destArea: string | null;
}

interface DashData {
  date: string;
  today: DashBooking[];
  requests: DashBooking[];
  kpis: {
    todayCount: number;
    pendingRequests: number;
    walletAvailable: number;
    rating: number;
    reviewCount: number;
    weekCompleted: number;
  };
  homeVisitToday: {
    sessionId: string;
    stage: string;
    title: string;
    startAt: string;
    endAt: string;
    destArea: string;
    student: { id: string; name: string; avatarColor: string };
  } | null;
  rescue: {
    kind: "cancelled" | "expiring";
    booking: DashBooking;
    substitutes: SubstituteRow[];
  } | null;
  earnings: { last7: number; prev7: number; daily: { date: string; amount: number }[] };
}

interface SubstituteRow {
  id: string;
  name: string;
  color: string;
  headline: string;
  rating: number;
  reviews: number;
  trustScore: number;
}

interface HandoverPack {
  booking: { id: string; title: string; subject: string; grade: string; board: string; startAt: string; mode: string };
  student: { name: string; grade: string; weakTopics: string[]; goals: string[] };
  lessonPlan: {
    id: string;
    title: string;
    subject: string;
    grade: string;
    board: string;
    periods: number;
    periodMinutes: number;
    provenance: string;
    objectives: string[];
    stages: { name: string; title: string }[];
  } | null;
  lastClassNotes: {
    classTitle: string;
    subject: string;
    endedAt: string;
    summary: string;
    homework: string;
  } | null;
  homeworkDue: { id: string; title: string; subject: string; dueAt: string } | null;
}

function greetingFor(h: number) {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function TDashboard() {
  const { user, setView } = useAppStore();
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* handover pack flow (lazy-loaded per substitute) */
  const [handoverFor, setHandoverFor] = useState<{ substitute: SubstituteRow; booking: DashBooking } | null>(null);
  const [pack, setPack] = useState<HandoverPack | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tutor/dashboard");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load your dashboard.");
      setData(json.data as DashData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your dashboard.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openHandover = async (substitute: SubstituteRow, booking: DashBooking) => {
    setHandoverFor({ substitute, booking });
    setPack(null);
    setPackError("");
    setPackLoading(true);
    try {
      const res = await fetch(`/api/tutor/handover?bookingId=${booking.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not compile the handover pack.");
      setPack(json.data as HandoverPack);
    } catch (e) {
      setPackError(e instanceof Error ? e.message : "Could not compile the handover pack.");
    } finally {
      setPackLoading(false);
    }
  };

  const sendHandover = async () => {
    if (!handoverFor) return;
    setSendBusy(true);
    try {
      const res = await fetch("/api/tutor/handover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: handoverFor.booking.id, substituteTutorId: handoverFor.substitute.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "Could not send the handover pack.");
      toast({ title: "Handover pack sent", description: `${handoverFor.substitute.name} has been notified and can review the pack in their dashboard.` });
      setHandoverFor(null);
    } catch (e) {
      toast({ title: "Couldn't send the pack", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSendBusy(false);
    }
  };

  const respond = async (b: DashBooking, action: "accept" | "decline") => {
    setBusyId(b.id + action);
    try {
      const res = await fetch(`/api/bookings/${b.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: action === "decline" ? JSON.stringify({ reason: "Declined from dashboard" }) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || `Could not ${action} the request.`);
      toast({
        title: action === "accept" ? "Request accepted" : "Request declined",
        description:
          action === "accept"
            ? `${b.student.name}'s ${b.subject} session is confirmed for ${dateTimeOf(b.startAt)}.`
            : `${b.student.name} has been notified with your reason.`,
      });
      await load();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={CalendarX2}
          title="Dashboard unavailable"
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
  if (!data) return <LoadingView label="Loading your day…" />;

  const now = new Date();
  const dateLine = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const maxDaily = Math.max(...data.earnings.daily.map((d) => d.amount), 1);
  const previewRequests = data.requests.slice(0, 2);
  const stage = data.homeVisitToday ? pillFor(STAGE_PILL, data.homeVisitToday.stage) : null;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">
            {greetingFor(now.getHours())}, {user?.name?.split(" ")[0] ?? "Teacher"}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {dateLine} · {data.kpis.weekCompleted} session{data.kpis.weekCompleted === 1 ? "" : "s"} completed this week
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("t-timetable")}>
            <Clock className="w-3.5 h-3.5" /> Timetable
          </button>
          <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => setView("t-bookings")}>
            All bookings <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Today's sessions" value={data.kpis.todayCount} sub="across online & home visits" icon={CalendarCheck} tone="navy" />
        <KpiCard label="Pending requests" value={data.kpis.pendingRequests} sub="waiting for your reply" icon={Inbox} tone="orange" />
        <KpiCard label="Wallet available" value={kwd(data.kpis.walletAvailable)} sub="after escrow & payouts" icon={Wallet} tone="green" />
        <KpiCard label="Rating" value={data.kpis.rating.toFixed(1)} sub={`${data.kpis.reviewCount} parent reviews`} icon={Star} tone="royal" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ---------- today's schedule ---------- */}
        <section className="lg:col-span-2 space-y-3" aria-label="Today's schedule">
          <SectionTitle title="Today's schedule" sub="Tap a session for classroom or visit controls" />
          {data.today.length === 0 ? (
            <div className="sk-card p-6">
              <EmptyState
                icon={CalendarCheck}
                title="No sessions today"
                sub="A clear day — perfect for lesson planning in the Teaching Studio."
                action={
                  <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("t-studio")}>
                    Open Teaching Studio
                  </button>
                }
              />
            </div>
          ) : (
            <ol className="space-y-3">
              {data.today.map((b) => {
                const state = pillFor(BOOKING_STATE_PILL, b.state);
                return (
                  <li key={b.id} className="sk-card p-4 flex gap-3.5">
                    <div className="hidden sm:flex flex-col items-center pt-0.5 w-[64px] shrink-0 text-center">
                      <span className="text-[13px] font-bold tabular">{timeOf(b.startAt)}</span>
                      <span className="text-[10.5px] text-muted-foreground tabular">{timeOf(b.endAt)}</span>
                      <div className="w-px flex-1 my-2 bg-border" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarTile name={b.student.name} color={b.student.avatarColor} size={38} />
                          <div className="min-w-0">
                            <div className="font-semibold text-[13.5px] truncate">{b.title}</div>
                            <div className="text-[12px] text-muted-foreground truncate">
                              {b.student.name} · {b.grade} {b.board}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusPill tone="grey" dot={false}>{MODE_LABEL[b.mode] ?? b.mode}</StatusPill>
                          <StatusPill tone={state.cls}>{state.label}</StatusPill>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-[12px] text-muted-foreground flex items-center gap-3 flex-wrap">
                          <span className="tabular sm:hidden">{timeOf(b.startAt)} – {timeOf(b.endAt)}</span>
                          <span className="tabular">Net {kwd(b.sessionFee)}</span>
                          {b.mode === "home" && b.destArea && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {b.destArea}
                            </span>
                          )}
                        </div>
                        {b.mode === "online" && b.state === "accepted" ? (
                          <button
                            className="sk-btn sk-btn-orange sk-btn-sm"
                            onClick={() =>
                              toast({
                                title: "Classroom link opening (demo)",
                                description: b.meetUrl ?? "Classroom link will appear here once generated.",
                              })
                            }
                          >
                            <Video className="w-3.5 h-3.5" /> Start class
                          </button>
                        ) : b.mode === "home" && ["accepted", "in_progress"].includes(b.state) ? (
                          <button
                            className="sk-btn sk-btn-primary sk-btn-sm"
                            onClick={() => setView("t-homevisits", { sessionId: b.id })}
                          >
                            <DoorOpen className="w-3.5 h-3.5" /> Open home visit controls
                          </button>
                        ) : b.state === "requested" ? (
                          <span className="text-[11.5px] text-muted-foreground">Respond in Requests below</span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* ---------- requests preview ---------- */}
          <SectionTitle
            title="New requests"
            sub={`${data.kpis.pendingRequests} pending`}
            right={
              data.requests.length > 2 ? (
                <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("t-requests")}>
                  View all <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : undefined
            }
          />
          {previewRequests.length === 0 ? (
            <div className="sk-card p-5 text-[13px] text-muted-foreground">
              No pending requests — your availability looks great!
            </div>
          ) : (
            <ul className="space-y-3">
              {previewRequests.map((b) => (
                <li key={b.id} className="sk-card p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                  <AvatarTile name={b.student.name} color={b.student.avatarColor} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13.5px] truncate">
                      {b.student.name} · {b.subject}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {MODE_LABEL[b.mode] ?? b.mode} · {dateTimeOf(b.startAt)} ({untilLabel(b.startAt)}) · Your net{" "}
                      <span className="font-semibold text-foreground tabular">{kwd(b.sessionFee)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="sk-btn sk-btn-success sk-btn-sm"
                      disabled={busyId === b.id + "accept"}
                      onClick={() => respond(b, "accept")}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                    </button>
                    <button
                      className="sk-btn sk-btn-ghost sk-btn-sm"
                      disabled={busyId === b.id + "decline"}
                      onClick={() => respond(b, "decline")}
                    >
                      <X className="w-3.5 h-3.5" /> Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- right rail ---------- */}
        <div className="space-y-5">
          {/* home-visit quick control */}
          {data.homeVisitToday && stage && (
            <section className="sk-card p-5 space-y-3.5" aria-label="Home visit quick controls">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-[14px]">
                  <Car className="w-4 h-4 text-brand-orange" /> Home visit today
                </div>
                <StatusPill tone={stage.cls}>{stage.label}</StatusPill>
              </div>
              <div>
                <div className="font-semibold text-[13px]">{data.homeVisitToday.title}</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {data.homeVisitToday.student.name} · {timeOf(data.homeVisitToday.startAt)} – {timeOf(data.homeVisitToday.endAt)} ·{" "}
                  {data.homeVisitToday.destArea}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["On my way", "Check in with OTP", "Check out"] as const).map((label, i, arr) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <button
                      className="sk-btn sk-btn-ghost sk-btn-sm"
                      onClick={() => setView("t-homevisits", { sessionId: data.homeVisitToday!.sessionId })}
                    >
                      {label}
                    </button>
                    {i < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </span>
                ))}
              </div>
              <button
                className="sk-btn sk-btn-orange sk-btn-sm w-full"
                onClick={() => setView("t-homevisits", { sessionId: data.homeVisitToday!.sessionId })}
              >
                <MapPin className="w-3.5 h-3.5" /> Open live visit console
              </button>
            </section>
          )}

          {/* missed-class rescue */}
          {data.rescue && (
            <section className="sk-card p-5 space-y-3.5 border-l-4 border-l-[#F47B20]" aria-label="Missed class rescue">
              <div className="flex items-center gap-2 font-bold text-[14px]">
                <CalendarX2 className="w-4 h-4 text-brand-orange" />
                {data.rescue.kind === "cancelled" ? "Missed-class rescue" : "Request expiring soon"}
              </div>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {data.rescue.kind === "cancelled" ? (
                  <>
                    <span className="font-semibold text-foreground">{data.rescue.booking.title}</span> with{" "}
                    {data.rescue.booking.student.name} was cancelled this week —{" "}
                    {data.rescue.substitutes.length} vetted substitutes are ready to cover the slot.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">{data.rescue.booking.title}</span> with{" "}
                    {data.rescue.booking.student.name} starts {untilLabel(data.rescue.booking.startAt)} and is still
                    unanswered — accept it, or offer the slot to one of {data.rescue.substitutes.length} vetted substitutes.
                  </>
                )}
              </p>
              <div className="flex flex-col gap-2">
                {data.rescue.substitutes.map((s) => (
                  <div key={s.id} className="sk-well p-2.5 flex items-center gap-2.5 flex-wrap">
                    <AvatarTile name={s.name} color={s.color} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[12.5px] truncate">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        ★ {s.rating.toFixed(1)} · Trust {s.trustScore}
                      </div>
                    </div>
                    <button
                      className="sk-btn sk-btn-ghost sk-btn-sm shrink-0"
                      onClick={() => openHandover(s, data.rescue!.booking)}
                    >
                      <PackageOpen className="w-3.5 h-3.5" /> Handover pack
                    </button>
                  </div>
                ))}
              </div>
              {data.rescue.kind === "cancelled" || data.rescue.substitutes.length > 0 ? (
                <button
                  className="sk-btn sk-btn-primary sk-btn-sm w-full"
                  onClick={() =>
                    toast({
                      title: "Substitute offered (demo)",
                      description: `${data.rescue!.substitutes[0]?.name ?? "A vetted tutor"} has been offered the slot and will respond shortly.`,
                    })
                  }
                >
                  Offer slot to top match
                </button>
              ) : (
                <button
                  className="sk-btn sk-btn-orange sk-btn-sm w-full"
                  onClick={() => setView("t-requests")}
                >
                  Review request now
                </button>
              )}
            </section>
          )}

          {/* earnings mini */}
          <section className="sk-card p-5 space-y-4" aria-label="Earnings this week">
            <SectionTitle
              title="Earnings"
              right={
                <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setView("t-earnings")}>
                  Details
                </button>
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="sk-well p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Last 7 days</div>
                <div className="text-[16px] font-bold tabular mt-0.5">{kwd(data.earnings.last7)}</div>
              </div>
              <div className="sk-well p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Previous 7</div>
                <div className="text-[16px] font-bold tabular mt-0.5 text-muted-foreground">{kwd(data.earnings.prev7)}</div>
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-16" aria-hidden>
              {data.earnings.daily.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col justify-end items-center gap-1" title={`${kwd(d.amount)}`}>
                  <div
                    className="w-full rounded-t-[5px]"
                    style={{
                      height: `${Math.max(4, Math.round((d.amount / maxDaily) * 52))}px`,
                      background:
                        d.amount === maxDaily && d.amount > 0
                          ? "linear-gradient(180deg,#FFAB5E,#E97414)"
                          : "linear-gradient(180deg,#4C6BC4,#22357F)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Daily net, last 7 days
              </span>
              <span className="tabular">
                {data.earnings.last7 >= data.earnings.prev7 ? "▲" : "▼"}{" "}
                {data.earnings.prev7 > 0
                  ? Math.abs(Math.round(((data.earnings.last7 - data.earnings.prev7) / data.earnings.prev7) * 100))
                  : 100}
                % vs prev
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* ---------- handover pack dialog ---------- */}
      <Dialog open={!!handoverFor} onOpenChange={(o) => !o && setHandoverFor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto sk-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageOpen className="w-4 h-4 text-brand-orange" />
              Handover pack — {handoverFor?.substitute.name}
            </DialogTitle>
            <DialogDescription>
              Lesson plan, class notes and student needs packaged for the substitute. Send it when it looks right.
            </DialogDescription>
          </DialogHeader>

          {packLoading ? (
            <div className="py-8">
              <LoadingView label="Compiling the handover pack…" />
            </div>
          ) : packError ? (
            <EmptyState
              icon={CalendarX2}
              title="Couldn't compile the pack"
              sub={packError}
              action={
                <Button
                  size="sm"
                  onClick={() => handoverFor && openHandover(handoverFor.substitute, handoverFor.booking)}
                >
                  Try again
                </Button>
              }
            />
          ) : pack ? (
            <div className="space-y-3">
              {/* Session */}
              <section className="sk-well p-3.5" aria-label="Session">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  <CalendarCheck className="w-3.5 h-3.5" /> Session
                </div>
                <div className="font-semibold text-[13.5px]">{pack.booking.title}</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {pack.booking.subject} · {pack.booking.grade} {pack.booking.board} ·{" "}
                  {MODE_LABEL[pack.booking.mode] ?? pack.booking.mode} · {dateTimeOf(pack.booking.startAt)}
                </div>
              </section>

              {/* Student needs */}
              <section className="sk-well p-3.5" aria-label="Student needs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  <Target className="w-3.5 h-3.5" /> Student needs
                </div>
                <div className="font-semibold text-[13.5px]">
                  {pack.student.name} · {pack.student.grade}
                </div>
                {pack.student.weakTopics.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[11.5px] text-muted-foreground">Weak topics:</span>
                    {pack.student.weakTopics.map((t) => (
                      <span key={t} className="sk-pill sk-pill-orange">{t}</span>
                    ))}
                  </div>
                )}
                {pack.student.goals.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[11.5px] text-muted-foreground">Goals:</span>
                    {pack.student.goals.map((g) => (
                      <span key={g} className="sk-pill sk-pill-navy">{g}</span>
                    ))}
                  </div>
                )}
                {pack.student.weakTopics.length === 0 && pack.student.goals.length === 0 && (
                  <p className="text-[12px] text-muted-foreground mt-1">No flagged weak topics or goals on record.</p>
                )}
              </section>

              {/* Lesson plan */}
              <section className="sk-well p-3.5" aria-label="Lesson plan">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  <ClipboardList className="w-3.5 h-3.5" /> Lesson plan
                </div>
                {pack.lessonPlan ? (
                  <>
                    <div className="font-semibold text-[13.5px]">{pack.lessonPlan.title}</div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5">
                      {pack.lessonPlan.subject} · {pack.lessonPlan.grade} · {pack.lessonPlan.periods}×
                      {pack.lessonPlan.periodMinutes}min · {pack.lessonPlan.provenance}
                    </div>
                    {pack.lessonPlan.objectives.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {pack.lessonPlan.objectives.map((o, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-navy mt-1.5 shrink-0" />
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}
                    {pack.lessonPlan.stages.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                        {pack.lessonPlan.stages.map((s) => (
                          <span key={s.name} className="sk-pill sk-pill-grey" title={s.title}>
                            {s.name} · {s.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">No saved lesson plan yet — build one in the Teaching Studio.</p>
                )}
              </section>

              {/* Last class notes */}
              <section className="sk-well p-3.5" aria-label="Last class notes">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  <NotebookPen className="w-3.5 h-3.5" /> Last class notes
                </div>
                {pack.lastClassNotes ? (
                  <>
                    <div className="font-semibold text-[13.5px]">{pack.lastClassNotes.classTitle}</div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5">
                      ended {dateTimeOf(pack.lastClassNotes.endedAt)}
                    </div>
                    <p className="text-[12.5px] leading-relaxed mt-2">{pack.lastClassNotes.summary}</p>
                    {pack.lastClassNotes.homework && (
                      <p className="text-[12px] text-muted-foreground mt-1.5">
                        <span className="font-semibold">Homework given:</span> {pack.lastClassNotes.homework}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">No ended class with notes yet.</p>
                )}
              </section>

              {/* Homework */}
              <section className="sk-well p-3.5" aria-label="Homework">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  <ClipboardList className="w-3.5 h-3.5" /> Homework
                </div>
                {pack.homeworkDue ? (
                  <>
                    <div className="font-semibold text-[13.5px]">{pack.homeworkDue.title}</div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5">
                      {pack.homeworkDue.subject} · due {dateTimeOf(pack.homeworkDue.dueAt)}
                    </div>
                  </>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">No open homework for this student right now.</p>
                )}
              </section>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setHandoverFor(null)}>
              Cancel
            </Button>
            <Button onClick={sendHandover} disabled={!pack || sendBusy}>
              <PackageOpen className="w-3.5 h-3.5" />
              {sendBusy ? "Sending…" : `Send pack to ${handoverFor?.substitute.name.split(" ")[0] ?? "substitute"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
