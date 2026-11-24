"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { GraduationCap, HandHeart, Loader2, Check, X, Clock } from "lucide-react";

interface Pledge { id: string; tutorId: string; tutorName?: string; hours: number; hoursUsed: number; left?: number; subjects: string; note: string; createdAt: string }
interface App { id: string; parentName?: string; childName?: string; childId: string; subject: string; hoursRequested: number; reason: string; status: string; decidedBy: string | null; createdAt: string; pledgeId: string | null }
interface Data { summary: { pledged: number; used: number; pledges: number }; pledges?: Pledge[]; applications?: App[]; children?: { id: string; name: string; grade: string }[] }

const STATUS: Record<string, string> = { pending: "bg-[#FFF6E5] text-[#A86A12]", approved: "bg-[#E6F6EE] text-[#1F7A55]", declined: "bg-[#F3F4F7] text-[#57627F]" };

async function api<T>(method: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/scholarships", { method, cache: "no-store", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
  return j.data as T;
}

/** Scholarship hours (spec §16 / §30) — donated tutoring hours, transparently allocated. */
export function Scholarships() {
  const { user } = useAppStore();
  const role = user?.role;
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(() => {
    api<Data>("GET").then(setD).catch(() => setD({ summary: { pledged: 0, used: 0, pledges: 0 } }));
  }, []);
  useEffect(load, [load]);
  if (!d) return <LoadingView />;

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="learning"
        icon={HandHeart}
        title="Scholarship Hours"
        subtitle={role === "tutor" ? "Pledge free hours for students who need them. Every hour is allocated transparently." : role === "parent" ? "Apply for donated tutoring hours from verified tutors." : "Match donated tutor hours to families who applied."}
        pills={[{ label: `${d.summary.pledged - d.summary.used} hours available`, tone: "verified" }]}
      />
      <div className="grid grid-cols-3 gap-3">
        <AccentKpi label="Hours pledged" value={d.summary.pledged} tone="green" sub={`${d.summary.pledges} pledges`} />
        <AccentKpi label="Hours given" value={d.summary.used} tone="navy" />
        <AccentKpi label="Still available" value={d.summary.pledged - d.summary.used} />
      </div>
      {role === "tutor" ? <TutorPledge d={d} onDone={load} /> : role === "parent" ? <ParentApply d={d} onDone={load} /> : <AdminAllocate d={d} onDone={load} />}
    </div>
  );
}

