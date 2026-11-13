"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { WEEKDAYS, minutesToLabel } from "@/lib/format";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Car, Clock, Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react";

interface Block {
  start: number;
  end: number;
}
interface DayRule {
  day: number;
  blocks: Block[];
}

const STEP = 30;
const SELECT_MIN = 6 * 60; // 06:00
const SELECT_MAX = 23 * 60; // 23:00

const TIME_OPTIONS = Array.from({ length: (SELECT_MAX - SELECT_MIN) / STEP + 1 }, (_, i) => SELECT_MIN + i * STEP);

function newBlock(after?: Block): Block {
  const start = after ? Math.min(SELECT_MAX - 60, after.end) : 16 * 60;
  return { start, end: Math.min(SELECT_MAX, start + 90) };
}

export function TAvailability() {
  const [weekly, setWeekly] = useState<DayRule[] | null>(null);
  const [buffer, setBuffer] = useState(15);
  const [radius, setRadius] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tutor/availability");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load availability.");
      const w: DayRule[] = json?.data?.weekly ?? [];
      setWeekly(w);
      setBuffer(json?.data?.travelBufferMin ?? 15);
      setRadius(json?.data?.travelRadiusKm ?? 10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load availability.");
      setWeekly([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isOpen = (day: number) => weekly?.some((w) => w.day === day && w.blocks.length > 0) ?? false;

  const toggleDay = (day: number, open: boolean) => {
    setWeekly((prev) => {
      const cur = prev ?? [];
      if (open) {
        return cur.some((w) => w.day === day)
          ? cur
          : [...cur, { day, blocks: [newBlock()] }].sort((a, b) => a.day - b.day);
      }
      return cur.filter((w) => w.day !== day);
    });
  };

  const addBlock = (day: number) => {
    setWeekly((prev) =>
      (prev ?? []).map((w) => {
        if (w.day !== day) return w;
        const last = w.blocks[w.blocks.length - 1];
        return { ...w, blocks: [...w.blocks, newBlock(last)] };
      })
    );
  };

  const updateBlock = (day: number, idx: number, patch: Partial<Block>) => {
    setWeekly((prev) =>
      (prev ?? []).map((w) => {
        if (w.day !== day) return w;
        const blocks = w.blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b));
        // keep start < end
        blocks.forEach((b) => {
          if (b.end <= b.start) b.end = Math.min(SELECT_MAX, b.start + STEP);
        });
        return { ...w, blocks };
      })
    );
  };

  const removeBlock = (day: number, idx: number) => {
    setWeekly((prev) =>
      (prev ?? [])
        .map((w) => (w.day === day ? { ...w, blocks: w.blocks.filter((_, i) => i !== idx) } : w))
        .filter((w) => w.blocks.length > 0)
    );
  };

  const save = async () => {
    if (!weekly) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tutor/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekly, travelBufferMin: buffer, travelRadiusKm: radius }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not save availability.");
      toast({
        title: "Availability saved",
        description: `${weekly.length} teaching day${weekly.length === 1 ? "" : "s"} · ${buffer} min travel buffer · ${radius} km radius.`,
      });
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDays = weekly?.filter((w) => w.blocks.length > 0).length ?? 0;
  const totalHours =
    weekly?.reduce((sum, w) => sum + w.blocks.reduce((s, b) => s + (b.end - b.start), 0), 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Availability & travel</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {weekly ? `${openDays} day${openDays === 1 ? "" : "s"} open · ${(totalHours / 60).toFixed(1)} teaching hours a week` : "Loading…"}
          </p>
        </div>
        <button className="sk-btn sk-btn-primary sk-btn-sm" disabled={saving || !weekly} onClick={save}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save changes
        </button>
      </div>

      {error && (
        <div className="sk-callout sk-callout-danger">
          {error} —{" "}
          <button className="underline font-semibold" onClick={load}>
            retry
          </button>
        </div>
      )}

      {!weekly ? (
        <LoadingView label="Loading your weekly schedule…" />
      ) : (
        <>
          <div className="sk-callout sk-callout-info flex items-start gap-2">
            <Car className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Home visits are chained to minimise travel — the scheduler uses your buffer between visits and only offers
              homes within your radius.
            </span>
          </div>

          {/* weekly editor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {WEEKDAYS.map((label, day) => {
              const rule = weekly.find((w) => w.day === day);
              const open = !!rule && rule.blocks.length > 0;
              return (
                <section key={day} className={`sk-card p-4 ${open ? "" : "opacity-[0.92]"}`} aria-label={`${label} availability`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`font-bold text-[14px] ${open ? "text-brand-navy" : "text-muted-foreground"}`}>{label}</span>
                      {open && (
                        <span className="sk-pill sk-pill-green">
                          <Clock className="w-3 h-3" />
                          {rule!.blocks.reduce((s, b) => s + (b.end - b.start), 0) / 60}h open
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{open ? "Open" : "Closed"}</span>
                      <Switch checked={open} onCheckedChange={(v) => toggleDay(day, v)} aria-label={`Toggle ${label}`} />
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-2">
                      {rule!.blocks.map((b, idx) => (
                        <div key={idx} className="sk-well p-2.5 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <select
                              className="sk-input !py-1.5 !px-2 !text-[12px] tabular"
                              value={b.start}
                              onChange={(e) => updateBlock(day, idx, { start: Number(e.target.value) })}
                              aria-label={`${label} block ${idx + 1} start`}
                            >
                              {TIME_OPTIONS.filter((t) => t < b.end).map((t) => (
                                <option key={t} value={t}>{minutesToLabel(t)}</option>
                              ))}
                            </select>
                            <span className="text-muted-foreground text-[12px]">–</span>
                            <select
                              className="sk-input !py-1.5 !px-2 !text-[12px] tabular"
                              value={b.end}
                              onChange={(e) => updateBlock(day, idx, { end: Number(e.target.value) })}
                              aria-label={`${label} block ${idx + 1} end`}
                            >
                              {TIME_OPTIONS.filter((t) => t > b.start).map((t) => (
                                <option key={t} value={t}>{minutesToLabel(t)}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            className="sk-btn sk-btn-ghost sk-btn-sm !px-2 text-destructive"
                            onClick={() => removeBlock(day, idx)}
                            aria-label={`Remove ${label} block ${idx + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => addBlock(day)}>
                        <Plus className="w-3.5 h-3.5" /> Add block
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* travel sliders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="sk-card p-5 space-y-4">
              <div className="flex items-center gap-2 font-bold text-[14px]">
                <Car className="w-4 h-4 text-brand-orange" /> Travel buffer between home visits
              </div>
              <div className="px-1">
                <Slider
                  value={[buffer]}
                  min={10}
                  max={45}
                  step={5}
                  onValueChange={(v) => setBuffer(v[0])}
                  aria-label="Travel buffer minutes"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
                  <span>10 min</span>
                  <span className="font-bold text-foreground text-[13px] tabular">{buffer} min</span>
                  <span>45 min</span>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                After each home visit the scheduler blocks this much time before your next commitment, so back-to-back
                visits stay realistic across Anna Nagar, Mylapore and Adyar.
              </p>
            </section>

            <section className="sk-card p-5 space-y-4">
              <div className="flex items-center gap-2 font-bold text-[14px]">
                <MapPin className="w-4 h-4 text-brand-navy" /> Home-visit radius
              </div>
              <div className="px-1">
                <Slider
                  value={[radius]}
                  min={5}
                  max={25}
                  step={1}
                  onValueChange={(v) => setRadius(v[0])}
                  aria-label="Home visit radius kilometers"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
                  <span>5 km</span>
                  <span className="font-bold text-foreground text-[13px] tabular">{radius} km</span>
                  <span>25 km</span>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                New home-visit requests beyond this radius from your base area will be offered to closer tutors first.
              </p>
            </section>
          </div>
        </>
      )}

      {weekly && weekly.length === 0 && (
        <div className="sk-card p-6">
          <EmptyState
            icon={Clock}
            title="No teaching days yet"
            sub="Switch on a day above and add your first availability block — parents can only request slots inside these windows."
          />
        </div>
      )}
    </div>
  );
}
