"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  ArrowRight, Check, X, ChevronDown, Menu, Play, ShieldCheck, BadgeCheck, MapPin, KeyRound, Wallet, Sparkles, Video, Users, Star, Search,
  GraduationCap, Baby, UserCog, Landmark, Radar, BrainCircuit, FileText, ScanLine, CalendarDays, MessageCircle, Lock, Globe, Palette, Receipt,
  Heart, Home as HomeIcon, Siren, Plus, Minus, Loader2, Mail, Phone, Clock, Languages, BookOpenCheck, HandCoins, Layers, Zap, CheckCircle2, Building2, Gift,
} from "lucide-react";
import { HeroShowcase } from "@/views/home/HeroShowcase";
import { AuthDrawer, type Role } from "@/views/home/AuthDrawer";
import { toast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */
interface Featured {
  id: string;
  name: string;
  color: string;
  headline: string;
  rating: number;
  reviews: number;
  badges: string[];
  modes: string[];
  trustScore: number;
  years: number;
  languages: string[];
  rateOnline: number;
  rateHome: number;
}

const MODULES = ["Verified tutors", "Home tuition", "Live classes", "Group batches", "AI Tutor Maya", "Lesson plans", "Question papers", "Escrow payments", "Live tracking", "Parent-teacher meetings", "Progress passport", "Smart flashcards"];
const BOARDS = ["CBSE", "ICSE / ISC", "State boards", "IB", "Cambridge", "NIOS", "JEE · NEET · CUET"];
const LANGS = ["English", "हिन्दी", "ಕನ್ನಡ", "தமிழ்", "తెలుగు", "മലയാളം"];

const FEATURE_LINKS = [
  { id: "features", label: "Verified tutors & booking", icon: BadgeCheck },
  { id: "safety", label: "Home-visit safety", icon: ShieldCheck },
  { id: "features", label: "Live classes", icon: Video },
  { id: "ai", label: "AI Tutor & Teaching Studio", icon: Sparkles },
  { id: "academies", label: "For institutes", icon: Building2 },
  { id: "tutors", label: "Find a tutor", icon: Search },
];

const SWITCH: [string, string][] = [
  ["WhatsApp groups to find a tutor", "Curriculum-matched tutors, ranked with reasons"],
  ["Unverified profiles, word of mouth", "ID, credentials and employer-confirmed experience"],
  ["Cash in hand, no receipts", "UPI escrow, GST invoices, refunds by policy"],
  ["No idea when the tutor arrives", "OTP check-in, live tracking and an SOS desk"],
  ["Random PDFs, no lesson plan", "AI lesson plans, papers and class recaps"],
  ["Progress? Wait for the exam", "Progress passport and a weekly parent digest"],
];

const FAQ: [string, string][] = [
  ["How are tutors verified?", "Every tutor completes an eight-step check: government ID with a selfie match, degree and teaching certificates, and work experience confirmed directly by the employer through a signed link. Home-visit tutors also need a police verification certificate and safety training. A human verifier approves each item — AI only flags."],
  ["How does home-tuition safety work?", "Location is shared only from “On my way” until check-out. The tutor checks in with a 4-digit code you share at the door, a geofence confirms arrival, and alerts fire for lateness, leaving the safe zone or no check-in. SOS reaches our safety desk, your trusted contacts and the emergency number 112."],
  ["Which boards and grades do you cover?", "CBSE, ICSE/ISC, state boards, NIOS, IB, Cambridge and American curricula from Pre-KG to Grade 12, plus JEE, NEET, CUET and Olympiad preparation. Only verified syllabi are used to generate lesson plans and question papers — nothing is invented."],
  ["How do payments and refunds work?", "Pay by UPI, card, netbanking or wallet. Money is held in escrow and released to the tutor only after the session and a 24-hour dispute window. Cancellations follow a clear policy, and refunds go back to the original payment method."],
  ["What does the AI tutor do — and not do?", "Maya explains step by step in your child's language, writes on a whiteboard and checks understanding. She never hands over graded homework answers, says so when unsure and offers the human tutor. Parents can read every transcript, and a wellbeing protocol alerts you if your child needs help."],
  ["Can my child join live classes safely?", "Classes run in a waiting room where only the tutor can admit, mute or remove people. Sign-in or guardian-approved invitations are required for minors, recording is off by default and needs consent, and parents can observe."],
  ["Is there a free trial?", "Yes — the first 20-minute demo class with each tutor is free (limited per student). You can also explore every role right now with a one-tap demo."],
  ["How is my family's data protected?", "We follow India's DPDP Act: verifiable parental consent, minimum data, no advertising to children, addresses shown to tutors only after a confirmed booking, and short retention for location data. Every sensitive action is audit-logged."],
];

/* ------------------------------------------------------------------ */
/* reveal-on-scroll                                                    */
/* ------------------------------------------------------------------ */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".hm-reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
}

const H2 = ({ children, light, className }: { children: React.ReactNode; light?: boolean; className?: string }) => (
  <h2 className={clsx("font-display font-extrabold text-[34px] sm:text-[44px] leading-[1.04] hm-reveal", light ? "text-white" : "text-[#0F1B3D]", className)}>{children}</h2>
);
const Accent = ({ children, warm }: { children: React.ReactNode; warm?: boolean }) => <span className={warm ? "text-[#FFB067]" : "text-[#F26B1D]"}>{children}</span>;

/* ================================================================== */

