"use client";

import { useEffect, useState } from "react";
import { listKits, removeKit, type OfflineKit } from "@/lib/offline-kits";
import { EmptyState } from "@/components/shared/Section";
import { WifiOff, Trash2, X, BookOpen, RotateCw } from "lucide-react";

/** Tiny Markdown renderer (headings, lists, bold) — keeps this screen light enough to ship in the offline shell. */
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <b key={i}>{x.slice(2, -2)}</b> : x));
}
function MiniMarkdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    out.push(<L key={out.length}>{list.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</L>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = !!li[1];
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(li[2]);
      continue;
    }
    flush();
    if (h) {
      const H = (["h1", "h2", "h3"] as const)[h[1].length - 1];
      out.push(<H key={out.length}>{inline(h[2])}</H>);
    } else if (line.trim()) out.push(<p key={out.length}>{inline(line)}</p>);
  }
  flush();
  return <>{out}</>;
}

/** Saved resources on this device — opens with no network at all. */
export function OfflineKitList() {
  const [kits, setKits] = useState<OfflineKit[]>([]);
  const [open, setOpen] = useState<OfflineKit | null>(null);
  useEffect(() => setKits(listKits()), []);
  const size = kits.reduce((a, k) => a + k.content.length, 0);
  if (!kits.length)
    return <div className="sk-card p-4"><EmptyState icon={WifiOff} title="No offline kits yet" sub="Open any resource and tap “Save offline” — it stays readable on this device with no internet." /></div>;
  return (
    <>
      <div className="text-[12px] text-muted-foreground flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> {kits.length} saved on this device · {Math.max(1, Math.round(size / 1024))} KB · readable without internet</div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kits.map((k) => (
          <div key={k.id} className="sk-card p-5 flex flex-col">
            <div className="font-bold text-[#142366] leading-snug">{k.title}</div>
            <div className="text-[11.5px] text-muted-foreground">{k.subject} · {k.grade} · by {k.author}</div>
            <div className="text-[11px] text-muted-foreground mt-2 flex-1">Saved {new Date(k.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
            <div className="flex gap-2 mt-3">
              <button className="sk-btn sk-btn-sm sk-btn-primary flex-1" onClick={() => setOpen(k)}><BookOpen className="w-3.5 h-3.5" /> Read</button>
              <button className="sk-btn sk-btn-sm sk-btn-ghost" aria-label={`Remove ${k.title}`} onClick={() => { removeKit(k.id); setKits(listKits()); }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-[#142366]/30 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-white rounded-[22px] w-full max-w-[820px] max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
            <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-[#142366] truncate">{open.title}</div>
                <div className="text-[12px] text-muted-foreground">{open.subject} · {open.grade} · offline copy</div>
              </div>
              <button className="p-1.5 rounded-lg hover:bg-[#F3F6FB]" onClick={() => setOpen(null)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto sk-scroll px-7 py-6 prose prose-sm max-w-none [&_h1]:text-[20px] [&_h2]:text-[17px] [&_h1,&_h2,&_h3]:font-extrabold [&_h1,&_h2,&_h3]:text-[#142366] [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5 text-[14px] leading-relaxed">
              <MiniMarkdown text={open.content} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Full-screen fallback when the app opens with no connection. */
export function OfflineScreen() {
  return (
    <div className="min-h-screen bg-[#F6F8FC] px-4 py-8">
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div className="sk-card p-6 flex flex-wrap items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-[#142366] text-white flex items-center justify-center"><WifiOff className="w-6 h-6" /></span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[18px] font-extrabold text-[#142366]">You&apos;re offline</div>
            <div className="text-[13px] text-muted-foreground">Your offline class kits still work. Everything else comes back when you reconnect.</div>
          </div>
          <button className="sk-btn sk-btn-primary" onClick={() => location.reload()}><RotateCw className="w-4 h-4" /> Try again</button>
        </div>
        <OfflineKitList />
      </div>
    </div>
  );
}
