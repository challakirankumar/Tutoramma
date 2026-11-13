"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLiveSocket, type LiveState } from "@/lib/live-socket";
import { MapView } from "@/components/shared/MapView";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { STAGE_PILL, dateTimeOf, timeOf, fromNow } from "@/lib/format";
import { clsx } from "clsx";
import {
  ShieldAlert, Phone, Siren, CheckCircle2, AlertTriangle, Radar, Timer, MapPin, Radio, Activity,
  FileWarning, Search, AlertOctagon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface SafetySession {
  sessionId: string;
  stage: string;
  sosActive: boolean;
  startAt: string;
  endAt: string;
  subject: string;
  title: string;
  state: string;
  tutor: { id: string; name: string; phone: string; avatarColor: string };
  student: { id: string; name: string; avatarColor: string };
  destArea: string;
  dest: { lat: number; lng: number };
  route?: { lat: number; lng: number }[];
}

interface AlertRow {
  id: string;
  sessionId: string | null;
  bookingRef: string | null;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

interface IncidentRow {
  id: string;
  sessionId: string;
  bookingRef: string | null;
  tutorId: string | null;
  tutorName: string;
  studentName: string;
  area: string;
  status: string; // open | investigating | resolved | escalated
  summary: string;
  resolution: string | null;
  openedBy: string;
  createdAt: string;
  updatedAt: string;
  session: { stage: string; subject: string; title: string; startAt: string; state: string } | null;
}

const CONSOLE_COLORS: Record<string, { label: string; tone: "green" | "orange" | "red" | "blue" | "navy" }> = {
  enroute: { label: "On the way", tone: "orange" },
  arrived: { label: "On site", tone: "blue" },
  in_progress: { label: "Session live", tone: "navy" },
};

const INCIDENT_PILL: Record<string, { label: string; tone: "red" | "orange" | "green" | "grey" }> = {
  open: { label: "Open", tone: "red" },
  investigating: { label: "Investigating", tone: "orange" },
  resolved: { label: "Resolved", tone: "green" },
  escalated: { label: "Escalated", tone: "red" },
};

const SEVERITY_PILL: Record<string, string> = {
  critical: "sk-pill-red",
  warning: "sk-pill-orange",
  success: "sk-pill-green",
  info: "sk-pill-blue",
};

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SafetyConsole() {
  const [sessions, setSessions] = useState<SafetySession[] | null>(null);
  const [lives, setLives] = useState<Record<string, LiveState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [incidentDraft, setIncidentDraft] = useState<{ sessionId: string; summary: string } | null>(null);
  const [resolveDraft, setResolveDraft] = useState<{ id: string; resolution: string } | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<IncidentRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const socketRef = useRef<ReturnType<typeof getLiveSocket> | null>(null);

  /* load + refresh sessions every 30s (new sessions appear without reload) */
  useEffect(() => {
    const load = () =>
      fetch("/api/safety/sessions")
        .then((r) => r.json())
        .then((j) => {
          if (j?.data) {
            setSessions(j.data);
            setSelected((prev) => prev ?? j.data.find((s: SafetySession) => s.stage !== "done" && s.stage !== "scheduled")?.sessionId ?? j.data[0]?.sessionId ?? null);
          }
        })
        .catch(() => setSessions([]));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  /* alerts + incidents — on mount, every 30s and after every action below */
  const loadAux = () => {
    fetch("/api/safety/alerts")
      .then((r) => r.json())
      .then((j) => j?.data && setAlerts(j.data))
      .catch(() => {});
    fetch("/api/safety/incidents")
      .then((r) => r.json())
      .then((j) => j?.data && setIncidents(j.data))
      .catch(() => {});
  };
  useEffect(() => {
    loadAux();
    const t = setInterval(loadAux, 30000);
    return () => clearInterval(t);
  }, []);

  /* join every non-done session room */
  useEffect(() => {
    if (!sessions) return;
    const socket = getLiveSocket();
    socketRef.current = socket;
    const onState = (s: LiveState) => setLives((prev) => ({ ...prev, [s.sessionId]: s }));
    socket.on("state", onState);
    for (const s of sessions) {
      if (s.stage !== "done" || lives[s.sessionId]) {
        socket.emit("join", { sessionId: s.sessionId, role: "admin" });
      }
    }
    return () => {
      socket.off("state", onState);
    };

  }, [sessions?.length]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const session = useMemo(() => sessions?.find((s) => s.sessionId === selected) ?? null, [sessions, selected]);
  const live = selected ? lives[selected] : null;

  /* ---------- actions ---------- */
  const acknowledgeAlert = async (id: string) => {
    setBusy(`ack:${id}`);
    try {
      const r = await fetch("/api/safety/alerts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok) {
        toast({ title: "Alert acknowledged", description: "Logged against your admin account." });
        loadAux();
      } else {
        toast({ title: "Could not acknowledge alert", description: j?.error?.message ?? "Please try again.", variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  };

  const startIncident = (s: SafetySession) => {
    const liveAlerts = lives[s.sessionId]?.alerts ?? [];
    const dbAlerts = alerts.filter((a) => a.bookingRef === s.sessionId);
    const recent = [
      ...dbAlerts.map((a) => ({ type: a.type, message: a.message, ts: new Date(a.createdAt).getTime() })),
      ...liveAlerts.map((a) => ({ type: a.type, message: a.message, ts: new Date(a.at).getTime() })),
    ]
      .sort((x, y) => y.ts - x.ts)
      .slice(0, 5);
    const header = `Safety review — ${s.tutor.name} → ${s.student.name} (${s.subject}, ${s.destArea}, ${dateTimeOf(s.startAt)}).`;
    setIncidentDraft(
      recent.length
        ? {
            sessionId: s.sessionId,
            summary: `${header}\n\nAutomated alerts on this session:\n${recent.map((a) => `• [${a.type}] ${a.message}`).join("\n")}`,
          }
        : { sessionId: s.sessionId, summary: header }
    );
  };

  const submitIncident = async () => {
    if (!incidentDraft) return;
    if (!incidentDraft.summary.trim()) {
      toast({ title: "Add a summary", description: "Describe what happened so the safety team can act.", variant: "destructive" });
      return;
    }
    setBusy("incident");
    try {
      const r = await fetch("/api/safety/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: incidentDraft.sessionId, summary: incidentDraft.summary.trim() }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok) {
        toast({ title: "Incident opened", description: "The tutor has been notified and the review workflow has started." });
        setIncidentDraft(null);
        loadAux();
      } else {
        toast({ title: "Could not open incident", description: j?.error?.message ?? "Please try again.", variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  };

  const patchIncident = async (inc: IncidentRow, body: { status: string; resolution?: string }, okTitle: string, okDesc: string) => {
    setBusy(`inc:${inc.id}`);
    try {
      const r = await fetch(`/api/safety/incidents/${inc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (r.ok) {
        toast({ title: okTitle, description: okDesc });
        loadAux();
      } else {
        toast({ title: "Action failed", description: j?.error?.message ?? "Please try again.", variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  };

  if (sessions === null) return <LoadingView label="Loading safety console…" />;

  const active = sessions.filter((s) => {
    const stage = lives[s.sessionId]?.stage ?? s.stage;
    return stage !== "done";
  });
  const sosCount = sessions.filter((s) => lives[s.sessionId]?.sosActive ?? s.sosActive).length;
  const unackCount = alerts.filter((a) => !a.acknowledged).length;
  const activeIncidents = incidents.filter((i) => i.status === "open" || i.status === "investigating").length;

  /* merged alert stream: durable AlertEvents (acknowledgeable) + live-only
     socket events, deduped by bookingRef|type|message once the DB copy lands */
  const sessionById = new Map(sessions.map((s) => [s.sessionId, s]));
  const dbAlertKeys = new Set(alerts.map((a) => `${a.bookingRef ?? ""}|${a.type}|${a.message}`));
  const liveOnlyAlerts = Object.values(lives)
    .flatMap((l) => l.alerts.map((a) => ({ ...a, sessionId: l.sessionId, tutor: l.tutorName, student: l.studentName })))
    .filter((a) => !dbAlertKeys.has(`${a.sessionId}|${a.type}|${a.message}`));
  const streamRows = [
    ...alerts.map((a) => {
      const s = a.bookingRef ? sessionById.get(a.bookingRef) : undefined;
      return {
        key: `db-${a.id}`,
        alertId: a.id as string | undefined,
        type: a.type,
        severity: a.severity,
        message: a.message,
        at: a.createdAt,
        acknowledged: a.acknowledged,
        tutor: s?.tutor.name ?? "—",
        student: s?.student.name ?? "—",
      };
    }),
    ...liveOnlyAlerts.map((a, i) => ({
      key: `live-${a.sessionId}-${i}-${a.at}`,
      alertId: undefined as string | undefined,
      type: a.type,
      severity: a.severity,
      message: a.message,
      at: a.at,
      acknowledged: false,
      tutor: a.tutor,
      student: a.student,
    })),
  ]
    .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
    .slice(0, 14);

  const standDown = (sessionId: string) => {
    socketRef.current?.emit("clear_sos", { sessionId, by: "admin" });
    toast({ title: "SOS stood down", description: "Incident logged for review." });
  };

  return (
    <div>
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
            Safety Console
            {active.length > 0 && (
              <span className="sk-pill sk-pill-green">
                <Radio className="w-3 h-3 animate-pulse" /> {active.length} active
              </span>
            )}
            {sosCount > 0 && (
              <span className="sk-pill sk-pill-red sos-pulse">🚨 {sosCount} SOS</span>
            )}
            {activeIncidents > 0 && (
              <span className="sk-pill sk-pill-red"><FileWarning className="w-3 h-3" /> {activeIncidents} incident{activeIncidents > 1 ? "s" : ""}</span>
            )}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Live map, alerts and one-tap response for every home session on the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="sk-pill sk-pill-blue"><MapPin className="w-3 h-3" /> Chennai ops</span>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Active sessions", value: active.length, icon: Radar, tone: "navy" as const, sub: "en route + on site + live" },
          { label: "SOS active", value: sosCount, icon: Siren, tone: "red" as const, sub: sosCount > 0 ? "IMMEDIATE RESPONSE" : "all clear" },
          { label: "On the way", value: active.filter((s) => (lives[s.sessionId]?.stage ?? s.stage) === "enroute").length, icon: Activity, tone: "orange" as const, sub: "tutors en route" },
          { label: "Sessions live", value: active.filter((s) => (lives[s.sessionId]?.stage ?? s.stage) === "in_progress").length, icon: Timer, tone: "green" as const, sub: "OTP checked in" },
        ].map((k) => (
          <div key={k.label} className="sk-card p-3.5 flex items-center gap-3">
            <div className={clsx("sk-avatar shrink-0", k.tone === "red" ? "bg-gradient-to-b from-[#E96A75] to-[#C03342]" : k.tone === "orange" ? "bg-gradient-to-b from-[#FFA24D] to-[#E76E0F]" : k.tone === "green" ? "bg-gradient-to-b from-[#46BD85] to-[#1F9D68]" : "bg-gradient-to-b from-[#33549E] to-[#14246B]")} style={{ width: 38, height: 38, borderRadius: 12 }}>
              <k.icon className="w-[17px] h-[17px]" strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="text-[20px] font-extrabold leading-tight tabular">{k.value}</div>
              <div className="text-[10px] text-muted-foreground">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState icon={ShieldAlert} title="No home sessions in the system" sub="The console lights up automatically whenever a home-visit session goes active." />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
          {/* map + incidents */}
          <div className="space-y-5 min-w-0">
            <div className="sk-card p-4 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3.5">
                {session && (
                  <>
                    <StatusPill tone={pillFor(STAGE_PILL, live?.stage ?? session.stage).cls} className="!text-[12px] !py-1.5 !px-3">
                      {pillFor(STAGE_PILL, live?.stage ?? session.stage).label}
                    </StatusPill>
                    <span className="text-[12.5px] font-semibold">
                      {session.tutor.name} <span className="text-muted-foreground">→</span> {session.student.name}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">{session.destArea}</span>
                    {(live?.sosActive ?? session.sosActive) && <span className="sk-pill sk-pill-red sos-pulse">🚨 SOS</span>}
                    {live?.stage === "in_progress" && (
                      <span className="sk-pill sk-pill-navy tabular !text-[12px] !py-1.5 !px-3">
                        <Timer className="w-3.5 h-3.5" /> {fmtElapsed(live.sessionElapsedSec)}
                      </span>
                    )}
                  </>
                )}
              </div>
              {session && (
                <MapView
                  route={session.route?.length ? session.route : [session.dest]}
                  marker={live?.marker ?? null}
                  dest={session.dest}
                  destLabel={session.destArea}
                  geofenceMeters={150}
                  sosActive={live?.sosActive ?? session.sosActive}
                  stage={live?.stage ?? session.stage}
                  progress={live?.progress ?? 0}
                  className="h-[340px] sm:h-[420px]"
                />
              )}
              {session && (
                <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <AvatarTile name={session.tutor.name} color={session.tutor.avatarColor} size={38} />
                  <div className="mr-auto">
                    <div className="text-[13px] font-bold">{session.tutor.name}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {session.subject} · {session.student.name} · {timeOf(session.startAt)}
                    </div>
                  </div>
                  <a href={`tel:${session.tutor.phone?.replace(/\s/g, "")}`} className="sk-btn sk-btn-ghost sk-btn-sm">
                    <Phone className="w-3.5 h-3.5" /> Call tutor
                  </a>
                  {(live?.sosActive ?? session.sosActive) ? (
                    <button className="sk-btn sk-btn-success sk-btn-sm" onClick={() => standDown(session.sessionId)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Stand down SOS
                    </button>
                  ) : (
                    <span className="sk-pill sk-pill-green"><CheckCircle2 className="w-3 h-3" /> Background checked</span>
                  )}
                </div>
              )}
            </div>

            {/* incidents */}
            <div className="sk-card p-4">
              <div className="text-[14px] font-bold mb-2.5 flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-[#C03342]" /> Incidents
                {activeIncidents > 0 && (
                  <span className="sk-pill sk-pill-red !text-[10px]">{activeIncidents} needing action</span>
                )}
                <span className="text-[10.5px] text-muted-foreground font-normal ml-auto">open → investigating → resolved / escalated</span>
              </div>
              {incidents.length === 0 ? (
                <div className="text-[12px] text-muted-foreground py-3 text-center">
                  No incidents on file — open one from a session when the safety team needs a formal review.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto sk-scroll pr-1">
                  {incidents.map((inc) => {
                    const pill = INCIDENT_PILL[inc.status] ?? { label: inc.status, tone: "grey" as const };
                    const incBusy = busy === `inc:${inc.id}`;
                    return (
                      <div key={inc.id} className="sk-well p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill tone={pill.tone} className="!text-[10px] !py-1">{pill.label}</StatusPill>
                          <span className="text-[12.5px] font-bold">
                            {inc.tutorName} <span className="text-muted-foreground font-normal">→ {inc.studentName}</span>
                          </span>
                          <span className="text-[10.5px] text-muted-foreground">
                            {inc.area}{inc.session ? ` · ${inc.session.subject}` : ""} · opened {fromNow(inc.createdAt)} by {inc.openedBy}
                          </span>
                        </div>
                        <div className="text-[12px] text-muted-foreground leading-relaxed mt-1.5 whitespace-pre-line">{inc.summary}</div>
                        {inc.resolution && (
                          <div className="sk-callout sk-callout-info mt-2 !text-[11.5px] leading-relaxed">
                            <b>Resolution:</b> {inc.resolution}
                          </div>
                        )}
                        {(inc.status === "open" || inc.status === "investigating") && (
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            {inc.status === "open" && (
                              <button
                                className="sk-btn sk-btn-ghost sk-btn-sm !text-[11px]"
                                disabled={incBusy}
                                onClick={() => patchIncident(inc, { status: "investigating" }, "Investigation started", `${inc.tutorName}'s incident is now with the safety team.`)}
                              >
                                <Search className="w-3.5 h-3.5" /> Start investigating
                              </button>
                            )}
                            {inc.status === "investigating" && (
                              <button
                                className="sk-btn sk-btn-success sk-btn-sm !text-[11px]"
                                disabled={incBusy}
                                onClick={() => setResolveDraft({ id: inc.id, resolution: "" })}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                              </button>
                            )}
                            <button
                              className="sk-btn sk-btn-danger sk-btn-sm !text-[11px]"
                              disabled={incBusy}
                              onClick={() => setEscalateTarget(inc)}
                            >
                              <AlertOctagon className="w-3.5 h-3.5" /> Escalate (suspends tutor)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* right rail: sessions + alerts */}
          <div className="space-y-4">
            <div className="sk-card p-4">
              <div className="text-[14px] font-bold mb-2.5 flex items-center gap-2">
                <Radar className="w-4 h-4 text-[#315BE5]" /> All sessions
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto sk-scroll pr-1">
                {sessions.map((s) => {
                  const st = lives[s.sessionId]?.stage ?? s.stage;
                  const c = CONSOLE_COLORS[st];
                  const sos = lives[s.sessionId]?.sosActive ?? s.sosActive;
                  return (
                    <div
                      key={s.sessionId}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(s.sessionId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelected(s.sessionId);
                      }}
                      className={clsx(
                        "w-full text-left rounded-xl p-2.5 border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#315BE5]",
                        selected === s.sessionId ? "border-[#315BE5] shadow-[0_3px_10px_rgba(49,91,229,0.15)]" : "border-[var(--border)] hover:border-[#B9C6E4]"
                      )}
                      style={{ background: selected === s.sessionId ? "var(--accent)" : "var(--card)" }}
                    >
                      <div className="flex items-center gap-2">
                        <AvatarTile name={s.tutor.name} color={s.tutor.avatarColor} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-bold truncate">
                            {s.tutor.name} <span className="text-muted-foreground font-normal">→ {s.student.name}</span>
                          </div>
                          <div className="text-[10.5px] text-muted-foreground truncate">
                            {s.subject} · {s.destArea} · {timeOf(s.startAt)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {sos ? (
                            <span className="sk-pill sk-pill-red !text-[9.5px] sos-pulse">SOS</span>
                          ) : c ? (
                            <StatusPill tone={c.tone} className="!text-[9.5px] !py-1">{c.label}</StatusPill>
                          ) : (
                            <StatusPill tone="grey" className="!text-[9.5px] !py-1">{st === "done" ? "Done" : "Scheduled"}</StatusPill>
                          )}
                        </div>
                      </div>
                      {st === "enroute" && lives[s.sessionId] && (
                        <div className="mt-2 sk-progress-track !h-[6px]">
                          <div className="sk-progress-fill sk-progress-fill-orange" style={{ width: `${lives[s.sessionId].progress}%` }} />
                        </div>
                      )}
                      {st !== "done" && (
                        <button
                          className="sk-btn sk-btn-ghost sk-btn-sm !text-[10px] !py-1 mt-2 w-full"
                          disabled={busy === `incident:${s.sessionId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startIncident(s);
                          }}
                        >
                          <FileWarning className="w-3 h-3" /> Open incident
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* live alerts feed */}
            <div className="sk-card p-4">
              <div className="text-[14px] font-bold mb-2.5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#DF8B32]" /> Live alert stream
                {unackCount > 0 && (
                  <span className="sk-pill sk-pill-orange !text-[10px]">{unackCount} unacknowledged</span>
                )}
              </div>
              {streamRows.length === 0 ? (
                <div className="text-[12px] text-muted-foreground py-3 text-center">No alerts — all sessions healthy.</div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto sk-scroll pr-1">
                  {streamRows.map((a) => (
                    <div
                      key={a.key}
                      className={clsx(
                        "sk-well p-2.5",
                        a.severity === "critical" && "!border-[#F2C2C7] !bg-[#FDEBED]",
                        a.severity === "warning" && "!border-[#F2D9AC] !bg-[#FDF4E3]"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        {a.severity === "critical" ? (
                          <Siren className="w-4 h-4 text-[#C03342] shrink-0 mt-0.5" />
                        ) : a.severity === "warning" ? (
                          <AlertTriangle className="w-4 h-4 text-[#DF8B32] shrink-0 mt-0.5" />
                        ) : a.severity === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-[#1F9D68] shrink-0 mt-0.5" />
                        ) : (
                          <MapPin className="w-4 h-4 text-[#315BE5] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className={clsx("sk-pill", SEVERITY_PILL[a.severity] ?? "sk-pill-grey", "!text-[9px] !py-0.5 !px-1.5 mb-1")}>
                            {a.type.replace(/_/g, " ")}
                          </span>
                          <div className="text-[12px] font-semibold leading-snug">{a.message}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {a.tutor} · {a.student} · {timeOf(a.at)} · {fromNow(a.at)}
                          </div>
                        </div>
                        {a.alertId && !a.acknowledged && (
                          <button
                            className="sk-btn sk-btn-ghost sk-btn-sm !text-[10px] !py-1 shrink-0"
                            disabled={busy === `ack:${a.alertId}`}
                            onClick={() => acknowledgeAlert(a.alertId as string)}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Acknowledge
                          </button>
                        )}
                        {a.alertId && a.acknowledged && (
                          <span className="sk-pill sk-pill-green !text-[9px] shrink-0"><CheckCircle2 className="w-3 h-3" /> Acked</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* response protocol */}
            <div className="sk-card-flat p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">SOS response protocol</div>
              <ol className="space-y-1.5 text-[11.5px] text-muted-foreground leading-relaxed">
                <li><b className="text-foreground">1.</b> SOS pings this console + on-call pager (critical severity).</li>
                <li><b className="text-foreground">2.</b> Call the tutor, then the parent — buttons on every session.</li>
                <li><b className="text-foreground">3.</b> Escalate to local emergency services if unreachable.</li>
                <li><b className="text-foreground">4.</b> Stand down only after verbal confirmation, then log the incident.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* open-incident dialog */}
      <Dialog open={!!incidentDraft} onOpenChange={(o) => !o && setIncidentDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Open safety incident</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            The incident is filed against this session with status <b>Open</b>. The tutor is asked to cooperate with the
            review — you can then investigate, resolve or escalate it from the Incidents card.
          </p>
          <textarea
            className="sk-input min-h-[140px] text-[12px] leading-relaxed"
            value={incidentDraft?.summary ?? ""}
            onChange={(e) => incidentDraft && setIncidentDraft({ ...incidentDraft, summary: e.target.value })}
            aria-label="Incident summary"
          />
          <DialogFooter>
            <button className="sk-btn sk-btn-ghost" onClick={() => setIncidentDraft(null)}>Cancel</button>
            <button className="sk-btn sk-btn-primary" disabled={busy === "incident" || !incidentDraft?.summary.trim()} onClick={submitIncident}>
              <FileWarning className="w-4 h-4" /> Open incident
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* resolve-incident dialog */}
      <Dialog open={!!resolveDraft} onOpenChange={(o) => !o && setResolveDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve incident</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Add a resolution note — it is stored on the incident record and audited.
          </p>
          <textarea
            className="sk-input min-h-[110px] text-[12px] leading-relaxed"
            placeholder="e.g. Spoke to both parties — the geofence alert was a GPS drift false positive. Tutor briefed, no further action needed."
            value={resolveDraft?.resolution ?? ""}
            onChange={(e) => resolveDraft && setResolveDraft({ ...resolveDraft, resolution: e.target.value })}
            aria-label="Resolution note"
          />
          <DialogFooter>
            <button className="sk-btn sk-btn-ghost" onClick={() => setResolveDraft(null)}>Cancel</button>
            <button
              className="sk-btn sk-btn-success"
              disabled={busy === `inc:${resolveDraft?.id}` || !resolveDraft?.resolution.trim()}
              onClick={() => {
                if (!resolveDraft?.resolution.trim()) return;
                const inc = incidents.find((i) => i.id === resolveDraft.id);
                if (inc) {
                  void patchIncident(inc, { status: "resolved", resolution: resolveDraft.resolution.trim() }, "Incident resolved", "Resolution note stored and audited.");
                  setResolveDraft(null);
                }
              }}
            >
              <CheckCircle2 className="w-4 h-4" /> Resolve incident
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* escalate-incident confirmation */}
      <Dialog open={!!escalateTarget} onOpenChange={(o) => !o && setEscalateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escalate incident?</DialogTitle>
          </DialogHeader>
          <div className="sk-callout sk-callout-danger text-[12px] leading-relaxed">
            Escalating {escalateTarget ? <b>{escalateTarget.tutorName}</b> : "the tutor"}'s incident immediately{" "}
            <b>suspends the tutor's account</b> (pending review) and notifies every admin. Use this for serious safety
            concerns only.
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            The incident record, its alerts and the location trail are preserved for the review. The tutor cannot sign
            in until an admin re-activates the account.
          </p>
          <DialogFooter>
            <button className="sk-btn sk-btn-ghost" onClick={() => setEscalateTarget(null)}>Cancel</button>
            <button
              className="sk-btn sk-btn-danger"
              disabled={busy === `inc:${escalateTarget?.id}`}
              onClick={() => {
                if (!escalateTarget) return;
                const inc = escalateTarget;
                setEscalateTarget(null);
                void patchIncident(inc, { status: "escalated" }, "Incident escalated", `${inc.tutorName}'s account is suspended pending review — admins notified.`);
              }}
            >
              <AlertOctagon className="w-4 h-4" /> Escalate &amp; suspend tutor
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
