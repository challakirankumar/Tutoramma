"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { useAppStore, type AuthUser } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { X, Lock, Loader2, ArrowRight, GraduationCap, Baby, UserCog, Landmark, ShieldCheck, SearchCheck, Radar, ChevronRight, Link2 } from "lucide-react";

export type Role = "student" | "parent" | "tutor" | "institute" | "admin" | "safety" | "verifier";

const SIGNUP: { id: Role; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "parent", label: "Parent", desc: "Book & protect", icon: Baby },
  { id: "student", label: "Student", desc: "Learn & practise", icon: GraduationCap },
  { id: "tutor", label: "Tutor", desc: "Teach & earn", icon: UserCog },
  { id: "institute", label: "Institute", desc: "Run an academy", icon: Landmark },
];
const DEMOS: { id: Role; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "parent", label: "Parent", icon: Baby },
  { id: "student", label: "Student", icon: GraduationCap },
  { id: "tutor", label: "Tutor", icon: UserCog },
  { id: "institute", label: "Institute", icon: Landmark },
  { id: "admin", label: "Super admin", icon: ShieldCheck },
  { id: "verifier", label: "Verifier", icon: SearchCheck },
  { id: "safety", label: "Safety desk", icon: Radar },
];

/** Sign-in / register / demo / join-a-class panel (slide-over), spec §6. */
export function AuthDrawer({ open, mode, role, onClose }: { open: boolean; mode: "login" | "register" | "demo"; role?: Role; onClose: () => void }) {
  const { setUser } = useAppStore();
  const [tab, setTab] = useState<"login" | "register" | "demo">(mode);
  const [busy, setBusy] = useState<string | null>(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ role: (role && SIGNUP.some((s) => s.id === role) ? role : "parent") as Role, name: "", email: "", password: "", phone: "" });
  const [join, setJoin] = useState("");
  const [joinErr, setJoinErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(mode);
    if (role && SIGNUP.some((s) => s.id === role)) setReg((r) => ({ ...r, role }));
  }, [open, mode, role]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message || "Something went wrong");
    return json.data as AuthUser;
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("login");
    try {
      const u = await post("/api/auth/login", login);
      setUser(u);
      toast({ title: `Welcome back, ${u.name.split(" ")[0]}!` });
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
      let referralCode: string | undefined;
      try {
        referralCode = sessionStorage.getItem("ta-ref") ?? undefined;
      } catch {}
      const u = await post("/api/auth/register", { ...reg, referralCode });
      setUser(u);
      toast({ title: `Welcome to Tutor Amma, ${u.name.split(" ")[0]}! 🎉` });
    } catch (err) {
      toast({ title: "Registration failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  const doDemo = async (r: Role) => {
    setBusy(`demo-${r}`);
    try {
      const u = await post("/api/auth/demo", { role: r });
      setUser(u);
      toast({ title: `You're exploring as ${u.name.split(" ")[0]}`, description: "Demo data · simulated payments and GPS." });
    } catch (err) {
      toast({ title: "Could not start the demo", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  const doJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = join.trim();
    if (!raw) return;
    setBusy("join");
    setJoinErr("");
    try {
      let key = raw;
      try {
        const u = new URL(raw);
        key = u.searchParams.get("join") || u.searchParams.get("classroom") || u.pathname.split("/").filter(Boolean).pop() || raw;
        if (u.searchParams.get("classroom")) {
          window.location.href = `/?classroom=${encodeURIComponent(key)}`;
          return;
        }
      } catch {}
      const res = await fetch(`/api/live-classes/join/${encodeURIComponent(key)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        window.location.href = `/?join=${encodeURIComponent(json.data.slug || key)}`;
        return;
      }
      /* a 6-character classroom code */
      const c = await fetch(`/api/classrooms/join?code=${encodeURIComponent(key)}`);
      if (c.ok) {
        window.location.href = `/?classroom=${encodeURIComponent(key.toUpperCase())}`;
        return;
      }
      throw new Error();
    } catch {
      setJoinErr("We couldn't find that class — check the code with your tutor.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={clsx("fixed inset-0 z-[70] transition-opacity", open ? "opacity-100" : "opacity-0 pointer-events-none")} aria-hidden={!open}>
      <div className="absolute inset-0 bg-[#0B1437]/45 backdrop-blur-[3px]" onClick={onClose} />
      <aside
        className={clsx("absolute right-0 top-0 bottom-0 w-full max-w-[460px] bg-white shadow-2xl overflow-y-auto transition-transform duration-500", open ? "translate-x-0" : "translate-x-full")}
        style={{ transitionTimingFunction: "cubic-bezier(.22,1,.36,1)" }}
        role="dialog"
        aria-modal
        aria-label="Sign in to Tutor Amma"
      >
        <div className="sticky top-0 bg-white/90 backdrop-blur z-10 px-6 pt-5 pb-3 flex items-center justify-between border-b border-[#EEF2F8]">
          <img src="/brand/logo-full.png" alt="Tutor Amma" className="h-8 w-auto" />
          <button className="p-2 rounded-full hover:bg-[#F3F6FB]" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-[#F1F4FA]">
            {(["login", "register", "demo"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={clsx("py-2 rounded-full text-[13px] font-bold transition-all", tab === t ? "bg-[#0F1B3D] text-white shadow" : "text-[#4A5578]")}>
                {t === "login" ? "Sign in" : t === "register" ? "Create account" : "Try a demo"}
              </button>
            ))}
          </div>

          {tab === "login" && (
            <form onSubmit={doLogin} className="mt-6 space-y-4">
              <h2 className="font-display text-[26px] font-extrabold text-[#0F1B3D]">Welcome back.</h2>
              <label className="block">
                <span className="text-[12px] font-bold text-[#4A5578]">Email</span>
                <input type="email" required className="hm-input mt-1" placeholder="you@example.com" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-[12px] font-bold text-[#4A5578]">Password</span>
                <input type="password" required className="hm-input mt-1" placeholder="••••••••" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
              </label>
              <button className="hm-btn-dark w-full justify-center" disabled={busy === "login"}>
                {busy === "login" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Sign in securely
              </button>
              <p className="text-[11.5px] text-[#6B7593] text-center">Demo accounts use the password <code className="font-bold">demo1234</code>.</p>
            </form>
          )}

          {tab === "register" && (
            <form onSubmit={doRegister} className="mt-6 space-y-4">
              <h2 className="font-display text-[26px] font-extrabold text-[#0F1B3D]">Start in minutes.</h2>
              <div className="grid grid-cols-2 gap-2">
                {SIGNUP.map((r) => (
                  <button key={r.id} type="button" onClick={() => setReg({ ...reg, role: r.id })} className={clsx("rounded-2xl border p-3 text-left transition-all", reg.role === r.id ? "border-[#0F1B3D] bg-[#F5F7FC] shadow-[0_6px_18px_rgba(15,27,61,.12)]" : "border-[#E1E7F2] hover:border-[#C3CDE2]")}>
                    <r.icon className={clsx("w-5 h-5", reg.role === r.id ? "text-[#F26B1D]" : "text-[#6B7593]")} />
                    <div className="text-[13.5px] font-bold text-[#0F1B3D] mt-1.5">{r.label}</div>
                    <div className="text-[11.5px] text-[#6B7593]">{r.desc}</div>
                  </button>
                ))}
              </div>
              <input required className="hm-input" placeholder="Full name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input required type="email" className="hm-input" placeholder="Email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                <input className="hm-input" placeholder="Mobile (+91)" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
              </div>
              <input required type="password" minLength={6} className="hm-input" placeholder="Password (min. 6 characters)" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} />
              <p className="text-[11.5px] text-[#6B7593] leading-relaxed">
                {reg.role === "tutor" ? "Tutors complete identity, credential and experience verification before going live." : reg.role === "student" ? "Students under 18 are linked to a parent or guardian, who approves the account." : reg.role === "institute" ? "Institutes list several tutors, run batches and receive consolidated payouts." : "Add your children after sign-up to book, track visits and pay from one wallet."}
              </p>
              <button className="hm-btn-orange w-full justify-center" disabled={busy === "register"}>
                {busy === "register" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Create {reg.role} account
              </button>
              <p className="text-[10.5px] text-[#8A93AB] text-center">By continuing you accept the terms and the privacy notice. Children's data is handled under India's DPDP Act.</p>
            </form>
          )}

          {tab === "demo" && (
            <div className="mt-6">
              <h2 className="font-display text-[26px] font-extrabold text-[#0F1B3D]">See every role, live.</h2>
              <p className="text-[13px] text-[#6B7593] mt-1">One tap opens a pre-loaded demo workspace. Synthetic data, sandbox payments, simulated GPS.</p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                {DEMOS.map((d) => (
                  <button key={d.id} onClick={() => doDemo(d.id)} disabled={busy !== null} className="group rounded-2xl border border-[#E1E7F2] p-3 flex items-center gap-2.5 hover:border-[#0F1B3D] hover:shadow-[0_6px_18px_rgba(15,27,61,.10)] transition-all text-left">
                    <span className="w-9 h-9 rounded-xl bg-[#F3F6FB] flex items-center justify-center text-[#0F1B3D] group-hover:bg-[#0F1B3D] group-hover:text-white transition-colors">
                      {busy === `demo-${d.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <d.icon className="w-4 h-4" />}
                    </span>
                    <span className="text-[13px] font-bold text-[#0F1B3D] flex-1">{d.label}</span>
                    <ChevronRight className="w-4 h-4 text-[#A5AEC6] group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={doJoin} className="mt-8 rounded-2xl bg-[#F5F7FC] border border-[#E6EBF5] p-4">
            <div className="text-[12.5px] font-bold text-[#0F1B3D] flex items-center gap-1.5"><Link2 className="w-4 h-4 text-[#F26B1D]" /> Have a class link or code?</div>
            <div className="flex gap-2 mt-2">
              <input className="hm-input !py-2.5" placeholder="TA-ALG268, GR8M4K or invite link" value={join} onChange={(e) => setJoin(e.target.value)} />
              <button className="hm-btn-dark !px-4" disabled={busy === "join"}>{busy === "join" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}</button>
            </div>
            {joinErr && <p className="text-[11.5px] text-[#C03342] mt-1.5">{joinErr}</p>}
          </form>
        </div>
      </aside>
    </div>
  );
}
