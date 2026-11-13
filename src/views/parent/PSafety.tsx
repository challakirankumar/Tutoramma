"use client";

import { useEffect, useState } from "react";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  KeyRound,
  Radar,
  MapPin,
  MessageCircleQuestion,
  Siren,
  ScrollText,
  Phone,
  Save,
  User,
  ShieldAlert,
  RefreshCw,
  Video,
  MessageSquare,
  Bell,
  UserCheck,
} from "lucide-react";

interface ConsentData {
  consents: {
    location: boolean;
    recording: boolean;
    messageVisibility: boolean;
    whatsapp: boolean;
    adultPresent: boolean;
  };
  emergencyName: string;
  emergencyPhone: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const CONSENT_ITEMS: {
  key: keyof ConsentData["consents"];
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
  onToast: string;
  offToast: string;
}[] = [
  {
    key: "location",
    icon: MapPin,
    title: "Live location tracking",
    desc: "Location tracking during home sessions only — route pings every 15–30 seconds, visible to you and your child.",
    onToast: "Live tracking enabled for home sessions.",
    offToast: "Live tracking switched off.",
  },
  {
    key: "recording",
    icon: Video,
    title: "Session recording",
    desc: "Allow online sessions to be recorded for quality review and dispute resolution. Recordings stay private to your family and the tutor.",
    onToast: "Session recording allowed.",
    offToast: "Session recording switched off.",
  },
  {
    key: "messageVisibility",
    icon: MessageSquare,
    title: "Guardian visibility of messages",
    desc: "Let me read my child's conversations with their tutors — recommended while children are under 16.",
    onToast: "You can now read your child's tutor chats.",
    offToast: "Your child's chats are now private to them.",
  },
  {
    key: "whatsapp",
    icon: Bell,
    title: "WhatsApp notifications",
    desc: "Session reminders, check-in confirmations and safety alerts delivered to WhatsApp.",
    onToast: "WhatsApp notifications enabled.",
    offToast: "WhatsApp notifications switched off.",
  },
  {
    key: "adultPresent",
    icon: UserCheck,
    title: "Adult present at home sessions",
    desc: "I confirm an adult will be present at home during every home-visit session.",
    onToast: "Adult-present acknowledgement saved.",
    offToast: "Adult-present acknowledgement withdrawn.",
  },
];

const PROMISES: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
}[] = [
  {
    icon: KeyRound,
    title: "OTP check-in",
    desc: "Tutors confirm arrival with a one-time code, verified only inside your home's geofence — no code, no session.",
  },
  {
    icon: MapPin,
    title: "150 m geofence",
    desc: "If a tutor leaves the 150-metre radius around your home mid-session, we flag it to you immediately.",
  },
  {
    icon: Radar,
    title: "Live tracking, 15–30s pings",
    desc: "From \u201con my way\u201d to check-out, watch the journey live with fresh position updates every 15–30 seconds.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Silent check",
    desc: "A discreet mid-session wellness check. No response escalates straight to our safety team.",
  },
  {
    icon: Siren,
    title: "One-tap SOS",
    desc: "Anyone in the session can raise an SOS — our safety team is paged in seconds with the full location trail.",
  },
  {
    icon: ScrollText,
    title: "Complete audit trail",
    desc: "Every step — booking, route, check-in, check-out — is logged immutably and reviewable on request.",
  },
];

