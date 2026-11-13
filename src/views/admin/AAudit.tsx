"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, ClipboardList, ShieldQuestion } from "lucide-react";

import { StatusPill } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { dateTimeOf, fromNow } from "@/lib/format";

interface AuditEvent {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  detail: string;
  severity: string;
  createdAt: string;
}

interface AlertRow {
  id: string;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  bookingRef: string | null;
  createdAt: string;
}

const SEVERITY_PILL: Record<string, { label: string; cls: "red" | "orange" | "blue" }> = {
  critical: { label: "Critical", cls: "red" },
  warning: { label: "Warning", cls: "orange" },
  info: { label: "Info", cls: "blue" },
};

const ROLE_CLS: Record<string, "navy" | "orange" | "green" | "grey" | "blue"> = {
  admin: "navy",
  tutor: "orange",
  parent: "green",
  student: "blue",
  system: "grey",
};

const ALERT_TYPES: Record<string, { label: string; cls: "red" | "orange" | "grey" }> = {
  sos: { label: "SOS", cls: "red" },
  geofence_exit: { label: "Geofence exit", cls: "red" },
  late_start: { label: "Late start", cls: "orange" },
  eta_slip: { label: "ETA slip", cls: "orange" },
  no_checkin: { label: "No check-in", cls: "orange" },
  overrun: { label: "Overrun", cls: "orange" },
  silent: { label: "Silent check", cls: "grey" },
};

export function AAudit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [severity, setSeverity] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ackBusy, setAckBusy] = useState("");

  const load = useCallback(async (sev?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit${sev ? `?severity=${sev}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load the audit trail.");
      setEvents(json.data.events);
      setAlerts(json.data.alerts);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the audit trail.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ack = async (id: string) => {
    setAckBusy(id);
    try {
      const res = await fetch("/api/admin/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alertId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not acknowledge.");
      setAlerts((list) => list.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
      toast({ title: "Alert acknowledged" });
    } catch (e) {
      toast({ title: "Could not acknowledge", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAckBusy("");
    }
  };

  if (error && events.length === 0 && alerts.length === 0) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Audit trail unavailable" sub={error} />
      </div>
    );
  }
  if (loading && events.length === 0) return <LoadingView label="Loading audit trail…" />;

  const unacked = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Audit & Alerts</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Append-only record of every privileged action · {unacked} alert{unacked === 1 ? "" : "s"} awaiting acknowledgement.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
          {[
            { v: "", label: "All" },
            { v: "info", label: "Info" },
            { v: "warning", label: "Warning" },
            { v: "critical", label: "Critical" },
          ].map((f) => (
            <button
              key={f.v}
              className={`sk-chip text-[12px] ${severity === f.v ? "sk-chip-active" : ""}`}
              onClick={() => {
                setSeverity(f.v);
                load(f.v);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Audit log ({events.length})</TabsTrigger>
          <TabsTrigger value="alerts">Safety alerts ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-4">
          <div className="sk-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Time</th>
                    <th className="px-3 py-2.5 font-semibold">Actor</th>
                    <th className="px-3 py-2.5 font-semibold">Action</th>
                    <th className="px-3 py-2.5 font-semibold">Resource</th>
                    <th className="px-3 py-2.5 font-semibold">Detail</th>
                    <th className="px-4 py-2.5 font-semibold">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No events match this severity.
                      </td>
                    </tr>
                  )}
                  {events.map((e) => {
                    const sev = SEVERITY_PILL[e.severity] ?? SEVERITY_PILL.info;
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{dateTimeOf(e.createdAt)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold">{e.actorName}</span>
                            <StatusPill tone={ROLE_CLS[e.actorRole] ?? "grey"} dot={false}>
                              {e.actorRole}
                            </StatusPill>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11.5px] text-[#315BE5] dark:text-[#9BB4F2] whitespace-nowrap">{e.action}</td>
                        <td className="px-3 py-2 max-w-[190px]">
                          <div className="truncate">{e.resource}</div>
                        </td>
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="truncate text-muted-foreground">{e.detail}</div>
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill tone={sev.cls}>{sev.label}</StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <div className="sk-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Time</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Severity</th>
                    <th className="px-3 py-2.5 font-semibold">Message</th>
                    <th className="px-3 py-2.5 font-semibold">Acknowledged</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Bell className="w-4 h-4" /> No alerts recorded.
                        </span>
                      </td>
                    </tr>
                  )}
                  {alerts.map((a) => {
                    const sev = SEVERITY_PILL[a.severity] ?? SEVERITY_PILL.info;
                    const type = ALERT_TYPES[a.type] ?? { label: a.type, cls: "grey" as const };
                    return (
                      <tr key={a.id} className="border-t">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          <div>{dateTimeOf(a.createdAt)}</div>
                          <div className="text-[10.5px]">{fromNow(a.createdAt)}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={type.cls}>{type.label}</StatusPill>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={sev.cls}>{sev.label}</StatusPill>
                        </td>
                        <td className="px-3 py-2.5 max-w-[320px]">
                          <div className="text-[12px] leading-snug">{a.message}</div>
                          {a.bookingRef && <div className="font-mono text-[10.5px] text-muted-foreground mt-0.5">{a.bookingRef}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          {a.acknowledged ? (
                            <span className="flex items-center gap-1 text-[11.5px] text-[#1F9D68] dark:text-green-400">
                              <Check className="w-3.5 h-3.5" /> Acknowledged
                            </span>
                          ) : (
                            <StatusPill tone="orange">Open</StatusPill>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {a.acknowledged ? (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          ) : (
                            <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={ackBusy === a.id} onClick={() => ack(a.id)}>
                              {ackBusy === a.id ? "…" : "Acknowledge"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <ClipboardList className="w-4 h-4" />
        This log is append-only — every state-changing action from any role is recorded and can never be edited or deleted.
      </div>
    </div>
  );
}