export function Landing() {
  useReveal();
  const [drawer, setDrawer] = useState<{ open: boolean; mode: "login" | "register" | "demo"; role?: Role }>({ open: false, mode: "login" });
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [stats, setStats] = useState({ tutors: 0, students: 0, sessions: 0, avgRating: 4.8 });
  const [tour, setTour] = useState(false);

  useEffect(() => {
    fetch("/api/public/summary")
      .then((r) => r.json())
      .then((j) => {
        if (j?.data) {
          setFeatured(j.data.featured);
          setStats(j.data.stats);
        }
      })
      .catch(() => {});
  }, []);

  /* arriving with a referral link opens sign-up straight away */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ref")) setDrawer({ open: true, mode: "register", role: "parent" });
  }, []);

  const openAuth = useCallback((mode: "login" | "register" | "demo", role?: Role) => setDrawer({ open: true, mode, role }), []);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-white text-[#0F1B3D] overflow-x-clip">
      <Nav openAuth={openAuth} go={go} />

      {/* ============================ HERO ============================ */}
      <section className="relative isolate pt-[92px] lg:pt-[104px]" aria-labelledby="hero-title">
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(900px 520px at 8% 100%, rgba(255,186,150,.42), transparent 60%), radial-gradient(900px 600px at 95% 0%, rgba(196,210,240,.75), transparent 60%), linear-gradient(180deg,#F6F8FC 0%,#EEF2F9 100%)" }} />
        <div className="absolute inset-0 -z-10 hm-grid-bg [mask-image:linear-gradient(180deg,black,transparent_85%)]" />
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-8 items-center pb-16 lg:pb-20 pt-6 lg:pt-10">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 pl-1 pr-3.5 py-1 rounded-full bg-white border border-[#E1E7F2] shadow-sm hm-reveal">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0F1B3D] text-white text-[10.5px] font-extrabold tracking-[.12em]"><span className="w-1.5 h-1.5 rounded-full bg-[#F26B1D]" /> TUTOR AMMA</span>
              <span className="text-[12.5px] font-semibold text-[#2A3557]">One app for every learning role</span>
            </div>
            <h1 id="hero-title" className="font-display font-extrabold text-[44px] sm:text-[58px] xl:text-[66px] leading-[1] mt-6 hm-reveal">
              <span className="whitespace-nowrap">Your child&apos;s</span> learning.
              <br />
              <span className="hm-hl relative z-0">In safe hands.</span>
            </h1>
            <p className="text-[16px] sm:text-[18px] leading-relaxed text-[#4A5578] mt-6 max-w-[560px] mx-auto lg:mx-0 hm-reveal">
              Verified tutors for your exact board and grade — online, at home or in a group. Live classes, an AI tutor, OTP-protected home visits and escrow payments, all in one place.
            </p>
            <div className="flex flex-wrap gap-3 mt-8 justify-center lg:justify-start hm-reveal">
              <button className="hm-btn-dark" onClick={() => openAuth("register", "parent")}>Find a verified tutor <ArrowRight className="w-4 h-4" /></button>
              <button className="hm-btn-light" onClick={() => openAuth("demo")}>Explore the platform</button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 justify-center lg:justify-start text-[13.5px] font-semibold text-[#2A3557] hm-reveal">
              {["Free demo class", "Verified tutors only", "Pay safely with escrow"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-[#E3F5EB] flex items-center justify-center"><Check className="w-3 h-3 text-[#1F9D6B]" strokeWidth={3} /></span>{t}</span>
              ))}
            </div>
          </div>
          <div className="hm-reveal"><HeroShowcase /></div>
        </div>

        {/* marquee */}
        <div className="border-y border-[#E6EBF5] bg-white/70 backdrop-blur overflow-hidden">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-4 flex items-center gap-6">
            <span className="shrink-0 text-[11px] font-extrabold tracking-[.16em] text-[#6B7593]">ONE APP FOR</span>
            <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
              <div className="hm-marquee">
                {[...MODULES, ...MODULES].map((m, k) => (
                  <span key={k} className="flex items-center gap-6 pr-6 text-[14px] font-semibold text-[#0F1B3D] whitespace-nowrap">{m}<span className="w-1.5 h-1.5 rounded-full bg-[#F26B1D]" /></span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* built for India strip */}
        <div className="bg-[#0F1B3D]">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center gap-3 justify-between">
            <span className="text-[11px] font-extrabold tracking-[.16em] text-[#FFB067]">BUILT FOR INDIA</span>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map((b) => <span key={b} className="px-3 py-1 rounded-full border border-white/15 text-white/90 text-[12px] font-semibold">{b}</span>)}
              <span className="px-3 py-1 rounded-full bg-white/10 text-white/90 text-[12px] font-semibold flex items-center gap-1.5"><Languages className="w-3.5 h-3.5" /> {LANGS.join(" · ")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ PRODUCT TOUR ============================ */}
      <section id="platform" className="scroll-mt-20 py-20 sm:py-28">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[0.85fr_1.15fr] gap-12 items-center">
          <div>
            <span className="hm-eyebrow hm-reveal">Product tour</span>
            <H2 className="mt-4">See Tutor Amma in <Accent>30 seconds.</Accent></H2>
            <p className="text-[16px] text-[#4A5578] leading-relaxed mt-5 hm-reveal">A parent books a verified tutor, watches the home visit live, and reads the class recap — while the tutor runs the day and the AI studio does the paperwork.</p>
            <ul className="mt-6 space-y-3 hm-reveal">
              {["Curriculum-first search and one-tap booking", "OTP check-in, live tracking and SOS", "AI tutor, lesson plans and question papers"].map((t) => (
                <li key={t} className="flex items-center gap-3 text-[14.5px] font-semibold"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#F26B1D]" />{t}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 mt-8 hm-reveal">
              <button className="hm-btn-dark" onClick={() => setTour(true)}><Play className="w-4 h-4" /> Watch the tour</button>
              <button className="hm-btn-light" onClick={() => openAuth("demo")}>Try the live demo</button>
            </div>
          </div>
          <button className="group relative text-left hm-reveal" onClick={() => setTour(true)} aria-label="Play the 30-second product tour">
            <div className="rounded-[24px] bg-white border border-[#E1E7F2] shadow-[0_40px_90px_rgba(15,27,61,.18)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#EEF2F8]">
                <span className="flex gap-1.5">{[0, 1, 2].map((k) => <span key={k} className="w-2.5 h-2.5 rounded-full bg-[#E5E8EF]" />)}</span>
                <span className="ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3F6FB] text-[11.5px] text-[#6B7593]"><Lock className="w-3 h-3" /> tutoramma.app/dashboard</span>
              </div>
              <div className="relative aspect-[16/10] bg-[#F3F6FB]">
                <img src="/tour/01.jpg" alt="Tutor Amma student dashboard" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F1B3D]/35 via-transparent to-transparent" />
                <span className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-[#F26B1D] text-white flex items-center justify-center shadow-[0_0_0_12px_rgba(242,107,29,.22)] group-hover:scale-105 transition-transform"><Play className="w-8 h-8 ml-1" fill="currentColor" /></span>
                <span className="absolute left-4 bottom-4 px-3 py-1.5 rounded-full bg-[#0F1B3D]/85 text-white text-[12px] font-semibold">0:30 · Live product tour</span>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* ============================ BENTO ============================ */}
      <section id="features" className="scroll-mt-20 py-20 sm:py-24" style={{ background: "linear-gradient(180deg,#F5F7FC,#EEF2F9)" }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-8 items-end">
            <div className="border-l-[3px] border-[#F26B1D] pl-5">
              <span className="hm-eyebrow hm-reveal">Learning jobs · one app</span>
              <H2 className="mt-3">Built like learning <br /><Accent>actually happens.</Accent></H2>
            </div>
            <div className="hm-reveal">
              <p className="text-[15.5px] text-[#4A5578] leading-relaxed">Not another tutor directory. One connected platform — from the first search to the progress report — for families, tutors and the people who keep children safe.</p>
              <div className="flex gap-3 mt-5">
                {[["1", "App"], ["7", "Roles"], ["40+", "Modules"]].map(([n, l]) => (
                  <div key={l} className="px-5 py-3 rounded-2xl bg-white border border-[#E1E7F2] shadow-sm"><div className="font-display text-[22px] font-extrabold leading-none tracking-normal">{n}</div><div className="text-[10.5px] font-bold tracking-[.14em] text-[#6B7593] mt-1 uppercase">{l}</div></div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-5 mt-12">
            {/* 01 — dark hero card */}
            <div className="lg:col-span-7 lg:row-span-2 rounded-[28px] p-7 sm:p-9 text-white relative overflow-hidden min-h-[480px] flex flex-col hm-reveal" style={{ background: "radial-gradient(700px 400px at 80% 10%, rgba(242,107,29,.25), transparent 60%), linear-gradient(160deg,#16244F 0%,#0B1437 100%)" }}>
              <span className="text-[12px] font-bold text-white/60">01</span>
              <h3 className="font-display text-[34px] sm:text-[40px] font-extrabold mt-2 leading-tight">Find the right tutor</h3>
              <p className="text-white/75 text-[15px] mt-2 max-w-[460px]">Board → grade → subject → language → mode. Verified tutors ranked with plain reasons — never just keywords.</p>
              <div className="mt-6 inline-flex flex-wrap items-center gap-1.5 self-start rounded-2xl bg-white/[0.06] border border-white/10 p-1.5 pr-3 text-[12px]">
                <span className="px-2.5 py-1 rounded-xl bg-[#F26B1D] font-bold flex items-center gap-1"><Search className="w-3.5 h-3.5" /> Match</span>
                {["Grade 8", "CBSE", "Maths", "Hindi", "Evenings", "Home visit"].map((c) => <span key={c} className="px-2 py-1 rounded-lg bg-white/10 font-semibold">{c}</span>)}
              </div>
              <div className="mt-4 space-y-3 relative">
                {[
                  { n: "Meera Krishnan", h: "CBSE Maths & Science · 9 yrs", r: ["Board specialist", "Speaks Tamil", "2 km away"], c: "#F26B1D", s: "4.9" },
                  { n: "Nikita Deshpande", h: "IGCSE + CBSE English · 11 yrs", r: ["92% parents rebook", "Available 5 PM"], c: "#6D4AE0", s: "4.9" },
                  { n: "Arjun Rao", h: "JEE Physics · ex-coaching faculty · 7 yrs", r: ["Helped Grade 11 improve", "Free demo"], c: "#1F9D6B", s: "4.8" },
                ].map((t, k) => (
                  <div key={t.n} className={clsx("rounded-2xl bg-white/[0.08] border border-white/10 backdrop-blur p-4 flex gap-3 items-start", k === 1 && "sm:ml-8", k === 2 && "sm:ml-16 opacity-80")}>
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-[14px] shrink-0" style={{ background: t.c }}>{t.n.split(" ").map((x) => x[0]).join("")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-[14.5px]">{t.n} <BadgeCheck className="w-4 h-4 text-[#7EE2B0]" /> <span className="ml-auto text-[12px] flex items-center gap-0.5"><Star className="w-3.5 h-3.5 fill-[#FFB067] text-[#FFB067]" /> {t.s}</span></div>
                      <div className="text-[12.5px] text-white/65">{t.h}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">{t.r.map((x) => <span key={x} className="px-2 py-[3px] rounded-full bg-white/10 text-[11px] font-semibold">{x}</span>)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-7 flex flex-wrap items-center gap-2">
                {["Board", "Grade", "Subject"].map((c) => <span key={c} className="px-3 py-1 rounded-full bg-white/10 text-[12px] font-semibold">{c}</span>)}
                <button onClick={() => go("tutors")} className="ml-auto text-[13.5px] font-bold text-[#FFB067] inline-flex items-center gap-1">See how we match <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
            {/* 02 */}
            <BentoCard n="02" icon={CalendarDays} title="Plan every class" desc="Timetables for tutors, students and parents — travel buffers, exams and homework in one calendar." chips={["Timetable", "Homework", "Exams"]} className="lg:col-span-5" onMore={() => openAuth("demo")}>
              <div className="grid grid-cols-4 gap-1.5 text-[10.5px] font-bold text-center">
                {["MON", "TUE", "WED", "THU"].map((d) => <span key={d} className="text-[#8A93AB]">{d}</span>)}
                {["Math", "Sci", "", "Eng", "", "Visit", "Hin", "Math", "Quiz", "", "Sci", "Eng"].map((c, k) => (
                  <span key={k} className={clsx("rounded-lg py-1.5", c ? (c === "Visit" ? "bg-[#FFE7D6] text-[#D9580E]" : c === "Quiz" ? "bg-[#FDECEC] text-[#C03342]" : "bg-[#EEF2FA] text-[#22357F]") : "")}>{c}</span>
                ))}
              </div>
              <span className="inline-block mt-2 px-2.5 py-1 rounded-full bg-white border border-[#E6EBF5] text-[11px] font-bold">Conflict check · 0 clashes</span>
            </BentoCard>
            {/* 03 */}
            <BentoCard n="03" icon={Video} title="Teach online & at home" desc="A Meet-style classroom with waiting room, polls, quizzes and Concept Pulse — or a protected home visit." chips={["Live class", "Home visit", "Groups"]} className="lg:col-span-5" onMore={() => openAuth("demo", "tutor")}>
              <div className="grid grid-cols-3 gap-1.5">
                {["#F26B1D", "#315BE5", "#1F9D6B", "#6D4AE0", "#E8A20C", "#0F1B3D"].map((c, k) => (
                  <div key={k} className="aspect-video rounded-lg flex items-center justify-center text-white text-[10px] font-bold relative" style={{ background: `linear-gradient(160deg, ${c}, ${c}CC)` }}>{["MK", "AM", "IV", "RD", "DS", "KS"][k]}{k === 0 && <span className="absolute top-1 left-1 px-1 rounded bg-black/30 text-[8px]">Host</span>}</div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold"><span className="flex-1 h-1.5 rounded-full bg-[#E3F5EB] overflow-hidden"><span className="block h-full w-[78%] bg-[#1F9D6B]" /></span>78% got it</div>
            </BentoCard>
            {/* 04 dark money */}
            <div className="lg:col-span-4 rounded-[26px] p-7 text-white relative overflow-hidden hm-reveal" style={{ background: "linear-gradient(160deg,#16244F,#0B1437)" }}>
              <div className="flex justify-between items-start"><span className="text-[12px] font-bold text-white/55">04</span><span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-bold text-[#FFB067]">UPI · Cards · Escrow</span></div>
              <h3 className="font-display text-[24px] font-extrabold mt-3">Pay & get paid safely</h3>
              <p className="text-white/70 text-[13.5px] mt-1.5">Escrow holds every fee until the class is done; tutors get weekly payouts and GST-ready statements.</p>
              <div className="flex items-end gap-1.5 h-16 mt-5">{[30, 46, 38, 60, 54, 78, 92].map((h, k) => <span key={k} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: k > 4 ? "#F26B1D" : "rgba(255,255,255,.18)" }} />)}</div>
              <div className="flex gap-2 mt-4">{["Escrow", "Refunds", "Payouts"].map((c) => <span key={c} className="px-3 py-1 rounded-full bg-white/10 text-[11.5px] font-semibold">{c}</span>)}</div>
            </div>
            {/* 05 orbit safety */}
            <div id="safety" className="lg:col-span-4 hm-card p-7 relative overflow-hidden scroll-mt-24 hm-reveal">
              <div className="flex justify-between"><span className="text-[12px] font-bold text-[#8A93AB]">05</span><span className="w-10 h-10 rounded-xl bg-[#FDECEC] text-[#D64545] flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></span></div>
              <h3 className="font-display text-[24px] font-extrabold mt-1">Protect every home visit</h3>
              <p className="text-[#4A5578] text-[13.5px] mt-1.5">OTP check-in and check-out, geofenced arrival, live tracking only during the visit, SOS and a human safety desk.</p>
              <div className="relative mx-auto mt-4 w-[170px] h-[170px]">
                <div className="absolute inset-[18px] rounded-full border border-dashed border-[#D8E0ED]" />
                <div className="absolute inset-0 hm-orbit">
                  {[[MapPin, "0%", "50%"], [KeyRound, "50%", "0%"], [Siren, "100%", "50%"], [BadgeCheck, "50%", "100%"]].map(([I, l, t], k) => {
                    const Icon = I as React.ComponentType<{ className?: string }>;
                    return <span key={k} className="absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full bg-white border border-[#E6EBF5] shadow flex items-center justify-center text-[#0F1B3D]" style={{ left: l as string, top: t as string }}><Icon className="w-4 h-4" /></span>;
                  })}
                </div>
                <span className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#0F1B3D] text-white flex items-center justify-center shadow-[0_0_0_10px_rgba(15,27,61,.06)]"><HomeIcon className="w-7 h-7" /></span>
              </div>
            </div>
            {/* 06 parents */}
            <div className="lg:col-span-4 hm-card p-7 relative overflow-hidden hm-reveal">
              <div className="flex justify-between"><span className="text-[12px] font-bold text-[#8A93AB]">06</span><span className="w-10 h-10 rounded-xl bg-[#FFF1E6] text-[#F26B1D] flex items-center justify-center"><Heart className="w-5 h-5" /></span></div>
              <h3 className="font-display text-[24px] font-extrabold mt-1">Keep parents close</h3>
              <p className="text-[#4A5578] text-[13.5px] mt-1.5">Recaps, progress passport, PTM booking and a weekly digest — on the app and WhatsApp.</p>
              <div className="mt-4 rounded-2xl bg-[#0F1B3D] p-3 space-y-2 max-w-[230px] ml-auto">
                <div className="rounded-xl bg-white px-3 py-2 text-[11.5px] font-semibold flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D6B]" /> Checked in · 5:02 PM</div>
                <div className="rounded-xl bg-white px-3 py-2 text-[11.5px] font-semibold flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[#6D4AE0]" /> Recap: Factorisation</div>
                <div className="rounded-xl bg-white/15 text-white px-3 py-2 text-[11.5px] font-semibold flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5" /> Weekly digest sent</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ WHY SWITCH ============================ */}
      <WhySwitch onCta={() => go("features")} />

      {/* ============================ AI BAND ============================ */}
      <section id="ai" className="scroll-mt-20 py-20 sm:py-28 text-white" style={{ background: "radial-gradient(900px 500px at 90% 0%, rgba(242,107,29,.16), transparent 60%), linear-gradient(180deg,#0F1B3D,#0A1330)" }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[0.9fr_1.1fr] gap-12">
          <div>
            <span className="hm-eyebrow !text-white/60 hm-reveal">AI · built in, not bolted on</span>
            <H2 light className="mt-4">AI that already knows <br /><Accent warm>your child.</Accent></H2>
            <p className="text-white/70 text-[16px] leading-relaxed mt-5 hm-reveal">Every AI feature reads the same learning record your tutor uses — so it starts from facts, not a blank form. Humans approve everything.</p>
            <div className="mt-8 rounded-[22px] border border-white/10 bg-white/[0.04] p-5 hm-reveal">
              <div className="text-[11px] font-extrabold tracking-[.16em] text-[#FFB067]">ONE LEARNING RECORD</div>
              <div className="flex flex-wrap gap-2 mt-3">{["Attendance", "Quiz scores", "Homework", "Topics", "Visits", "Goals"].map((c) => <span key={c} className="px-3 py-1.5 rounded-full border border-white/15 text-[13px] text-white/85">{c}</span>)}</div>
              <div className="flex items-center gap-2 mt-4 text-[13px] font-semibold text-white/85"><Sparkles className="w-4 h-4 text-[#FFB067]" /> Suggestions your tutor can explain</div>
            </div>
            <button className="hm-btn-orange mt-8 hm-reveal" onClick={() => openAuth("demo", "student")}>Meet Maya, the AI tutor <ArrowRight className="w-4 h-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              [BrainCircuit, "Live AI Tutor · Maya", "Talks, listens and writes on a whiteboard in six Indian languages — never hands over graded answers."],
              [UserCog, "Teaching Coach", "A learning profile for every student, a plan that fits them, and role-play with a simulated learner."],
              [BookOpenCheck, "Lesson plans (5E)", "Board-aware plans with explanations, board work and differentiation — converted to worksheets in one tap."],
              [FileText, "Question papers", "Blueprint-balanced papers with sets A–C, seating-aware allotment and separate answer keys."],
              [Sparkles, "Smart class recap", "Topics, homework and next steps drafted minutes after class — the tutor approves, parents receive."],
              [ScanLine, "Doubt scanner", "Photograph a problem and get step-by-step help grounded in the syllabus."],
            ].map(([I, t, d], k) => {
              const Icon = I as React.ComponentType<{ className?: string }>;
              return (
                <div key={k} className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6 hover:bg-white/[0.07] transition-colors hm-reveal" style={{ transitionDelay: `${k * 60}ms` }}>
                  <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#FFB067]"><Icon className="w-5 h-5" /></span>
                  <h3 className="font-display text-[19px] font-bold mt-4">{t as string}</h3>
                  <p className="text-white/60 text-[13.5px] leading-relaxed mt-1.5">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================ ACADEMIES (white-label) ============================ */}
      <Academies onRegister={() => openAuth("register", "institute")} />

      {/* ============================ WHO IT'S FOR ============================ */}
      <section className="py-20 sm:py-24" style={{ background: "linear-gradient(180deg,#F5F7FC,#EEF2F9)" }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-8 items-end">
            <div className="border-l-[3px] border-[#F26B1D] pl-5">
              <span className="hm-eyebrow hm-reveal">Who it&apos;s for</span>
              <H2 className="mt-3">Made for everyone who <br /><Accent>helps a child learn.</Accent></H2>
            </div>
            <p className="text-[15.5px] text-[#4A5578] leading-relaxed hm-reveal">Tutor Amma is built for the people responsible for learning, money and trust — so families get results without a pile of apps and WhatsApp groups.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 rounded-[26px] bg-white border border-[#E6EBF5] shadow-[0_18px_50px_rgba(15,27,61,.06)] overflow-hidden hm-reveal">
            {[
              [Baby, "Parents", "Book verified tutors, watch visits live, pay safely, see progress.", "parent"],
              [GraduationCap, "Students", "Classes, homework, an AI tutor, flashcards and a focus timer.", "student"],
              [UserCog, "Tutors & teachers", "A verified profile, a full calendar, AI studio and fast payouts.", "tutor"],
              [Landmark, "Institutes", "Batches, tutor rosters, revenue and branded reports.", "institute"],
              [Radar, "Safety & operations", "Verification queue, Control Tower, disputes and compliance.", "safety"],
            ].map(([I, t, d, r], k) => {
              const Icon = I as React.ComponentType<{ className?: string }>;
              return (
                <button key={k} onClick={() => openAuth("demo", r as Role)} className="text-left p-6 border-b sm:border-r border-[#EEF2F8] last:border-r-0 hover:bg-[#FAFBFE] transition-colors group">
                  <span className="w-10 h-10 rounded-xl bg-[#F3F6FB] flex items-center justify-center text-[#0F1B3D] group-hover:bg-[#0F1B3D] group-hover:text-white transition-colors"><Icon className="w-5 h-5" /></span>
                  <div className="font-display text-[17px] font-bold mt-4 tracking-normal">{t as string}</div>
                  <div className="text-[13px] text-[#6B7593] leading-relaxed mt-1">{d as string}</div>
                  <div className="text-[12.5px] font-bold text-[#F26B1D] mt-3 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">Try this role <ArrowRight className="w-3.5 h-3.5" /></div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================ TUTORS ============================ */}
      <Tutors featured={featured} stats={stats} onFind={() => openAuth("register", "parent")} />

      {/* ============================ FAQ ============================ */}
      <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[0.8fr_1.2fr] gap-12">
          <div className="lg:sticky lg:top-28 self-start">
            <div className="border-l-[3px] border-[#F26B1D] pl-5">
              <span className="hm-eyebrow hm-reveal">FAQ · before you start</span>
              <H2 className="mt-3">Questions families <br /><Accent>ask before they book</Accent></H2>
            </div>
            <p className="text-[15px] text-[#4A5578] leading-relaxed mt-5 hm-reveal">Short answers on safety, payments and the AI tutor. Still curious? Book a walkthrough and we&apos;ll show you with your child&apos;s syllabus.</p>
            <div className="flex gap-5 mt-5 text-[13.5px] font-bold hm-reveal">
              <button className="underline underline-offset-4 decoration-[#F26B1D]" onClick={() => go("demo")}>Book a walkthrough</button>
              <button className="underline underline-offset-4 decoration-[#F26B1D]" onClick={() => openAuth("demo")}>Try the demo</button>
            </div>
          </div>
          <FaqList />
        </div>
      </section>

      {/* ============================ CTA BAND ============================ */}
      <section className="bg-[#0F1B3D]">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-10 flex flex-col md:flex-row md:items-center gap-5 justify-between">
          <div>
            <div className="text-[11px] font-extrabold tracking-[.16em] text-white/50">FOR FAMILIES · TUTORS · INSTITUTES</div>
            <div className="font-display text-[26px] sm:text-[30px] font-extrabold text-white mt-1">See Tutor Amma with <span className="text-[#FFB067] underline decoration-[#F26B1D] decoration-4 underline-offset-[6px]">your child&apos;s syllabus.</span></div>
          </div>
          <div className="flex gap-3">
            <button className="hm-btn-orange" onClick={() => go("demo")}>Book a free demo <ArrowRight className="w-4 h-4" /></button>
            <button className="hm-btn-light !bg-transparent !text-white !border-white/25" onClick={() => openAuth("demo")}>Explore platform</button>
          </div>
        </div>
      </section>

      {/* ============================ DEMO FORM ============================ */}
      <DemoForm />

      <Footer go={go} openAuth={openAuth} />

      {/* floating help */}
      <button onClick={() => go("demo")} className="fixed right-5 bottom-5 z-50 w-14 h-14 rounded-full bg-[#1FAF5B] text-white shadow-[0_12px_30px_rgba(31,175,91,.45)] flex items-center justify-center hover:scale-105 transition-transform" aria-label="Talk to us">
        <MessageCircle className="w-6 h-6" />
      </button>

      {tour && <TourModal onClose={() => setTour(false)} onTry={() => { setTour(false); openAuth("demo"); }} />}
      <AuthDrawer open={drawer.open} mode={drawer.mode} role={drawer.role} onClose={() => setDrawer((d) => ({ ...d, open: false }))} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* nav                                                                 */
/* ------------------------------------------------------------------ */
function Nav({ openAuth, go }: { openAuth: (m: "login" | "register" | "demo", r?: Role) => void; go: (id: string) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [feat, setFeat] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const link = (id: string, label: string) => (
    <button key={label} onClick={() => { go(id); setMenu(false); }} className="px-3.5 py-2 rounded-xl text-[14px] font-medium text-[#2A3557] hover:text-[#0F1B3D] hover:bg-[#F3F6FB] transition-colors">{label}</button>
  );
  return (
    <header className={clsx("fixed top-0 inset-x-0 z-[60] transition-all", scrolled ? "bg-white/90 backdrop-blur-xl border-b border-[#E6EBF5] shadow-[0_6px_24px_rgba(15,27,61,.05)]" : "bg-white/70 backdrop-blur")}>
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 h-[72px] flex items-center gap-4">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Tutor Amma home" className="shrink-0">
          <img src="/brand/logo-full.png" alt="Tutor Amma — Key to Success" className="h-9 sm:h-10 w-auto" />
        </button>
        <nav className="hidden lg:flex items-center gap-0.5 ml-4" aria-label="Main">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="px-3.5 py-2 rounded-xl text-[14px] font-semibold bg-[#EEF3FB] text-[#0F1B3D]">Home</button>
          {link("platform", "Platform")}
          <div className="relative" onMouseEnter={() => setFeat(true)} onMouseLeave={() => setFeat(false)}>
            <button className="px-3.5 py-2 rounded-xl text-[14px] font-medium text-[#2A3557] hover:bg-[#F3F6FB] inline-flex items-center gap-1" onClick={() => setFeat((f) => !f)} aria-expanded={feat}>Features <ChevronDown className="w-4 h-4" /></button>
            {feat && (
              <div className="absolute left-0 top-full pt-2">
                <div className="w-[300px] rounded-2xl bg-white border border-[#E6EBF5] shadow-[0_24px_60px_rgba(15,27,61,.14)] p-2 hm-swap">
                  {FEATURE_LINKS.map((f) => (
                    <button key={f.label} onClick={() => { go(f.id); setFeat(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F5F7FC] text-left">
                      <span className="w-8 h-8 rounded-lg bg-[#F3F6FB] flex items-center justify-center text-[#0F1B3D]"><f.icon className="w-4 h-4" /></span>
                      <span className="text-[13.5px] font-semibold">{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {link("safety", "Safety")}
          {link("academies", "For institutes")}
          {link("faq", "FAQ")}
          {link("demo", "Contact")}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button className="hidden sm:inline-flex px-4 py-2.5 rounded-xl border border-[#DDE4F0] text-[14px] font-semibold hover:border-[#C3CDE2]" onClick={() => openAuth("login")}>Login</button>
          <button className="hidden md:inline-flex px-4 py-2.5 rounded-xl border border-[#DDE4F0] text-[14px] font-semibold hover:border-[#C3CDE2]" onClick={() => openAuth("register", "tutor")}>Become a tutor</button>
          <button className="hidden sm:inline-flex hm-btn-dark !py-2.5 !px-4 !text-[14px]" onClick={() => go("demo")}>Book a demo</button>
          <button className="lg:hidden p-2.5 rounded-xl hover:bg-[#F3F6FB]" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>{menu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
      </div>
      {menu && (
        <div className="lg:hidden border-t border-[#E6EBF5] bg-white px-5 py-4 flex flex-col gap-1 hm-swap">
          {link("platform", "Platform")}
          {link("features", "Features")}
          {link("safety", "Safety")}
          {link("ai", "AI tutor")}
          {link("academies", "For institutes")}
          {link("faq", "FAQ")}
          {link("demo", "Contact")}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button className="hm-btn-light justify-center" onClick={() => { setMenu(false); openAuth("login"); }}>Login</button>
            <button className="hm-btn-dark justify-center" onClick={() => { setMenu(false); openAuth("register", "parent"); }}>Get started</button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* bento card                                                          */
/* ------------------------------------------------------------------ */
function BentoCard({ n, icon: Icon, title, desc, chips, className, children, onMore }: { n: string; icon: React.ComponentType<{ className?: string }>; title: string; desc: string; chips: string[]; className?: string; children?: React.ReactNode; onMore: () => void }) {
  return (
    <div className={clsx("hm-card p-7 grid sm:grid-cols-[1fr_200px] gap-5 hm-reveal", className)}>
      <div className="flex flex-col">
        <div className="flex items-center justify-between"><span className="text-[12px] font-bold text-[#8A93AB]">{n}</span><span className="w-10 h-10 rounded-xl bg-[#F3F6FB] flex items-center justify-center text-[#0F1B3D] sm:hidden"><Icon className="w-5 h-5" /></span></div>
        <h3 className="font-display text-[22px] font-extrabold mt-1">{title}</h3>
        <p className="text-[#4A5578] text-[13.5px] leading-relaxed mt-1.5">{desc}</p>
        <div className="flex flex-wrap gap-1.5 mt-4">{chips.map((c) => <span key={c} className="px-3 py-1 rounded-full bg-[#F1F4FA] text-[12px] font-semibold">{c}</span>)}</div>
        <button onClick={onMore} className="mt-auto pt-4 text-[13px] font-bold inline-flex items-center gap-1 self-start">See it in action <ArrowRight className="w-3.5 h-3.5" /></button>
      </div>
      <div className="relative">
        <span className="hidden sm:flex absolute -top-1 -right-1 w-10 h-10 rounded-xl bg-[#F3F6FB] items-center justify-center text-[#0F1B3D] z-10"><Icon className="w-5 h-5" /></span>
        <div className="sm:mt-10 rounded-2xl bg-[#FAFBFE] border border-[#EEF2F8] p-3">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* why switch — scroll-driven comparison                               */
/* ------------------------------------------------------------------ */
function WhySwitch({ onCta }: { onCta: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      setP(Math.max(0, Math.min(1, (vh * 0.8 - r.top) / (r.height * 0.9))));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const switched = Math.min(SWITCH.length, Math.floor(p * (SWITCH.length + 1)));
  return (
    <section className="py-20 sm:py-28" id="compare">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-2 gap-8 items-end">
          <div className="border-l-[3px] border-[#F26B1D] pl-5">
            <span className="hm-eyebrow hm-reveal">Why families switch · 6 clear differences</span>
            <H2 className="mt-3">Why families switch <br />to <Accent>Tutor Amma</Accent></H2>
          </div>
          <p className="text-[15.5px] text-[#4A5578] leading-relaxed hm-reveal">Most families already have a tutor. The upgrade is not another app — it is one place that holds the tutor, the schedule, the payments and your child&apos;s safety together.</p>
        </div>
        <div ref={ref} className="mt-12 rounded-[26px] bg-white border border-[#E6EBF5] shadow-[0_24px_60px_rgba(15,27,61,.07)] overflow-hidden">
          <div className="grid grid-cols-[1fr_40px_1fr] px-4 sm:px-6 py-4 text-[11px] font-extrabold tracking-[.16em] text-[#8A93AB] border-b border-[#EEF2F8]">
            <span>THE USUAL WAY</span>
            <span />
            <span className="flex items-center gap-2 text-[#F26B1D]">TUTOR AMMA <span className="px-2 py-[2px] rounded-full bg-[#FFF1E6] tracking-normal text-[10.5px]">{switched}/{SWITCH.length} switched</span></span>
          </div>
          <div className="relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -ml-px bg-[#EEF2F8]" />
            <div className="absolute left-1/2 top-0 w-[2px] -ml-px bg-[#F26B1D] transition-all duration-300" style={{ height: `${(switched / SWITCH.length) * 100}%` }} />
            {SWITCH.map(([a, b], k) => {
              const on = k < switched;
              return (
                <div key={k} className={clsx("grid grid-cols-[1fr_40px_1fr] items-center px-4 sm:px-6 py-4 transition-colors duration-500", on && "bg-gradient-to-r from-[#FFF8F4] via-[#FFF3EC] to-transparent")}>
                  <span className={clsx("flex items-center gap-3 text-[13.5px] sm:text-[14.5px] transition-all duration-500", on ? "text-[#A5AEC6] line-through" : "text-[#4A5578]")}>
                    <span className="w-6 h-6 shrink-0 rounded-full bg-[#F1F4FA] flex items-center justify-center"><X className="w-3.5 h-3.5 text-[#8A93AB]" /></span>{a}
                  </span>
                  <span className="relative flex justify-center"><span className={clsx("w-3 h-3 rounded-full border-2 transition-all duration-500", on ? "bg-[#F26B1D] border-[#F26B1D] shadow-[0_0_0_6px_rgba(242,107,29,.15)]" : "bg-white border-[#D8E0ED]")} /></span>
                  <span className={clsx("flex items-center gap-3 text-[13.5px] sm:text-[14.5px] font-semibold transition-all duration-500", on ? "opacity-100 translate-x-0" : "opacity-25 translate-x-2")}>
                    <span className="w-6 h-6 shrink-0 rounded-full bg-[#FFF1E6] flex items-center justify-center"><Check className="w-3.5 h-3.5 text-[#F26B1D]" strokeWidth={3} /></span>{b}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hm-reveal">
          <div className="font-semibold text-[16px]">One app. Every role. Safe by design — from search to report card.</div>
          <button className="hm-btn-dark" onClick={onCta}>Compare every feature <ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* academies — white-label preview                                     */
/* ------------------------------------------------------------------ */
const ACADEMIES = [
  { name: "Bright Sparks Academy", short: "BS", color: "#7C2D12", url: "brightsparks.tutoramma.app", parent: "Mrs. Menon", child: "Aarav, Grade 8" },
  { name: "Vidya Tutorials", short: "VT", color: "#14532D", url: "vidya.tutoramma.app", parent: "Mr. Rao", child: "Diya, Grade 10" },
  { name: "Sunrise Maths Circle", short: "SM", color: "#1E3A8A", url: "sunrise.tutoramma.app", parent: "Ms. Iyer", child: "Kabir, Grade 6" },
];
function Academies({ onRegister }: { onRegister: () => void }) {
  const [a, setA] = useState(0);
  const ac = ACADEMIES[a];
  return (
    <section id="academies" className="scroll-mt-20 py-20 sm:py-28">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <span className="hm-eyebrow hm-reveal">For institutes &amp; tutors</span>
          <H2 className="mt-4">Looks like <Accent>your academy.</Accent><br />Not like a marketplace.</H2>
          <p className="text-[15.5px] text-[#4A5578] leading-relaxed mt-5 hm-reveal">Set your name, colours and sender details once. From then on, every page, receipt and message carries your academy&apos;s identity — with Tutor Amma&apos;s safety and payments underneath.</p>
          <div className="mt-7 space-y-5">
            {[
              [Globe, "Your own profile link", `Families open ${ac.url} — share it on WhatsApp or print the QR.`],
              [Palette, "Your colours & receipts", "Your logo and colours on every screen, fee receipt and progress report."],
              [MessageCircle, "Messages from your name", "Class links, reminders and recaps arrive from your academy."],
              [Receipt, "Escrow-safe payments", "UPI, cards and netbanking with GST-ready invoices and weekly payouts."],
            ].map(([I, t, d], k) => {
              const Icon = I as React.ComponentType<{ className?: string }>;
              return (
                <div key={k} className="flex gap-4 hm-reveal">
                  <span className="w-10 h-10 rounded-xl bg-[#F3F6FB] flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                  <div><div className="font-bold text-[15px]">{t as string}</div><div className="text-[13.5px] text-[#6B7593] mt-0.5">{d as string}</div></div>
                </div>
              );
            })}
          </div>
          <button className="hm-btn-dark mt-8 hm-reveal" onClick={onRegister}>Register your academy <ArrowRight className="w-4 h-4" /></button>
        </div>
        <div className="hm-reveal">
          <div className="text-[11px] font-extrabold tracking-[.16em] text-[#8A93AB]">PREVIEW AS</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {ACADEMIES.map((x, k) => (
              <button key={x.name} onClick={() => setA(k)} className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] font-semibold transition-all", k === a ? "border-[#0F1B3D] bg-white shadow-sm" : "border-[#E1E7F2] text-[#4A5578]")}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: x.color }} /> {x.name}
              </button>
            ))}
          </div>
          <div key={a} className="hm-swap mt-4 rounded-[24px] bg-white border border-[#E1E7F2] shadow-[0_40px_90px_rgba(15,27,61,.14)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#EEF2F8]">
              <span className="flex gap-1.5">{[0, 1, 2].map((k) => <span key={k} className="w-2.5 h-2.5 rounded-full bg-[#E5E8EF]" />)}</span>
              <span className="ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3F6FB] text-[11.5px] text-[#6B7593]"><Lock className="w-3 h-3" /> https://{ac.url}</span>
            </div>
            <div className="px-5 py-4 flex items-center gap-3 text-white" style={{ background: ac.color }}>
              <span className="w-10 h-10 rounded-full bg-white text-[13px] font-extrabold flex items-center justify-center" style={{ color: ac.color }}>{ac.short}</span>
              <div><div className="font-bold">{ac.name}</div><div className="text-[12px] opacity-80">Parent portal</div></div>
            </div>
            <div className="p-5">
              <div className="text-[13.5px] font-semibold">Welcome back, {ac.parent} · <span className="text-[#6B7593] font-normal">{ac.child}</span></div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[[CheckCircle2, "96%", "Attendance"], [BookOpenCheck, "2 due", "Homework"], [CalendarDays, "Fri", "Next PTM"]].map(([I, v, l], k) => {
                  const Icon = I as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                  return (
                    <div key={k} className="rounded-2xl border border-[#EEF2F8] p-3 border-t-[3px]" style={{ borderTopColor: ac.color }}>
                      <Icon className="w-4 h-4" style={{ color: ac.color }} />
                      <div className="font-display text-[20px] font-extrabold mt-1 tracking-normal">{v as string}</div>
                      <div className="text-[11px] text-[#6B7593]">{l as string}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-2xl p-4 flex items-center justify-between" style={{ background: `${ac.color}10` }}>
                <div><div className="text-[13.5px] font-bold">Batch fee · ₹2,400</div><div className="text-[11.5px] text-[#6B7593]">Due in 5 days · held in escrow</div></div>
                <span className="px-4 py-2 rounded-full text-white text-[12px] font-bold" style={{ background: ac.color }}>Pay now</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div key={`r${a}`} className="hm-swap rounded-[20px] bg-white border border-[#E1E7F2] p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[12px] font-bold"><span className="w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center" style={{ background: ac.color }}>{ac.short}</span>{ac.name}</div>
              <div className="text-[10.5px] text-[#8A93AB] mt-0.5">Fee receipt · R-2041</div>
              <div className="flex items-center justify-between mt-3"><span className="font-display text-[22px] font-extrabold tracking-normal">₹2,400</span><span className="px-2 py-0.5 rounded-md border-2 text-[10px] font-extrabold" style={{ borderColor: ac.color, color: ac.color }}>PAID</span></div>
              <div className="text-[11px] text-[#1F9D6B] mt-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Paid by UPI · GST invoice ready</div>
            </div>
            <div key={`m${a}`} className="hm-swap rounded-[20px] bg-white border border-[#E1E7F2] p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[12px] font-bold"><span className="w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center" style={{ background: ac.color }}>{ac.short}</span>{ac.name}</div>
              <div className="mt-2 rounded-xl bg-[#E7F8EE] p-2.5 text-[11.5px] leading-snug">Fee of ₹2,400 received for {ac.child.split(",")[0]}. Your receipt is in the parent portal. Thank you!</div>
              <div className="flex gap-1.5 mt-2 text-[10px] text-[#6B7593]">{["WhatsApp", "SMS", "Email"].map((c) => <span key={c} className="px-1.5 py-0.5 rounded border border-[#E6EBF5]">{c}</span>)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* featured tutors + curriculum search                                 */
/* ------------------------------------------------------------------ */
function Tutors({ featured, stats, onFind }: { featured: Featured[]; stats: { tutors: number; students: number; sessions: number; avgRating: number }; onFind: () => void }) {
  const [s, setS] = useState({ board: "CBSE", subject: "Mathematics", mode: "online" });
  const find = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ta_search_pref", JSON.stringify(s));
    } catch {}
    toast({ title: "Search saved", description: `Create a free account to see ${s.board} · ${s.subject} tutors.` });
    onFind();
  };
  return (
    <section id="tutors" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
        <div className="text-center max-w-[720px] mx-auto">
          <span className="hm-eyebrow hm-reveal">Verified tutors</span>
          <H2 className="mt-3">Meet tutors families <Accent>trust.</Accent></H2>
        </div>
        <form onSubmit={find} className="mt-10 mx-auto max-w-[860px] rounded-[22px] bg-white border border-[#E1E7F2] shadow-[0_24px_60px_rgba(15,27,61,.08)] p-3 grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 hm-reveal">
          {[
            ["board", ["CBSE", "ICSE", "State Board", "IB", "IGCSE", "NIOS"]],
            ["subject", ["Mathematics", "Science", "English", "Physics", "Chemistry", "Biology", "Hindi", "Social Science"]],
            ["mode", ["online", "home", "group"]],
          ].map(([k, opts]) => (
            <label key={k as string} className="rounded-2xl bg-[#F5F7FC] px-4 py-2">
              <span className="block text-[10.5px] font-extrabold tracking-[.14em] text-[#8A93AB] uppercase">{k as string}</span>
              <select className="w-full bg-transparent text-[14.5px] font-semibold outline-none capitalize" value={s[k as keyof typeof s]} onChange={(e) => setS({ ...s, [k as string]: e.target.value })}>
                {(opts as string[]).map((o) => <option key={o} value={o}>{o === "home" ? "Home tuition" : o === "group" ? "Group batch" : o}</option>)}
              </select>
            </label>
          ))}
          <button className="hm-btn-orange justify-center"><Search className="w-4 h-4" /> Find tutors</button>
        </form>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {(featured.length ? featured : Array.from({ length: 4 }).map(() => null)).map((t, k) =>
            t ? (
              <div key={t.id} className="hm-card p-5 hover:-translate-y-1 transition-transform hm-reveal" style={{ transitionDelay: `${k * 70}ms` }}>
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl text-white font-bold flex items-center justify-center" style={{ background: t.color }}>{t.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-[15px] flex items-center gap-1 truncate">{t.name} <BadgeCheck className="w-4 h-4 text-[#1F9D6B] shrink-0" /></div>
                    <div className="text-[12px] text-[#6B7593] flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-[#F26B1D] text-[#F26B1D]" /> {t.rating} · {t.reviews} reviews</div>
                  </div>
                </div>
                <p className="text-[13px] text-[#4A5578] mt-3 line-clamp-2 min-h-[38px]">{t.headline}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">{t.badges.slice(0, 2).map((b) => <span key={b} className="px-2 py-[3px] rounded-full bg-[#E9F7EF] text-[#1F7A55] text-[10.5px] font-bold">{b}</span>)}</div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#EEF2F8] text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-[#6B7593]">{t.modes.includes("online") && <Video className="w-4 h-4" />}{t.modes.includes("home") && <MapPin className="w-4 h-4" />}{t.modes.includes("group") && <Users className="w-4 h-4" />} {t.years}y exp</span>
                  <span className="font-bold">₹{Math.round((t.rateOnline || t.rateHome) / 100).toLocaleString("en-IN")}<span className="text-[#8A93AB] font-medium">/hr</span></span>
                </div>
              </div>
            ) : (
              <div key={k} className="hm-card p-5 h-[220px] ta-shimmer" />
            )
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {[["Verified tutors", stats.tutors], ["Learners", stats.students], ["Sessions booked", stats.sessions], ["Average rating", stats.avgRating]].map(([l, v]) => (
            <div key={l as string} className="text-center rounded-[22px] border border-[#E6EBF5] py-6 hm-reveal">
              <div className="font-display text-[34px] font-extrabold tracking-normal">{v as number}</div>
              <div className="text-[12px] font-bold tracking-[.12em] uppercase text-[#8A93AB] mt-1">{l as string}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ accordion                                                       */
/* ------------------------------------------------------------------ */
function FaqList() {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {FAQ.map(([q, a], k) => (
        <div key={q} className={clsx("rounded-[20px] border transition-all hm-reveal", open === k ? "border-[#F5C9AE] bg-[#FFFAF6] shadow-[0_12px_30px_rgba(242,107,29,.08)]" : "border-[#E6EBF5] bg-white")}>
          <button className="w-full flex items-center gap-4 px-5 py-4 text-left" onClick={() => setOpen(open === k ? -1 : k)} aria-expanded={open === k}>
            <span className="text-[12px] font-bold text-[#F26B1D] tabular">{String(k + 1).padStart(2, "0")}</span>
            <span className="flex-1 font-bold text-[15px]">{q}</span>
            <span className={clsx("w-7 h-7 rounded-lg flex items-center justify-center", open === k ? "bg-[#F26B1D] text-white" : "bg-[#F3F6FB]")}>{open === k ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</span>
          </button>
          <div className={clsx("grid transition-all duration-500", open === k ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
            <div className="overflow-hidden"><p className="px-5 pb-5 pl-[52px] text-[14px] text-[#4A5578] leading-relaxed">{a}</p></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* demo request form (leads)                                           */
/* ------------------------------------------------------------------ */
function DemoForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", city: "", role: "parent", grade: "", board: "CBSE", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, source: "home" }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message || "Please try again.");
      setDone(true);
    } catch (err) {
      toast({ title: "Couldn't send your request", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="demo" className="scroll-mt-16 py-20 sm:py-28 text-white" style={{ background: "radial-gradient(800px 500px at 0% 100%, rgba(242,107,29,.18), transparent 60%), linear-gradient(180deg,#111E44,#0A1330)" }}>
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <span className="hm-eyebrow !text-white/60 hm-reveal">Walkthrough · 20 minutes</span>
          <H2 light className="mt-4">Book a walkthrough <br />with <Accent warm>your learning goals</Accent></H2>
          <p className="text-white/70 text-[16px] leading-relaxed mt-5 hm-reveal">Board, grade, subjects, home or online — we show Tutor Amma against how your family or academy actually works. Not a generic slide deck.</p>
          <div className="mt-8 space-y-4 hm-reveal">
            {[[Clock, "Response within one business day"], [Lock, "Your details stay confidential"], [BookOpenCheck, "Demo on your board and grade"], [Languages, "English, Hindi and regional languages"]].map(([I, t], k) => {
              const Icon = I as React.ComponentType<{ className?: string }>;
              return <div key={k} className="flex items-center gap-3 text-[15px]"><span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#FFB067]"><Icon className="w-4 h-4" /></span>{t as string}</div>;
            })}
          </div>
        </div>
        <div className="rounded-[26px] bg-white text-[#0F1B3D] p-6 sm:p-8 shadow-[0_40px_90px_rgba(0,0,0,.35)] hm-reveal">
          {done ? (
            <div className="text-center py-10">
              <span className="w-16 h-16 rounded-full bg-[#E3F5EB] flex items-center justify-center mx-auto"><CheckCircle2 className="w-8 h-8 text-[#1F9D6B]" /></span>
              <h3 className="font-display text-[26px] font-extrabold mt-4">Request received</h3>
              <p className="text-[14px] text-[#6B7593] mt-2">A Tutor Amma specialist will contact you within one business day.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h3 className="font-display text-[24px] font-extrabold">Request your free demo</h3>
              <p className="text-[13px] text-[#6B7593] mt-1">A Tutor Amma specialist will follow up shortly.</p>
              <div className="grid sm:grid-cols-2 gap-3 mt-5">
                <label className="text-[12px] font-bold">Full name *<input required className="hm-input mt-1" placeholder="Priya Menon" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
                <label className="text-[12px] font-bold">Email *<input required type="email" className="hm-input mt-1" placeholder="you@example.com" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
                <label className="text-[12px] font-bold">Phone *<div className="flex gap-2 mt-1"><span className="hm-input !w-auto !px-3 text-[#6B7593]">+91</span><input required className="hm-input" inputMode="tel" placeholder="98765 43210" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div></label>
                <label className="text-[12px] font-bold">City<input className="hm-input mt-1" placeholder="Bengaluru" value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
                <label className="text-[12px] font-bold">I am a
                  <select className="hm-input mt-1" value={f.role} onChange={(e) => set("role", e.target.value)}>
                    <option value="parent">Parent</option><option value="student">Student</option><option value="tutor">Tutor / teacher</option><option value="institute">Institute / coaching centre</option><option value="school">School</option>
                  </select>
                </label>
                <label className="text-[12px] font-bold">Board &amp; grade
                  <div className="flex gap-2 mt-1">
                    <select className="hm-input" value={f.board} onChange={(e) => set("board", e.target.value)}>{["CBSE", "ICSE", "State", "IB", "IGCSE", "NIOS"].map((b) => <option key={b}>{b}</option>)}</select>
                    <select className="hm-input" value={f.grade} onChange={(e) => set("grade", e.target.value)}><option value="">Grade</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={`Grade ${i + 1}`}>{i + 1}</option>)}<option value="JEE/NEET">JEE/NEET</option></select>
                  </div>
                </label>
                <label className="text-[12px] font-bold sm:col-span-2">What would you like to see?<textarea className="hm-input mt-1 min-h-[80px] resize-y" placeholder="e.g. Home tuition for Grade 8 Maths with live tracking" value={f.message} onChange={(e) => set("message", e.target.value)} /></label>
              </div>
              <button className="hm-btn-orange w-full justify-center mt-5" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Request my free demo <ArrowRight className="w-4 h-4" /></button>
              <p className="text-[11.5px] text-[#8A93AB] mt-3 flex items-center gap-1.5 justify-center"><Lock className="w-3.5 h-3.5" /> Confidential. No spam. Used only to arrange your demo.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* product tour modal — real app screens, 30 seconds                   */
/* ------------------------------------------------------------------ */
const TOUR = [
  { src: "/tour/01.jpg", t: "Student home", d: "Classes, streaks, homework and the learning pulse in one view." },
  { src: "/tour/02.jpg", t: "Live AI Tutor · Maya", d: "Talks, listens and writes each step on the whiteboard." },
  { src: "/tour/03.jpg", t: "Classrooms you can share", d: "Link, QR and a 6-character join code — tutors approve every joiner." },
  { src: "/tour/04.jpg", t: "Home-visit Control Tower", d: "Every active visit, live — alerts reach a human in seconds." },
  { src: "/tour/05.jpg", t: "Parent-teacher meetings", d: "Book 10-minute slots with an AI meeting brief." },
  { src: "/tour/06.jpg", t: "Compliance & Rules", d: "Features open only after legal approves each country profile." },
];
function TourModal({ onClose, onTry }: { onClose: () => void; onTry: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => (i < TOUR.length - 1 ? setI(i + 1) : setPaused(true)), 5000);
    return () => clearTimeout(id);
  }, [i, paused]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(TOUR.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const s = TOUR[i];
  return (
    <div className="fixed inset-0 z-[80] bg-[#060C22]/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal aria-label="Product tour">
      <div className="w-full max-w-[1100px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1.5 mb-3">
          {TOUR.map((_, k) => (
            <button key={k} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden" onClick={() => { setI(k); setPaused(false); }} aria-label={`Slide ${k + 1}`}>
              <span className={clsx("block h-full bg-white origin-left", k < i ? "scale-x-100" : k === i ? (paused ? "scale-x-100" : "hm-progress") : "scale-x-0")} key={`${k}-${i}`} />
            </button>
          ))}
        </div>
        <div className="relative rounded-[20px] overflow-hidden bg-white shadow-2xl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <img key={s.src} src={s.src} alt={s.t} className="w-full h-auto block hm-swap" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 bg-gradient-to-t from-[#0F1B3D] via-[#0F1B3D]/80 to-transparent text-white">
            <div className="text-[12px] font-bold text-[#FFB067]">{String(i + 1).padStart(2, "0")} / {String(TOUR.length).padStart(2, "0")}</div>
            <div className="font-display text-[24px] sm:text-[30px] font-extrabold">{s.t}</div>
            <div className="text-white/80 text-[14px] sm:text-[15px]">{s.d}</div>
          </div>
        </div>
        <div className="flex justify-between items-center mt-4">
          <button className="text-white/80 text-[13px] font-semibold inline-flex items-center gap-1" onClick={onClose}><X className="w-4 h-4" /> Close</button>
          <button className="hm-btn-orange !py-2.5" onClick={onTry}>Try it live <ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* footer                                                              */
/* ------------------------------------------------------------------ */
function Footer({ go, openAuth }: { go: (id: string) => void; openAuth: (m: "login" | "register" | "demo", r?: Role) => void }) {
  const col = (title: string, items: [string, () => void][]) => (
    <div>
      <div className="text-[11px] font-extrabold tracking-[.16em] text-[#FFB067]">{title}</div>
      <ul className="mt-4 space-y-2.5">{items.map(([l, fn]) => <li key={l}><button onClick={fn} className="text-[14px] text-white/70 hover:text-white transition-colors text-left">{l}</button></li>)}</ul>
    </div>
  );
  return (
    <footer className="bg-[#0A1330] text-white border-t border-white/5">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-16 pb-10 grid lg:grid-cols-[1.3fr_repeat(4,1fr)] gap-10">
        <div>
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2"><img src="/brand/logo-full.png" alt="Tutor Amma" className="h-8 w-auto" /></div>
          <p className="text-[14px] text-white/60 leading-relaxed mt-5 max-w-[300px]">The verified tutor marketplace for India — live classrooms, safe home visits, an AI studio and a live AI tutor.</p>
          <div className="flex flex-wrap gap-2 mt-5">{["CBSE · ICSE · STATE", "JEE · NEET · CUET", "DPDP-AWARE", "ESCROW PAYMENTS"].map((c) => <span key={c} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10.5px] font-bold tracking-wider text-[#FFB067]">{c}</span>)}</div>
          <div className="mt-6 space-y-2 text-[13.5px] text-white/70">
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#FFB067]" /> Book a walkthrough using the form above</div>
            <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#FFB067]" /> Safety emergencies: call 112 · Childline 1098</div>
          </div>
        </div>
        {col("PRODUCT", [["Find a tutor", () => go("tutors")], ["Home-visit safety", () => go("safety")], ["Live classes", () => go("features")], ["AI tutor & studio", () => go("ai")], ["Product tour", () => go("platform")]])}
        {col("SOLUTIONS", [["For parents", () => openAuth("register", "parent")], ["For students", () => openAuth("register", "student")], ["For tutors", () => openAuth("register", "tutor")], ["For institutes", () => go("academies")], ["Try a demo", () => openAuth("demo")]])}
        {col("COMPANY", [["Why Tutor Amma", () => go("compare")], ["Become a tutor", () => openAuth("register", "tutor")], ["Contact us", () => go("demo")], ["FAQ", () => go("faq")]])}
        <div>
          <div className="text-[11px] font-extrabold tracking-[.16em] text-[#FFB067]">TRUST &amp; SAFETY</div>
          <ul className="mt-4 space-y-2.5 text-[14px] text-white/70">
            {[[ShieldCheck, "Police-verified home tutors"], [Lock, "Children's data under DPDP"], [HandCoins, "Escrow until class is done"], [Zap, "No ads aimed at children"]].map(([I, t], k) => {
              const Icon = I as React.ComponentType<{ className?: string }>;
              return <li key={k} className="flex items-start gap-2"><Icon className="w-4 h-4 mt-0.5 text-[#7EE2B0] shrink-0" />{t as string}</li>;
            })}
          </ul>
          <button onClick={() => openAuth("login")} className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1FAF5B] text-white text-[13.5px] font-bold whitespace-nowrap"><Layers className="w-4 h-4" /> Sign in</button>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row gap-2 justify-between text-[12.5px] text-white/45">
          <span>© {new Date().getFullYear()} Tutor Amma · Key to Success. All rights reserved.</span>
          <span className="flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Crafted with <Heart className="w-3.5 h-3.5 fill-[#F26B1D] text-[#F26B1D]" /> by Kiran Challa</span>
        </div>
      </div>
    </footer>
  );
}
