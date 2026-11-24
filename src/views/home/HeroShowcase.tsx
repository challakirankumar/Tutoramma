"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Baby, GraduationCap, UserCog, Radar, Zap, CheckCircle2, MapPin, KeyRound, Sparkles, Wallet, MessageCircle, Lock, Flame, Video, CalendarDays, TrendingUp, AlertTriangle, ShieldAlert } from "lucide-react";

const ROLES = [
  { id: "parent", label: "Parent", icon: Baby, caption: "Every update about your child, live" },
  { id: "student", label: "Student", icon: GraduationCap, caption: "A patient AI tutor that knows your syllabus" },
  { id: "tutor", label: "Tutor", icon: UserCog, caption: "Your day, students and earnings in one place" },
  { id: "safety", label: "Safety desk", icon: Radar, caption: "Every home visit watched, every alert answered" },
] as const;

/** Rotating role showcase for the hero (auto-advances every 5 s, pauses on hover). */
export function HeroShowcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setI((x) => (x + 1) % ROLES.length), 5000);
    return () => clearTimeout(id);
  }, [i, paused]);
  const role = ROLES[i];

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="mx-auto lg:mx-0 w-fit flex gap-1 p-1.5 rounded-2xl bg-white/90 border border-[#E1E7F2] shadow-[0_12px_34px_rgba(15,27,61,.08)] backdrop-blur" role="tablist" aria-label="See Tutor Amma by role">
        {ROLES.map((r, k) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={k === i}
            onClick={() => setI(k)}
            className={clsx("relative flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-[12.5px] sm:text-[13.5px] font-semibold transition-colors overflow-hidden", k === i ? "bg-[#0F1B3D] text-white" : "text-[#4A5578] hover:text-[#0F1B3D]")}
          >
            <r.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{r.label}</span>
            {k === i && !paused && <span key={i} className="absolute left-2 right-2 bottom-[3px] h-[2px] bg-[#F26B1D] rounded-full origin-left hm-progress" />}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#0F1B3D] justify-center lg:justify-start">
        <Zap className="w-4 h-4 text-[#F26B1D]" /> {role.caption}
      </div>
      <div key={role.id} className="hm-swap mt-4 flex justify-center lg:justify-start">
        {role.id === "parent" ? <ParentPhone /> : role.id === "student" ? <StudentCard /> : role.id === "tutor" ? <TutorCard /> : <SafetyCard />}
      </div>
    </div>
  );
}

