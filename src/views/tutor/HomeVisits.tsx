"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLiveSocket, type LiveState } from "@/lib/live-socket";
import { useAppStore } from "@/stores/app-store";
import { MapView } from "@/components/shared/MapView";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { STAGE_PILL, dateTimeOf } from "@/lib/format";
import { clsx } from "clsx";
import {
  MapPinned, KeyRound, LogOut, Siren, Timer, ShieldCheck, Navigation, CheckCircle2,
  RefreshCcw, Radio, AlertTriangle, Home, MapPin,
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

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STAGE_STEPS = [
  { key: "scheduled", label: "Scheduled" },
  { key: "enroute", label: "On my way" },
  { key: "arrived", label: "Arrived" },
  { key: "in_progress", label: "Session live" },
  { key: "done", label: "Checked out" },
];

const SEVERITY_PILL: Record<string, string> = {
  critical: "sk-pill-red",
  warning: "sk-pill-orange",
  success: "sk-pill-green",
  info: "sk-pill-blue",
};

export function HomeVisits() {
  const { context } = useAppStore();
  const [sessions, setSessions] = useState<SafetySession[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [otp, setOtp] = useState("");
  const [checkinError, setCheckinError] = useState<{ reason: string; message: string } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState({ topics: "", homework: "", notes: "" });
  const [, setTick] = useState(0);
  const socketRef = useRef<ReturnType<typeof getLiveSocket> | null>(null);

  const selectSession = (id: string) => {
    setSelected(id);
    setLive(null);
    setOtp("");
    setCheckinError(null);
  };

  useEffect(() => {
    fetch("/api/safety/sessions")
      .then((r) => r.json())
      .then((j) => {
        if (j?.data) {
          setSessions(j.data);
          const fromCtx = (context?.sessionId as string) || null;
          const initial =
            j.data.find((s: SafetySession) => s.sessionId === fromCtx) ??
            j.data.find((s: SafetySession) => s.stage !== "done") ??
            j.data[0];
          if (initial) selectSession(initial.sessionId);
        }
      })
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const socket = getLiveSocket();
    socketRef.current = socket;
    const onState = (s: LiveState) => {
      if (s.sessionId === selected) setLive(s);
    };
    socket.on("state", onState);
    socket.emit("join", { sessionId: selected, role: "tutor" });
    return () => {
      socket.off("state", onState);
    };
  }, [selected]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const session = useMemo(() => sessions?.find((s) => s.sessionId === selected) ?? null, [sessions, selected]);

  if (sessions === null) return <LoadingView label="Loading home visits…" />;

  if (sessions.length === 0) {
    return (
      <div>
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight">Home Visits</h1>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">OTP check-in, geofence & live tracking for every visit.</p>
          </div>
        </header>
        <div className="sk-card p-6">
          <EmptyState
            icon={MapPinned}
            title="No home visits booked"
            sub="When a parent books a home session with you, the full safety flow — On my way, OTP check-in, live session, check-out — appears here."
          />
        </div>
      </div>
    );
  }

  const stage = live?.stage ?? session!.stage;
  const stagePill = pillFor(STAGE_PILL, stage);
  const stepIndex = STAGE_STEPS.findIndex((s) => s.key === stage);

  const onMyWay = () => {
    setBusy(true);
    socketRef.current?.emit("on_my_way", { sessionId: selected });
    socketRef.current?.once("action_result", (r: { action: string; ok: boolean; message?: string }) => {
      if (r.action === "on_my_way") {
        setBusy(false);
        if (r.ok) toast({ title: "On my way! 🚗", description: "Live tracking started — the parent can see your route and ETA." });
        else toast({ title: "Cannot start", description: r.message, variant: "destructive" });
      }
    });
  };

  const checkIn = () => {
    if (otp.trim().length !== 4) {
      toast({ title: "Enter the 4-digit OTP", variant: "destructive" });
      return;
    }
    setBusy(true);
    setCheckinError(null);
    socketRef.current?.emit("checkin", { sessionId: selected, otp: otp.trim() });
    socketRef.current?.once("checkin_result", (r: { ok: boolean; reason?: string; message?: string }) => {
      setBusy(false);
      if (r.ok) {
        setOtp("");
        setCheckinError(null);
        toast({ title: "Checked in ✓", description: "OTP verified inside the geofence — your session has started." });
      } else {
        const reason = r.reason ?? "ERROR";
        setCheckinError({ reason, message: r.message ?? "Please try again." });
        const title =
          reason === "OUTSIDE_GEOFENCE"
            ? "Outside the geofence"
            : reason === "OTP_INVALID"
              ? "Incorrect OTP"
              : reason === "RATE_LIMIT"
                ? "Too many attempts"
                : reason === "INVALID_STATE"
                  ? "Cannot check in yet"
                  : "Check-in failed";
        toast({ title, description: r.message ?? "Please try again.", variant: "destructive" });
      }
    });
  };

  const doCheckout = () => {
    setBusy(true);
    setCheckoutError(null);
    const topics = summary.topics.split(",").map((t) => t.trim()).filter(Boolean);
    socketRef.current?.emit("checkout", {
      sessionId: selected,
      topics,
      homework: summary.homework,
      notes: summary.notes,
    });
    socketRef.current?.once("action_result", (r: { action: string; ok: boolean; message?: string }) => {
      if (r.action === "checkout") {
        setBusy(false);
        if (r.ok) {
          setCheckoutOpen(false);
          setCheckoutError(null);
          toast({ title: "Checked out ✓", description: "Summary shared with the parent — escrow releases to your wallet." });
        } else {
          setCheckoutError(r.message ?? "Please try again.");
          toast({ title: "Cannot check out", description: r.message, variant: "destructive" });
        }
      }
    });
  };

  const raiseSos = () => {
    socketRef.current?.emit("sos", { sessionId: selected, by: "tutor" });
    toast({ title: "🚨 SOS activated", description: "Safety team notified with your live location.", variant: "destructive" });
  };

  const resetDemo = () => {
    socketRef.current?.emit("reset", { sessionId: selected });
    toast({ title: "Demo session reset", description: "Back to Scheduled — run the flow again anytime." });
  };

  return (
    <div>
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
            Home Visits
            {(stage === "enroute" || stage === "in_progress") && (
              <span className="sk-pill sk-pill-green">
                <Radio className="w-3 h-3 animate-pulse" /> Tracking ON
              </span>
            )}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            SafeHome Guardian — you're tracked only during the session window, with consent on file.
          </p>
        </div>
        {sessions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button key={s.sessionId} onClick={() => selectSession(s.sessionId)} className={clsx("sk-chip", selected === s.sessionId && "sk-chip-active")}>
                {s.student.name} · {s.subject}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* stage stepper */}
      <div className="sk-card p-3 mb-5 flex items-center justify-between gap-1 overflow-x-auto sk-scroll">
        {STAGE_STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div className={clsx("sk-step", i < stepIndex && "sk-step-done", i === stepIndex && "sk-step-active")}>
              <span className="sk-step-dot">{i < stepIndex ? "✓" : i + 1}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STAGE_STEPS.length - 1 && <div className="w-4 sm:w-7 h-[2px] rounded" style={{ background: i < stepIndex ? "#1F9D68" : "var(--border)" }} />}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* ===== left: map + info ===== */}
        <div className="space-y-4 min-w-0">
          <div className="sk-card p-4">
            <div className="flex flex-wrap items-center gap-2.5 mb-3.5">
              <StatusPill tone={stagePill.cls} className="!text-[12px] !py-1.5 !px-3">{stagePill.label}</StatusPill>
              {live?.sosActive && <span className="sk-pill sk-pill-red sos-pulse !text-[12px] !py-1.5 !px-3">🚨 SOS ACTIVE</span>}
              {stage === "enroute" && (
                <span className="sk-pill sk-pill-orange !text-[12px] !py-1.5 !px-3">
                  <Navigation className="w-3.5 h-3.5" /> ETA {live?.etaMinutes ?? "—"} min · {live?.progress ?? 0}%
                </span>
              )}
              {stage === "in_progress" && (
                <span className="sk-pill sk-pill-navy !text-[12px] !py-1.5 !px-3 tabular">
                  <Timer className="w-3.5 h-3.5" /> {fmtElapsed(live?.sessionElapsedSec ?? 0)}
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">{session!.destArea}</span>
            </div>

            <MapView
              route={session!.route?.length ? session!.route : [session!.dest]}
              marker={live?.marker ?? null}
              dest={session!.dest}
              destLabel={session!.destArea}
              geofenceMeters={150}
              sosActive={live?.sosActive ?? false}
              stage={stage}
              progress={live?.progress ?? 0}
              className="h-[320px] sm:h-[380px]"
            />

            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <AvatarTile name={session!.student.name} color={session!.student.avatarColor} size={44} />
              <div className="min-w-0">
                <div className="text-[14px] font-bold">{session!.student.name}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {session!.subject} · {dateTimeOf(session!.startAt)} · {session!.title}
                </div>
              </div>
              <span className="sk-pill sk-pill-blue ml-auto">
                <Home className="w-3 h-3" /> {session!.destArea}
              </span>
            </div>
          </div>

          {/* context cards per stage */}
          {stage === "scheduled" && (
            <div className="sk-card p-4">
              <div className="text-[14px] font-bold mb-1">Before you start</div>
              <ul className="space-y-2 text-[12.5px] text-muted-foreground">
                <li className="flex gap-2.5"><ShieldCheck className="w-4 h-4 text-[#1F9D68] shrink-0" /> Live tracking runs only during the session window — parent consent on file.</li>
                <li className="flex gap-2.5"><KeyRound className="w-4 h-4 text-[#F47B20] shrink-0" /> Check-in needs the parent's 4-digit OTP and works only inside the 150 m geofence.</li>
                <li className="flex gap-2.5"><Siren className="w-4 h-4 text-[#C03342] shrink-0" /> SOS is one tap away — safety team responds in seconds.</li>
              </ul>
            </div>
          )}

          {(live?.alerts?.length ?? 0) > 0 && (
            <div className="sk-card p-4">
              <div className="text-[14px] font-bold mb-2.5">Session activity</div>
              <div className="space-y-2 max-h-48 overflow-y-auto sk-scroll pr-1">
                {live!.alerts.map((a, i) => (
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== right: controls ===== */}
        <div className="space-y-4">
          {stage === "scheduled" && (
            <div className="sk-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Navigation className="w-4 h-4 text-[#F47B20]" />
                <h3 className="text-[14px] font-bold">Start the visit</h3>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                Tapping “On my way” starts live tracking and shows the parent your route + ETA. Head to {session!.destArea}.
              </p>
              <button className="sk-btn sk-btn-orange w-full sk-btn-lg" onClick={onMyWay} disabled={busy}>
                <Navigation className="w-4 h-4" /> On my way
              </button>
            </div>
          )}

          {(stage === "enroute" || stage === "arrived") && (
            <div className="sk-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="w-4 h-4 text-[#F47B20]" />
                <h3 className="text-[14px] font-bold">Check in with OTP</h3>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                {stage === "arrived"
                  ? "You're inside the geofence ✓ — ask the parent for their 4-digit OTP at the door."
                  : "Arrive within the 150 m geofence, then enter the parent's OTP at the door."}
              </p>
              <input
                className="sk-input text-center text-[24px] font-extrabold tracking-[0.5em] tabular"
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setCheckinError(null);
                }}
                aria-label="Check-in OTP"
              />
              <button className="sk-btn sk-btn-primary w-full mt-3" onClick={checkIn} disabled={busy || otp.length !== 4}>
                <KeyRound className="w-4 h-4" /> Check in
              </button>
              {checkinError && (
                <div className="sk-callout sk-callout-danger mt-3 flex items-start gap-2" role="alert">
                  {checkinError.reason === "OUTSIDE_GEOFENCE" ? (
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div className="text-[11.5px] leading-relaxed">
                    <b>
                      {checkinError.reason === "OUTSIDE_GEOFENCE"
                        ? "Outside the geofence — "
                        : checkinError.reason === "OTP_INVALID"
                          ? "Incorrect OTP — "
                          : ""}
                    </b>
                    {checkinError.message}
                    {checkinError.reason === "OUTSIDE_GEOFENCE" &&
                      " Keep travelling — check-in unlocks inside the circle around the home."}
                  </div>
                </div>
              )}
              <p className="text-[10.5px] text-muted-foreground text-center mt-2">
                Wrong OTP? 5 attempts max, every attempt is logged.
              </p>
            </div>
          )}

          {stage === "in_progress" && (
            <div className="sk-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-[#315BE5]" />
                <h3 className="text-[14px] font-bold">Session in progress</h3>
              </div>
              <div className="sk-well py-3.5 text-center my-3">
                <div className="text-[30px] font-extrabold tabular gloss-title">{fmtElapsed(live?.sessionElapsedSec ?? 0)}</div>
                <div className="text-[10.5px] text-muted-foreground mt-1">since OTP check-in</div>
              </div>
              {(live?.sessionElapsedSec ?? 0) < 90 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground mb-1">
                    <span>Minimum session time (demo policy)</span>
                    <span className="tabular">{fmtElapsed(Math.floor(live?.sessionElapsedSec ?? 0))} / 01:30</span>
                  </div>
                  <div className="sk-progress-track !h-[6px]">
                    <div className="sk-progress-fill sk-progress-fill-green" style={{ width: `${Math.min(100, ((live?.sessionElapsedSec ?? 0) / 90) * 100)}%` }} />
                  </div>
                </div>
              )}
              <button className="sk-btn sk-btn-success w-full sk-btn-lg" onClick={() => { setCheckoutError(null); setCheckoutOpen(true); }} disabled={busy}>
                <LogOut className="w-4 h-4" /> Check out
              </button>
              <p className="text-[10.5px] text-muted-foreground text-center mt-2">
                Check-out records your summary and releases escrow — minimum duration 90 s (demo policy).
              </p>
            </div>
          )}

          {stage === "done" && (
            <div className="sk-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-[#1F9D68]" />
                <h3 className="text-[14px] font-bold">Visit complete ✓</h3>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Check-out recorded. Your summary was shared with the parent and the escrow payment is on its way to your
                wallet.
              </p>
              {live?.summary && live.summary.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {live.summary.topics.map((t) => (
                    <span key={t} className="sk-pill sk-pill-blue">{t}</span>
                  ))}
                </div>
              )}
              <button className="sk-btn sk-btn-ghost w-full mt-3" onClick={resetDemo}>
                <RefreshCcw className="w-4 h-4" /> Replay demo flow
              </button>
            </div>
          )}

          {/* SOS always available */}
          {stage !== "done" && (
            <div className="sk-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Siren className="w-4 h-4 text-[#C03342]" />
                <h3 className="text-[14px] font-bold">Emergency SOS</h3>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                Feeling unsafe at any point? One tap alerts the safety team with your live location.
              </p>
              {live?.sosActive ? (
                <div className="sk-callout sk-callout-danger">SOS active — safety team responding. Stay on this screen.</div>
              ) : (
                <button
                  className="sk-btn sk-btn-danger w-full"
                  onClick={() => {
                    if (confirm("Raise SOS? The safety team will be notified with your live location.")) raiseSos();
                  }}
                >
                  <Siren className="w-4 h-4" /> Raise SOS
                </button>
              )}
            </div>
          )}

          <div className="sk-card-flat p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Privacy first</div>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
              Location is collected only inside the active session window, with explicit consent from both sides, and is
              purged after the retention period. Every OTP attempt and alert is audited.
            </p>
          </div>
        </div>
      </div>

      {/* checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Check out — session summary</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11.5px] font-bold text-muted-foreground">Topics covered (comma separated)</label>
              <input
                className="sk-input mt-1"
                placeholder="e.g. Laws of reflection, Image formation, Lateral inversion"
                value={summary.topics}
                onChange={(e) => setSummary({ ...summary, topics: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-muted-foreground">Homework assigned</label>
              <input
                className="sk-input mt-1"
                placeholder="e.g. Ray diagrams worksheet Q1–Q8"
                value={summary.homework}
                onChange={(e) => setSummary({ ...summary, homework: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-muted-foreground">Notes for the parent</label>
              <textarea
                className="sk-input mt-1 min-h-[70px]"
                placeholder="Aarav grasped the laws quickly — needs more practice on image formation."
                value={summary.notes}
                onChange={(e) => setSummary({ ...summary, notes: e.target.value })}
              />
            </div>
            {checkoutError && (
              <div className="sk-callout sk-callout-danger text-[11.5px] leading-relaxed" role="alert">
                {checkoutError}
              </div>
            )}
          </div>
          <DialogFooter>
            <button className="sk-btn sk-btn-ghost" onClick={() => setCheckoutOpen(false)}>Cancel</button>
            <button className="sk-btn sk-btn-success" onClick={doCheckout} disabled={busy}>
              <LogOut className="w-4 h-4" /> Confirm check-out
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
