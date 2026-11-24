"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import ReactMarkdown from "react-markdown";
import { ModuleHeader, HeaderButton, AccentKpi } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { Library as LibraryIcon, Search, Plus, Download, Star, X, Sparkles, Loader2, Printer, FileText, NotebookPen, ClipboardList, Presentation, Trash2, Wallet } from "lucide-react";

interface Res {
  id: string;
  title: string;
  subject: string;
  grade: string;
  board: string;
  kind: string;
  description: string;
  preview: string;
  price: number;
  downloads: number;
  rating: number;
  ratings: number;
  status: string;
  createdAt: string;
  author: { id: string; name: string; avatarColor: string };
  owned: boolean;
  earnings?: number;
}

const KIND: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  notes: { label: "Notes", icon: NotebookPen, color: "#4A62D8" },
  worksheet: { label: "Worksheet", icon: FileText, color: "#1F9D6B" },
  mock: { label: "Mock paper", icon: ClipboardList, color: "#D64545" },
  slides: { label: "Slides", icon: Presentation, color: "#F26B1D" },
};
const SUBJECTS = ["Mathematics", "Science", "English", "Physics", "Chemistry", "Biology", "Social Science", "Hindi"];
const GRADES = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const rupees = (p: number) => (p ? `₹${(p / 100).toLocaleString("en-IN")}` : "Free");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json" } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
  return j.data as T;
}

