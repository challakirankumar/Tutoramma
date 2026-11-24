"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, HeaderButton, AccentKpi } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { getLiveSocket, type LiveState } from "@/lib/live-socket";
import { toast } from "@/hooks/use-toast";
import { exportBrandedExcel } from "@/lib/excel";
import { RadioTower, Phone, Siren, CheckCircle2, ShieldAlert, FileWarning, Download, AlertTriangle, MapPin, Clock } from "lucide-react";

/* ---------------- types ---------------- */
interface Visit {
  sessionId: string;
  stage: string;
  sosActive: boolean;
  startAt: string;
  endAt: string;
  subject: string;
  tutor: { id: string; name: string; phone: string };
  student: { id: string; name: string };
  destArea: string;
  dest: { lat: number; lng: number };
  checkedInAt: string | null;
  checkedOutAt: string | null;
  onMyWayAt: string | null;
}
interface Alert {
  id: string;
  sessionId: string | null;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}
interface Incident {
  id: string;
  sessionId: string;
  tutorName: string;
  studentName: string;
  area: string;
  status: string;
  summary: string;
  resolution: string | null;
  createdAt: string;
}

/* Default alert rules (spec §23) — thresholds live in the country RulesProfile. */
const RULES = [
  ["Tutor on the way", "Tutor taps On my way", "Parent", "Show ETA and map"],
  ["Late", "ETA exceeded by 10 min", "Parent, safety desk", "Offer backup tutor after 20 min"],
  ["Off route", "More than 500 m from route for 2 min", "Safety desk", "Ping tutor; call if no answer"],
  ["No check-in", "10 min after start with no check-in", "Parent, safety desk", "Call tutor then parent"],
  ["Geofence exit", "Outside safe zone > 150 m for 3 min during session", "Parent, safety desk", "Call both; escalate if no answer"],
  ["Location lost", "No ping for 2 min", "Safety desk", "Request refresh; log gap"],
  ["Session overrun", "15 min past booked end", "Parent", "Prompt check-out"],
  ["Check-out missing", "15 min after end with no check-out", "Parent, safety desk", "Call tutor"],
  ["Battery low", "Tutor device below 10 percent", "Safety desk", "Warn tutor"],
  ["Suspicious location", "Mock-location flag or impossible speed", "Safety desk", "Flag for review (no accusation)"],
  ["SOS", "Tutor or parent presses SOS", "Safety desk, trusted contacts, support lead", "Share live location; call; escalation ladder"],
];

const ALERT_LABEL: Record<string, string> = {
  sos: "SOS",
  late_start: "Late arrival",
  eta_slip: "Late arrival",
  geofence_exit: "Geofence exit",
  silent: "Location lost",
  no_checkin: "No check-in",
  overrun: "Session overrun",
  off_route: "Off route",
};

function statusOf(v: Visit, live?: LiveState): { label: string; cls: string; key: string } {
  const stage = live?.stage ?? v.stage;
  if (live?.sosActive || v.sosActive) return { label: "SOS", cls: "bg-[#FDECEC] text-[#C03342]", key: "sos" };
  const alerts = live?.alerts ?? [];
  if (alerts.some((a) => a.type === "geofence_exit")) return { label: "Geofence", cls: "bg-[#FDECEC] text-[#C03342]", key: "alert" };
  if (stage === "enroute") {
    if (alerts.some((a) => a.type === "eta_slip" || a.type === "late_start")) return { label: "Late", cls: "bg-[#FFF1E6] text-[#D9580E]", key: "late" };
    return { label: "En route", cls: "bg-[#EAF0FB] text-[#22357F]", key: "enroute" };
  }
  if (stage === "arrived") return { label: "Arrived", cls: "bg-[#EAF0FB] text-[#22357F]", key: "arrived" };
  if (stage === "in_progress") return { label: "In session", cls: "bg-[#E6F6EE] text-[#1F7A55]", key: "session" };
  if (stage === "done") return { label: "Completed", cls: "bg-[#EEF2FA] text-[#57627F]", key: "done" };
  return { label: "Scheduled", cls: "bg-[#EEF2FA] text-[#57627F]", key: "scheduled" };
}

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

/* ======================================================================= */

