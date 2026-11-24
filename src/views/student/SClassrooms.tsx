"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { School, KeyRound, Loader2, CheckCircle2, Hourglass, ListOrdered } from "lucide-react";

interface Joined {
  id: string;
  name: string;
  subject: string;
  grade: string;
  board: string;
  language: string;
  schedule: string;
  status: string;
  tutor: { id: string; name: string; avatarColor: string };
}

const STATUS: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: "Enrolled", cls: "bg-[#E6F6EE] text-[#1F7A55]", icon: CheckCircle2 },
  pending: { label: "Waiting for tutor approval", cls: "bg-[#FFF6E5] text-[#A86A12]", icon: Hourglass },
  waitlisted: { label: "On the waitlist", cls: "bg-[#EAF0FB] text-[#22357F]", icon: ListOrdered },
};

/** Student "My Classrooms": join a tutor's classroom with a code or link (spec §10). */
export function SClassrooms() {
  const { context } = useAppStore();
  const [list, setList] = useState<Joined[] | null>(null);
  const [code, setCode] = useState(String(context?.classroomCode ?? ""));
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/classrooms", { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j?.data ?? [])).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  const join = async (c = code) => {
    if (!c.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/classrooms/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c.trim(), via: context?.classroomCode ? "link" : "code" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Couldn't join");
      const s = j.data.status as string;
      toast({ title: j.data.already ? `Already in ${j.data.name}` : s === "active" ? `Joined ${j.data.name} 🎉` : s === "pending" ? "Request sent" : "Added to the waitlist", description: s === "pending" ? "Your tutor will approve you shortly." : undefined });
      setCode("");
      load();
    } catch (e) {
      toast({ title: "Couldn't join", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /* arriving from a shared link (?classroom=CODE) joins automatically */
  useEffect(() => {
    const ts = Number(context?.classroomAt ?? 0);
    if (context?.classroomCode && Date.now() - ts < 8000) void join(String(context.classroomCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <ModuleHeader group="scheduling" icon={School} title="My Classrooms" subtitle="Classrooms you joined with a tutor's link, QR or 6-character code." />
      <div className="sk-card p-5 flex flex-col sm:flex-row gap-3 sm:items-end">
        <label className="flex-1">
          <span className="block text-[11.5px] font-bold mb-1">Join with a code</span>
          <input className="sk-input font-mono tracking-[.3em] uppercase !text-[16px]" maxLength={24} placeholder="GR8M4K" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && join()} />
        </label>
        <button className="sk-btn sk-btn-primary" disabled={busy || !code.trim()} onClick={() => join()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Join classroom
        </button>
      </div>
      {!list ? (
        <LoadingView />
      ) : list.length === 0 ? (
        <div className="sk-card p-4"><EmptyState icon={School} title="No classrooms yet" sub="Ask your tutor for the join link or code." /></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((c) => {
            const st = STATUS[c.status] ?? STATUS.pending;
            return (
              <div key={c.id} className="sk-card p-4">
                <div className="font-bold text-[#142366]">{c.name}</div>
                <div className="text-[11.5px] text-muted-foreground">{c.subject} · {c.grade} · {c.board} · {c.language}</div>
                <div className="text-[12px] mt-2">with <b>{c.tutor.name}</b>{c.schedule ? ` · ${c.schedule}` : ""}</div>
                <span className={clsx("inline-flex items-center gap-1 mt-3 px-2 py-[3px] rounded-full text-[10.5px] font-bold", st.cls)}>
                  <st.icon className="w-3 h-3" /> {st.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
