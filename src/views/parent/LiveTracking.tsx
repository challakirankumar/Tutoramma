"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLiveSocket, type LiveState } from "@/lib/live-socket";
import { useAppStore } from "@/stores/app-store";
import { MapView } from "@/components/shared/MapView";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { SectionTitle, EmptyState, LoadingView } from "@/components/shared/Section";
import { STAGE_PILL, dateTimeOf, fromNow } from "@/lib/format";
import { clsx } from "clsx";
import {
  Radar, ShieldCheck, KeyRound, BatteryFull, Siren, CheckCircle2, AlertTriangle,
  Clock, MapPin, RefreshCcw, Phone, MessageCircleQuestion, Timer, Lock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const SEVERITY_PILL: Record<string, string> = {
  critical: "sk-pill-red",
  warning: "sk-pill-orange",
  success: "sk-pill-green",
  info: "sk-pill-blue",
};

export function LiveTracking() {
  const { user } = useAppStore();
  const [sessions, setSessions] = useState<SafetySession[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [silentOpen, setSilentOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const socketRef = useRef<ReturnType<typeof getLiveSocket> | null>(null);

  /* load sessions */
  const selectSession = (id: string) => {
    setSelected(id);
    setLive(null);
    setOtp(null);
    setOtpExpiry(null);
  };

  useEffect(() => {
    fetch("/api/safety/sessions")
      .then((r) => r.json())
      .then((j) => {
        if (j?.data) {
          setSessions(j.data);
          const first = j.data.find((s: SafetySession) => s.stage !== "done") ?? j.data[0];
          if (first) selectSession(first.sessionId);
        }
      })
      .catch(() => setSessions([]));
     
  }, []);

  /* socket join */
  useEffect(() => {
    if (!selected) return;
    const socket = getLiveSocket();
    socketRef.current = socket;
    const onState = (s: LiveState) => {
      if (s.sessionId === selected) setLive(s);
    };
    const onOtp = (d: { sessionId: string; otp: string; expiresAt: number }) => {
      if (d.sessionId === selected) {
        setOtp(d.otp);
        setOtpExpiry(d.expiresAt);
      }
    };
    socket.on("state", onState);
    socket.on("otp", onOtp);
    socket.emit("join", { sessionId: selected, role: "parent" });
    return () => {
      socket.off("state", onState);
      socket.off("otp", onOtp);
    };
  }, [selected]);

  /* 1s ticker for timer/ping labels */
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const session = useMemo(
    () => sessions?.find((s) => s.sessionId === selected) ?? null,
    [sessions, selected]
  );

  if (sessions === null) return <LoadingView label="Loading live sessions…" />;

  if (sessions.length === 0) {
    return (
      <div>
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight">Live Tracking</h1>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Every home session, on a map, in real time.</p>
          </div>
        </header>
        <div className="sk-card p-6">
          <EmptyState
            icon={Radar}
            title="No home sessions yet"
            sub="When a tutor is on the way to a home session, you'll see their live route, ETA and check-in OTP here."
          />
        </div>
      </div>
    );
  }

  const stagePill = live ? pillFor(STAGE_PILL, live.stage) : pillFor(STAGE_PILL, session?.stage ?? "scheduled");
  const eta = live?.etaMinutes ?? 0;
  const otpSecondsLeft = otpExpiry ? Math.max(0, Math.round((otpExpiry - Date.now()) / 1000)) : 0;

  const requestOtp = () => {
    socketRef.current?.emit("request_otp", { sessionId: selected, role: "parent" });
  };
  const silentCheck = (status: "ok" | "not_ok") => {
    socketRef.current?.emit("silent_check", { sessionId: selected, status });
    setSilentOpen(false);
    toast({
      title: status === "ok" ? "Confirmed — everything is OK" : "Safety check escalated",
      description:
        status === "ok"
          ? "Thanks! The tutor session continues normally."
          : "Our safety team has been notified and will follow up immediately.",
      variant: status === "ok" ? undefined : "destructive",
    });
  };
  const raiseSos = () => {
    socketRef.current?.emit("sos", { sessionId: selected, by: "parent" });
    toast({ title: "🚨 SOS activated", description: "Safety team + emergency contacts notified with live location.", variant: "destructive" });
  };
  const clearSos = () => {
    socketRef.current?.emit("clear_sos", { sessionId: selected, by: "parent" });
    toast({ title: "SOS stood down", description: "Logged for review — stay safe!" });
  };

  return (
    <div key={tick % 1}>
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
            Live Tracking
            {live && (live.stage === "enroute" || live.stage === "in_progress") && (
              <span className="sk-pill sk-pill-green">
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" /> LIVE
              </span>
            )}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            SafeHome Guardian — OTP check-in, 150 m geofence, live route & one-tap SOS.
          </p>
        </div>
        {sessions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => selectSession(s.sessionId)}
                className={clsx("sk-chip", selected === s.sessionId && "sk-chip-active")}
              >
                {s.student.name} · {s.subject}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* ===== map + status ===== */}
        <div className="space-y-4 min-w-0">
          <div className="sk-card p-4">
            {/* status strip */}
            <div className="flex flex-wrap items-center gap-2.5 mb-3.5">
              <StatusPill tone={stagePill.cls} className="!text-[12px] !py-1.5 !px-3">
                {stagePill.label}
              </StatusPill>
              {live?.sosActive && (
                <span className="sk-pill sk-pill-red sos-pulse !text-[12px] !py-1.5 !px-3">🚨 SOS ACTIVE</span>
              )}
              {live?.stage === "enroute" && (
                <span className="sk-pill sk-pill-orange !text-[12px] !py-1.5 !px-3">
                  <Clock className="w-3.5 h-3.5" /> ETA {eta} min
                </span>
              )}
              {live?.stage === "in_progress" && (
                <span className="sk-pill sk-pill-navy !text-[12px] !py-1.5 !px-3 tabular">
                  <Timer className="w-3.5 h-3.5" /> {fmtElapsed(live.sessionElapsedSec)}
                </span>
              )}
              {live && (
                <span className="sk-pill sk-pill-grey !text-[12px] !py-1.5 !px-3">
                  <BatteryFull className="w-3.5 h-3.5" /> {Math.round(live.battery)}%
                </span>
              )}
              {live?.lastPingAt && (
                <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
                  <Radar className="w-3 h-3" /> Last ping {fromNow(new Date(live.lastPingAt))}
                </span>
              )}
            </div>

            <MapView
              route={live && live.stage !== "enroute" && session!.route?.length ? session!.route : (live ? [live.marker, live.dest] : [session!.dest])}
              marker={live?.marker ?? null}
              dest={session!.dest}
              destLabel={session!.destArea}
              geofenceMeters={150}
              sosActive={live?.sosActive ?? false}
              stage={live?.stage ?? session!.stage}
              progress={live?.progress ?? 0}
              className="h-[340px] sm:h-[400px]"
            />

            {/* tutor + booking info */}
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <AvatarTile name={session!.tutor.name} color={session!.tutor.avatarColor} size={44} />
              <div className="min-w-0">
                <div className="text-[14px] font-bold">{session!.tutor.name}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {session!.subject} · {session!.student.name} · {dateTimeOf(session!.startAt)}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <a href={`tel:${session!.tutor.phone?.replace(/\s/g, "")}`} className="sk-btn sk-btn-ghost sk-btn-sm">
                  <Phone className="w-3.5 h-3.5" /> Call tutor
                </a>
                <span className="sk-pill sk-pill-green">
                  <ShieldCheck className="w-3 h-3" /> Background checked
                </span>
              </div>
            </div>
          </div>

          {/* alerts feed */}
          <div className="sk-card p-4">
            <SectionTitle
              title="Safety activity"
              sub="Every event on this session is logged and auditable."
              right={<span className="sk-pill sk-pill-blue">Audit trail</span>}
            />
            <div className="mt-3 space-y-2 max-h-56 overflow-y-auto sk-scroll pr-1">
              {(live?.alerts?.length ?? 0) === 0 && (
                <div className="text-[12.5px] text-muted-foreground py-3 text-center">
                  No events yet — activity appears as the session progresses.
                </div>
              )}
              {live?.alerts?.map((a, i) => (
                <div
                  key={i}
                  className={clsx(
                    "sk-well p-2.5 flex items-start gap-2.5",
                    a.severity === "warning" && "!border-[#F2D9AC] !bg-[#FDF4E3]",
                    a.severity === "critical" && "!border-[#F2C2C7] !bg-[#FDEBED]"
                  )}
                >
                  {a.severity === "critical" ? (
                    <Siren className="w-4 h-4 text-[#C03342] shrink-0 mt-0.5" />
                  ) : a.severity === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-[#1F9D68] shrink-0 mt-0.5" />
                  ) : a.severity === "warning" ? (
                    <AlertTriangle className="w-4 h-4 text-[#DF8B32] shrink-0 mt-0.5" />
                  ) : (
                    <MapPin className="w-4 h-4 text-[#315BE5] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className={clsx("sk-pill", SEVERITY_PILL[a.severity] ?? "sk-pill-grey", "!text-[9px] !py-0.5 !px-1.5")}>
                      {a.type.replace(/_/g, " ")}
                    </span>
                    <div className="text-[12.5px] font-semibold leading-snug mt-1">{a.message}</div>
                    <div className="text-[10.5px] text-muted-foreground">{fromNow(a.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== right rail: OTP + safety controls ===== */}
        <div className="space-y-4">
          {/* check-in OTP */}
          <div className="sk-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-[#F47B20]" />
              <h3 className="text-[14px] font-bold">Check-in OTP</h3>
            </div>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
              Share this code with your tutor <b>only at your door</b>. Check-in works exclusively inside the 150 m
              geofence.
            </p>
            {!otp ? (
              <button className="sk-btn sk-btn-primary w-full" onClick={requestOtp} disabled={live?.stage === "done"}>
                <KeyRound className="w-4 h-4" /> {otpExpiry ? "Show my OTP" : "Get check-in OTP"}
              </button>
            ) : (
              <div className="text-center">
                <div
                  className="sk-well py-4 px-4 flex items-center justify-center gap-3"
                  style={{ letterSpacing: "0.35em" }}
                >
                  <span className="text-[34px] font-extrabold tabular gloss-title">{otp}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  {otpSecondsLeft > 0 ? <>Expires in {Math.floor(otpSecondsLeft / 60)}:{String(otpSecondsLeft % 60).padStart(2, "0")}</> : "Expired — request a fresh code"}
                </div>
                {otpSecondsLeft <= 0 && (
                  <button className="sk-btn sk-btn-ghost sk-btn-sm mt-2" onClick={requestOtp}>
                    <RefreshCcw className="w-3.5 h-3.5" /> New OTP
                  </button>
                )}
              </div>
            )}
          </div>

          {/* silent check */}
          <div className="sk-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircleQuestion className="w-4 h-4 text-[#315BE5]" />
              <h3 className="text-[14px] font-bold">Silent check</h3>
            </div>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
              A quick mid-session check. Only you and the safety team see your answer.
            </p>
            {live?.silentCheck ? (
              <div className={clsx("sk-callout", live.silentCheck.status === "ok" ? "sk-callout-info" : "sk-callout-danger")}>
                {live.silentCheck.status === "ok"
                  ? "You confirmed everything is OK ✓"
                  : "You flagged NOT OK — the safety team is responding."}
              </div>
            ) : live?.stage === "in_progress" ? (
              !silentOpen ? (
                <button className="sk-btn sk-btn-ghost w-full" onClick={() => setSilentOpen(true)}>
                  <MessageCircleQuestion className="w-4 h-4" /> Is everything OK?
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button className="sk-btn sk-btn-success" onClick={() => silentCheck("ok")}>
                    <CheckCircle2 className="w-4 h-4" /> All good
                  </button>
                  <button className="sk-btn sk-btn-danger" onClick={() => silentCheck("not_ok")}>
                    <AlertTriangle className="w-4 h-4" /> Not OK
                  </button>
                </div>
              )
            ) : (
              <div className="sk-callout sk-callout-info">Available while the session is in progress.</div>
            )}
          </div>

          {/* SOS */}
          <div className="sk-card p-4" style={{ boxShadow: live?.sosActive ? "0 8px 30px rgba(198,51,66,0.25)" : undefined }}>
            <div className="flex items-center gap-2 mb-1">
              <Siren className="w-4 h-4 text-[#C03342]" />
              <h3 className="text-[14px] font-bold">Emergency SOS</h3>
            </div>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
              One tap notifies the Tutor Amma safety team and your emergency contacts with the live location.
            </p>
            {live?.sosActive ? (
              <button className="sk-btn sk-btn-ghost w-full" onClick={clearSos}>
                <CheckCircle2 className="w-4 h-4" /> Stand down — situation resolved
              </button>
            ) : (
              <button
                className="sk-btn sk-btn-danger w-full sk-btn-lg sos-pulse"
                onClick={() => {
                  if (confirm("Raise SOS now? The safety team and your emergency contacts will be notified with the live location.")) raiseSos();
                }}
              >
                <Siren className="w-4 h-4" /> Raise SOS
              </button>
            )}
          </div>

          {/* how it works */}
          <div className="sk-card-flat p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
              How the safety chain works
            </div>
            <ol className="space-y-2 text-[12px] leading-relaxed">
              {[
                "Tutor taps “On my way” — live tracking starts",
                "You see the route, ETA & battery en route",
                "At your door: tutor must be inside the 150 m geofence",
                "Tutor enters your OTP to check in — session timer starts",
                "Check-out with summary → escrow releases to the tutor",
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    className="sk-avatar shrink-0"
                    style={{ width: 20, height: 20, borderRadius: 7, fontSize: 10, background: "linear-gradient(180deg,#33549E,#14246B)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* completed summary */}
          {live?.stage === "done" && live.summary && (
            <div className="sk-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-[#1F9D68]" />
                <h3 className="text-[14px] font-bold">Session summary</h3>
              </div>
              {live.summary.topics.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10.5px] font-bold uppercase text-muted-foreground">Topics covered</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {live.summary.topics.map((t) => (
                      <span key={t} className="sk-pill sk-pill-blue">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {live.summary.homework && (
                <div className="mb-2">
                  <div className="text-[10.5px] font-bold uppercase text-muted-foreground">Homework</div>
                  <div className="text-[12px] mt-0.5">{live.summary.homework}</div>
                </div>
              )}
              {live.summary.notes && (
                <div>
                  <div className="text-[10.5px] font-bold uppercase text-muted-foreground">Tutor notes</div>
                  <div className="text-[12px] mt-0.5 text-muted-foreground">{live.summary.notes}</div>
                </div>
              )}
              <div className="sk-callout sk-callout-info mt-3">
                Escrow released to the tutor after check-out. Your invoice has been updated.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