export function ControlTower() {
  const [tab, setTab] = useState("map");
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [lives, setLives] = useState<Record<string, LiveState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [, tick] = useState(0);
  const joined = useRef(new Set<string>());

  const loadAux = () => {
    fetch("/api/safety/alerts").then((r) => r.json()).then((j) => j?.data && setAlerts(j.data)).catch(() => {});
    fetch("/api/safety/incidents").then((r) => r.json()).then((j) => j?.data && setIncidents(j.data)).catch(() => {});
  };

  useEffect(() => {
    const load = () =>
      fetch("/api/safety/sessions")
        .then((r) => r.json())
        .then((j) => setVisits(j?.data ?? []))
        .catch(() => setVisits([]));
    load();
    loadAux();
    const a = setInterval(load, 30000);
    const b = setInterval(loadAux, 15000);
    const c = setInterval(() => tick((x) => x + 1), 1000);
    return () => [a, b, c].forEach(clearInterval);
  }, []);

  /* subscribe to every visit room for live stage, alerts and SOS */
  useEffect(() => {
    if (!visits) return;
    const socket = getLiveSocket();
    const onState = (s: LiveState) => setLives((p) => ({ ...p, [s.sessionId]: s }));
    socket.on("state", onState);
    for (const v of visits) {
      if (v.stage === "done" || joined.current.has(v.sessionId)) continue;
      joined.current.add(v.sessionId);
      socket.emit("join", { sessionId: v.sessionId, role: "admin" });
    }
    return () => {
      socket.off("state", onState);
    };
  }, [visits]);

  const active = useMemo(() => (visits ?? []).filter((v) => (lives[v.sessionId]?.stage ?? v.stage) !== "done"), [visits, lives]);
  const counts = useMemo(() => {
    const st = active.map((v) => statusOf(v, lives[v.sessionId]).key);
    return {
      enroute: st.filter((k) => k === "enroute").length,
      late: st.filter((k) => k === "late" || k === "alert").length,
      open: alerts.filter((a) => !a.acknowledged).length,
    };
  }, [active, lives, alerts]);

  /* response time = time from alert to acknowledgement isn't stored; show time-to-ack of open queue */
  const avgOpenAge = useMemo(() => {
    const open = alerts.filter((a) => !a.acknowledged);
    if (!open.length) return "—";
    const secs = open.reduce((s, a) => s + (Date.now() - new Date(a.createdAt).getTime()) / 1000, 0) / open.length;
    return secs < 60 ? `${Math.round(secs)}s` : secs < 3600 ? `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s` : `${Math.round(secs / 3600)}h`;
  }, [alerts]);

  const ack = async (a: Alert) => {
    const r = await fetch("/api/safety/alerts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id }) });
    if (r.ok) {
      toast({ title: "Alert acknowledged", description: "Logged with your name and time." });
      loadAux();
    } else toast({ title: "Could not acknowledge", variant: "destructive" });
  };

  const escalate = async (sessionId: string | null, summary: string) => {
    if (!sessionId) return toast({ title: "No visit linked to this alert", variant: "destructive" });
    const r = await fetch("/api/safety/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, summary }) });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      toast({ title: "Incident opened", description: "Escalation ladder started — shift lead notified." });
      loadAux();
      setTab("incidents");
    } else toast({ title: "Could not escalate", description: j?.error?.message, variant: "destructive" });
  };

  const updateIncident = async (i: Incident, status: string) => {
    const resolution = status === "resolved" ? window.prompt("Resolution note (required)", "Contacted tutor and parent; visit confirmed safe.") : status === "escalated" ? "Escalated to head of safety." : "";
    if (status === "resolved" && !resolution) return;
    const r = await fetch(`/api/safety/incidents/${i.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, resolution }) });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      toast({ title: `Incident ${status}` });
      loadAux();
    } else toast({ title: "Update failed", description: j?.error?.message, variant: "destructive" });
  };

  const exportLog = () =>
    exportBrandedExcel({
      fileName: "control-tower-visit-log",
      title: "Home-visit Control Tower · visit and alert log",
      subtitle: `Generated ${new Date().toLocaleString("en-IN")} · India · all areas`,
      columns: [
        { header: "Visit", key: "visit", width: 30 },
        { header: "Area", key: "area", width: 20 },
        { header: "Status", key: "status", width: 14 },
        { header: "Scheduled", key: "start", width: 20 },
        { header: "Checked in", key: "in", width: 20 },
        { header: "Checked out", key: "out", width: 20 },
        { header: "Open alerts", key: "alerts", width: 12, type: "number" },
      ],
      rows: (visits ?? []).map((v) => ({
        visit: `${v.tutor.name} · ${v.student.name}`,
        area: v.destArea,
        status: statusOf(v, lives[v.sessionId]).label,
        start: new Date(v.startAt).toLocaleString("en-IN"),
        in: v.checkedInAt ? new Date(v.checkedInAt).toLocaleString("en-IN") : "—",
        out: v.checkedOutAt ? new Date(v.checkedOutAt).toLocaleString("en-IN") : "—",
        alerts: alerts.filter((a) => a.sessionId === v.sessionId && !a.acknowledged).length,
      })),
      totals: { visit: "Total visits", alerts: "SUM" },
    });

  const sosOpen = alerts.find((a) => a.type === "sos" && !a.acknowledged);

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="safety"
        icon={RadioTower}
        title="Home-visit Control Tower"
        subtitle="Every active visit, live. Alerts reach the right person in seconds."
        pills={[{ label: "Live", tone: "live" }, ...(counts.open ? [{ label: `${counts.open} open alert${counts.open > 1 ? "s" : ""}`, tone: "alert" as const }] : []), { label: "India · all areas", tone: "info" }]}
        actions={
          <>
            <HeaderButton onClick={exportLog}>
              <Download className="w-3.5 h-3.5" /> Export log
            </HeaderButton>
            <HeaderButton variant="danger" onClick={() => { const a = alerts.find((x) => !x.acknowledged); if (a) escalate(a.sessionId, `${ALERT_LABEL[a.type] ?? a.type}: ${a.message}`); else toast({ title: "No open alerts to escalate" }); }}>
              <Siren className="w-3.5 h-3.5" /> Escalate
            </HeaderButton>
          </>
        }
        tabs={[
          { id: "map", label: "Live map" },
          { id: "alerts", label: "Alerts", count: counts.open },
          { id: "incidents", label: "Incidents", count: incidents.filter((i) => i.status !== "resolved").length },
          { id: "rules", label: "Rules" },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {sosOpen && <SosLadder alert={sosOpen} onAck={() => ack(sosOpen)} onEscalate={() => escalate(sosOpen.sessionId, `SOS: ${sosOpen.message}`)} />}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <AccentKpi label="Active visits" value={active.length} />
        <AccentKpi label="En route" value={counts.enroute} />
        <AccentKpi label="Late / off route" value={counts.late} tone={counts.late ? "red" : "orange"} />
        <AccentKpi label="Open alerts" value={counts.open} tone={counts.open ? "red" : "orange"} />
        <AccentKpi label="Avg open age" value={avgOpenAge} sub="target: acknowledge P0 in 1 min" />
      </div>

      {!visits ? (
        <LoadingView label="Connecting to live visits…" />
      ) : tab === "map" ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-3 sk-card p-0 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                  <th className="text-left px-4 py-2.5">Visit</th>
                  <th className="text-left px-2 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {visits.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">No home visits today.</td></tr>
                )}
                {visits.map((v) => {
                  const st = statusOf(v, lives[v.sessionId]);
                  return (
                    <tr key={v.sessionId} className={clsx("border-t cursor-pointer hover:bg-[#F7F9FE]", selected === v.sessionId && "bg-[#F0F4FE]")} style={{ borderColor: "var(--border)" }} onClick={() => setSelected(v.sessionId)}>
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-[#142366]">{v.tutor.name.split(" ")[0]} · {v.student.name.split(" ")[0]}</div>
                        <div className="text-[11px] text-muted-foreground">{v.destArea || "—"}</div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={clsx("px-2 py-[3px] rounded-full text-[10.5px] font-bold whitespace-nowrap", st.cls)}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="xl:col-span-5 sk-card p-3">
            <TowerMap visits={visits} lives={lives} selected={selected} onSelect={setSelected} />
          </div>
          <div className="xl:col-span-4 space-y-2.5">
            <div className="text-[14px] font-extrabold text-[#142366] px-1">Alerts</div>
            <AlertFeed alerts={alerts.filter((a) => !a.acknowledged).slice(0, 6)} visits={visits} onAck={ack} onEscalate={escalate} />
          </div>
        </div>
      ) : tab === "alerts" ? (
        <div className="sk-card p-4">
          <AlertFeed alerts={alerts} visits={visits} onAck={ack} onEscalate={escalate} showAll />
        </div>
      ) : tab === "incidents" ? (
        <div className="sk-card p-0 overflow-hidden">
          {incidents.length === 0 ? (
            <EmptyState icon={FileWarning} title="No incidents" sub="Escalated alerts open an incident with a full evidence trail." />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                  <th className="text-left px-4 py-2.5">Visit</th>
                  <th className="text-left px-3 py-2.5">Summary</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Opened</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#142366]">{i.tutorName} · {i.studentName}</div>
                      <div className="text-[11px] text-muted-foreground">{i.area}</div>
                    </td>
                    <td className="px-3 py-3 max-w-[340px]">
                      {i.summary}
                      {i.resolution && <div className="text-[11px] text-[#1F7A55] mt-1">Resolution: {i.resolution}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx("px-2 py-[3px] rounded-full text-[10.5px] font-bold", i.status === "resolved" ? "bg-[#E6F6EE] text-[#1F7A55]" : i.status === "escalated" ? "bg-[#FDECEC] text-[#C03342]" : "bg-[#FFF1E6] text-[#D9580E]")}>{i.status}</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{ago(i.createdAt)} ago</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {i.status !== "resolved" && (
                        <>
                          {i.status === "open" && <button className="sk-btn sk-btn-sm sk-btn-ghost mr-1" onClick={() => updateIncident(i, "investigating")}>Investigate</button>}
                          {i.status !== "escalated" && <button className="sk-btn sk-btn-sm sk-btn-ghost mr-1" onClick={() => updateIncident(i, "escalated")}>Escalate</button>}
                          <button className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => updateIncident(i, "resolved")}>Resolve</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="sk-card p-0 overflow-hidden">
          <div className="px-4 py-3 text-[12px] text-muted-foreground border-b" style={{ borderColor: "var(--border)" }}>
            Default alert rules. Thresholds are data in the India RulesProfile (Admin › Compliance &amp; Rules); alerts start a human check — they never punish automatically.
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                {["Alert", "Trigger", "Who is told", "Automatic action"].map((h) => <th key={h} className="text-left px-4 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => (
                <tr key={r[0]} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2.5 font-bold text-[#142366]">{r[0]}</td>
                  <td className="px-4 py-2.5">{r[1]}</td>
                  <td className="px-4 py-2.5">{r[2]}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 text-[11.5px] border-t bg-[#FFF8F3]" style={{ borderColor: "var(--border)" }}>
            <b>SOS escalation ladder:</b> 0 s notify desk and trusted contacts · 60 s no acknowledgement → call parent and tutor · 120 s escalate to supervisor and advise calling <b>112</b>.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- alert feed ---------------- */
function AlertFeed({ alerts, visits, onAck, onEscalate, showAll }: { alerts: Alert[]; visits: Visit[]; onAck: (a: Alert) => void; onEscalate: (sid: string | null, s: string) => void; showAll?: boolean }) {
  if (!alerts.length)
    return (
      <div className="sk-card p-5 text-center text-[12.5px] text-muted-foreground">
        <CheckCircle2 className="w-6 h-6 text-[#1F9D6B] mx-auto mb-1.5" /> All clear — no open alerts.
      </div>
    );
  return (
    <div className={clsx("space-y-2.5", showAll && "max-h-[640px] overflow-y-auto sk-scroll pr-1")}>
      {alerts.map((a) => {
        const v = visits.find((x) => x.sessionId === a.sessionId);
        const critical = a.type === "sos" || a.severity === "critical" || a.type === "geofence_exit";
        return (
          <div key={a.id} className={clsx("sk-card p-3.5 pl-4 relative overflow-hidden", a.acknowledged && "opacity-60")}>
            <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: critical ? "#D64545" : "#F26B1D" }} />
            <div className="flex items-center justify-between gap-2">
              <span className={clsx("px-2 py-[2px] rounded-full text-[10.5px] font-bold", critical ? "bg-[#FDECEC] text-[#C03342]" : "bg-[#FFF1E6] text-[#D9580E]")}>{ALERT_LABEL[a.type] ?? a.type}</span>
              <span className="text-[11px] text-muted-foreground">{ago(a.createdAt)}</span>
            </div>
            <div className="text-[12.5px] mt-1.5 leading-snug">{a.message}</div>
            {v && <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {v.tutor.name} · {v.destArea}</div>}
            {!a.acknowledged && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <button className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => onAck(a)}><CheckCircle2 className="w-3.5 h-3.5" /> Acknowledge</button>
                {v?.tutor.phone && (
                  <a className="sk-btn sk-btn-sm sk-btn-ghost" href={`tel:${v.tutor.phone.replace(/\s/g, "")}`}><Phone className="w-3.5 h-3.5" /> Call tutor</a>
                )}
                <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => onEscalate(a.sessionId, `${ALERT_LABEL[a.type] ?? a.type}: ${a.message}`)}><AlertTriangle className="w-3.5 h-3.5" /> Escalate</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- SOS ladder banner ---------------- */
function SosLadder({ alert, onAck, onEscalate }: { alert: Alert; onAck: () => void; onEscalate: () => void }) {
  const secs = Math.round((Date.now() - new Date(alert.createdAt).getTime()) / 1000);
  const steps = [
    { at: 0, label: "Desk + trusted contacts notified" },
    { at: 60, label: "Call parent and tutor" },
    { at: 120, label: "Supervisor · advise 112" },
  ];
  return (
    <div className="rounded-2xl p-4 text-white flex flex-col md:flex-row md:items-center gap-4" style={{ background: "linear-gradient(135deg,#E5484D,#B4232C)", boxShadow: "0 10px 30px rgba(214,69,69,.35)" }} role="alert">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <ShieldAlert className="w-8 h-8 shrink-0 animate-pulse" />
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold">SOS active · {alert.message}</div>
          <div className="text-[12px] text-white/80 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {secs}s since raised</div>
        </div>
      </div>
      <div className="flex gap-2">
        {steps.map((s) => (
          <div key={s.at} className={clsx("rounded-xl px-3 py-2 text-[11px] leading-tight", secs >= s.at ? "bg-white text-[#B4232C] font-bold" : "bg-white/15")}>
            <div>{s.at}s</div>
            <div>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded-full bg-white text-[#B4232C] text-[12px] font-bold" onClick={onAck}>Acknowledge</button>
        <button className="px-3 py-2 rounded-full bg-white/15 border border-white/40 text-[12px] font-bold" onClick={onEscalate}>Open incident</button>
      </div>
    </div>
  );
}

/* ---------------- multi-visit map ---------------- */
function TowerMap({ visits, lives, selected, onSelect }: { visits: Visit[]; lives: Record<string, LiveState>; selected: string | null; onSelect: (id: string) => void }) {
  const pts = visits.map((v) => {
    const l = lives[v.sessionId];
    return { v, p: l?.marker ?? v.dest, dest: v.dest, st: statusOf(v, l) };
  });
  const all = pts.flatMap((x) => [x.p, x.dest]).filter((p) => p && Number.isFinite(p.lat));
  const W = 560, H = 480, PAD = 46;
  const minLat = Math.min(...all.map((p) => p.lat), 12.9), maxLat = Math.max(...all.map((p) => p.lat), 13.1);
  const minLng = Math.min(...all.map((p) => p.lng), 80.15), maxLng = Math.max(...all.map((p) => p.lng), 80.3);
  const sx = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng || 1)) * (W - PAD * 2);
  const sy = (lat: number) => H - PAD - ((lat - minLat) / (maxLat - minLat || 1)) * (H - PAD * 2);
  const color = (k: string) => (k === "sos" || k === "alert" ? "#D64545" : k === "late" ? "#F26B1D" : k === "session" ? "#1F9D6B" : "#142366");
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: "#EAF2E6" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Map of active home visits">
        <defs>
          <pattern id="tw-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="#DCE7D6" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#tw-grid)" />
        <path d={`M0 ${H * 0.18} L${W} ${H * 0.72}`} stroke="#FFFFFF" strokeWidth="16" />
        <path d={`M${W * 0.62} 0 L${W * 0.2} ${H}`} stroke="#FFFFFF" strokeWidth="14" />
        <path d={`M${W * 0.05} ${H * 0.9} Q ${W * 0.5} ${H * 0.55} ${W} ${H * 0.35}`} stroke="#FFFFFF" strokeWidth="8" fill="none" />
        {pts.map(({ v, p, dest, st }) => (
          <g key={v.sessionId} onClick={() => onSelect(v.sessionId)} className="cursor-pointer">
            <circle cx={sx(dest.lng)} cy={sy(dest.lat)} r={selected === v.sessionId ? 26 : 16} fill="none" stroke={color(st.key)} strokeOpacity={0.5} strokeWidth="2" strokeDasharray="4 3" />
            <g transform={`translate(${sx(p.lng)},${sy(p.lat)})`}>
              {(st.key === "sos" || st.key === "alert") && <circle r="18" fill="#D64545" opacity="0.25"><animate attributeName="r" values="10;24;10" dur="1.6s" repeatCount="indefinite" /></circle>}
              <path d="M0 0 C -9 -12 -9 -24 0 -24 C 9 -24 9 -12 0 0 Z" fill={color(st.key)} stroke="#fff" strokeWidth="2" />
              <circle cy="-16" r="3.5" fill="#fff" />
            </g>
            <text x={sx(p.lng) + 10} y={sy(p.lat) - 20} fontSize="11" fontWeight="700" fill="#142366">{v.tutor.name.split(" ")[0]}</text>
          </g>
        ))}
      </svg>
      <span className="absolute bottom-2 right-2 px-2 py-[2px] rounded-full bg-[#FFF8E1] border border-[#F2D79A] text-[10.5px] text-[#8A6516]">Schematic map · live positions</span>
    </div>
  );
}
