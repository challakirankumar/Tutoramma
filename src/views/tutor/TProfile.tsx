"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { toast } from "@/hooks/use-toast";
import { TUTOR_STATUS_PILL, dateOf } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Award, BadgeCheck, Check, Clock, FileText, Languages, Lightbulb, Loader2, Lock, Plus,
  Save, ShieldCheck, Sparkles, Star, TrendingUp, UserRound, X,
} from "lucide-react";

interface ProfileData {
  user: { id: string; name: string; email: string; avatarColor: string; phone: string | null; city: string | null } | null;
  profile: {
    id: string;
    headline: string;
    bio: string;
    status: string;
    yearsExperience: number;
    rating: number;
    reviewCount: number;
    sessionsDone: number;
    trustScore: number;
    badges: string[];
    languages: string[];
    modes: string[];
    rateOnline: number;
    rateHome: number;
    travelRadiusKm: number;
    responseMins: number;
  };
  documents: { id: string; type: string; name: string; issuer: string | null; status: string; uploadedAt: string; reviewedBy: string | null }[];
  offerings: number;
  trust: {
    total: number;
    breakdown: { key: string; label: string; score: number; max: number }[];
  };
  completeness: { pct: number; fields: { key: string; label: string; filled: boolean }[] };
  steps: { key: string; label: string; done: boolean }[];
  tips: { key: string; tone: "tip" | "praise" | "warn"; title: string; body: string }[];
  reverify: { needed: boolean; docs: { id: string; name: string; daysOld: number; uploadedAt: string }[] };
}

const CANONICAL_BADGES = ["ID verified", "Qualification verified", "Experience verified", "Background checked", "Top rated", "Responds fast"];
const DOC_STATE: Record<string, { label: string; cls: "green" | "orange" | "red" }> = {
  verified: { label: "Verified", cls: "green" },
  submitted: { label: "Submitted", cls: "orange" },
  rejected: { label: "Rejected", cls: "red" },
};
const ALL_MODES = [
  { key: "online", label: "Online 1:1" },
  { key: "home", label: "Home visit" },
  { key: "group", label: "Group class" },
];

const TIP_ICONS: Record<string, typeof Lightbulb> = {
  completeness: TrendingUp,
  bio: FileText,
  offerings: Sparkles,
  response: Clock,
  reverify: ShieldCheck,
};