function Row({ icon: Icon, title, sub, tone = "#0F1B3D", children }: { icon: React.ComponentType<{ className?: string }>; title: string; sub?: string; tone?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-[#EDF1F8] px-3.5 py-3 flex items-center gap-3 shadow-[0_2px_8px_rgba(15,27,61,.04)]">
      <span className="shrink-0" style={{ color: tone }}><Icon className="w-[18px] h-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-[#0F1B3D] truncate">{title}</div>
        {sub && <div className="text-[11.5px] text-[#6B7593] truncate">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

function ParentPhone() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-[290px] rounded-[44px] bg-[#0F1B3D] p-[10px] shadow-[0_40px_80px_rgba(15,27,61,.28)] hm-float">
        <div className="rounded-[36px] bg-[#F7F9FD] px-3.5 pt-3 pb-4">
          <div className="mx-auto w-24 h-6 rounded-full bg-[#0F1B3D]" />
          <div className="flex items-center gap-2.5 mt-3 px-1">
            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F57A2C] to-[#E35D10] text-white flex items-center justify-center font-bold text-[13px]">AM</span>
            <div>
              <div className="text-[14px] font-bold text-[#0F1B3D]">Aarav</div>
              <div className="text-[11.5px] text-[#6B7593]">Grade 8 · CBSE</div>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            <Row icon={MapPin} title="Meera ma'am is on the way" tone="#315BE5">
              <div className="h-1.5 rounded-full bg-[#E8EDF8] mt-1.5 overflow-hidden"><div className="h-full w-[72%] rounded-full bg-[#315BE5]" /></div>
              <div className="text-[10.5px] text-[#6B7593] mt-1">ETA 6 min · live map</div>
            </Row>
            <Row icon={KeyRound} title="Check-in code  4 8 2 1" sub="Share only when she's at your door" tone="#1F9D6B" />
            <Row icon={Sparkles} title="Class recap ready" sub="Factorisation · 2 worksheets set" tone="#6D4AE0" />
            <div className="rounded-2xl bg-white border border-[#EDF1F8] px-3.5 py-3 flex items-center gap-3">
              <Wallet className="w-[18px] h-[18px] text-[#F26B1D] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-[#0F1B3D]">₹1,850 held safely</div>
                <div className="text-[11.5px] text-[#6B7593]">Released after the class</div>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#F26B1D] text-white text-[11px] font-bold">UPI</span>
            </div>
          </div>
        </div>
      </div>
      <span className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E1E7F2] text-[12px] font-semibold text-[#0F1B3D] shadow-sm">
        <MessageCircle className="w-3.5 h-3.5 text-[#1FAF5B]" /> Also sent on WhatsApp &amp; SMS
      </span>
    </div>
  );
}

function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[520px] rounded-[22px] bg-white border border-[#E1E7F2] shadow-[0_40px_80px_rgba(15,27,61,.16)] overflow-hidden hm-float">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#EEF2F8]">
        <span className="flex gap-1.5">{["#E5E8EF", "#E5E8EF", "#E5E8EF"].map((c, k) => <span key={k} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}</span>
        <span className="ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3F6FB] text-[11px] text-[#6B7593]"><Lock className="w-3 h-3" /> {url}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StudentCard() {
  return (
    <BrowserFrame url="tutoramma.app/ai-tutor">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[.14em] text-[#6B7593]">LIVE AI TUTOR · MAYA</div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E35D10]"><Flame className="w-3.5 h-3.5" /> 9-day streak</span>
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-4 mt-3">
        <div className="rounded-2xl aspect-square flex items-center justify-center" style={{ background: "radial-gradient(circle at 50% 35%, #2B3E8F, #0E1A52)" }}>
          <svg viewBox="0 0 100 100" className="w-16 h-16"><ellipse cx="50" cy="54" rx="26" ry="29" fill="#E8B48A" /><path d="M24 50 C 28 22, 72 22, 76 50 C 66 40, 34 40, 24 50 Z" fill="#2A1A14" /><circle cx="41" cy="54" r="3" fill="#2A1A14" /><circle cx="59" cy="54" r="3" fill="#2A1A14" /><ellipse cx="50" cy="68" rx="6" ry="3" fill="#B8424C" /></svg>
        </div>
        <div className="space-y-1.5 font-display">
          <div className="text-[19px] font-extrabold text-[#0F1B3D] tracking-normal">45 km in 3 hours</div>
          <div className="text-[16px] text-[#0F1B3D] tracking-normal">Speed = 45 ÷ 3 = <b className="text-[#F26B1D]">15 km/h</b></div>
          <div className="text-[16px] text-[#0F1B3D] tracking-normal">In 5 hours: 15 × 5 = <b className="text-[#1F9D6B]">75 km</b></div>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-[12px] font-bold text-[#0F1B3D]"><span>Understanding</span><span className="text-[#F26B1D]">72%</span></div>
        <div className="h-2 rounded-full bg-[#EEF2F8] mt-1 overflow-hidden"><div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#F57A2C] to-[#E35D10]" /></div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {["Slower", "Give an example", "Explain in Hindi", "Quiz me"].map((q) => <span key={q} className="px-2.5 py-1 rounded-full bg-[#F1F4FA] text-[11.5px] font-semibold text-[#2A3557]">{q}</span>)}
      </div>
    </BrowserFrame>
  );
}

function TutorCard() {
  const bars = [38, 52, 46, 64, 58, 82];
  return (
    <BrowserFrame url="tutoramma.app/tutor/today">
      <div className="text-[11px] font-bold tracking-[.14em] text-[#6B7593]">EARNINGS · NOVEMBER</div>
      <div className="flex items-end justify-between mt-1">
        <div className="font-display text-[26px] font-extrabold text-[#0F1B3D] tracking-normal">₹48,600 <span className="text-[12px] font-semibold text-[#6B7593]">of ₹55K goal</span></div>
        <span className="w-12 h-12 rounded-full flex items-center justify-center text-[11px] font-extrabold text-[#E35D10]" style={{ background: "conic-gradient(#F26B1D 0 88%, #F1F4FA 88% 100%)" }}><span className="w-9 h-9 rounded-full bg-white flex items-center justify-center">88%</span></span>
      </div>
      <div className="flex items-end gap-2.5 h-[96px] mt-3">
        {bars.map((b, k) => <div key={k} className="flex-1 rounded-t-lg" style={{ height: `${b}%`, background: k === bars.length - 1 ? "#0F1B3D" : "#D6DDEA" }} />)}
      </div>
      <div className="grid grid-cols-6 text-center text-[10.5px] text-[#8A93AB] mt-1">{["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((m) => <span key={m}>{m}</span>)}</div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="rounded-2xl border border-[#EDF1F8] p-3"><div className="text-[11px] text-[#6B7593]">Today</div><div className="text-[15px] font-extrabold text-[#0F1B3D] flex items-center gap-1"><Video className="w-4 h-4 text-[#315BE5]" /> 3 classes · 2 visits</div></div>
        <div className="rounded-2xl border border-[#EDF1F8] p-3"><div className="text-[11px] text-[#6B7593]">Repeat parents</div><div className="text-[15px] font-extrabold text-[#0F1B3D] flex items-center gap-1"><TrendingUp className="w-4 h-4 text-[#1F9D6B]" /> 92%</div></div>
      </div>
    </BrowserFrame>
  );
}

function SafetyCard() {
  return (
    <BrowserFrame url="tutoramma.app/control-tower">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[.14em] text-[#6B7593]">CONTROL TOWER · LIVE</div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1F7A55]"><span className="w-1.5 h-1.5 rounded-full bg-[#1F9D6B] animate-pulse" /> 14 active visits</span>
      </div>
      <div className="relative mt-3 h-[150px] rounded-2xl overflow-hidden" style={{ background: "#EAF2E6" }}>
        <svg viewBox="0 0 400 150" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path d="M0 30 L400 120" stroke="#fff" strokeWidth="10" /><path d="M260 0 L90 150" stroke="#fff" strokeWidth="9" />
          {[[70, 60, "#0F1B3D"], [150, 95, "#1F9D6B"], [230, 48, "#F26B1D"], [300, 100, "#0F1B3D"], [340, 40, "#D64545"]].map(([x, y, c], k) => (
            <g key={k} transform={`translate(${x},${y})`}>
              {c === "#D64545" && <circle r="14" fill="#D64545" opacity=".2"><animate attributeName="r" values="6;18;6" dur="1.6s" repeatCount="indefinite" /></circle>}
              <path d="M0 0 C -7 -9 -7 -18 0 -18 C 7 -18 7 -9 0 0 Z" fill={c as string} stroke="#fff" strokeWidth="1.5" />
            </g>
          ))}
        </svg>
      </div>
      <div className="space-y-2 mt-3">
        <div className="rounded-xl border-l-4 border-[#D64545] bg-[#FFF7F7] px-3 py-2 text-[12px] flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#D64545]" /><b>SOS</b> · Indiranagar <span className="ml-auto text-[#6B7593]">ack in 38s</span></div>
        <div className="rounded-xl border-l-4 border-[#F26B1D] bg-[#FFF8F2] px-3 py-2 text-[12px] flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#F26B1D]" /><b>Late</b> · ETA +12 min · parent notified</div>
        <div className="rounded-xl border-l-4 border-[#1F9D6B] bg-[#F4FBF7] px-3 py-2 text-[12px] flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#1F9D6B]" /><b>Checked in</b> · OTP verified · 38 m inside safe zone</div>
      </div>
      <div className="mt-3 text-[11px] text-[#6B7593] flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Location shared only from “On my way” to check-out</div>
    </BrowserFrame>
  );
}
