"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import QRCode from "qrcode";
import { ModuleHeader, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { exportBrandedExcel } from "@/lib/excel";
import { School, Plus, CalendarSync, Share2, X, Copy, Check, Download, Printer, Users, Archive, RotateCcw, MessageCircle, Mail, Smartphone, CalendarPlus, Search, FileSpreadsheet, LayoutGrid, List } from "lucide-react";

/* ---------------- types ---------------- */
interface Room {
  id: string;
  name: string;
  board: string;
  grade: string;
  section: string;
  subject: string;
  language: string;
  mode: string;
  visibility: string;
  joinPolicy: string;
  seats: number;
  pricePlan: string;
  price: number;
  joinCode: string;
  shareToken: string;
  schedule: string;
  status: string;
  recording: boolean;
  students: number;
  pending: number;
  waitlisted: number;
}
interface Member {
  id: string;
  studentId: string;
  name: string;
  color: string;
  grade: string;
  school: string;
  status: string;
  via: string;
  joinedAt: string;
  progressShare: boolean;
}

const BOARDS = ["CBSE", "ICSE", "IGCSE", "IB", "State Board", "NIOS"];
const GRADES = ["Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const POLICY: Record<string, string> = { approval: "Tutor approval", instant: "Instant", paid: "Paid enrolment" };
const STATUS: Record<string, string> = { active: "bg-[#E6F6EE] text-[#1F7A55]", forming: "bg-[#FFF6E5] text-[#A86A12]", archived: "bg-[#EEF2FA] text-[#57627F]" };

const linkFor = (r: Room) => `${typeof window !== "undefined" ? window.location.origin : ""}/?classroom=${r.joinCode}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json" } });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error(j?.error?.message || `Request failed (${res.status})`);
  return j.data as T;
}

/* ======================================================================= */

export function TClassrooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [tab, setTab] = useState("active");
  const [board, setBoard] = useState("All");
  const [q, setQ] = useState("");
  const [grid, setGrid] = useState(false);
  const [share, setShare] = useState<Room | null>(null);
  const [roster, setRoster] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<Room[]>("/api/classrooms").then(setRooms).catch((e) => toast({ title: "Couldn't load classrooms", description: e.message, variant: "destructive" }));
  }, []);
  useEffect(load, [load]);

  const list = useMemo(
    () =>
      (rooms ?? []).filter(
        (r) =>
          (tab === "archived" ? r.status === "archived" : r.status !== "archived") &&
          (board === "All" || r.board === board) &&
          (!q || `${r.name} ${r.subject} ${r.grade}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [rooms, tab, board, q]
  );

  const syncCalendar = () => {
    const rs = (rooms ?? []).filter((r) => r.status !== "archived");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tutor Amma//Classrooms//EN"];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    rs.forEach((r) => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
      const dt = d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      lines.push("BEGIN:VEVENT", `UID:${r.id}@tutoramma`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`, "DURATION:PT1H", "RRULE:FREQ=WEEKLY", `SUMMARY:${r.name}`, `DESCRIPTION:${r.schedule || "Classroom"} · join ${linkFor(r)}`, "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    download(new Blob([lines.join("\r\n")], { type: "text/calendar" }), "tutor-amma-classrooms.ics");
    toast({ title: "Calendar file ready", description: `${rs.length} classroom series exported (.ics).` });
  };

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="scheduling"
        icon={School}
        trail={[]}
        title="My Classrooms"
        subtitle="Create, schedule and share classrooms. Students who join become your linked students after your approval."
        pills={[{ label: `${(rooms ?? []).filter((r) => r.status !== "archived").length} active`, tone: "info" }, ...((rooms ?? []).some((r) => r.pending) ? [{ label: `${(rooms ?? []).reduce((a, r) => a + r.pending, 0)} waiting approval`, tone: "new" as const }] : [])]}
        actions={
          <>
            <HeaderButton onClick={syncCalendar}>
              <CalendarSync className="w-3.5 h-3.5" /> Sync calendar
            </HeaderButton>
            <HeaderButton variant="primary" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" /> New Classroom
            </HeaderButton>
          </>
        }
        tabs={[
          { id: "active", label: "Classrooms", count: (rooms ?? []).filter((r) => r.status !== "archived").length },
          { id: "archived", label: "Archived", count: (rooms ?? []).filter((r) => r.status === "archived").length },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      <div className="sk-card p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select className="sk-input !w-auto !py-1.5" value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Filter by board">
            <option value="All">Board: All</option>
            {BOARDS.map((b) => <option key={b}>{b}</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input className="sk-input !py-1.5 !pl-8" placeholder="Search classrooms…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ml-auto sk-segment">
            <button className={clsx("sk-segment-item", !grid && "sk-segment-item-active")} onClick={() => setGrid(false)} aria-label="List view"><List className="w-3.5 h-3.5" /></button>
            <button className={clsx("sk-segment-item", grid && "sk-segment-item-active")} onClick={() => setGrid(true)} aria-label="Grid view"><LayoutGrid className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {!rooms ? (
          <LoadingView label="Loading classrooms…" />
        ) : list.length === 0 ? (
          <EmptyState icon={School} title={tab === "archived" ? "No archived classrooms" : "No classrooms yet"} sub="Create a classroom, share its link, QR or join code, and students appear here for approval." action={tab !== "archived" ? <button className="sk-btn sk-btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Classroom</button> : undefined} />
        ) : grid ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((r) => (
              <div key={r.id} className="sk-card-flat p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[#142366] truncate">{r.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{r.grade}{r.section ? ` · ${r.section}` : ""} · {r.subject} · {r.language}</div>
                  </div>
                  <span className={clsx("px-2 py-[2px] rounded-full text-[10.5px] font-bold capitalize", STATUS[r.status])}>{r.status}</span>
                </div>
                <div className="text-[12px] mt-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" /> {r.students}/{r.seats} students {r.pending > 0 && <span className="sk-pill sk-pill-orange !text-[10px]">{r.pending} pending</span>}</div>
                <div className="flex gap-2 mt-3">
                  <button className="sk-btn sk-btn-sm sk-btn-primary flex-1" onClick={() => setShare(r)}><Share2 className="w-3.5 h-3.5" /> Share</button>
                  <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setRoster(r)}>Roster</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto sk-scroll">
            <table className="w-full text-[12.5px] min-w-[760px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground bg-[#F3F6FB]">
                  {["Classroom name", "Grade · section", "Subject", "Language", "Students", "Class link", "Status", ""].map((h) => <th key={h} className="text-left px-3 py-2.5">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-[#F7F9FE]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-3">
                      <button className="font-bold text-[#142366] hover:underline text-left" onClick={() => setRoster(r)}>{r.name}</button>
                      <div className="text-[11px] text-muted-foreground">{r.board} · {r.schedule || "Schedule not set"}</div>
                    </td>
                    <td className="px-3 py-3">{r.grade}{r.section ? ` · ${r.section}` : ""}</td>
                    <td className="px-3 py-3">{r.subject}</td>
                    <td className="px-3 py-3">{r.language}</td>
                    <td className="px-3 py-3 tabular">
                      {r.students}/{r.seats}
                      {r.pending > 0 && <span className="ml-1.5 sk-pill sk-pill-orange !text-[10px]">{r.pending} pending</span>}
                    </td>
                    <td className="px-3 py-3">
                      <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11.5px] font-bold text-[#142366] hover:border-[#B9C6E4]" style={{ borderColor: "var(--border)" }} onClick={() => setShare(r)}>
                        <Share2 className="w-3 h-3" /> Share
                      </button>
                    </td>
                    <td className="px-3 py-3"><span className={clsx("px-2 py-[3px] rounded-full text-[10.5px] font-bold capitalize", STATUS[r.status])}>{r.status}</span></td>
                    <td className="px-3 py-3 text-right">
                      <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setRoster(r)}>Roster</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {share && <ShareDialog room={share} onClose={() => setShare(null)} onChanged={load} />}
      {roster && <RosterDrawer room={roster} onClose={() => { setRoster(null); load(); }} onShare={() => { setShare(roster); }} />}
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); load(); setShare(r); }} />}
    </div>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- modal shell ---------------- */
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#142366]/30 backdrop-blur-[2px]" onClick={onClose}>
      <div className={clsx("bg-white rounded-[22px] shadow-2xl w-full max-h-[92vh] overflow-y-auto sk-scroll p-6 relative ta-pop-in", wide ? "max-w-[680px]" : "max-w-[520px]")} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <button className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#F3F6FB]" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        {children}
      </div>
    </div>
  );
}

/* ---------------- share dialog (Screen 15) ---------------- */
function ShareDialog({ room, onClose, onChanged }: { room: Room; onClose: () => void; onChanged: () => void }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [r, setR] = useState(room);
  const link = linkFor(r);

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#142366", light: "#FFFFFF" }, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [link]);

  const msg = `Join "${r.name}" (${r.subject}, ${r.grade}) on Tutor Amma.\nLink: ${link}\nJoin code: ${r.joinCode}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const setPolicy = async (p: string) => {
    try {
      const u = await api<Room>(`/api/classrooms/${r.id}`, { method: "PATCH", body: JSON.stringify({ joinPolicy: p }) });
      setR({ ...r, joinPolicy: u.joinPolicy });
      onChanged();
    } catch (e) {
      toast({ title: "Couldn't change policy", description: (e as Error).message, variant: "destructive" });
    }
  };
  const regenerate = async () => {
    if (!confirm("Generate a new join code? The old link and code stop working.")) return;
    const u = await api<Room>(`/api/classrooms/${r.id}`, { method: "PATCH", body: JSON.stringify({ regenerateCode: true }) });
    setR({ ...r, joinCode: u.joinCode });
    onChanged();
    toast({ title: "New join code issued", description: "The previous link no longer works." });
  };
  const ics = () => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(18, 0, 0, 0);
    const dt = d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tutor Amma//Classroom//EN", "BEGIN:VEVENT", `UID:${r.id}@tutoramma`, `DTSTAMP:${dt}`, `DTSTART:${dt}`, "DURATION:PT1H", "RRULE:FREQ=WEEKLY", `SUMMARY:${r.name}`, `DESCRIPTION:Join code ${r.joinCode} · ${link}`, `URL:${link}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    download(new Blob([body], { type: "text/calendar" }), `${r.name.replace(/\W+/g, "-")}.ics`);
  };
  const printQr = () => {
    const w = window.open("", "_blank", "width=520,height=680");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${r.name} — join QR</title><style>@page{size:A5;margin:0}body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#142366}.c{text-align:center;padding:14mm}img{width:70mm;height:70mm}h1{font-size:18pt;margin:6mm 0 2mm}p{margin:1mm;color:#57627F;font-size:10pt}.code{font-size:22pt;letter-spacing:6px;font-weight:800;margin-top:4mm}.brand{font-weight:800;font-size:12pt;margin-bottom:6mm}.brand b{color:#F26B1D}</style></head><body><div class="c"><div class="brand">Tutor <b>Amma</b></div><img src="${qr}" alt="QR"/><h1>${r.name}</h1><p>${r.subject} · ${r.grade} · ${r.board}</p><div class="code">${r.joinCode}</div><p>Scan, or enter the join code in the Tutor Amma app</p></div><script>onload=()=>{print();setTimeout(()=>close(),400)}</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="grid sm:grid-cols-[1fr_190px] gap-6">
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold text-[#142366] pr-6">Share “{r.name}”</h2>
          <p className="text-[12px] text-muted-foreground">{r.joinPolicy === "instant" ? "Anyone with the link joins instantly after sign-in." : r.joinPolicy === "paid" ? "Students join after paying the enrolment." : "Anyone who joins is added to your students after your approval."}</p>

          <label className="block text-[11.5px] font-bold mt-4 mb-1">Join link</label>
          <div className="flex gap-2">
            <input readOnly value={link} className="sk-input !py-2 font-mono !text-[12px]" onFocus={(e) => e.target.select()} />
            <button className="sk-btn sk-btn-primary sk-btn-sm shrink-0" onClick={copy}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}</button>
          </div>

          <label className="block text-[11.5px] font-bold mt-4 mb-1">Join code</label>
          <div className="flex items-center gap-2">
            <div className="sk-well flex-1 px-4 py-3 text-[24px] font-extrabold tracking-[.4em] text-[#142366] font-mono">{r.joinCode}</div>
            <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={regenerate} title="Regenerate code"><RotateCcw className="w-3.5 h-3.5" /></button>
          </div>

          <label className="block text-[11.5px] font-bold mt-4 mb-1">Join policy</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(POLICY).map(([k, v]) => (
              <button key={k} className={clsx("sk-chip !text-[11.5px]", r.joinPolicy === k && "sk-chip-active")} onClick={() => setPolicy(k)}>
                {v} {r.joinPolicy === k && "✓"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <a className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1FAF5B] text-white text-[12px] font-bold" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
            <a className="sk-btn sk-btn-sm sk-btn-ghost" href={`sms:?&body=${encodeURIComponent(msg)}`}><Smartphone className="w-3.5 h-3.5" /> SMS</a>
            <a className="sk-btn sk-btn-sm sk-btn-ghost" href={`mailto:?subject=${encodeURIComponent(`Join ${r.name} on Tutor Amma`)}&body=${encodeURIComponent(msg)}`}><Mail className="w-3.5 h-3.5" /> Email</a>
            <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={ics}><CalendarPlus className="w-3.5 h-3.5" /> Add to calendar</button>
          </div>
          <p className="text-[10.5px] text-muted-foreground mt-3">Students must sign in to join — a guardian-approved account is required for minors.</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-[190px] h-[190px] rounded-2xl border p-2 bg-white flex items-center justify-center" style={{ borderColor: "var(--border)" }}>
            {qr ? <img src={qr} alt={`QR code to join ${r.name}`} className="w-full h-full" /> : <div className="w-full h-full ta-shimmer rounded-xl" />}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="sk-btn sk-btn-sm sk-btn-ghost" disabled={!qr} onClick={() => { const a = document.createElement("a"); a.href = qr; a.download = `${r.joinCode}-qr.png`; a.click(); }}><Download className="w-3.5 h-3.5" /> Download</button>
            <button className="sk-btn sk-btn-sm sk-btn-ghost" disabled={!qr} onClick={printQr}><Printer className="w-3.5 h-3.5" /> Print</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- roster drawer ---------------- */
function RosterDrawer({ room, onClose, onShare }: { room: Room; onClose: () => void; onShare: () => void }) {
  const [data, setData] = useState<(Room & { roster: Member[] }) | null>(null);
  const load = useCallback(() => {
    api<Room & { roster: Member[] }>(`/api/classrooms/${room.id}`).then(setData).catch(() => {});
  }, [room.id]);
  useEffect(load, [load]);

  const act = async (m: Member, action: string) => {
    try {
      await api(`/api/classrooms/${room.id}/members`, { method: "POST", body: JSON.stringify({ memberId: m.id, action }) });
      toast({ title: action === "approve" ? `${m.name} approved` : action === "remove" ? `${m.name} removed` : `${m.name} waitlisted` });
      load();
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    }
  };
  const archive = async () => {
    const next = data?.status === "archived" ? "active" : "archived";
    await api(`/api/classrooms/${room.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    toast({ title: next === "archived" ? "Classroom archived" : "Classroom restored" });
    onClose();
  };
  const exportRoster = () =>
    data &&
    exportBrandedExcel({
      fileName: `${data.name.replace(/\W+/g, "-")}-roster`,
      title: `Classroom roster · ${data.name}`,
      subtitle: `${data.subject} · ${data.grade} · ${data.board} · join code ${data.joinCode}`,
      columns: [
        { header: "Student", key: "name", width: 26 },
        { header: "Grade", key: "grade", width: 12 },
        { header: "School", key: "school", width: 28 },
        { header: "Status", key: "status", width: 12 },
        { header: "Joined via", key: "via", width: 12 },
        { header: "Joined on", key: "joined", width: 20, type: "date" },
      ],
      rows: data.roster.map((m) => ({ name: m.name, grade: m.grade, school: m.school, status: m.status, via: m.via, joined: new Date(m.joinedAt) })),
      totals: { name: `${data.roster.length} students` },
    });

  const groups: [string, Member[]][] = data
    ? [
        ["Waiting for approval", data.roster.filter((m) => m.status === "pending")],
        ["Enrolled", data.roster.filter((m) => m.status === "active")],
        ["Waitlist", data.roster.filter((m) => m.status === "waitlisted")],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-[#142366]/25" onClick={onClose}>
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[480px] bg-white shadow-2xl p-6 overflow-y-auto sk-scroll" onClick={(e) => e.stopPropagation()} aria-label="Classroom roster">
        <button className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#F3F6FB]" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">Roster</div>
        <h2 className="text-[18px] font-extrabold text-[#142366] pr-8">{room.name}</h2>
        <p className="text-[12px] text-muted-foreground">{room.subject} · {room.grade} · {POLICY[room.joinPolicy]} · {room.seats} seats</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="sk-btn sk-btn-sm sk-btn-primary" onClick={onShare}><Share2 className="w-3.5 h-3.5" /> Share</button>
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={exportRoster} disabled={!data}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={archive}><Archive className="w-3.5 h-3.5" /> {room.status === "archived" ? "Restore" : "Archive"}</button>
        </div>
        {!data ? (
          <LoadingView />
        ) : data.roster.length === 0 ? (
          <EmptyState icon={Users} title="No students yet" sub="Share the link, QR or join code — joiners appear here." />
        ) : (
          groups.map(([label, ms]) =>
            ms.length ? (
              <div key={label} className="mt-5">
                <div className="text-[12px] font-bold text-[#142366] mb-2">{label} · {ms.length}</div>
                <div className="space-y-2">
                  {ms.map((m) => (
                    <div key={m.id} className="sk-card-flat !rounded-2xl p-3 flex items-center gap-3">
                      <span className="sk-avatar shrink-0" style={{ width: 34, height: 34, borderRadius: 11, background: m.color, fontSize: 12 }}>{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold truncate">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{m.grade}{m.school ? ` · ${m.school}` : ""} · via {m.via}</div>
                      </div>
                      {m.status === "pending" && <button className="sk-btn sk-btn-sm sk-btn-success" onClick={() => act(m, "approve")}>Approve</button>}
                      {m.status === "waitlisted" && <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => act(m, "approve")}>Admit</button>}
                      <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => act(m, "remove")} aria-label={`Remove ${m.name}`}><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
      </aside>
    </div>
  );
}

/* ---------------- create dialog ---------------- */
function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (r: Room) => void }) {
  const [f, setF] = useState({ name: "", board: "CBSE", grade: "Grade 8", section: "", subject: "Mathematics", language: "English", mode: "online", visibility: "link", joinPolicy: "approval", seats: 25, pricePlan: "free", price: 0, schedule: "", recording: false });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<Room>("/api/classrooms", { method: "POST", body: JSON.stringify({ ...f, price: Math.round(Number(f.price) * 100) }) });
      toast({ title: "Classroom created", description: `Join code ${r.joinCode} is ready to share.` });
      onCreated({ ...r, students: 0, pending: 0, waitlisted: 0 });
    } catch (e) {
      toast({ title: "Couldn't create classroom", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const L = ({ children }: { children: React.ReactNode }) => <span className="block text-[11.5px] font-bold mb-1">{children}</span>;
  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-[18px] font-extrabold text-[#142366]">New Classroom</h2>
      <p className="text-[12px] text-muted-foreground">Name, board, grade and subject — then set rules and share.</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="sm:col-span-2"><L>Classroom name</L><input className="sk-input" placeholder="e.g. Gr 8 CBSE Maths · Evening" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></label>
        <label><L>Board</L><select className="sk-input" value={f.board} onChange={(e) => set("board", e.target.value)}>{BOARDS.map((b) => <option key={b}>{b}</option>)}</select></label>
        <label><L>Grade</L><select className="sk-input" value={f.grade} onChange={(e) => set("grade", e.target.value)}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label><L>Subject</L><input className="sk-input" value={f.subject} onChange={(e) => set("subject", e.target.value)} /></label>
        <label><L>Section (optional)</L><input className="sk-input" placeholder="A" value={f.section} onChange={(e) => set("section", e.target.value)} /></label>
        <label><L>Language</L><select className="sk-input" value={f.language} onChange={(e) => set("language", e.target.value)}>{["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali"].map((l) => <option key={l}>{l}</option>)}</select></label>
        <label><L>Schedule</L><input className="sk-input" placeholder="Mon, Wed · 6:00 PM" value={f.schedule} onChange={(e) => set("schedule", e.target.value)} /></label>
        <label><L>Visibility</L><select className="sk-input" value={f.visibility} onChange={(e) => set("visibility", e.target.value)}><option value="private">Private (invite only)</option><option value="link">Link (sign-in required)</option><option value="public">Public listing</option></select></label>
        <label><L>Join policy</L><select className="sk-input" value={f.joinPolicy} onChange={(e) => set("joinPolicy", e.target.value)}>{Object.entries(POLICY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><L>Seats</L><input type="number" min={1} max={500} className="sk-input" value={f.seats} onChange={(e) => set("seats", Number(e.target.value))} /></label>
        <label><L>Pricing</L><select className="sk-input" value={f.pricePlan} onChange={(e) => set("pricePlan", e.target.value)}><option value="free">Free</option><option value="per_class">Per class</option><option value="monthly">Monthly subscription</option><option value="package">Package</option></select></label>
        {f.pricePlan !== "free" && <label><L>Price (₹)</L><input type="number" min={0} className="sk-input" value={f.price} onChange={(e) => set("price", e.target.value)} /></label>}
        <label className="sm:col-span-2 flex items-center gap-2 text-[12px] mt-1"><input type="checkbox" checked={f.recording} onChange={(e) => set("recording", e.target.checked)} /> Allow recording (a consent banner is shown to students and guardians)</label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="sk-btn sk-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="sk-btn sk-btn-primary" disabled={busy || !f.name.trim() || !f.subject.trim()} onClick={submit}><Plus className="w-4 h-4" /> Create & share</button>
      </div>
    </Modal>
  );
}
