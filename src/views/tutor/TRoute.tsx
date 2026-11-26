"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { ModuleHeader, AccentKpi, HeaderButton } from "@/components/shared/ModuleHeader";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { Route as RouteIcon, MapPin, Navigation, AlertTriangle, Shuffle, Crosshair, Clock } from "lucide-react";

interface Leg {
  bookingId: string;
  student: string;
  subject: string;
  area: string;
  start: string;
  end: string;
  at: { lat: number; lng: number };
  stage: string;
  legKm: number;
  travelMin: number;
  slackMin: number | null;
  leaveBy: string;
  warning: string | null;
}
interface Plan {
  date: string;
  days: { date: string; visits: number }[];
  origin: { lat: number; lng: number } | null;
  usingHome: boolean;
  legs: Leg[];
  totalKm: number;
  driveMin: number;
  fuelLitres: number;
  swaps: { a: string; b: string; savedKm: number }[];
}

const t = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** Tutor Route Planner (spec §29): the day's home visits as a route, with buffers and swap suggestions. */
export function TRoute() {
  const { setView } = useAppStore();
  const [p, setP] = useState<Plan | null>(null);
  const [home, setHome] = useState<{ lat: number; lng: number } | null>(null);
  const load = useCallback((date?: string, h = home) => {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (h) {
      q.set("lat", String(h.lat));
      q.set("lng", String(h.lng));
    }
    fetch(`/api/tutor/route-plan?${q}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setP(j.data)).catch(() => {});
  }, [home]);
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const startFromHere = () => {
    if (!navigator.geolocation) return toast({ title: "Location isn't available on this device" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const h = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setHome(h);
        load(p?.date, h);
        toast({ title: "Starting from your location", description: "Used only to plan this route — not stored." });
      },
      () => toast({ title: "Location permission denied", description: "Route starts from your first visit instead." })
    );
  };

  if (!p) return <LoadingView label="Planning your route…" />;
  const pts = p.legs.map((l) => l.at).concat(p.origin ? [p.origin] : []);
  const W = 560, H = 360, PAD = 48;
  const anchor = (x: number) => (x < W * 0.25 ? "start" : x > W * 0.75 ? "end" : "middle");
  const dx = (x: number) => (x < W * 0.25 ? -12 : x > W * 0.75 ? 12 : 0);
  const minLat = Math.min(...pts.map((x) => x.lat)), maxLat = Math.max(...pts.map((x) => x.lat));
  const minLng = Math.min(...pts.map((x) => x.lng)), maxLng = Math.max(...pts.map((x) => x.lng));
  const sx = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng || 0.01)) * (W - PAD * 2);
  const sy = (lat: number) => H - PAD - ((lat - minLat) / (maxLat - minLat || 0.01)) * (H - PAD * 2);
  const path = [p.origin, ...p.legs.map((l) => l.at)].filter(Boolean).map((x, i) => `${i ? "L" : "M"}${sx(x!.lng)},${sy(x!.lat)}`).join(" ");

  return (
    <div className="space-y-5">
      <ModuleHeader
        group="scheduling"
        icon={RouteIcon}
        trail={["Safety"]}
        title="Route Planner"
        subtitle="Your home visits as one route — travel time, buffers and swaps that save kilometres. Families' slots never change without their consent."
        actions={
          <>
            <HeaderButton onClick={startFromHere}><Crosshair className="w-3.5 h-3.5" /> {p.usingHome ? "Using my location" : "Start from my location"}</HeaderButton>
            <HeaderButton variant="primary" onClick={() => setView("t-homevisits")}><Navigation className="w-3.5 h-3.5" /> Open home visits</HeaderButton>
          </>
        }
        tabs={p.days.map((d) => ({ id: d.date, label: new Date(d.date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }), count: d.visits }))}
        activeTab={p.date}
        onTab={(d) => load(d)}
      />
      {!p.legs.length ? (
        <div className="sk-card p-4"><EmptyState icon={MapPin} title="No home visits on this day" sub="Pick another day above, or open Home Visits to see requests." /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AccentKpi label="Visits" value={p.legs.length} tone="navy" />
            <AccentKpi label="Distance" value={`${p.totalKm} km`} />
            <AccentKpi label="Driving" value={`${p.driveMin} min`} tone="purple" />
            <AccentKpi label="Fuel (two-wheeler)" value={`${p.fuelLitres} L`} tone="green" sub="≈ 45 km per litre" />
          </div>
          <div className="grid xl:grid-cols-[1fr_1.1fr] gap-4">
            <div className="sk-card p-3">
              <div className="relative rounded-xl overflow-hidden" style={{ background: "#EAF2E6" }}>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Route map">
                  <defs><pattern id="rt-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#DCE7D6" /></pattern></defs>
                  <rect width={W} height={H} fill="url(#rt-grid)" />
                  <path d={path} fill="none" stroke="#142366" strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round" />
                  {p.usingHome && p.origin && <g transform={`translate(${sx(p.origin.lng)},${sy(p.origin.lat)})`}><circle r="9" fill="#fff" stroke="#142366" strokeWidth="3" /><text y="-14" textAnchor="middle" fontSize="11" fontWeight="700" fill="#142366">Start</text></g>}
                  {p.legs.map((l, i) => (
                    <g key={l.bookingId} transform={`translate(${sx(l.at.lng)},${sy(l.at.lat)})`}>
                      <circle r="14" fill={l.warning ? "#D64545" : "#F26B1D"} stroke="#fff" strokeWidth="3" />
                      <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">{i + 1}</text>
                      <text x={dx(sx(l.at.lng))} y="-20" textAnchor={anchor(sx(l.at.lng))} fontSize="11" fontWeight="700" fill="#142366" paintOrder="stroke" stroke="#EAF2E6" strokeWidth="3">{l.area.split(",")[0]}</text>
                    </g>
                  ))}
                </svg>
                <span className="absolute bottom-2 right-2 px-2 py-[2px] rounded-full bg-[#FFF8E1] border border-[#F2D79A] text-[10.5px] text-[#8A6516]">Schematic · straight-line × 1.35 road factor</span>
              </div>
            </div>
            <div className="sk-card p-5">
              <div className="text-[15px] font-extrabold text-[#142366]">Today&apos;s route</div>
              <ol className="mt-3 space-y-3">
                {p.legs.map((l, i) => (
                  <li key={l.bookingId} className="flex gap-3">
                    <span className={clsx("w-7 h-7 rounded-full text-white text-[12px] font-extrabold flex items-center justify-center shrink-0", l.warning ? "bg-[#D64545]" : "bg-[#F26B1D]")}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-[13.5px]"><b className="truncate">{l.student} · {l.subject}</b><span className="tabular text-muted-foreground whitespace-nowrap">{t(l.start)}–{t(l.end)}</span></div>
                      <div className="text-[12px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {l.area}</div>
                      <div className="text-[11.5px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{l.legKm} km · {l.travelMin} min drive</span>
                        <span className="flex items-center gap-1 text-[#22357F] font-semibold"><Clock className="w-3 h-3" /> Leave by {t(l.leaveBy)}</span>
                        {l.slackMin != null && <span className="text-muted-foreground">{l.slackMin} min gap</span>}
                      </div>
                      {l.warning && <div className="mt-1 text-[11.5px] text-[#C03342] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {l.warning}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {p.swaps.length > 0 && (
                <div className="mt-4 rounded-2xl bg-[#F5F3FF] border border-[#DCD2FB] p-3.5">
                  <div className="text-[12.5px] font-bold text-[#6D4AE0] flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /> Swap suggestions</div>
                  {p.swaps.map((s, i) => <div key={i} className="text-[12px] mt-1">Swap <b>{s.a}</b> with <b>{s.b}</b> → save <b>{s.savedKm} km</b></div>)}
                  <div className="text-[10.5px] text-muted-foreground mt-1">Ask both families before moving a slot — the app never moves it for you.</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
