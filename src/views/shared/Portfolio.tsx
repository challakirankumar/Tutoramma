"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ModuleHeader, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, Star, Briefcase, GraduationCap, ShieldCheck, Copy, MessageCircle, Download, ExternalLink, Languages, Video, MapPin, Users, Quote } from "lucide-react";

export interface PortfolioData {
  id: string;
  name: string;
  color: string;
  city: string;
  headline: string;
  bio: string;
  years: number;
  rating: number;
  reviewCount: number;
  sessionsDone: number;
  trustScore: number;
  badges: string[];
  languages: string[];
  modes: string[];
  qualifications: { title: string; issuer: string; year: number; verified: boolean }[];
  experience: { role: string; org: string; from?: string; to?: string; confirmed: boolean }[];
  verifications: { label: string; issuer: string | null; at: string }[];
  teaches: { subject: string; board: string; grade: string }[];
  reviews: { rating: number | null; text: string | null; subject: string; at: string }[];
}

/** The verified portfolio itself — used by the tutor preview and the public page. */
export function PortfolioCard({ p, qr }: { p: PortfolioData; qr?: string }) {
  const subjects = [...new Set(p.teaches.map((t) => t.subject))];
  const boards = [...new Set(p.teaches.map((t) => t.board))];
  return (
    <div className="rounded-[26px] bg-white border border-[#E1E7F2] shadow-[0_30px_80px_rgba(15,27,61,.10)] overflow-hidden">
      <div className="p-7 sm:p-9 text-white relative overflow-hidden" style={{ background: "radial-gradient(600px 300px at 90% 0%, rgba(242,107,29,.3), transparent 60%), linear-gradient(135deg,#1B2F79,#142366 55%,#0E1A52)" }}>
        <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
          <span className="w-20 h-20 rounded-[24px] flex items-center justify-center text-[26px] font-extrabold shrink-0 border-4 border-white/20" style={{ background: p.color }}>{p.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-[.16em] text-[#FFC27A]">VERIFIED TEACHING PORTFOLIO</div>
            <h1 className="font-display text-[30px] sm:text-[36px] font-extrabold leading-tight flex items-center gap-2">{p.name} <BadgeCheck className="w-7 h-7 text-[#7EE2B0]" /></h1>
            <p className="text-white/75 text-[15px]">{p.headline}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-[13px] font-semibold">
              <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-[#FFB067] text-[#FFB067]" /> {p.rating.toFixed(1)} · {p.reviewCount} reviews</span>
              <span>{p.years} years teaching</span>
              <span>{p.sessionsDone.toLocaleString("en-IN")} sessions</span>
              <span>Trust score {p.trustScore}</span>
            </div>
          </div>
          {qr && <img src={qr} alt="QR to this portfolio" className="w-28 h-28 rounded-2xl bg-white p-2 shrink-0" />}
        </div>
      </div>
      <div className="p-7 sm:p-9 grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="space-y-7">
          {p.bio && <p className="text-[15px] text-[#3A4566] leading-relaxed">{p.bio}</p>}
          <section>
            <h2 className="text-[13px] font-extrabold tracking-[.12em] text-[#8A93AB] uppercase flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Qualifications</h2>
            <div className="mt-3 space-y-2">
              {p.qualifications.map((q, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-[#EEF2F8] p-3">
                  <div className="flex-1 min-w-0"><div className="font-bold text-[14px] text-[#142366]">{q.title}</div><div className="text-[12px] text-[#6B7593]">{q.issuer} · {q.year}</div></div>
                  {q.verified && <span className="px-2 py-[3px] rounded-full bg-[#E6F6EE] text-[#1F7A55] text-[10.5px] font-bold">Verified</span>}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-[13px] font-extrabold tracking-[.12em] text-[#8A93AB] uppercase flex items-center gap-2"><Briefcase className="w-4 h-4" /> Experience</h2>
            <div className="mt-3 border-l-2 border-[#E6EBF5] pl-5 space-y-4">
              {p.experience.map((e, i) => (
                <div key={i} className="relative">
                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-white border-2 border-[#F26B1D]" />
                  <div className="font-bold text-[14px] text-[#142366]">{e.role}</div>
                  <div className="text-[12.5px] text-[#6B7593]">{e.org}{e.from ? ` · ${e.from}–${e.to ?? "now"}` : ""}</div>
                  {e.confirmed && <span className="inline-block mt-1 px-2 py-[2px] rounded-full bg-[#E6F6EE] text-[#1F7A55] text-[10.5px] font-bold">Confirmed by employer</span>}
                </div>
              ))}
            </div>
          </section>
          {p.reviews.length > 0 && (
            <section>
              <h2 className="text-[13px] font-extrabold tracking-[.12em] text-[#8A93AB] uppercase flex items-center gap-2"><Quote className="w-4 h-4" /> From families</h2>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {p.reviews.map((r, i) => (
                  <div key={i} className="rounded-2xl bg-[#F7F9FD] p-4">
                    <div className="flex gap-0.5">{Array.from({ length: r.rating ?? 5 }).map((_, k) => <Star key={k} className="w-3.5 h-3.5 fill-[#E8A20C] text-[#E8A20C]" />)}</div>
                    <p className="text-[13px] text-[#3A4566] mt-1.5">“{r.text}”</p>
                    <div className="text-[11px] text-[#8A93AB] mt-1">{r.subject} · verified session</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="space-y-6">
          <section className="rounded-[20px] bg-[#F4FBF7] border border-[#D6F0E2] p-5">
            <h2 className="text-[13px] font-extrabold tracking-[.12em] text-[#1F7A55] uppercase flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Verified by Tutor Amma</h2>
            <ul className="mt-3 space-y-2">
              {p.verifications.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]"><BadgeCheck className="w-4 h-4 text-[#1F9D6B] mt-0.5 shrink-0" /><span className="flex-1">{v.label}{v.issuer ? ` · ${v.issuer}` : ""}</span><span className="text-[11px] text-[#6B7593] whitespace-nowrap">{new Date(v.at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span></li>
              ))}
            </ul>
            <p className="text-[11px] text-[#6B7593] mt-3">Documents stay private. Only what was verified, and when, is shown.</p>
          </section>
          <section>
            <h2 className="text-[13px] font-extrabold tracking-[.12em] text-[#8A93AB] uppercase">What I teach</h2>
            <div className="flex flex-wrap gap-1.5 mt-3">{subjects.map((s) => <span key={s} className="px-3 py-1 rounded-full bg-[#142366] text-white text-[12px] font-semibold">{s}</span>)}{boards.map((b) => <span key={b} className="px-3 py-1 rounded-full bg-[#EEF2FA] text-[#22357F] text-[12px] font-semibold">{b}</span>)}</div>
            <div className="flex flex-wrap gap-3 mt-3 text-[12.5px] text-[#4A5578]">
              {p.modes.includes("online") && <span className="flex items-center gap-1"><Video className="w-4 h-4" /> Online</span>}
              {p.modes.includes("home") && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Home visits{p.city ? ` · ${p.city}` : ""}</span>}
              {p.modes.includes("group") && <span className="flex items-center gap-1"><Users className="w-4 h-4" /> Groups</span>}
              {p.languages.length > 0 && <span className="flex items-center gap-1"><Languages className="w-4 h-4" /> {p.languages.join(", ")}</span>}
            </div>
          </section>
          {p.badges.length > 0 && <div className="flex flex-wrap gap-1.5">{p.badges.map((b) => <span key={b} className="px-2.5 py-1 rounded-full border border-[#E1E7F2] text-[11.5px] font-semibold">{b}</span>)}</div>}
        </div>
      </div>
    </div>
  );
}

function usePortfolio(id: string | undefined) {
  const [p, setP] = useState<PortfolioData | null | undefined>(undefined);
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!id) return;
    fetch(`/api/public/portfolio/${id}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) return setP(null);
      setP(j.data);
      QRCode.toDataURL(`${window.location.origin}/?portfolio=${id}`, { margin: 1, width: 260, color: { dark: "#142366", light: "#FFFFFF" } }).then(setQr).catch(() => {});
    }).catch(() => setP(null));
  }, [id]);
  return { p, qr };
}

/** Tutor › Teaching Portfolio: preview and share. */
export function TPortfolio() {
  const { user, setView } = useAppStore();
  const { p, qr } = usePortfolio(user?.id);
  const link = typeof window !== "undefined" && user ? `${window.location.origin}/?portfolio=${user.id}` : "";
  return (
    <div className="space-y-5">
      <ModuleHeader
        group="core"
        icon={BadgeCheck}
        title="Verified Teaching Portfolio"
        subtitle="A shareable public page with QR that proves your credentials and experience — documents stay private."
        actions={p ? (
          <>
            <HeaderButton onClick={() => { navigator.clipboard.writeText(link); toast({ title: "Portfolio link copied" }); }}><Copy className="w-3.5 h-3.5" /> Copy link</HeaderButton>
            <a className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1FAF5B] text-white text-[12.5px] font-bold" href={`https://wa.me/?text=${encodeURIComponent(`My verified teaching portfolio on Tutor Amma: ${link}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
            {qr && <HeaderButton onClick={() => { const a = document.createElement("a"); a.href = qr; a.download = "portfolio-qr.png"; a.click(); }}><Download className="w-3.5 h-3.5" /> QR</HeaderButton>}
            <HeaderButton variant="primary" onClick={() => window.open(link, "_blank")}><ExternalLink className="w-3.5 h-3.5" /> Open public page</HeaderButton>
          </>
        ) : undefined}
      />
      {p === undefined ? <LoadingView /> : p === null ? (
        <div className="sk-card p-4"><EmptyState icon={BadgeCheck} title="Your portfolio goes live after approval" sub="Finish verification — once a verifier approves your profile, this page becomes public." action={<button className="sk-btn sk-btn-primary" onClick={() => setView("t-profile")}>Continue verification</button>} /></div>
      ) : <PortfolioCard p={p} qr={qr} />}
    </div>
  );
}

/** Public page for ?portfolio=<tutorId> (no sign-in needed). */
export function PublicPortfolio({ id }: { id: string }) {
  const { p, qr } = usePortfolio(id);
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#F6F8FC,#EEF2F9)" }}>
      <header className="bg-white/90 backdrop-blur border-b border-[#E6EBF5]">
        <div className="max-w-[1100px] mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/"><img src="/brand/logo-full.png" alt="Tutor Amma" className="h-9" /></a>
          <a href="/" className="hm-btn-dark !py-2.5 !text-[13.5px]">Book a free demo class</a>
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto px-5 py-10">
        {p === undefined ? <LoadingView label="Loading portfolio…" /> : p === null ? <div className="sk-card p-6"><EmptyState icon={BadgeCheck} title="This portfolio isn't public" sub="It may be under review, or the link is wrong." /></div> : <PortfolioCard p={p} qr={qr} />}
        <p className="text-center text-[12px] text-[#8A93AB] mt-6">Verified by Tutor Amma · scan the QR to check this page is genuine.</p>
      </main>
    </div>
  );
}
