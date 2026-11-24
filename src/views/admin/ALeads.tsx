"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { exportBrandedExcel } from "@/lib/excel";
import { Inbox, Phone, Mail, FileSpreadsheet, MessageCircle } from "lucide-react";

interface Lead { id: string; name: string; email: string; phone: string; city: string; role: string; board: string; grade: string; message: string; source: string; status: string; note: string; createdAt: string }
const STATUSES = [
  ["new", "New", "bg-[#FFF1E6] text-[#D9580E]"],
  ["contacted", "Contacted", "bg-[#EAF0FB] text-[#22357F]"],
  ["demo_booked", "Demo booked", "bg-[#EFEAFD] text-[#6D4AE0]"],
  ["won", "Won", "bg-[#E6F6EE] text-[#1F7A55]"],
  ["closed", "Closed", "bg-[#F3F4F7] text-[#57627F]"],
] as const;

/** Admin › Leads & demos — requests from the public home page. */
export function ALeads() {
  const [list, setList] = useState<Lead[] | null>(null);
  const [tab, setTab] = useState("all");
  const load = useCallback(() => {
    fetch("/api/leads", { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j.data ?? [])).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);
  const update = async (l: Lead, patch: Partial<Lead>) => {
    const r = await fetch("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: l.id, ...patch }) });
    if (r.ok) {
      setList((x) => x?.map((y) => (y.id === l.id ? { ...y, ...patch } : y)) ?? null);
      toast({ title: "Lead updated" });
    }
  };
  const shown = useMemo(() => (list ?? []).filter((l) => tab === "all" || l.status === tab), [list, tab]);
  if (!list) return <LoadingView />;
  const count = (s: string) => list.filter((l) => l.status === s).length;
  return (
    <div className="space-y-5">
      <ModuleHeader
        group="money"
        icon={Inbox}
        trail={["Operations"]}
        title="Leads & Demo Requests"
        subtitle="Walkthrough requests from the home page. Respond within one business day."
        pills={count("new") ? [{ label: `${count("new")} new`, tone: "new" }] : []}
        actions={<HeaderButton onClick={() => exportBrandedExcel({ fileName: "tutor-amma-leads", title: "Demo requests", columns: [{ header: "Received", key: "at", width: 18 }, { header: "Name", key: "name", width: 22 }, { header: "Role", key: "role", width: 12 }, { header: "Email", key: "email", width: 28 }, { header: "Phone", key: "phone", width: 16 }, { header: "City", key: "city", width: 14 }, { header: "Board/grade", key: "bg", width: 16 }, { header: "Status", key: "status", width: 14 }, { header: "Message", key: "message", width: 50 }], rows: list.map((l) => ({ at: new Date(l.createdAt).toLocaleString("en-IN"), name: l.name, role: l.role, email: l.email, phone: l.phone, city: l.city, bg: `${l.board} ${l.grade}`, status: l.status, message: l.message })), totals: { at: `${list.length} leads` }, footerText: "Confidential · contains personal data" })}><FileSpreadsheet className="w-3.5 h-3.5" /> Export</HeaderButton>}
        tabs={[{ id: "all", label: "All", count: list.length }, ...STATUSES.map(([id, label]) => ({ id, label, count: count(id) }))]}
        activeTab={tab}
        onTab={setTab}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AccentKpi label="New" value={count("new")} />
        <AccentKpi label="Demos booked" value={count("demo_booked")} tone="purple" />
        <AccentKpi label="Won" value={count("won")} tone="green" />
        <AccentKpi label="Conversion" value={list.length ? `${Math.round((count("won") / list.length) * 100)}%` : "—"} tone="navy" />
      </div>
      {!shown.length ? <div className="sk-card p-4"><EmptyState icon={Inbox} title="No requests here" sub="New walkthrough requests from the home page land in this inbox." /></div> : (
        <div className="space-y-3">
          {shown.map((l) => (
            <div key={l.id} className="sk-card p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#142366] text-[15px]">{l.name} <span className="text-[12px] font-semibold text-muted-foreground capitalize">· {l.role}{l.city ? ` · ${l.city}` : ""}</span></div>
                  <div className="text-[12px] text-muted-foreground">{new Date(l.createdAt).toLocaleString("en-IN")} · {l.board} {l.grade}</div>
                </div>
                <select className={clsx("text-[12px] font-bold rounded-full px-3 py-1.5 border-0", STATUSES.find((s) => s[0] === l.status)?.[2])} value={l.status} onChange={(e) => update(l, { status: e.target.value })}>
                  {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              {l.message && <p className="text-[13px] mt-2">{l.message}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                <a className="sk-btn sk-btn-sm sk-btn-ghost" href={`tel:${l.phone.replace(/\s/g, "")}`}><Phone className="w-3.5 h-3.5" /> {l.phone}</a>
                <a className="sk-btn sk-btn-sm sk-btn-ghost" href={`mailto:${l.email}`}><Mail className="w-3.5 h-3.5" /> {l.email}</a>
                <a className="sk-btn sk-btn-sm sk-btn-ghost" href={`https://wa.me/${l.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`} target="_blank" rel="noreferrer"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
              </div>
              <input className="sk-input mt-3 !py-1.5 !text-[12.5px]" placeholder="Add a note (press Enter to save)" defaultValue={l.note} onKeyDown={(e) => e.key === "Enter" && update(l, { note: (e.target as HTMLInputElement).value })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
