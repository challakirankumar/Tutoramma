"use client";

import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy, X, Star, BadgeCheck, Loader2, CalendarCheck } from "lucide-react";

interface Cand { tutorId: string; name: string; color: string; headline: string; rating: number; reviews: number; trustScore: number; years: number; usualFee: number }
interface Data { eligible: boolean; slot?: string; price?: number; subject?: string; mode?: string; candidates: Cand[]; booked?: boolean }

/** Backup Tutor Guarantee (spec §30): verified alternatives at the same slot and price. */
export function BackupTutors({ bookingId, onClose, onBooked }: { bookingId: string; onClose: () => void; onBooked: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/backups`, { cache: "no-store" }).then((r) => r.json()).then((j) => setD(j.data ?? { eligible: false, candidates: [] })).catch(() => setD({ eligible: false, candidates: [] }));
  }, [bookingId]);
  const book = async (c: Cand) => {
    setBusy(c.tutorId);
    try {
      const r = await fetch(`/api/bookings/${bookingId}/backups`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tutorId: c.tutorId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Couldn't book");
      toast({ title: `Requested ${c.name.split(" ")[0]} ✓`, description: "Same slot, same price — you'll be notified when they accept." });
      onBooked();
    } catch (e) {
      toast({ title: "Couldn't book the backup", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  const slot = d?.slot ? new Date(d.slot).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  return (
    <div className="fixed inset-0 z-50 bg-[#142366]/30 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] w-full max-w-[560px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Backup tutors">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-2xl bg-[#FFF1E6] text-[#F26B1D] flex items-center justify-center shrink-0"><LifeBuoy className="w-5 h-5" /></span>
          <div className="flex-1">
            <h2 className="text-[18px] font-extrabold text-[#142366]">Backup Tutor Guarantee</h2>
            <p className="text-[12.5px] text-muted-foreground">No lost learning day — verified tutors free at {slot || "the same time"}, at your original price{d?.price ? ` (₹${(d.price / 100).toLocaleString("en-IN")})` : ""}.</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-5 space-y-2.5">
          {!d ? (
            [0, 1, 2].map((k) => <div key={k} className="h-[74px] rounded-2xl ta-shimmer" />)
          ) : !d.eligible ? (
            <p className="text-[13px] text-muted-foreground">{d.booked ? "A backup tutor is already booked for this session — see it in your bookings." : "Backups are offered when a session is cancelled by the tutor or missed."}</p>
          ) : !d.candidates.length ? (
            <p className="text-[13px] text-muted-foreground">No verified {d.subject} tutor is free at that time. Try Find a Tutor to pick another time.</p>
          ) : (
            d.candidates.map((c) => (
              <div key={c.tutorId} className="rounded-2xl border p-3.5 flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
                <span className="w-11 h-11 rounded-xl text-white font-bold flex items-center justify-center shrink-0" style={{ background: c.color }}>{c.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[14px] flex items-center gap-1">{c.name} <BadgeCheck className="w-4 h-4 text-[#1F9D6B]" /></div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{c.headline}</div>
                  <div className="text-[11.5px] flex items-center gap-2 mt-0.5"><span className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-[#E8A20C] text-[#E8A20C]" /> {c.rating.toFixed(1)}</span><span>{c.years}y exp</span><span>Trust {c.trustScore}</span></div>
                </div>
                <button className="sk-btn sk-btn-sm sk-btn-primary" disabled={!!busy} onClick={() => book(c)}>{busy === c.tutorId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5" />} Book</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