export function PSafety() {
  const [saved, setSaved] = useState<ConsentData | null>(null);
  const [consents, setConsents] = useState<ConsentData["consents"] | null>(null);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // emergency contact has its own draft + save
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const load = () => {
    setError("");
    getJson<ConsentData>("/api/parent/consent")
      .then((d) => {
        setSaved(d);
        setConsents(d.consents);
        setEmName(d.emergencyName ?? "");
        setEmPhone(d.emergencyPhone ?? "");
      })
      .catch((e) => setError(e.message || "Could not load your consent settings."));
  };

  useEffect(load, []);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load safety settings"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary" onClick={load}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!saved || !consents) return <LoadingView label="Loading your safety settings…" />;

  const contactDirty = emName !== (saved.emergencyName ?? "") || emPhone !== (saved.emergencyPhone ?? "");

  /* toggle a single consent — saved immediately, toast only after the API succeeds */
  const toggle = async (key: keyof ConsentData["consents"], next: boolean) => {
    const prev = consents[key];
    if (prev === next) return;
    const item = CONSENT_ITEMS.find((i) => i.key === key)!;
    setConsents((c) => (c ? { ...c, [key]: next } : c));
    setSavingKey(key);
    try {
      const res = await fetch("/api/parent/consent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consents: { [key]: next } }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json?.error?.message || "Save failed");
      setSaved({ ...saved, consents: json.data.consents });
      setConsents(json.data.consents);
      toast({
        title: `${item.title} ${next ? "enabled" : "disabled"}`,
        description: next ? item.onToast : item.offToast,
      });
    } catch (e) {
      setConsents((c) => (c ? { ...c, [key]: prev } : c)); // revert on failure
      toast({
        title: "Couldn't save that change",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingKey(null);
    }
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      const res = await fetch("/api/parent/consent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emergencyName: emName, emergencyPhone: emPhone }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json?.error?.message || "Save failed");
      setSaved((s) => (s ? { ...s, emergencyName: json.data.emergencyName, emergencyPhone: json.data.emergencyPhone } : s));
      toast({
        title: "Emergency contact saved",
        description: "Our safety team will call this person if an alert can't reach you.",
      });
    } catch (e) {
      toast({
        title: "Couldn't save contact",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Safety &amp; Consent</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            You control what's tracked, recorded and shared. Every home visit runs on verified check-ins.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* ---------- consent toggles + emergency contact ---------- */}
        <div className="xl:col-span-3 space-y-4">
          <div className="sk-card p-5">
            <SectionTitle
              title="Your consents"
              sub="Each change is saved instantly and applies to all home visits and chats for your children"
            />
            <div className="mt-4 space-y-3">
              {CONSENT_ITEMS.map((item) => {
                const on = consents[item.key];
                const busy = savingKey === item.key;
                return (
                  <div
                    key={item.key}
                    className="sk-well p-3.5 flex items-start gap-3.5 cursor-pointer transition-colors"
                    onClick={() => toggle(item.key, !on)}
                    role="switch"
                    aria-checked={on}
                    aria-busy={busy}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(item.key, !on);
                      }
                    }}
                  >
                    <div
                      className={`sk-avatar shrink-0 flex items-center justify-center transition-colors ${
                        on ? "bg-gradient-to-b from-[#46BD85] to-[#1F9D68]" : "bg-gradient-to-b from-[#E4E9F4] to-[#D4DCEC]"
                      }`}
                      style={{ width: 38, height: 38, borderRadius: 12 }}
                    >
                      <item.icon className={`w-[18px] h-[18px] ${on ? "text-white" : "text-[#7C88A8]"}`} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[13.5px]">{item.title}</span>
                        <span className={`sk-pill ${on ? "sk-pill-green" : "sk-pill-grey"}`}>
                          {busy ? "Saving…" : on ? "Enabled" : "Off"}
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">{item.desc}</p>
                    </div>
                    <Switch
                      checked={on}
                      disabled={busy}
                      onCheckedChange={(v) => toggle(item.key, v)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={item.title}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* emergency contact */}
          <div className="sk-card p-5">
            <SectionTitle
              title="Emergency contact"
              sub="Our safety team calls this person if an alert can't reach you"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <label className="block">
                <span className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Contact name
                </span>
                <input
                  className="sk-input mt-1.5 w-full"
                  value={emName}
                  placeholder="e.g. Kumar Menon"
                  onChange={(e) => setEmName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Phone
                </span>
                <input
                  className="sk-input mt-1.5 w-full"
                  value={emPhone}
                  placeholder="+91 …"
                  onChange={(e) => setEmPhone(e.target.value)}
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 mt-3.5 flex-wrap">
              <p className="text-[11.5px] text-muted-foreground">Used only for safety escalations — never for marketing.</p>
              <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={saveContact} disabled={!contactDirty || savingContact}>
                <Save className="w-3.5 h-3.5" /> {savingContact ? "Saving…" : contactDirty ? "Save contact" : "Saved"}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- our safety promise ---------- */}
        <div className="xl:col-span-2 space-y-4">
          <div className="sk-card p-5">
            <SectionTitle title="Our safety promise" sub="Six layers of protection on every home visit" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 mt-4">
              {PROMISES.map((p) => (
                <div key={p.title} className="sk-well p-3.5 flex items-start gap-3">
                  <div
                    className="shrink-0 flex items-center justify-center rounded-xl text-white"
                    style={{
                      width: 36,
                      height: 36,
                      background: "linear-gradient(180deg, #33549E, #14246B)",
                      boxShadow: "0 2px 6px rgba(20,36,107,.35), inset 0 1px 0 rgba(255,255,255,.25)",
                    }}
                  >
                    <p.icon className="w-[17px] h-[17px]" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[13px]">{p.title}</div>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="sk-callout sk-callout-info flex gap-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Every tutor on Tutor Amma passes document verification and a background check before their first home
              visit — you can review each tutor's verification badges on their profile.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