/** Resource marketplace (spec §29): tutors share or sell; students and parents browse and get. */
export function Library() {
  const { user, setView } = useAppStore();
  const isAuthor = user?.role === "tutor" || user?.role === "institute";
  const [tab, setTab] = useState(isAuthor ? "mine" : "browse");
  const [list, setList] = useState<Res[] | null>(null);
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setList(null);
    const p = new URLSearchParams({ q, subject, grade, ...(tab === "mine" ? { mine: "1" } : {}) });
    api<Res[]>(`/api/resources?${p}`).then(setList).catch(() => setList([]));
  }, [q, subject, grade, tab]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const get = async (r: Res) => {
    try {
      await api(`/api/resources/${r.id}`, { method: "POST", body: JSON.stringify({ action: "get" }) });
      toast({ title: r.price ? `Purchased · ${rupees(r.price)}` : "Added to your library", description: r.title });
      load();
      setReading(r.id);
    } catch (e) {
      toast({ title: "Couldn't get this resource", description: (e as Error).message, variant: "destructive" });
      if ((e as Error).message.includes("wallet")) setView(user?.role === "parent" ? "p-wallet" : "s-payments");
    }
  };

  const mine = tab === "mine" ? list ?? [] : [];
  const totals = tab === "mine" ? { count: mine.length, downloads: mine.reduce((a, r) => a + r.downloads, 0), earnings: mine.reduce((a, r) => a + (r.earnings ?? 0), 0) } : null;

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="learning"
        icon={LibraryIcon}
        title="Resource Library"
        subtitle={isAuthor ? "Share or sell notes, worksheets and mock papers. You keep 85% of every sale." : "Notes, worksheets and mock papers from verified tutors — free or for a small price."}
        pills={[{ label: "Verified authors", tone: "verified" }]}
        actions={isAuthor ? <HeaderButton variant="primary" onClick={() => setCreating(true)}><Plus className="w-3.5 h-3.5" /> Publish resource</HeaderButton> : undefined}
        tabs={isAuthor ? [{ id: "mine", label: "My resources" }, { id: "browse", label: "Marketplace" }] : [{ id: "browse", label: "Browse" }]}
        activeTab={tab}
        onTab={setTab}
      />

      {totals && (
        <div className="grid grid-cols-3 gap-3">
          <AccentKpi label="Published" value={totals.count} />
          <AccentKpi label="Downloads" value={totals.downloads} tone="navy" />
          <AccentKpi label="Earned" value={rupees(totals.earnings)} tone="green" sub="85% of sales, to your wallet" />
        </div>
      )}

      {tab === "browse" && (
        <div className="sk-card p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input className="sk-input !pl-9" placeholder="Search notes, worksheets, mock papers…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="sk-input !w-auto" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">All subjects</option>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="sk-input !w-auto" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">All grades</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
        </div>
      )}

      {!list ? (
        <LoadingView label="Loading resources…" />
      ) : list.length === 0 ? (
        <div className="sk-card p-4"><EmptyState icon={LibraryIcon} title={tab === "mine" ? "Nothing published yet" : "No resources match"} sub={tab === "mine" ? "Publish your first worksheet — AI can draft it for you." : "Try another subject or grade."} action={tab === "mine" ? <button className="sk-btn sk-btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Publish resource</button> : undefined} /></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((r) => {
            const K = KIND[r.kind] ?? KIND.notes;
            return (
              <div key={r.id} className="sk-card p-5 flex flex-col">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl text-white flex items-center justify-center shrink-0" style={{ background: K.color }}><K.icon className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#142366] leading-snug">{r.title}</div>
                    <div className="text-[11.5px] text-muted-foreground">{K.label} · {r.subject} · {r.grade} · {r.board}</div>
                  </div>
                  <span className={clsx("px-2 py-[2px] rounded-full text-[11px] font-bold shrink-0", r.price ? "bg-[#FFF1E6] text-[#D9580E]" : "bg-[#E6F6EE] text-[#1F7A55]")}>{rupees(r.price)}</span>
                </div>
                <p className="text-[12.5px] text-muted-foreground mt-3 line-clamp-3 flex-1">{r.description || r.preview}</p>
                <div className="flex items-center gap-3 mt-3 text-[11.5px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-[#E8A20C] text-[#E8A20C]" /> {r.ratings ? r.rating.toFixed(1) : "New"}</span>
                  <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" /> {r.downloads}</span>
                  <span className="ml-auto truncate">by {r.author.name}</span>
                </div>
                <div className="flex gap-2 mt-4">
                  {r.owned ? (
                    <button className="sk-btn sk-btn-sm sk-btn-primary flex-1" onClick={() => setReading(r.id)}>Open</button>
                  ) : (
                    <button className="sk-btn sk-btn-sm sk-btn-orange flex-1" onClick={() => get(r)}>{r.price ? <><Wallet className="w-3.5 h-3.5" /> Buy {rupees(r.price)}</> : <><Download className="w-3.5 h-3.5" /> Get free</>}</button>
                  )}
                  {tab === "mine" && (
                    <button className="sk-btn sk-btn-sm sk-btn-ghost" aria-label="Unpublish" onClick={async () => { if (!confirm("Unpublish this resource?")) return; await api(`/api/resources/${r.id}`, { method: "POST", body: JSON.stringify({ action: "remove" }) }); load(); }}><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                {tab === "mine" && <div className="text-[11px] text-[#1F7A55] mt-2">Earned {rupees(r.earnings ?? 0)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {reading && <Reader id={reading} onClose={() => { setReading(null); load(); }} canRate={!isAuthor} />}
      {creating && <Publish onClose={() => setCreating(false)} onDone={() => { setCreating(false); setTab("mine"); load(); }} />}
    </div>
  );
}

function Reader({ id, onClose, canRate }: { id: string; onClose: () => void; canRate: boolean }) {
  const [r, setR] = useState<(Res & { content: string; authorName: string }) | null>(null);
  useEffect(() => {
    api<Res & { content: string; authorName: string }>(`/api/resources/${id}`).then(setR).catch((e) => { toast({ title: "Couldn't open", description: e.message, variant: "destructive" }); onClose(); });
  }, [id, onClose]);
  const print = () => {
    if (!r) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const body = document.getElementById("res-print")?.innerHTML ?? "";
    w.document.write(`<!doctype html><html><head><title>${r.title}</title><style>@page{size:A4;margin:0}body{font-family:system-ui,sans-serif;color:#142366;margin:0}.sheet{padding:16mm 16mm 18mm}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #F26B1D;padding-bottom:8px;margin-bottom:14px}header b{font-size:16pt}header span{font-size:9pt;color:#57627F;text-align:right}h1,h2,h3{color:#142366}p,li{font-size:11pt;line-height:1.55;color:#24304f}.foot{position:fixed;bottom:8mm;left:16mm;right:16mm;font-size:8pt;color:#8A93AB;display:flex;justify-content:space-between}</style></head><body><div class="sheet"><header><b>Tutor <span style="color:#F26B1D;font-size:16pt">Amma</span></b><span>${r.title}<br/>${r.subject} · ${r.grade} · by ${r.authorName}</span></header>${body}</div><div class="foot"><span>Tutor Amma resource library</span><span>${r.board}</span></div><script>onload=()=>{print();setTimeout(()=>close(),300)}</script></body></html>`);
    w.document.close();
  };
  const rate = async (n: number) => {
    try {
      await api(`/api/resources/${id}`, { method: "POST", body: JSON.stringify({ action: "rate", rating: n }) });
      toast({ title: `Thanks — rated ${n}★` });
    } catch (e) {
      toast({ title: "Couldn't rate", description: (e as Error).message, variant: "destructive" });
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-[#142366]/30 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] w-full max-w-[820px] max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-[#142366] truncate">{r?.title ?? "Loading…"}</div>
            {r && <div className="text-[12px] text-muted-foreground">{r.subject} · {r.grade} · by {r.authorName}</div>}
          </div>
          {canRate && r && <div className="flex">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => rate(n)} aria-label={`Rate ${n}`}><Star className="w-4 h-4 text-[#E8A20C] hover:fill-[#E8A20C]" /></button>)}</div>}
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={print} disabled={!r}><Printer className="w-3.5 h-3.5" /> Print</button>
          <button className="p-1.5 rounded-lg hover:bg-[#F3F6FB]" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto sk-scroll px-7 py-6">
          {!r ? <LoadingView /> : <div id="res-print" className="prose prose-sm max-w-none [&_h1]:text-[20px] [&_h2]:text-[17px] [&_h3]:text-[15px] [&_h1,&_h2,&_h3]:font-extrabold [&_h1,&_h2,&_h3]:text-[#142366] [&_h1,&_h2,&_h3]:mt-4 [&_p]:my-2 [&_li]:my-1 [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5 text-[14px] leading-relaxed"><ReactMarkdown>{r.content}</ReactMarkdown></div>}
        </div>
      </div>
    </div>
  );
}

function Publish({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: "", subject: "Mathematics", grade: "Grade 8", board: "CBSE", kind: "worksheet", description: "", content: "", price: "0" });
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (aiDraft: boolean) => {
    setBusy(aiDraft ? "ai" : "save");
    try {
      const r = await api<Res & { source: string }>("/api/resources", { method: "POST", body: JSON.stringify({ ...f, price: Math.round(Number(f.price) * 100), aiDraft }) });
      toast({ title: "Published ✓", description: r.source === "ai" ? "AI drafted the content — review it from My resources." : r.title });
      onDone();
    } catch (e) {
      toast({ title: "Couldn't publish", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-[#142366]/30 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] w-full max-w-[680px] max-h-[92vh] overflow-y-auto sk-scroll p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between"><h2 className="text-[18px] font-extrabold text-[#142366]">Publish a resource</h2><button onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button></div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <label className="sm:col-span-2 text-[11.5px] font-bold">Title<input className="sk-input mt-1" placeholder="e.g. Factorisation practice — 20 graded questions" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
          <label className="text-[11.5px] font-bold">Type<select className="sk-input mt-1" value={f.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="text-[11.5px] font-bold">Price (₹, 0 = free)<input type="number" min={0} max={5000} className="sk-input mt-1" value={f.price} onChange={(e) => set("price", e.target.value)} /></label>
          <label className="text-[11.5px] font-bold">Subject<select className="sk-input mt-1" value={f.subject} onChange={(e) => set("subject", e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-[11.5px] font-bold">Grade<select className="sk-input mt-1" value={f.grade} onChange={(e) => set("grade", e.target.value)}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
          <label className="sm:col-span-2 text-[11.5px] font-bold">Short description<input className="sk-input mt-1" value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
          <label className="sm:col-span-2 text-[11.5px] font-bold">Content (Markdown supported)<textarea className="sk-input mt-1 min-h-[180px] font-mono !text-[12.5px]" placeholder="# Heading&#10;1. Question…" value={f.content} onChange={(e) => set("content", e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button className="sk-btn sk-btn-ghost" disabled={!!busy || !f.title.trim() || !!f.content.trim()} onClick={() => submit(true)} title="AI writes the content from your title">{busy === "ai" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Draft with AI &amp; publish</button>
          <button className="sk-btn sk-btn-primary" disabled={!!busy || !f.title.trim() || f.content.trim().length < 40} onClick={() => submit(false)}>{busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Publish</button>
        </div>
      </div>
    </div>
  );
}