export function TProfile() {
  const { user } = useAppStore();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // editable form state
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [langInput, setLangInput] = useState("");
  const [modes, setModes] = useState<string[]>([]);
  const [rateOnline, setRateOnline] = useState("");
  const [rateHome, setRateHome] = useState("");
  const [radius, setRadius] = useState("");
  const [responseMins, setResponseMins] = useState("");

  const hydrate = (d: ProfileData) => {
    setData(d);
    setHeadline(d.profile.headline);
    setBio(d.profile.bio);
    setLanguages(d.profile.languages);
    setModes(d.profile.modes);
    setRateOnline((d.profile.rateOnline / 100).toFixed(2));
    setRateHome((d.profile.rateHome / 100).toFixed(2));
    setRadius(String(d.profile.travelRadiusKm));
    setResponseMins(String(d.profile.responseMins));
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tutor/profile");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load your profile.");
      hydrate(json.data as ProfileData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your profile.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addLanguage = () => {
    const l = langInput.trim();
    if (!l) return;
    if (languages.length >= 8) {
      toast({ title: "Up to 8 languages", description: "Remove one before adding another.", variant: "destructive" });
      return;
    }
    if (!languages.some((x) => x.toLowerCase() === l.toLowerCase())) setLanguages([...languages, l]);
    setLangInput("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/tutor/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          headline,
          bio,
          languages,
          modes,
          rateOnline: Math.round((parseFloat(rateOnline) || 0) * 100),
          rateHome: Math.round((parseFloat(rateHome) || 0) * 100),
          travelRadiusKm: parseInt(radius || "0", 10) || 0,
          responseMins: parseInt(responseMins || "30", 10) || 30,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not save your profile.");
      toast({ title: "Profile updated", description: "Parents will see the new version immediately." });
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={UserRound}
          title="Profile unavailable"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={load}>
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading your profile…" />;

  const status = pillFor(TUTOR_STATUS_PILL, data.profile.status);
  const firstPending = data.steps.find((s) => !s.done);

  return (
    <div className="space-y-5">
      {/* header + stepper */}
      <div className="sk-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <AvatarTile name={data.user?.name ?? user?.name ?? "Tutor"} color={data.user?.avatarColor ?? "#14246B"} size={52} />
            <div className="min-w-0">
              <h1 className="text-[20px] font-extrabold tracking-tight truncate">{data.user?.name ?? "My profile"}</h1>
              <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                {data.profile.yearsExperience} yrs experience · {data.profile.sessionsDone} sessions · ★ {data.profile.rating.toFixed(1)} ({data.profile.reviewCount})
              </p>
            </div>
          </div>
          <StatusPill tone={status.cls}>{status.label}</StatusPill>
        </div>

        {/* verification stepper */}
        <div className="flex items-center gap-0.5 overflow-x-auto sk-scroll pb-1">
          {data.steps.map((s, i) => (
            <div key={s.key} className={`sk-step ${s.done ? "sk-step-done" : !firstPending || firstPending.key === s.key ? "sk-step-active" : ""}`}>
              <span className={`sk-step-dot ${s.done ? "" : ""}`}>
                {s.done ? <Check className="w-3 h-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
              {i < data.steps.length - 1 && <span className="w-3 h-px bg-border ml-1" />}
            </div>
          ))}
        </div>
      </div>

      {/* re-verification notice */}
      {data.reverify.needed && (
        <div className="sk-callout sk-callout-warn flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Re-verification due:</strong> {data.reverify.docs.map((d) => `${d.name} (${d.daysOld} days old)`).join(", ")}.
            Re-upload these documents to keep your verification badges active.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* trust score */}
        <section className="sk-card p-5 space-y-4" aria-label="Trust score">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[16px] font-bold tracking-tight">Trust score</h2>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold leading-none text-brand-navy tabular">{data.trust.total}</span>
              <span className="text-[13px] text-muted-foreground font-semibold">/ 100</span>
            </div>
          </div>
          <div className="space-y-3">
            {data.trust.breakdown.map((b) => (
              <div key={b.key}>
                <div className="flex justify-between text-[11.5px] font-semibold mb-1">
                  <span>{b.label}</span>
                  <span className="tabular text-muted-foreground">{b.score} / {b.max}</span>
                </div>
                <div className="sk-progress-track">
                  <div
                    className={`sk-progress-fill ${b.score / b.max >= 0.7 ? "sk-progress-fill-green" : b.score / b.max >= 0.4 ? "" : "sk-progress-fill-orange"}`}
                    style={{ width: `${Math.round((b.score / b.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Trust score blends verification depth, parent ratings, session completion, response time and dispute record.
            It powers your rank in parent search.
          </p>
        </section>

        {/* growth coach */}
        <section className="sk-card p-5 space-y-4" aria-label="Growth coach">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-bold tracking-tight flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-brand-orange" /> Growth coach
            </h2>
            <span className="text-[11px] text-muted-foreground">advisory only</span>
          </div>
          <div>
            <div className="flex justify-between text-[11.5px] font-semibold mb-1">
              <span>Profile completeness</span>
              <span className="tabular text-muted-foreground">{data.completeness.pct}%</span>
            </div>
            <div className="sk-progress-track">
              <div
                className={`sk-progress-fill ${data.completeness.pct >= 80 ? "sk-progress-fill-green" : ""}`}
                style={{ width: `${data.completeness.pct}%` }}
              />
            </div>
          </div>
          <ul className="space-y-2.5 max-h-64 overflow-y-auto sk-scroll pr-1">
            {data.tips.map((t) => {
              const Icon = TIP_ICONS[t.key] ?? Sparkles;
              return (
                <li key={t.key} className="sk-well p-3 flex items-start gap-2.5">
                  <span
                    className={`sk-avatar shrink-0 w-8 h-8 rounded-[10px] text-[14px] flex items-center justify-center text-white ${
                      t.tone === "praise" ? "bg-[#1F9D68]" : t.tone === "warn" ? "bg-[#E76E0F]" : "bg-[#315BE5]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[12.5px]">{t.title}</div>
                    <div className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">{t.body}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* badges */}
      <section className="sk-card p-5 space-y-3" aria-label="Badges">
        <h2 className="text-[16px] font-bold tracking-tight flex items-center gap-2">
          <Award className="w-4 h-4 text-brand-navy" /> Verification badges
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {CANONICAL_BADGES.map((b) => {
            const earned = data.profile.badges.includes(b);
            return earned ? (
              <span key={b} className="sk-pill sk-pill-green">
                <BadgeCheck className="w-3 h-3" /> {b}
              </span>
            ) : (
              <span key={b} className="sk-pill sk-pill-grey">
                <Lock className="w-3 h-3" /> {b}
              </span>
            );
          })}
        </div>
      </section>

      {/* documents */}
      <section className="sk-card p-0 overflow-hidden" aria-label="Verification documents">
        <div className="p-5 pb-3">
          <h2 className="text-[16px] font-bold tracking-tight">Verification documents</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {data.documents.filter((d) => d.status === "verified").length} of {data.documents.length} verified · reviewed by the Tutor Amma safety team
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Issuer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.documents.map((d) => {
              const pill = DOC_STATE[d.status] ?? { label: d.status, cls: "grey" as const };
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-semibold text-[12.5px]">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{d.type.replace(/_/g, " ")}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[12.5px]">{d.issuer ?? "—"}</TableCell>
                  <TableCell>
                    <StatusPill tone={pill.cls}>{pill.label}</StatusPill>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular text-[12.5px]">{dateOf(d.uploadedAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* edit profile */}
      <section className="sk-card p-5 space-y-5" aria-label="Edit profile">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-[16px] font-bold tracking-tight">Edit profile</h2>
          <span className="text-[11.5px] text-muted-foreground">
            {["approved", "draft"].includes(data.profile.status)
              ? "Headline & bio editable while approved"
              : "Headline & bio are locked during review"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <label className="text-[12px] font-semibold" htmlFor="headline">Headline</label>
              <Input id="headline" className="sk-input mt-1" value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)} />
            </div>
            <div>
              <div className="flex justify-between items-center">
                <label className="text-[12px] font-semibold" htmlFor="bio">Bio</label>
                <span className={`text-[11px] tabular ${bio.length > 200 ? "text-[#1F9D68]" : "text-muted-foreground"}`}>
                  {bio.length} / 200+ chars recommended
                </span>
              </div>
              <Textarea
                id="bio"
                className="sk-input mt-1 min-h-[150px] text-[13px] leading-relaxed"
                value={bio}
                maxLength={1200}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold flex items-center gap-1.5" htmlFor="lang-input">
                <Languages className="w-3.5 h-3.5" /> Teaching languages
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  id="lang-input"
                  className="sk-input"
                  placeholder="e.g. Tamil"
                  value={langInput}
                  onChange={(e) => setLangInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLanguage();
                    }
                  }}
                />
                <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm shrink-0" onClick={addLanguage}>
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {languages.map((l) => (
                  <button
                    key={l}
                    className="sk-pill sk-pill-blue inline-flex items-center gap-1"
                    onClick={() => setLanguages(languages.filter((x) => x !== l))}
                    aria-label={`Remove ${l}`}
                  >
                    {l} <X className="w-3 h-3" />
                  </button>
                ))}
                {languages.length === 0 && <span className="text-[11.5px] text-muted-foreground">No languages yet</span>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <span className="text-[12px] font-semibold">Teaching modes</span>
              <div className="space-y-2 mt-1.5">
                {ALL_MODES.map((m) => (
                  <label key={m.key} className="flex items-center gap-2.5 sk-well p-2.5 cursor-pointer">
                    <Checkbox
                      checked={modes.includes(m.key)}
                      onCheckedChange={(v) =>
                        setModes(v ? [...modes, m.key] : modes.filter((x) => x !== m.key))
                      }
                      aria-label={m.label}
                    />
                    <span className="text-[12.5px] font-semibold">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold" htmlFor="rate-online">Online rate (₹)</label>
                <Input id="rate-online" className="sk-input mt-1 tabular" inputMode="decimal" value={rateOnline} onChange={(e) => setRateOnline(e.target.value)} />
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="rate-home">Home-visit rate (₹)</label>
                <Input id="rate-home" className="sk-input mt-1 tabular" inputMode="decimal" value={rateHome} onChange={(e) => setRateHome(e.target.value)} />
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="radius">Travel radius (km)</label>
                <Input id="radius" className="sk-input mt-1 tabular" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
              </div>
              <div>
                <label className="text-[12px] font-semibold" htmlFor="response">Response time (min)</label>
                <Input id="response" className="sk-input mt-1 tabular" inputMode="numeric" value={responseMins} onChange={(e) => setResponseMins(e.target.value)} />
              </div>
            </div>
            <div className="sk-well p-3 flex items-center gap-2.5 text-[12px] text-muted-foreground">
              <Star className="w-4 h-4 text-brand-orange shrink-0" />
              {data.offerings} published offerings across boards, grades and subjects
            </div>
            <Button className="sk-btn sk-btn-primary w-full" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save profile
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
