"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAppStore, type AuthUser } from "@/stores/app-store";
import { clsx } from "clsx";
import {
  ShieldCheck, BadgeCheck, Lock, Sparkles, Star, MapPin, Video, Users, ArrowRight,
  GraduationCap, Baby, UserCog, Loader2, Search, Radar, ChevronRight, CalendarCheck, Landmark,
  SearchCheck, Target, Wallet, BookOpen, Activity, NotebookPen, MessageCircleQuestion, ScanLine,
  ConciergeBell, BellRing, Split, Languages, LogIn, Link2, Heart, Download,
  Layers as LayersIcon,
  Timer as TimerIcon,
  CalendarClock as CalendarClockIcon,
  Command as CommandIcon,
  Zap as ZapIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { kwd } from "@/lib/format";

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

type Role = "student" | "parent" | "tutor" | "institute" | "admin";

export function Landing() {
  const { setUser } = useAppStore();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [stats, setStats] = useState({ tutors: 0, students: 0, sessions: 0, avgRating: 4.8 });
  const [busy, setBusy] = useState<string | null>(null);

  // Private easter egg: 5 quick clicks on the crafted-by credit reveal the
  // source-bundle download. Invisible to normal visitors.
  const [secretHint, setSecretHint] = useState(0);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const secretCountRef = useRef(0);
  const secretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secretTap = () => {
    if (secretRevealed) return;
    secretCountRef.current += 1;
    if (secretCountRef.current >= 5) {
      setSecretRevealed(true);
      setSecretHint(0);
      return;
    }
    setSecretHint(secretCountRef.current);
    if (secretTimer.current) clearTimeout(secretTimer.current);
    secretTimer.current = setTimeout(() => {
      secretCountRef.current = 0;
      setSecretHint(0);
    }, 5000);
  };
  const [demoBusy, setDemoBusy] = useState<Role | null>(null);

  const [login, setLogin] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ role: "student" as Role, name: "", email: "", password: "", phone: "" });

  /* curriculum search card + join-a-class link (hero) */
  const [search, setSearch] = useState({ board: "CBSE", subject: "Mathematics", mode: "online" });
  const [joinLink, setJoinLink] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState("");

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

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("login");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(login),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Login failed");
      setUser(json.data as AuthUser);
      toast({ title: `Welcome back, ${json.data.name.split(" ")[0]}!` });
    } catch (err) {
      toast({ title: "Sign in failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("register");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reg),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Registration failed");
      setUser(json.data as AuthUser);
      toast({ title: `Welcome to Tutor Amma, ${json.data.name.split(" ")[0]}! 🎉` });
    } catch (err) {
      toast({ title: "Registration failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const doDemo = async (role: Role) => {
    setDemoBusy(role);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Demo unavailable");
      setUser(json.data as AuthUser);
      toast({ title: `Demo ${role} mode`, description: "Simulated payments & GPS — explore freely!" });
    } catch (err) {
      toast({ title: "Could not start demo", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDemoBusy(null);
    }
  };

  /* ===== anchor navigation (smooth scroll, clears the sticky header) ===== */
  const scrollToAuth = () =>
    document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const goTo = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* curriculum search → remember preference, open register */
  const doFindTutors = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ta_search_pref", JSON.stringify(search));
    } catch {}
    setTab("register");
    toast({
      title: "Curriculum saved",
      description: `Create a free account to see ${search.board} · ${search.subject} tutors near you.`,
    });
    scrollToAuth();
  };

  /* join a live class with a code (TA-XXXXXX) or a full invite link.
     The join API accepts either the secret slug or the TA- code and returns
     the public class card; the ?join= guest screen re-resolves both, so we
     redirect with the resolved slug (falling back to the entered key). */
  const doJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinLink.trim();
    if (!raw || joinBusy) return;
    setJoinBusy(true);
    setJoinError("");
    try {
      let key = raw;
      /* a full link carries the key in ?join= (or the last path segment) */
      try {
        const u = new URL(raw);
        key = u.searchParams.get("join") || u.pathname.split("/").filter(Boolean).pop() || raw;
      } catch {
        const m = raw.match(/[?&]join=([^&\s]+)/);
        if (m) key = decodeURIComponent(m[1]);
      }
      const res = await fetch(`/api/live-classes/join/${encodeURIComponent(key)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error("not found");
      const slug = json.data.slug || key;
      window.location.href = `/?join=${encodeURIComponent(slug)}`;
    } catch {
      setJoinError("Class not found — check the code with your tutor.");
    } finally {
      setJoinBusy(false);
    }
  };

  /* final CTA — preselects the tutor role in the register form */
  const becomeTutor = () => {
    setTab("register");
    setReg((r) => ({ ...r, role: "tutor" }));
    scrollToAuth();
  };

  const roleCards: { id: Role; label: string; desc: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
    { id: "student", label: "Student", desc: "Learn & practice", icon: GraduationCap, color: "#F47B20" },
    { id: "parent", label: "Parent", desc: "Book & protect", icon: Baby, color: "#1F9D68" },
    { id: "tutor", label: "Tutor", desc: "Teach & earn", icon: UserCog, color: "#315BE5" },
    { id: "institute", label: "Institute", desc: "Run an academy", icon: Landmark, color: "#7C4D2A" },
    { id: "admin", label: "Admin", desc: "Operate platform", icon: ShieldCheck, color: "#14246B" },
  ];

  const statCards = [
    { icon: BadgeCheck, label: "Verified tutors", value: stats.tutors },
    { icon: GraduationCap, label: "Learners", value: stats.students },
    { icon: CalendarCheck, label: "Sessions booked", value: stats.sessions },
    { icon: Star, label: "Average rating", value: stats.avgRating },
  ];

  const navLinks = [
    { id: "how", label: "How it works" },
    { id: "features", label: "Features" },
    { id: "live", label: "Live classes" },
  ];

  const steps = [
    { icon: SearchCheck, title: "Find a verified tutor", desc: "Curriculum-first matching by board, grade and subject — every tutor credential-verified." },
    { icon: ShieldCheck, title: "Book & pay safely", desc: "Escrow payments, free cancellation windows and a live safety system for home visits." },
    { icon: GraduationCap, title: "Learn & grow", desc: "Live digital classroom, AI teaching tools and a Learning Passport that follows your child." },
  ];

  const features = [
    { icon: BadgeCheck, title: "Verified tutors", desc: "ID, qualifications and experience verified with trust badges." },
    { icon: Target, title: "Curriculum-exact matching", desc: "Country > Board > Grade > Subject — no cross-board mismatch." },
    { icon: ShieldCheck, title: "SafeHome Guardian", desc: "OTP check-in, geofence, live route tracking and one-tap SOS for home tuition." },
    { icon: Wallet, title: "Escrow payments", desc: "Money held safely and released only after the session completes." },
    { icon: Sparkles, title: "AI Teaching Studio", desc: "Lesson plans, question papers and worksheets in minutes." },
    { icon: Video, title: "Live digital classroom", desc: "Video, whiteboard, polls, quizzes and Concept Pulse — join by link." },
    { icon: Users, title: "Group batches", desc: "Small-group classes with seat guarantees and auto-refunds." },
    { icon: BookOpen, title: "Learning Passport", desc: "Mastery, test history and goals that follow the student across tutors." },
  ];

  const signatures = [
    { icon: Activity, title: "Concept Pulse", desc: "Real-time understanding checks for every learner in class." },
    { icon: NotebookPen, title: "AI class notes & action items", desc: "Auto-generated recap notes and follow-ups after each session." },
    { icon: MessageCircleQuestion, title: "Doubt Queue with AI-drafted answers", desc: "Students queue doubts; tutors start from AI-drafted answers." },
    { icon: ScanLine, title: "Question from image", desc: "Snap any worksheet or board photo to turn it into questions." },
    { icon: ConciergeBell, title: "Smart Match Concierge", desc: "Our team hand-picks the perfect tutor when matching feels hard." },
    { icon: BellRing, title: "Spaced revision nudges", desc: "Well-timed reminders that lock learning into long-term memory." },
    { icon: Split, title: "Breakout rooms", desc: "Split the class into small groups in one click." },
    { icon: Languages, title: "Live captions & translation", desc: "Follow the lesson in your language, in real time." },
  ];

  const testimonials = [
    {
      quote: "Meera ma'am's home sessions feel completely safe — the OTP check-in and live tracking give us real peace of mind.",
      name: "Priya Menon",
      role: "Parent, Chennai",
      color: "#F47B20",
    },
    {
      quote: "The AI class notes and revision nudges fixed my algebra before finals.",
      name: "Aarav",
      role: "Grade 8 student",
      color: "#315BE5",
    },
    {
      quote: "I prepare papers in minutes and get paid on time, every time.",
      name: "Sunil",
      role: "Verified tutor",
      color: "#1F9D68",
    },
  ];

  /* soft tile colors for feature icons (brand chart palette) */
  const tileColors = ["#14246B", "#F47B20", "#315BE5", "#1F9D68"];

  return (
    <div className="min-h-screen flex flex-col landing-bg">
      {/* subtle structural grid fading down from the header */}
      <div className="fixed inset-x-0 top-0 h-[560px] landing-grid pointer-events-none" aria-hidden />

      {/* ===== navigation bar (sticky) ===== */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{
          borderColor: "rgba(20,36,107,0.10)",
          background: "color-mix(in srgb, #FFFFFF 86%, transparent)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-[60px] lg:h-[76px] flex items-center justify-between gap-3">
            {/* logo — top-left, vertically centered, 36px mobile / 48px desktop */}
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              aria-label="Tutor Amma — back to top"
              className="flex items-center min-w-0 rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Image
                src="/brand/tutor-amma-logo-trim.png"
                alt="Tutor Amma — Key to Success"
                width={232}
                height={49}
                priority
                className="h-[36px] lg:h-[48px] w-auto max-w-[58vw] object-contain object-left"
              />
            </a>

            {/* desktop links */}
            <nav aria-label="Primary" className="hidden lg:flex items-center gap-1">
              {navLinks.map((l) => (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  onClick={goTo(l.id)}
                  className="px-3 py-2 rounded-[10px] text-[13px] font-semibold text-[#2A3560] hover:text-[#14246B] hover:bg-[#EDF1FA] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => { setTab("login"); scrollToAuth(); }}
              className="sk-btn sk-btn-primary sk-btn-sm"
            >
              <LogIn className="w-3.5 h-3.5" /> Login
            </button>
          </div>

          {/* mobile links — compact horizontally scrollable row */}
          <nav
            aria-label="Primary"
            className="lg:hidden flex items-center gap-2 overflow-x-auto pb-2.5 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navLinks.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                onClick={goTo(l.id)}
                className="shrink-0 inline-flex items-center px-3.5 py-1.5 rounded-full border border-[#E7ECF5] bg-white text-[12px] font-semibold text-[#2A3560] hover:border-[#B9C6E4] hover:text-[#14246B] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative flex-1" style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
        {/* ===== hero ===== */}
        <section
          className="max-w-6xl mx-auto px-4 sm:px-6 pt-9 sm:pt-12 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_420px] gap-8 lg:gap-10 items-start"
          aria-label="Welcome to Tutor Amma"
        >
          {/* left: pitch + curriculum search */}
          <div className="min-w-0">
            <h1 className="text-[32px] sm:text-[42px] lg:text-[46px] font-extrabold leading-[1.06] tracking-[-0.015em]">
              The tutor your family can{" "}
              <span className="relative inline-block">
                <span className="gloss-title">actually trust.</span>
                <span
                  className="absolute left-0 right-0 -bottom-1 h-[5px] rounded-full"
                  style={{ background: "linear-gradient(90deg, rgba(244,123,32,0.55), rgba(244,123,32,0.12))" }}
                  aria-hidden
                />
              </span>
            </h1>

            <p className="mt-5 text-[14.5px] sm:text-[15px] leading-relaxed text-muted-foreground max-w-xl">
              Tutor Amma connects you with credential-verified teachers for online 1:1, safe home tuition and group
              classes — matched to your exact board, grade and chapters. Every home visit is protected with OTP
              check-in, geofencing, live tracking and one-tap SOS.
            </p>

            <div className="flex flex-wrap gap-2 mt-5">
              <span className="hero-pill inline-flex"><ShieldCheck className="w-3 h-3" /> ID &amp; background verified</span>
              <span className="hero-pill inline-flex"><Lock className="w-3 h-3" /> Escrow-protected payments</span>
              <span className="hero-pill inline-flex"><Radar className="w-3 h-3" /> Live home-tuition tracking</span>
              <span className="hero-pill inline-flex"><Sparkles className="w-3 h-3" /> AI lesson &amp; paper studio</span>
            </div>

            {/* curriculum search card */}
            <form
              onSubmit={doFindTutors}
              className="p-4 sm:p-5 mt-7 max-w-xl rounded-[18px] border"
              style={{
                borderColor: "rgba(20,36,107,0.12)",
                background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFE 100%)",
                boxShadow: "0 10px 30px rgba(20,36,107,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
              aria-label="Find tutors by curriculum"
            >
              <div className="flex items-center gap-2 mb-3.5">
                <span
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(180deg,#33549E,#14246B)" }}
                  aria-hidden
                >
                  <Search className="w-3.5 h-3.5 text-white" />
                </span>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  Curriculum-first search
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="search-board" className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">Board</label>
                  <select
                    id="search-board"
                    aria-label="Curriculum board"
                    className="sk-input mt-1"
                    value={search.board}
                    onChange={(e) => setSearch({ ...search, board: e.target.value })}
                  >
                    {["CBSE", "ICSE", "IGCSE", "IB", "American", "TN State Board"].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="search-subject" className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">Subject</label>
                  <select
                    id="search-subject"
                    aria-label="Subject"
                    className="sk-input mt-1"
                    value={search.subject}
                    onChange={(e) => setSearch({ ...search, subject: e.target.value })}
                  >
                    {["Mathematics", "Science", "English", "Physics", "Chemistry"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="search-mode" className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">Mode</label>
                  <select
                    id="search-mode"
                    aria-label="Learning mode"
                    className="sk-input mt-1"
                    value={search.mode}
                    onChange={(e) => setSearch({ ...search, mode: e.target.value })}
                  >
                    <option value="online">Online</option>
                    <option value="home">At home</option>
                    <option value="group">Group</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="sk-btn sk-btn-orange sk-btn-lg w-full mt-3.5">
                <Search className="w-4 h-4" /> Find tutors
              </button>
              <p className="flex items-center gap-1.5 mt-2.5 text-[10.5px] text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 text-brand-orange shrink-0" />
                We match by board, grade and subject — never just keywords.
              </p>
            </form>

            {/* stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7 max-w-xl">
              {statCards.map((s) => (
                <div
                  key={s.label}
                  className="p-3.5 text-center rounded-[16px] border transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: "rgba(20,36,107,0.10)",
                    background: "linear-gradient(180deg, #FFFFFF, #F9FBFE)",
                    boxShadow: "0 6px 18px rgba(20,36,107,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}
                >
                  <s.icon className="w-4 h-4 mx-auto text-brand-orange" aria-hidden />
                  <div className="text-[21px] font-extrabold tabular gloss-title mt-1.5">{s.value}</div>
                  <div className="text-[10.5px] font-semibold text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* right: auth card + join-a-class link */}
          <div id="auth" className="lg:sticky lg:top-24 min-w-0 scroll-mt-[120px] lg:scroll-mt-[96px]">
            <div className="auth-ring">
              <div
                className="rounded-[22.5px] p-5 sm:p-6"
                style={{ background: "var(--card)" }}
              >
                {/* tabs */}
                <div className="sk-segment w-full mb-4" role="tablist">
                  <button className={clsx("sk-segment-item flex-1", tab === "login" && "sk-segment-item-active")} onClick={() => setTab("login")} role="tab" aria-selected={tab === "login"}>
                    Sign in
                  </button>
                  <button className={clsx("sk-segment-item flex-1", tab === "register" && "sk-segment-item-active")} onClick={() => setTab("register")} role="tab" aria-selected={tab === "register"}>
                    Register
                  </button>
                </div>

                {tab === "login" ? (
                  <form onSubmit={doLogin} className="space-y-3">
                    <div>
                      <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="email">Email</label>
                      <input id="email" type="email" required className="sk-input mt-1" placeholder="you@example.com" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="password">Password</label>
                      <input id="password" type="password" required className="sk-input mt-1" placeholder="••••••••" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
                    </div>
                    <button type="submit" disabled={busy === "login"} className="sk-btn sk-btn-primary w-full sk-btn-lg">
                      {busy === "login" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Sign in securely
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                      Demo password for seeded accounts: <code className="font-bold">demo1234</code>
                    </p>
                  </form>
                ) : (
                  <form onSubmit={doRegister} className="space-y-3">
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {roleCards.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setReg({ ...reg, role: r.id })}
                          className={clsx(
                            "rounded-xl border p-2.5 flex flex-col items-center gap-1.5 transition-all",
                            reg.role === r.id ? "border-[#14246B] shadow-[0_3px_10px_rgba(20,36,107,0.18)]" : "border-[#D6DEEE] hover:border-[#B9C6E4]"
                          )}
                          style={reg.role === r.id ? { background: `linear-gradient(180deg, ${r.color}18, ${r.color}0a)` } : undefined}
                          aria-pressed={reg.role === r.id}
                        >
                          <span className="sk-avatar" style={{ width: 30, height: 30, borderRadius: 10, background: `linear-gradient(180deg, ${r.color}, ${r.color}cc)`, fontSize: 12 }}>
                            <r.icon className="w-4 h-4" />
                          </span>
                          <span className="text-[10.5px] font-bold">{r.label}</span>
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="rname">Full name</label>
                      <input id="rname" required className="sk-input mt-1" placeholder="e.g. Priya Menon" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="remail">Email</label>
                        <input id="remail" type="email" required className="sk-input mt-1" placeholder="you@example.com" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="rphone">Mobile</label>
                        <input id="rphone" className="sk-input mt-1" placeholder="+91 ··········" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="rpass">Password</label>
                      <input id="rpass" type="password" required minLength={6} className="sk-input mt-1" placeholder="Min. 6 characters" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {reg.role === "tutor"
                        ? "Tutors: complete document verification after signup. Background check + code of conduct unlock home tuition."
                        : reg.role === "parent"
                        ? "Parents: link your children after signup to book, track and pay from one wallet."
                        : reg.role === "institute"
                        ? "Institutes: register your academy to run group batches, manage tutors and receive bulk payouts."
                        : reg.role === "admin"
                        ? "Admin accounts manage verification, safety and finance operations."
                        : "Students under 18 are automatically linked to a parent or guardian."}
                    </p>
                    <button type="submit" disabled={busy === "register"} className="sk-btn sk-btn-primary w-full sk-btn-lg">
                      {busy === "register" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      Create {reg.role} account
                    </button>
                  </form>
                )}

                <div className="flex items-center gap-3 my-4">
                  <div className="sk-divider flex-1" />
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">or explore a demo</span>
                  <div className="sk-divider flex-1" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {roleCards.map((r) => (
                    <button key={r.id} onClick={() => doDemo(r.id)} disabled={demoBusy !== null} className="sk-btn sk-btn-ghost !justify-between group">
                      <span className="flex items-center gap-2">
                        {demoBusy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <r.icon className="w-3.5 h-3.5" />}
                        {r.label} demo
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ))}
                </div>
                <p className="text-[10.5px] text-muted-foreground mt-3 text-center leading-relaxed flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> Simulated payments &amp; GPS · reset anytime from the profile menu
                </p>
              </div>
            </div>

            {/* join a class with a link */}
            <form onSubmit={doJoinClass} className="sk-card-flat p-4 mt-4" aria-label="Join a live class with a link">
              <label htmlFor="join-code" className="flex items-center gap-1.5 text-[11.5px] font-bold text-muted-foreground">
                <Link2 className="w-3.5 h-3.5 text-brand-orange" /> Join a class with a link
              </label>
              <div className="flex gap-2 mt-2">
                <input
                  id="join-code"
                  className="sk-input min-w-0"
                  placeholder="Class code e.g. TA-ALG268 or invite link"
                  aria-label="Class code or invite link"
                  autoComplete="off"
                  spellCheck={false}
                  value={joinLink}
                  onChange={(e) => {
                    setJoinLink(e.target.value);
                    if (joinError) setJoinError("");
                  }}
                />
                <button type="submit" className="sk-btn sk-btn-primary shrink-0" disabled={joinBusy || !joinLink.trim()}>
                  {joinBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span className="hidden sm:inline">Join</span>
                </button>
              </div>
              {joinError ? (
                <p className="text-[11.5px] font-semibold text-[#C03342] mt-2" role="alert">{joinError}</p>
              ) : (
                <p className="text-[10.5px] text-muted-foreground mt-2 leading-relaxed">
                  No account needed — your tutor&apos;s code opens the live classroom.
                </p>
              )}
            </form>

            {/* trust footer note */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: ShieldCheck, t: "OTP check-in" },
                { icon: Radar, t: "Live tracking" },
                { icon: Lock, t: "Escrow release" },
              ].map((x) => (
                <div
                  key={x.t}
                  className="p-2.5 flex flex-col items-center gap-1 rounded-[14px] border"
                  style={{ borderColor: "rgba(20,36,107,0.09)", background: "color-mix(in srgb, var(--card) 70%, transparent)" }}
                >
                  <x.icon className="w-4 h-4 text-[#1F9D68]" />
                  <span className="text-[10px] font-bold text-muted-foreground">{x.t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== featured tutors ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-10 lg:mt-12 scroll-mt-[120px] lg:scroll-mt-[96px]" aria-label="Featured tutors">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-[16px] font-bold flex items-center gap-2">
              Featured this week
              <span className="hidden sm:inline-block w-8 h-[3px] rounded-full bg-[#F47B20]/70" aria-hidden />
            </h2>
            <span className="hero-pill inline-flex"><Star className="w-3 h-3" /> Trust Score ranked</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {featured.map((t) => (
              <div
                key={t.id}
                className="p-4 flex items-center gap-3.5 rounded-[18px] border transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(20,36,107,0.12)]"
                style={{
                  borderColor: "rgba(20,36,107,0.10)",
                  background: "linear-gradient(180deg, #FFFFFF, #FAFBFE)",
                  boxShadow: "0 6px 18px rgba(20,36,107,0.05)",
                }}
              >
                <AvatarTile name={t.name} color={t.color} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-bold truncate">{t.name}</span>
                    <span className="sk-pill sk-pill-green !px-1.5 !py-0.5 !text-[9px]">
                      <BadgeCheck className="w-2.5 h-2.5" /> {t.trustScore}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{t.headline}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-semibold text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-[#F47B20] text-[#F47B20]" /> {t.rating}
                    </span>
                    <span>·</span>
                    <span>{t.years}y exp</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      {t.modes.includes("online") && <Video className="w-3 h-3" />}
                      {t.modes.includes("home") && <MapPin className="w-3 h-3" />}
                      {t.modes.includes("group") && <Users className="w-3 h-3" />}
                    </span>
                    <span>·</span>
                    <span className="tabular">{kwd(t.rateOnline || t.rateHome, 2)}/hr</span>
                  </div>
                </div>
              </div>
            ))}
            {featured.length === 0 && (
              <div className="sk-card p-4 text-[12.5px] text-muted-foreground">Loading featured tutors…</div>
            )}
          </div>
        </section>

        {/* ===== how it works ===== */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 sm:mt-16 scroll-mt-[120px] lg:scroll-mt-[96px]" aria-labelledby="how-title">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-orange">
              <SearchCheck className="w-3.5 h-3.5" aria-hidden /> How it works
            </span>
            <h2 id="how-title" className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.015em] mt-2">
              Three steps to safer, smarter tuition
            </h2>
            <p className="text-[13.5px] sm:text-[14px] text-muted-foreground leading-relaxed mt-2.5">
              From curriculum-first matching to AI-powered learning — everything happens inside one protected platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {steps.map((s, i) => (
              <div key={s.title} className="sk-card p-6 relative overflow-hidden transition-all hover:-translate-y-0.5">
                <span
                  className="absolute top-3.5 right-5 text-[46px] font-extrabold leading-none select-none"
                  style={{ color: "rgba(20,36,107,0.07)" }}
                  aria-hidden
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="inline-flex w-11 h-11 rounded-[14px] items-center justify-center"
                  style={{
                    background: "linear-gradient(180deg,#33549E,#14246B)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 8px rgba(20,36,107,0.3)",
                  }}
                  aria-hidden
                >
                  <s.icon className="w-5 h-5 text-white" />
                </span>
                <h3 className="text-[15px] font-bold mt-4">{i + 1}. {s.title}</h3>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground mt-1.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== everything in one platform ===== */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 sm:mt-16 scroll-mt-[120px] lg:scroll-mt-[96px]" aria-labelledby="features-title">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-orange">
              <Sparkles className="w-3.5 h-3.5" aria-hidden /> Features
            </span>
            <h2 id="features-title" className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.015em] mt-2">
              Everything in one platform
            </h2>
            <p className="text-[13.5px] sm:text-[14px] text-muted-foreground leading-relaxed mt-2.5">
              Find, book, learn and stay safe — without juggling WhatsApp groups, cash and spreadsheets.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-8">
            {features.map((f, i) => (
              <div key={f.title} className="sk-card p-4 sm:p-5 transition-all hover:-translate-y-0.5">
                <span
                  className="inline-flex w-10 h-10 rounded-[13px] items-center justify-center"
                  style={{
                    background: `linear-gradient(180deg, ${tileColors[i % tileColors.length]}, ${tileColors[i % tileColors.length]}cc)`,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 8px rgba(20,36,107,0.22)",
                  }}
                  aria-hidden
                >
                  <f.icon className="w-5 h-5 text-white" />
                </span>
                <h3 className="text-[13.5px] font-bold mt-3.5 leading-snug">{f.title}</h3>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground mt-1.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== live classes & signature features ===== */}
        <section id="live" className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 sm:mt-16 scroll-mt-[120px] lg:scroll-mt-[96px]" aria-labelledby="live-title">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-orange">
              <Video className="w-3.5 h-3.5" aria-hidden /> Live classes
            </span>
            <h2 id="live-title" className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.015em] mt-2">
              Live classes &amp; signature features
            </h2>
            <p className="text-[13.5px] sm:text-[14px] text-muted-foreground leading-relaxed mt-2.5">
              A digital classroom that feels like a real one — with AI doing the busywork.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
            {signatures.map((s, i) => (
              <div key={s.title} className="sk-card-flat p-4 flex items-start gap-3 transition-all hover:-translate-y-0.5">
                <span
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                  style={{
                    background: i % 2 === 0
                      ? "linear-gradient(180deg,#E4EBFC,#D4DFFA)"
                      : "linear-gradient(180deg,#FFEFD9,#FFE1BC)",
                  }}
                  aria-hidden
                >
                  <s.icon className={clsx("w-4 h-4", i % 2 === 0 ? "text-[#315BE5]" : "text-[#E06A0C]")} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[12.5px] font-bold leading-snug">{s.title}</h3>
                  <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== v2 learning toolkit ===== */}
        <section id="toolkit" className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 sm:mt-16 scroll-mt-[120px] lg:scroll-mt-[96px]" aria-labelledby="toolkit-title">
          <div
            className="rounded-[26px] p-6 sm:p-9 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#33549E 0%,#1B2F79 50%,#14246B 100%)", boxShadow: "0 20px 60px rgba(20,36,107,.25)" }}
          >
            <div className="relative z-10 grid lg:grid-cols-5 gap-8 items-center">
              <div className="lg:col-span-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#FFC27A]">
                  <ZapIcon className="w-3.5 h-3.5" aria-hidden /> New · Study toolkit
                </span>
                <h2 id="toolkit-title" className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.015em] mt-2 leading-tight">
                  Learn smarter between classes
                </h2>
                <p className="text-[13.5px] text-white/75 leading-relaxed mt-2.5">
                  Science-backed tools that turn every tuition session into lasting memory — powered by AI running on Cloudflare&apos;s global network.
                </p>
              </div>
              <div className="lg:col-span-3 grid sm:grid-cols-2 gap-3">
                {[
                  { icon: LayersIcon, title: "Smart Flashcards", desc: "AI writes cards from any chapter or your notes; spaced repetition schedules each review right before you'd forget." },
                  { icon: TimerIcon, title: "Focus Studio", desc: "Pomodoro & deep-work timer with generated rain, ocean and brown-noise soundscapes, XP and a consistency heatmap." },
                  { icon: CalendarClockIcon, title: "Revision Planner", desc: "A day-by-day exam plan: weak topics first, 1-3-7 spaced revision, light days, mock tests and calendar export." },
                  { icon: CommandIcon, title: "Command palette", desc: "Press Ctrl / ⌘ K anywhere to jump to any page or start a focus block in one keystroke." },
                ].map((f) => (
                  <div key={f.title} className="rounded-2xl bg-white/[0.08] border border-white/10 p-4 backdrop-blur-sm">
                    <f.icon className="w-5 h-5 text-[#FFC27A]" aria-hidden />
                    <h3 className="text-[13.5px] font-bold mt-2">{f.title}</h3>
                    <p className="text-[11.5px] leading-relaxed text-white/70 mt-1">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== testimonials ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 sm:mt-16" aria-labelledby="testimonials-title">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-orange">
              <Star className="w-3.5 h-3.5" aria-hidden /> Testimonials
            </span>
            <h2 id="testimonials-title" className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.015em] mt-2">
              Loved by parents, students and tutors
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {testimonials.map((t) => (
              <figure key={t.name} className="sk-card p-5 transition-all hover:-translate-y-0.5">
                <div className="flex items-center gap-1" role="img" aria-label="Rated 5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-[#F47B20] text-[#F47B20]" aria-hidden />
                  ))}
                </div>
                <blockquote className="text-[13px] leading-relaxed mt-3.5">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="flex items-center gap-2.5 mt-4">
                  <AvatarTile name={t.name} color={t.color} size={36} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ===== final CTA band ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 sm:mt-16 pb-14 sm:pb-16" aria-label="Get started with Tutor Amma">
          <div
            className="relative overflow-hidden rounded-[22px] p-8 sm:p-12 text-center"
            style={{
              background: "linear-gradient(135deg, #0E1A52 0%, #14246B 55%, #26418F 100%)",
              boxShadow: "0 24px 60px rgba(20,36,107,0.25)",
            }}
          >
            {/* decorative glows */}
            <div
              className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(244,123,32,0.28), transparent 65%)" }}
              aria-hidden
            />
            <div
              className="absolute -bottom-28 -left-20 w-80 h-80 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(49,91,229,0.35), transparent 65%)" }}
              aria-hidden
            />

            <h2 className="relative text-white text-[24px] sm:text-[32px] font-extrabold tracking-[-0.015em]">
              Give your child the Key to Success.
            </h2>
            <p className="relative text-[13.5px] sm:text-[14.5px] text-white/80 leading-relaxed mt-3 max-w-xl mx-auto">
              Verified tutors, safe payments and AI-powered learning — start in minutes.
            </p>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 mt-7">
              <button type="button" onClick={scrollToAuth} className="sk-btn sk-btn-orange sk-btn-lg px-7">
                <ArrowRight className="w-4 h-4" /> Start learning
              </button>
              <button
                type="button"
                onClick={becomeTutor}
                className="sk-btn sk-btn-lg px-7 hover:bg-white/10 transition-colors"
                style={{ borderColor: "rgba(255,255,255,0.65)", color: "#FFFFFF" }}
              >
                <UserCog className="w-4 h-4" /> Become a tutor
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ===== footer ===== */}
      <footer
        className="relative border-t mt-4"
        style={{
          borderColor: "rgba(20,36,107,0.10)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div
          className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-col items-center text-center"
          style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}
        >
          {/* brand */}
          <div className="flex flex-col items-center gap-2.5 min-w-0">
            <Image
              src="/brand/tutor-amma-logo-trim.png"
              alt="Tutor Amma — Key to Success"
              width={232}
              height={49}
              className="h-[30px] w-auto max-w-[58vw] object-contain"
            />
            <div className="text-[11.5px] text-muted-foreground">Verified tutors for online, home and group learning.</div>
          </div>

          {/* elegant hairline divider with brand accent */}
          <div className="w-full max-w-sm sm:max-w-md flex items-center gap-3.5 mt-5" aria-hidden>
            <span
              className="h-px flex-1"
              style={{ background: "linear-gradient(to right, transparent, rgba(20,36,107,0.22))" }}
            />
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#F47B20" }} />
            <span
              className="h-px flex-1"
              style={{ background: "linear-gradient(to left, transparent, rgba(20,36,107,0.22))" }}
            />
          </div>

          {/* crafted credit — centred at the bottom of the page (secret 5× click reveals the private source-bundle download) */}
          <button
            type="button"
            onClick={secretTap}
            className="flex items-center justify-center gap-1.5 mt-4 text-[12.5px] tracking-wide text-[#2A3560] cursor-default select-none focus:outline-none"
            aria-label="Credits: crafted with love by Kiran Challa"
          >
            <span className="font-medium">Crafted with</span>
            <Heart
              className="w-[14px] h-[14px] shrink-0 text-[#E03131]"
              fill="#E03131"
              aria-label="love"
              role="img"
            />
            <span className="font-medium">by</span>
            <span className="font-extrabold gloss-title">Kiran Challa</span>
            {secretHint > 0 && !secretRevealed && (
              <span className="ml-1 text-[10px] text-muted-foreground" aria-hidden>
                {5 - secretHint} more
              </span>
            )}
          </button>

          {secretRevealed && (
            <a
              href="/api/bundle?k=00acf5e76bd586648d16"
              download="tutor-amma-github-repo.zip"
              className="group mt-3 inline-flex items-center gap-2 rounded-full border bg-white/85 backdrop-blur px-4 py-2.5 text-[12px] font-semibold text-[#14246B] transition-all hover:shadow-[0_6px_18px_rgba(20,36,107,0.16)] hover:-translate-y-px"
              style={{ borderColor: "rgba(20,36,107,0.20)" }}
              aria-label="Download the complete Tutor Amma source bundle as a zip archive"
            >
              <Download className="w-[14px] h-[14px] shrink-0" aria-hidden />
              <span>Download source bundle</span>
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: "#F47B20" }}>
                3.15 MB · zip
              </span>
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
