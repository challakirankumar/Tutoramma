"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { exportBrandedExcel } from "@/lib/excel";
import { Gavel, Plus, Check, GitCompare, Send, ShieldCheck, Undo2, FileSpreadsheet, Pencil, X } from "lucide-react";

interface Rule {
  key: string;
  label: string;
  value: string;
  confirmed: boolean;
  required?: boolean;
  owner: string;
}
interface Gate {
  key: string;
  label: string;
  state: "open" | "blocked" | "guardian_only" | "off_default";
  note: string;
}
interface Profile {
  id: string;
  country: string;
  version: number;
  status: "draft" | "in_review" | "approved" | "superseded";
  rules: Rule[];
  gates: Gate[];
  notes: string;
  submittedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

const STATUS: Record<Profile["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-[#EEF2FA] text-[#57627F]" },
  in_review: { label: "In review", cls: "bg-[#FFF6E5] text-[#A86A12]" },
  approved: { label: "Approved by legal", cls: "bg-[#E6F6EE] text-[#1F7A55]" },
  superseded: { label: "Superseded", cls: "bg-[#F3F4F7] text-[#8A93AB]" },
};
const GATE: Record<Gate["state"], { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-[#E6F6EE] text-[#1F7A55]" },
  blocked: { label: "Blocked", cls: "bg-[#FDECEC] text-[#C03342]" },
  guardian_only: { label: "Guardian only", cls: "bg-[#E6F6EE] text-[#1F7A55]" },
  off_default: { label: "Off by default", cls: "bg-[#EEF2FA] text-[#57627F]" },
};

async function call<T>(method: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/admin/rules", { method, cache: "no-store", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
  return j.data as T;
}

/** Compliance & Rules — Screen 52: country rules are data; features open only after legal approval. */
export function ACompliance() {
  const [list, setList] = useState<Profile[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [compare, setCompare] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback((keep?: string) => {
    call<Profile[]>("GET")
      .then((l) => {
        setList(l);
        setSel((s) => keep ?? (l.some((p) => p.id === s) ? s : (l.find((p) => p.status === "in_review") ?? l[0])?.id ?? ""));
      })
      .catch((e) => toast({ title: "Couldn't load rules", description: e.message, variant: "destructive" }));
  }, []);
  useEffect(() => load(), [load]);

  const p = list?.find((x) => x.id === sel);
  const prev = useMemo(() => (p ? list?.filter((x) => x.country === p.country && x.version < p.version).sort((a, b) => b.version - a.version)[0] : undefined), [p, list]);
  const locked = !p || p.status === "approved" || p.status === "superseded";
  const unconfirmed = p?.rules.filter((r) => !r.confirmed).length ?? 0;

  const act = async (action: string) => {
    if (!p) return;
    try {
      const u = await call<Profile>("PATCH", { id: p.id, action });
      toast({ title: action === "submit" ? "Submitted for legal approval" : action === "approve" ? `${u.country} v${u.version} approved` : "Returned to draft", description: action === "approve" ? "Launch gates re-evaluated; earlier version superseded." : undefined });
      load(p.id);
    } catch (e) {
      toast({ title: "Not possible yet", description: (e as Error).message, variant: "destructive" });
    }
  };
  const saveRule = async (r: Rule, patch: { value?: string; confirmed?: boolean }) => {
    if (!p) return;
    try {
      await call<Profile>("PATCH", { id: p.id, rules: [{ key: r.key, ...patch }] });
      setEditing(null);
      load(p.id);
    } catch (e) {
      toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" });
    }
  };
  const newProfile = async () => {
    const country = window.prompt("Country for the new rules profile", p?.country ?? "India");
    if (!country) return;
    try {
      const n = await call<Profile>("POST", { country });
      toast({ title: `${n.country} v${n.version} created`, description: n.notes });
      load(n.id);
    } catch (e) {
      toast({ title: "Couldn't create", description: (e as Error).message, variant: "destructive" });
    }
  };
  const exportProfile = () =>
    p &&
    exportBrandedExcel({
      fileName: `rules-${p.country.toLowerCase()}-v${p.version}`,
      title: `Rules profile · ${p.country} v${p.version}`,
      subtitle: `${STATUS[p.status].label}${p.approvedBy ? ` · ${p.approvedBy}` : ""} · exported ${new Date().toLocaleString("en-IN")}`,
      columns: [
        { header: "Rule", key: "label", width: 42 },
        { header: "Value", key: "value", width: 30 },
        { header: "Status", key: "status", width: 14 },
        { header: "Owner", key: "owner", width: 20 },
      ],
      rows: p.rules.map((r) => ({ label: r.label, value: r.value || "Not set", status: !r.value && r.required ? "required" : r.confirmed ? "confirmed" : "unconfirmed", owner: r.owner })),
      footerText: "Confidential · Tutor Amma compliance · not legal advice",
    });

  if (!list) return <LoadingView label="Loading country rules…" />;

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="core"
        icon={Gavel}
        trail={["Governance"]}
        title="Compliance & Rules"
        subtitle="Country rules are data. A country cannot launch a feature until legal approves its profile."
        pills={unconfirmed ? [{ label: `${unconfirmed} unconfirmed`, tone: "warn" }] : [{ label: "All confirmed", tone: "verified" }]}
        actions={
          <>
            <HeaderButton onClick={exportProfile}><FileSpreadsheet className="w-3.5 h-3.5" /> Export</HeaderButton>
            <HeaderButton variant="primary" onClick={newProfile}><Plus className="w-3.5 h-3.5" /> New rules profile</HeaderButton>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="sk-card p-5">
          <div className="text-[15px] font-extrabold text-[#142366]">Country profiles</div>
          <table className="w-full text-[12.5px] mt-3">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                {["Country", "Version", "Status", "Approved by"].map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={clsx("border-t cursor-pointer hover:bg-[#F7F9FE]", sel === x.id && "bg-[#F0F4FE]")} style={{ borderColor: "var(--border)" }} onClick={() => { setSel(x.id); setCompare(false); }}>
                  <td className="px-3 py-3 font-bold text-[#142366]">{x.country}</td>
                  <td className="px-3 py-3">v{x.version}</td>
                  <td className="px-3 py-3"><span className={clsx("px-2 py-[3px] rounded-full text-[10.5px] font-bold", STATUS[x.status].cls)}>{x.status === "draft" && x.notes === "Conservative defaults" ? "Draft (conservative default)" : STATUS[x.status].label}</span></td>
                  <td className="px-3 py-3 text-muted-foreground">{x.approvedBy ? `${x.approvedBy.replace(/ · .*/, "")} · ${new Date(x.approvedAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {p && (
            <>
              <div className="text-[15px] font-extrabold text-[#142366] mt-6">Launch gates · {p.country}</div>
              <div className="mt-2">
                {p.gates.map((g) => (
                  <div key={g.key} className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0 text-[12.5px]" style={{ borderColor: "var(--border)" }}>
                    <span>{g.label}</span>
                    <span className={clsx("px-2.5 py-[3px] rounded-full text-[10.5px] font-bold", GATE[g.state].cls)}>
                      {GATE[g.state].label}{g.note && g.state === "blocked" ? ` · ${g.note}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {p && (
          <div className="sk-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[15px] font-extrabold text-[#142366]">Rules editor · {p.country} v{p.version}</div>
                <div className="text-[12px] text-muted-foreground">{locked ? "Approved profiles are locked; create a new version to change." : "Unconfirmed values are marked until approved."}</div>
              </div>
              <span className={clsx("px-2 py-[3px] rounded-full text-[10.5px] font-bold shrink-0", STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
            </div>
            <div className="mt-3">
              {p.rules.map((r) => {
                const old = prev?.rules.find((x) => x.key === r.key);
                const changed = compare && old && old.value !== r.value;
                return (
                  <div key={r.key} className={clsx("grid grid-cols-[1fr_auto] sm:grid-cols-[1.3fr_1fr_auto] gap-x-3 gap-y-1 items-center py-2.5 border-b last:border-0 text-[12.5px]", changed && "bg-[#FFFBEA] -mx-2 px-2 rounded-lg")} style={{ borderColor: "var(--border)" }}>
                    <span>{r.label}</span>
                    <span className="order-3 sm:order-none col-span-2 sm:col-span-1">
                      {editing === r.key ? (
                        <span className="flex gap-1">
                          <input className="sk-input !py-1 !text-[12.5px]" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveRule(r, { value: draft })} />
                          <button className="p-1 text-[#1F7A55]" onClick={() => saveRule(r, { value: draft })} aria-label="Save"><Check className="w-4 h-4" /></button>
                          <button className="p-1 text-muted-foreground" onClick={() => setEditing(null)} aria-label="Cancel"><X className="w-4 h-4" /></button>
                        </span>
                      ) : (
                        <button className={clsx("font-bold text-left inline-flex items-center gap-1", locked ? "cursor-default" : "hover:underline")} disabled={locked} onClick={() => { setEditing(r.key); setDraft(r.value); }}>
                          {r.value || "Not set"} {!locked && <Pencil className="w-3 h-3 text-muted-foreground" />}
                        </button>
                      )}
                      {changed && <span className="block text-[10.5px] text-[#A86A12]">v{prev!.version}: {old!.value || "Not set"}</span>}
                    </span>
                    <span className="justify-self-end">
                      {!r.value && r.required ? (
                        <span className="px-2 py-[2px] rounded-full text-[10.5px] font-bold bg-[#FDECEC] text-[#C03342]">required</span>
                      ) : r.confirmed ? (
                        <span className="px-2 py-[2px] rounded-full text-[10.5px] font-bold bg-[#E6F6EE] text-[#1F7A55]">confirmed</span>
                      ) : locked ? (
                        <span className="px-2 py-[2px] rounded-full text-[10.5px] font-bold bg-[#FFF6E5] text-[#A86A12]">unconfirmed</span>
                      ) : (
                        <button className="px-2 py-[2px] rounded-full text-[10.5px] font-bold bg-[#FFF6E5] text-[#A86A12] hover:bg-[#FCEBC9]" title={`Mark confirmed by ${r.owner}`} onClick={() => saveRule(r, { confirmed: true })}>unconfirmed · confirm</button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {prev && <HeaderButton onClick={() => setCompare((c) => !c)}><GitCompare className="w-3.5 h-3.5" /> {compare ? "Hide comparison" : `Compare with v${prev.version}`}</HeaderButton>}
              {p.status === "draft" && <HeaderButton variant="primary" onClick={() => act("submit")}><Send className="w-3.5 h-3.5" /> Submit for legal approval</HeaderButton>}
              {p.status === "in_review" && (
                <>
                  <HeaderButton variant="primary" onClick={() => act("approve")}><ShieldCheck className="w-3.5 h-3.5" /> Record legal approval</HeaderButton>
                  <HeaderButton onClick={() => act("return")}><Undo2 className="w-3.5 h-3.5" /> Return to draft</HeaderButton>
                </>
              )}
            </div>
            <p className="text-[10.5px] text-muted-foreground mt-3">Defaults are cautious placeholders, not legal advice. Each change is audit-logged; bookings store the profile version they used.</p>
          </div>
        )}
      </div>
    </div>
  );
}
