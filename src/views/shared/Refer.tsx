"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ModuleHeader, AccentKpi } from "@/components/shared/ModuleHeader";
import { LoadingView } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { Gift, Copy, MessageCircle, Mail, Users } from "lucide-react";

interface Data { code: string; link: string; credit: number; earned: number; friends: { id: string; name: string; role: string; at: string; credit: number }[] }

/** Referral & family credits (spec §30): ₹200 to you and ₹200 to every friend who joins. */
export function Refer() {
  const [d, setD] = useState<Data | null>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    fetch("/api/referrals", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setD(j.data);
      QRCode.toDataURL(j.data.link, { margin: 1, width: 300, color: { dark: "#142366", light: "#FFFFFF" } }).then(setQr).catch(() => {});
    }).catch(() => {});
  }, []);
  if (!d) return <LoadingView />;
  const msg = `I use Tutor Amma for verified tutors and safe home tuition. Join with my code ${d.code} and we both get ₹${d.credit / 100} credit: ${d.link}`;
  return (
    <div className="space-y-5">
      <ModuleHeader group="money" icon={Gift} title="Refer & Earn" subtitle={`Give ₹${d.credit / 100}, get ₹${d.credit / 100}. Credit lands in both wallets when your friend creates an account.`} pills={[{ label: "Family credits", tone: "new" }]} />
      <div className="grid grid-cols-2 gap-3">
        <AccentKpi label="Friends joined" value={d.friends.length} tone="navy" />
        <AccentKpi label="Credits earned" value={`₹${(d.earned / 100).toLocaleString("en-IN")}`} tone="green" />
      </div>
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="rounded-[22px] p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1B2F79,#142366 55%,#0E1A52)" }}>
          <div className="text-[11px] font-bold tracking-[.16em] text-[#FFC27A]">YOUR CODE</div>
          <div className="font-display text-[40px] font-extrabold tracking-[.08em] mt-1">{d.code}</div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button className="px-4 py-2 rounded-full bg-white text-[#142366] text-[13px] font-bold inline-flex items-center gap-1.5" onClick={() => { navigator.clipboard.writeText(d.link); toast({ title: "Link copied" }); }}><Copy className="w-4 h-4" /> Copy link</button>
            <a className="px-4 py-2 rounded-full bg-[#1FAF5B] text-white text-[13px] font-bold inline-flex items-center gap-1.5" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
            <a className="px-4 py-2 rounded-full bg-white/10 border border-white/25 text-[13px] font-bold inline-flex items-center gap-1.5" href={`mailto:?subject=${encodeURIComponent("Join me on Tutor Amma")}&body=${encodeURIComponent(msg)}`}><Mail className="w-4 h-4" /> Email</a>
          </div>
          <p className="text-[12px] text-white/60 mt-4">One credit per new account. Credits can be used on bookings and resources; they never expire while your account is active.</p>
          <Gift className="absolute -right-6 -bottom-8 w-44 h-44 text-white/[0.06]" />
        </div>
        <div className="sk-card p-5 flex flex-col items-center justify-center">
          {qr ? <img src={qr} alt="Referral QR code" className="w-44 h-44" /> : <div className="w-44 h-44 ta-shimmer rounded-xl" />}
          <div className="text-[12px] text-muted-foreground mt-2">Scan to join with your code</div>
        </div>
      </div>
      <div className="sk-card p-5">
        <div className="text-[15px] font-extrabold text-[#142366] flex items-center gap-2"><Users className="w-4 h-4" /> Friends who joined</div>
        {!d.friends.length ? <p className="text-[12.5px] text-muted-foreground mt-2">No one yet — share your code with another family or a teacher friend.</p> : d.friends.map((f) => (
          <div key={f.id} className="flex items-center justify-between py-2.5 border-b last:border-0 text-[13px]" style={{ borderColor: "var(--border)" }}><span><b>{f.name}</b> <span className="text-muted-foreground capitalize">· {f.role}</span></span><span className="text-[#1F7A55] font-semibold">+₹{f.credit / 100}</span></div>
        ))}
      </div>
    </div>
  );
}
