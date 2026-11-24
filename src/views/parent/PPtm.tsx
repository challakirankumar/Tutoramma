"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { Handshake, Sparkles, Video, School, X, CalendarPlus } from "lucide-react";

interface Data {
  children: { id: string; name: string; grade: string; board: string }[];
  childId?: string;
  teachers: { id: string; name: string; color: string; subject?: string }[];
  days: { date: string; slots: { tutorId: string; times: { at: string; status: "free" | "booked" | "mine" }[] }[] }[];
  bookings: { id: string; tutorId: string; tutorName: string; subject: string; startAt: string; mode: string; status: string; brief: string }[];
}

const tIST = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const dIST = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });

/** Parent-teacher meetings — Screen 44. */
export function PPtm() {
  const [data, setData] = useState<Data | null>(null);
  const [child, setChild] = useState<string>("");
  const [teacher, setTeacher] = useState<string>("");
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string>("");
  const [mode, setMode] = useState<"online" | "school">("online");
  const [busy, setBusy] = useState(false);

  const load = useCallback((cid?: string) => {
    fetch(`/api/ptm${cid ? `?childId=${cid}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data as Data;
        setData(d);
        if (d?.childId) setChild(d.childId);
        setTeacher((t) => (d?.teachers.some((x) => x.id === t) ? t : d?.teachers[0]?.id ?? ""));
      })
      .catch(() => setData({ children: [], teachers: [], days: [], bookings: [] }));
  }, []);
  useEffect(() => load(), [load]);

  const times = useMemo(() => data?.days[day]?.slots.find((s) => s.tutorId === teacher)?.times ?? [], [data, day, teacher]);
  const t = data?.teachers.find((x) => x.id === teacher);
  const kid = data?.children.find((c) => c.id === child);
  const upcoming = (data?.bookings ?? []).filter((b) => b.status === "booked");

  const book = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ptm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId: child, tutorId: teacher, startAt: slot, mode }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Booking failed");
      toast({ title: "Meeting booked ✓", description: `${t?.name} · ${dIST(slot)} ${tIST(slot)} · ${mode === "online" ? "online" : "at school"}. Reminder 1 hour before.` });
      setSlot("");
      load(child);
    } catch (e) {
      toast({ title: "Couldn't book", description: (e as Error).message, variant: "destructive" });
      load(child);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    if (!confirm("Cancel this meeting?")) return;
    await fetch(`/api/ptm?id=${id}`, { method: "DELETE" });
    toast({ title: "Meeting cancelled" });
    load(child);
  };
  const ics = () => {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tutor Amma//PTM//EN"];
    upcoming.forEach((b) => {
      const s = new Date(b.startAt).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      lines.push("BEGIN:VEVENT", `UID:${b.id}@tutoramma`, `DTSTAMP:${s}`, `DTSTART:${s}`, "DURATION:PT10M", `SUMMARY:PTM · ${b.tutorName} (${b.subject})`, `DESCRIPTION:${b.mode === "online" ? "Online" : "At school"} · ${b.brief.replace(/[,;]/g, " ")}`, "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:PTM in 1 hour", "END:VALARM", "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
    a.download = "tutor-amma-ptm.ics";
    a.click();
  };

  if (!data) return <LoadingView label="Loading meeting slots…" />;

  const termLabel = data.days.length ? `PTM days · ${data.days.map((d) => new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })).join(" and ")}` : "";

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="core"
        icon={Handshake}
        title="Parent-teacher meetings"
        subtitle="Book a 10-minute slot with each teacher. Meet online or at school; reminders and notes included."
        pills={termLabel ? [{ label: termLabel, tone: "info" }] : []}
        actions={
          <>
            {data.children.length > 1 && (
              <select className="sk-input !w-auto !py-2 !rounded-full" value={child} onChange={(e) => load(e.target.value)} aria-label="Child">
                {data.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {upcoming.length > 0 && <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={ics}><CalendarPlus className="w-3.5 h-3.5" /> Add to calendar</button>}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AccentKpi label="Teachers" value={data.teachers.length} sub={kid ? `for ${kid.name.split(" ")[0]}` : undefined} />
        <AccentKpi label="Booked" value={upcoming.length} sub={`${Math.max(0, data.teachers.length - upcoming.length)} to go`} />
        <AccentKpi label="Online / at school" value={`${upcoming.filter((b) => b.mode === "online").length} / ${upcoming.filter((b) => b.mode === "school").length}`} />
        <AccentKpi label="Briefs ready" value={upcoming.filter((b) => b.brief).length} />
      </div>

      {data.teachers.length === 0 ? (
        <div className="sk-card p-4"><EmptyState icon={Handshake} title="No teachers yet" sub="Once your child has a session with a tutor, you can book a parent-teacher meeting here." /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3 sk-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[15px] font-extrabold text-[#142366] mr-auto">Choose a slot · {t?.name} {t?.subject && `(${t.subject})`}</div>
              <select className="sk-input !w-auto !py-1.5" value={teacher} onChange={(e) => { setTeacher(e.target.value); setSlot(""); }} aria-label="Teacher">
                {data.teachers.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.subject}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-3">
              {data.days.map((d, i) => (
                <button key={d.date} className={clsx("sk-chip", day === i && "sk-chip-active")} onClick={() => { setDay(i); setSlot(""); }}>
                  {new Date(d.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {times.map((s) => {
                const sel = slot === s.at;
                const free = s.status === "free";
                return (
                  <button
                    key={s.at}
                    disabled={!free}
                    onClick={() => setSlot(s.at)}
                    className={clsx("rounded-2xl border py-2.5 text-center transition-all", sel ? "border-[#F26B1D] bg-[#FFF5EE] shadow-[0_0_0_2px_#F26B1D33]" : free ? "bg-white hover:border-[#B9C6E4]" : "bg-[#F7F9FC] opacity-60 cursor-not-allowed")}
                    style={!sel && free ? { borderColor: "var(--border)" } : undefined}
                  >
                    <div className={clsx("text-[13px] font-bold", free ? "text-[#142366]" : "text-muted-foreground")}>{tIST(s.at)}</div>
                    <div className="text-[11px] text-muted-foreground">{sel ? "Selected" : s.status === "mine" ? "Your meeting" : free ? "Free" : "Booked"}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              {(["online", "school"] as const).map((m) => (
                <button key={m} className={clsx("inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-semibold border", mode === m ? "bg-[#EAF0FB] text-[#22357F] border-[#C9D6F5]" : "bg-white border-[#D8E0ED]")} onClick={() => setMode(m)}>
                  {m === "online" ? <Video className="w-3 h-3" /> : <School className="w-3 h-3" />} {m === "online" ? "Online" : "At school"} {mode === m && "✓"}
                </button>
              ))}
            </div>
            <button className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#F26B1D] text-white text-[13px] font-bold disabled:opacity-50" disabled={!slot || busy} onClick={book}>
              {slot ? `Book ${dIST(slot)} · ${tIST(slot)}` : "Pick a free slot"}
            </button>
          </div>

          <div className="xl:col-span-2 sk-card p-5">
            <div className="text-[15px] font-extrabold text-[#142366]">{kid?.name.split(" ")[0]}&apos;s meeting plan</div>
            {upcoming.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground mt-3">No meetings booked yet.</p>
            ) : (
              <table className="w-full text-[12.5px] mt-3">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                    <th className="text-left px-2.5 py-2">Teacher</th>
                    <th className="text-left px-2.5 py-2">Slot</th>
                    <th className="text-left px-2.5 py-2">Mode</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((b) => (
                    <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-2.5 py-2.5">{b.tutorName} · {b.subject}</td>
                      <td className="px-2.5 py-2.5 whitespace-nowrap">{dIST(b.startAt)} {tIST(b.startAt)}</td>
                      <td className="px-2.5 py-2.5"><span className={clsx("px-2 py-[2px] rounded-full text-[10.5px] font-bold", b.mode === "online" ? "bg-[#EAF0FB] text-[#22357F]" : "bg-[#FFF1E6] text-[#D9580E]")}>{b.mode === "online" ? "Online" : "School"}</span></td>
                      <td className="text-right"><button className="p-1 text-muted-foreground hover:text-[#C03342]" onClick={() => cancel(b.id)} aria-label="Cancel meeting"><X className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {upcoming[0]?.brief && (
              <div className="mt-4 rounded-2xl border border-[#DCD2FB] bg-[#F6F3FF] p-3.5">
                <div className="text-[12.5px] font-bold text-[#6D4AE0] flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> AI meeting brief · {upcoming[0].tutorName}</div>
                <p className="text-[12px] text-[#4B3C8A] mt-1 leading-relaxed">{upcoming[0].brief}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