function TutorPledge({ d, onDone }: { d: Data; onDone: () => void }) {
  const [f, setF] = useState({ hours: "5", subjects: "", note: "" });
  const [busy, setBusy] = useState(false);
  const pledge = async () => {
    setBusy(true);
    try {
      await api("POST", { hours: Number(f.hours), subjects: f.subjects, note: f.note });
      toast({ title: `Thank you — ${f.hours} hours pledged 💛`, description: "We'll notify you when a student is matched." });
      setF({ hours: "5", subjects: "", note: "" });
      onDone();
    } catch (e) {
      toast({ title: "Couldn't pledge", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="sk-card p-5 space-y-3">
        <div className="text-[15px] font-extrabold text-[#142366]">Pledge hours</div>
        <div className="flex gap-1.5">{["2", "5", "10", "20"].map((h) => <button key={h} className={clsx("sk-chip", f.hours === h && "sk-chip-active")} onClick={() => setF({ ...f, hours: h })}>{h} h</button>)}<input type="number" min={1} max={200} className="sk-input !w-24 !py-1.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></div>
        <input className="sk-input" placeholder="Subjects (e.g. Maths, Science)" value={f.subjects} onChange={(e) => setF({ ...f, subjects: e.target.value })} />
        <textarea className="sk-input min-h-[80px]" placeholder="Note (optional) — e.g. weekday evenings, online only" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="sk-btn sk-btn-primary" disabled={busy} onClick={pledge}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />} Pledge {f.hours} hours</button>
      </div>
      <div className="sk-card p-5">
        <div className="text-[15px] font-extrabold text-[#142366]">My pledges</div>
        {!d.pledges?.length ? <p className="text-[12.5px] text-muted-foreground mt-3">No pledges yet.</p> : (
          <div className="space-y-2.5 mt-3">
            {d.pledges.map((p) => (
              <div key={p.id} className="sk-well p-3">
                <div className="flex justify-between text-[13px] font-bold"><span>{p.hours} hours · {p.subjects || "Any subject"}</span><span className="text-[#1F7A55]">{p.hoursUsed} given</span></div>
                <div className="h-2 rounded-full bg-white mt-2 overflow-hidden"><div className="h-full bg-[#1F9D6B]" style={{ width: `${(p.hoursUsed / p.hours) * 100}%` }} /></div>
                {p.note && <div className="text-[11.5px] text-muted-foreground mt-1.5">{p.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ParentApply({ d, onDone }: { d: Data; onDone: () => void }) {
  const [f, setF] = useState({ childId: d.children?.[0]?.id ?? "", subject: "Mathematics", hours: "6", reason: "" });
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      await api("POST", { ...f, hours: Number(f.hours) });
      toast({ title: "Application sent", description: "Our team reviews applications within a week." });
      setF({ ...f, reason: "" });
      onDone();
    } catch (e) {
      toast({ title: "Couldn't apply", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="sk-card p-5 space-y-3">
        <div className="text-[15px] font-extrabold text-[#142366]">Apply for hours</div>
        <div className="grid grid-cols-2 gap-2">
          <select className="sk-input" value={f.childId} onChange={(e) => setF({ ...f, childId: e.target.value })}>{d.children?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.grade}</option>)}</select>
          <select className="sk-input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>{["Mathematics", "Science", "English", "Hindi", "Social Science"].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <label className="text-[11.5px] font-bold">Hours needed: {f.hours}<input type="range" min={1} max={40} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className="w-full accent-[#142366]" /></label>
        <textarea className="sk-input min-h-[110px]" placeholder="Tell us briefly how these hours would help (shared only with the scholarship team)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <button className="sk-btn sk-btn-primary" disabled={busy || !f.childId} onClick={apply}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />} Submit application</button>
      </div>
      <div className="sk-card p-5">
        <div className="text-[15px] font-extrabold text-[#142366]">My applications</div>
        {!d.applications?.length ? <p className="text-[12.5px] text-muted-foreground mt-3">No applications yet.</p> : d.applications.map((a) => (
          <div key={a.id} className="sk-well p-3 mt-2.5 flex items-center gap-3">
            <div className="flex-1 text-[13px]"><b>{a.hoursRequested} h · {a.subject}</b><div className="text-[11.5px] text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-IN")}</div></div>
            <span className={clsx("px-2 py-[3px] rounded-full text-[10.5px] font-bold capitalize", STATUS[a.status])}>{a.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAllocate({ d, onDone }: { d: Data; onDone: () => void }) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const decide = async (a: App, decision: string) => {
    try {
      await api("PATCH", { id: a.id, decision, pledgeId: pick[a.id] });
      toast({ title: decision === "approve" ? "Hours allocated" : "Application declined" });
      onDone();
    } catch (e) {
      toast({ title: "Couldn't decide", description: (e as Error).message, variant: "destructive" });
    }
  };
  const open = (d.pledges ?? []).filter((p) => (p.left ?? 0) > 0);
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <div className="sk-card p-5">
        <div className="text-[15px] font-extrabold text-[#142366]">Applications</div>
        {!d.applications?.length ? <EmptyState icon={Clock} title="No applications" /> : d.applications.map((a) => (
          <div key={a.id} className="border-b last:border-0 py-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2"><b className="text-[13.5px]">{a.childName}</b><span className="text-[12px] text-muted-foreground">· {a.hoursRequested} h {a.subject} · parent {a.parentName}</span><span className={clsx("ml-auto px-2 py-[2px] rounded-full text-[10.5px] font-bold capitalize", STATUS[a.status])}>{a.status}</span></div>
            <p className="text-[12.5px] text-muted-foreground mt-1">{a.reason}</p>
            {a.status === "pending" && (
              <div className="flex flex-wrap gap-2 mt-2">
                <select className="sk-input !w-auto !py-1.5 !text-[12px]" value={pick[a.id] ?? ""} onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}>
                  <option value="">Allocate from pledge…</option>
                  {open.map((p) => <option key={p.id} value={p.id}>{p.tutorName} · {p.left} h left · {p.subjects || "any"}</option>)}
                </select>
                <HeaderButton variant="primary" onClick={() => decide(a, "approve")} disabled={!pick[a.id]}><Check className="w-3.5 h-3.5" /> Approve</HeaderButton>
                <HeaderButton onClick={() => decide(a, "decline")}><X className="w-3.5 h-3.5" /> Decline</HeaderButton>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="sk-card p-5">
        <div className="text-[15px] font-extrabold text-[#142366]">Pledges</div>
        {(d.pledges ?? []).map((p) => (
          <div key={p.id} className="sk-well p-3 mt-2.5 text-[12.5px]"><b>{p.tutorName}</b> · {p.hours} h · {p.subjects || "any"}<div className="text-muted-foreground">{p.left} h left</div></div>
        ))}
      </div>
    </div>
  );
}
