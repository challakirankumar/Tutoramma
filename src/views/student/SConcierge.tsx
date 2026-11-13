"use client";

/**
 * Student — Concierge: chat-style natural-language tutor search.
 * Describe board / grade / subject / mode / budget in plain words; the backend
 * parses it into allow-listed filters and returns ranked verified tutors with
 * transparent "understood as" pills under each reply.
 */
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { clsx } from "clsx";
import { fils, fromNow, MODE_LABEL } from "@/lib/format";
import {
  ConciergeBell,
  SendHorizontal,
  Loader2,
  Star,
  BadgeCheck,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Search,
  Clock,
  Sparkles,
  Video,
  MapPin,
  Users,
  GraduationCap,
  CalendarCheck,
} from "lucide-react";

/* ---------------- types ---------------- */

interface TutorCard {
  id: string;
  name: string;
  color: string;
  headline: string;
  rating: number;
  reviews: number;
  trustScore: number;
  years: number;
  badges: string[];
  modes: string[];
  languages: string[];
  rateOnline: number;
  rateHome: number;
  responseMins: number;
  sessionsDone: number;
  whyMatched: string[];
  subjects: string[];
  boards: string[];
}

interface ConciergeFilters {
  board: string | null;
  grade: string | null;
  subject: string | null;
  mode: string | null;
  maxPrice: number | null;
  keywords: string | null;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  tutors?: TutorCard[];
  filters?: ConciergeFilters | null;
  provenance?: string;
  failed?: boolean;
  retryOf?: string;
}

interface TutorDetail extends Omit<TutorCard, "reviews"> {
  bio: string;
  reviewCount: number;
  qualifications: { title: string; issuer: string; year: number; status: string }[];
  experience: { role: string; org: string; from: string; to: string; verified: boolean }[];
  offerings: { id: string; mode: string; board: string; boardCode?: string; grade: string; subject: string; price: number }[];
  reviews: { name: string; rating: number; comment: string; at: string }[];
  availableSlots: { startAt: string; label: string }[];
}

/* ---------------- constants ---------------- */

const STARTERS = [
  "I need a CBSE Grade 8 Maths tutor for algebra",
  "Any IGCSE Science tutor under ₹600?",
  "Home tuition for Grade 6 English",
  "Group classes for Grade 9 Science",
];

const EMPTY_FILTERS: ConciergeFilters = { board: null, grade: null, subject: null, mode: null, maxPrice: null, keywords: null };

/* ---------------- small components ---------------- */

function Stars({ rating, size = 3.5 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= Math.round(rating) ? "text-[#E8A20C] fill-[#E8A20C]" : "text-muted-foreground/40"}
          style={{ width: size * 4, height: size * 4 }}
        />
      ))}
    </span>
  );
}

function ModeIcons({ modes }: { modes: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      {modes.includes("online") && (
        <span className="sk-pill sk-pill-blue" title="Online 1:1">
          <Video className="w-3 h-3" /> Online
        </span>
      )}
      {modes.includes("home") && (
        <span className="sk-pill sk-pill-orange" title="Home visits">
          <MapPin className="w-3 h-3" /> Home
        </span>
      )}
      {modes.includes("group") && (
        <span className="sk-pill sk-pill-green" title="Group classes">
          <Users className="w-3 h-3" /> Group
        </span>
      )}
    </span>
  );
}

/** Transparent echo of what the concierge understood (board/grade/subject/mode/budget). */
function FilterEcho({ filters, provenance }: { filters: ConciergeFilters; provenance?: string }) {
  const items: { label: string; cls: string }[] = [];
  if (filters.board) items.push({ label: filters.board, cls: "sk-pill-navy" });
  if (filters.grade) items.push({ label: filters.grade, cls: "sk-pill-navy" });
  if (filters.subject) items.push({ label: filters.subject, cls: "sk-pill-blue" });
  if (filters.mode) items.push({ label: MODE_LABEL[filters.mode] ?? filters.mode, cls: "sk-pill-orange" });
  if (filters.maxPrice) items.push({ label: `≤ ₹${filters.maxPrice}`, cls: "sk-pill-green" });
  if (filters.keywords) items.push({ label: filters.keywords, cls: "sk-pill-grey" });
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Understood as</span>
      {items.map((it) => (
        <span key={it.label} className={clsx("sk-pill", it.cls)}>
          {it.label}
        </span>
      ))}
      {provenance && <span className="text-[10px] text-muted-foreground ml-0.5">· {provenance}</span>}
    </div>
  );
}

/** Compact tutor result card rendered under an assistant reply. */
function TutorResultCard({ tutor, mode, onOpen }: { tutor: TutorCard; mode?: string | null; onOpen: () => void }) {
  const rates = [tutor.rateOnline, tutor.rateHome].filter((x) => x > 0);
  const rate =
    mode === "home" && tutor.rateHome > 0
      ? tutor.rateHome
      : mode === "online" && tutor.rateOnline > 0
        ? tutor.rateOnline
        : rates.length
          ? Math.min(...rates)
          : 0;

  return (
    <div className="sk-card-flat p-3.5 flex flex-col gap-2.5 text-left">
      <div className="flex items-start gap-3">
        <AvatarTile name={tutor.name} color={tutor.color} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[13.5px]">{tutor.name}</span>
            <span className="sk-pill sk-pill-green">
              <BadgeCheck className="w-3 h-3" /> Verified
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Stars rating={tutor.rating} />
            <span className="text-[11.5px] font-semibold tabular">{tutor.rating.toFixed(1)}</span>
            <span className="text-[11px] text-muted-foreground">({tutor.reviews} reviews)</span>
            <span className="sk-pill sk-pill-navy" title="Trust score — verification + reviews + reliability">
              <ShieldCheck className="w-3 h-3" /> Trust {tutor.trustScore}
            </span>
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug line-clamp-2">{tutor.headline}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tutor.whyMatched.slice(0, 4).map((w) => (
          <span key={w} className="sk-pill sk-pill-blue">
            {w}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap border-t border-border/70 pt-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {rate > 0 && <span className="text-[12.5px] font-bold text-brand-navy tabular">₹{fils(rate)}/session</span>}
          <ModeIcons modes={tutor.modes} />
        </div>
        <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={onOpen}>
          <CalendarCheck className="w-3.5 h-3.5" /> View &amp; book
        </button>
      </div>
    </div>
  );
}

/* ---------------- view ---------------- */

export function SConcierge() {
  const { user, setView } = useAppStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* profile dialog (booking happens in Find Tutors) */
  const [profile, setProfile] = useState<TutorDetail | null>(null);
  const [profileId, setProfileId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  /* ---------- concierge API ---------- */
  const sendMsg = async (text: string, history: { role: "user" | "assistant"; text: string }[]) => {
    setBusy(true);
    let serverMsg = "";
    try {
      const res = await fetch("/api/tutors/concierge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.error) {
        serverMsg = json?.error?.message || "";
        throw new Error(serverMsg || `Request failed (${res.status})`);
      }
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: json.data.reply,
          tutors: Array.isArray(json.data.tutors) ? json.data.tutors : [],
          filters: json.data.filters ?? EMPTY_FILTERS,
          provenance: json.data.provenance,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setMessages((m) => [
        ...m,
        { role: "assistant", text: serverMsg && msg ? msg : "Couldn't reach the concierge — try again.", failed: true, retryOf: text },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    void sendMsg(text, history);
  };

  const retry = () => {
    const last = messages[messages.length - 1];
    if (!last?.retryOf || busy) return;
    const text = last.retryOf;
    const trimmed = messages.slice(0, Math.max(0, messages.length - 2));
    setMessages([...trimmed, { role: "user", text }]);
    void sendMsg(text, trimmed.slice(-6).map((m) => ({ role: m.role, text: m.text })));
  };

  /* ---------- tutor profile dialog ---------- */
  const openProfile = (id: string) => {
    setProfileId(id);
    setProfile(null);
    setProfileError("");
    setProfileOpen(true);
    setProfileLoading(true);
    fetch(`/api/tutors/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.error) throw new Error(json?.error?.message || "Couldn't load this profile.");
        setProfile(json.data as TutorDetail);
      })
      .catch((e) => setProfileError(e instanceof Error ? e.message : "Couldn't load this profile."))
      .finally(() => setProfileLoading(false));
  };

  const firstName = user?.name.split(" ")[0] ?? "";

  /* ================= render ================= */
  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Concierge</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Describe what you need — I&apos;ll find your best-matched verified tutors.
          </p>
        </div>
        <span className="sk-pill sk-pill-green">
          <ShieldCheck className="w-3 h-3" /> Verified tutors only
        </span>
      </div>

      {/* ---------- chat card ---------- */}
      <div className="max-w-3xl mx-auto">
        <div className="sk-card p-0 overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
          {/* chat header */}
          <div className="shrink-0 px-5 py-3.5 border-b flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
            <span
              className="sk-avatar shrink-0"
              style={{ width: 38, height: 38, borderRadius: 13, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 15 }}
            >
              <ConciergeBell className="w-5 h-5 text-white" />
            </span>
            <div>
              <div className="text-[14px] font-extrabold">Tutor Concierge</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F9D68]" />
                {busy ? "matching tutors…" : "online · natural-language search"}
              </div>
            </div>
            <span className="sk-pill sk-pill-navy ml-auto hidden sm:inline-flex">
              <Sparkles className="w-3 h-3" /> Smart search
            </span>
          </div>

          {/* messages */}
          <div ref={scrollRef} aria-live="polite" className="flex-1 max-h-[52vh] overflow-y-auto sk-scroll p-5 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <span
                  className="sk-avatar mx-auto"
                  style={{ width: 60, height: 60, borderRadius: 20, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 24 }}
                >
                  <ConciergeBell className="w-7 h-7 text-white" />
                </span>
                <h3 className="text-[15.5px] font-extrabold mt-3">
                  Hi{firstName ? ` ${firstName}` : ""}! I&apos;m your tutor concierge ✨
                </h3>
                <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
                  Tell me your board, grade, subject, mode or budget in plain words — I&apos;ll rank the best-matched verified
                  tutors for you.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  <span className="sk-pill sk-pill-grey">Boards · Grades 6–10 · Subjects</span>
                  <span className="sk-pill sk-pill-grey">Online · Home · Group</span>
                  <span className="sk-pill sk-pill-grey">Budget-aware in ₹</span>
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div
                    className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md text-white text-[13px] leading-relaxed"
                    style={{ background: "linear-gradient(180deg,#33549E,#14246B)" }}
                  >
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-2.5 justify-start">
                  <span
                    className="sk-avatar shrink-0 mt-0.5"
                    style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 12 }}
                  >
                    <ConciergeBell className="w-4 h-4 text-white" />
                  </span>
                  <div className="max-w-[92%] min-w-0 space-y-2">
                    <div
                      className={clsx(
                        "px-4 py-2.5 rounded-2xl rounded-bl-md text-[13px] leading-relaxed border",
                        m.failed
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-white border-border shadow-sm text-foreground"
                      )}
                    >
                      {m.text}
                      {m.failed && m.retryOf && (
                        <div className="mt-2">
                          <button className="sk-btn sk-btn-ghost sk-btn-sm !text-red-700" onClick={retry} disabled={busy}>
                            <RefreshCw className="w-3.5 h-3.5" /> Retry
                          </button>
                        </div>
                      )}
                    </div>
                    {m.filters && <FilterEcho filters={m.filters} provenance={m.provenance} />}
                    {!!m.tutors?.length && (
                      <div className="space-y-2.5 pt-1">
                        {m.tutors.map((t) => (
                          <TutorResultCard key={t.id} tutor={t} mode={m.filters?.mode} onOpen={() => openProfile(t.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {busy && (
              <div className="flex gap-2.5 justify-start">
                <span
                  className="sk-avatar shrink-0 mt-0.5"
                  style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 12 }}
                >
                  <ConciergeBell className="w-4 h-4 text-white" />
                </span>
                <div className="bg-white border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#14246B]/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[#14246B]/40 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[#14246B]/40 animate-bounce" style={{ animationDelay: "240ms" }} />
                  <span className="text-[11.5px] text-muted-foreground ml-1.5">Matching tutors…</span>
                </div>
              </div>
            )}
          </div>

          {/* composer */}
          <div className="shrink-0 border-t p-3 space-y-2.5" style={{ borderColor: "var(--border)" }}>
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button key={s} className="sk-chip" onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                className="sk-input flex-1 resize-none min-h-[42px] max-h-32"
                rows={1}
                placeholder="e.g. 'I need a CBSE Grade 8 Maths tutor for algebra'"
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                aria-label="Describe the tutor you need"
                disabled={busy}
              />
              <button className="sk-btn sk-btn-orange !px-4" onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send message">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- tutor profile dialog (booking continues in Find Tutors) ---------- */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto sk-scroll" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Tutor profile</DialogTitle>
          {profileLoading ? (
            <LoadingView label="Loading profile…" />
          ) : profileError ? (
            <EmptyState
              icon={ShieldAlert}
              title="Couldn't load this profile"
              sub={profileError}
              action={
                <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => openProfile(profileId)}>
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              }
            />
          ) : profile ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3.5">
                  <AvatarTile name={profile.name} color={profile.color} size={54} />
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 flex-wrap text-[17px] font-bold">
                      {profile.name}
                      <span className="sk-pill sk-pill-green">
                        <BadgeCheck className="w-3 h-3" /> Verified tutor
                      </span>
                    </h2>
                    <DialogDescription className="mt-1">{profile.headline}</DialogDescription>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Stars rating={profile.rating} />
                      <span className="text-[12px] font-semibold tabular">{profile.rating.toFixed(1)}</span>
                      <span className="text-[11.5px] text-muted-foreground">({profile.reviewCount} reviews)</span>
                      <span className="sk-pill sk-pill-navy" title="Trust score — verification + reviews + reliability">
                        <ShieldCheck className="w-3 h-3" /> Trust {profile.trustScore}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground">
                        · {profile.years} yrs · {profile.sessionsDone.toLocaleString()} sessions
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {profile.bio && <p className="text-[13px] leading-relaxed text-muted-foreground">{profile.bio}</p>}

                {!!profile.badges.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.badges.map((b) => (
                      <span key={b} className="sk-pill sk-pill-blue">
                        <BadgeCheck className="w-3 h-3" /> {b}
                      </span>
                    ))}
                  </div>
                )}

                {/* pricing */}
                <div>
                  <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                    <GraduationCap className="w-4 h-4 text-brand-navy" /> Pricing{" "}
                    <span className="sk-pill sk-pill-grey">escrow protected</span>
                  </h3>
                  <div className="sk-well rounded-2xl p-3 space-y-1.5">
                    {[
                      { key: "online", label: "Online 1:1", fee: profile.rateOnline },
                      { key: "home", label: "Home visit", fee: profile.rateHome },
                    ]
                      .filter((r) => r.fee > 0)
                      .map((r) => (
                        <div key={r.key} className="flex items-center justify-between gap-3 text-[12.5px]">
                          <span className="font-semibold">{r.label}</span>
                          <span className="tabular text-right">
                            ₹{fils(r.fee)}{" "}
                            <span className="text-muted-foreground">· escrow total ₹{fils(r.fee + Math.round(r.fee * 0.08))}</span>
                          </span>
                        </div>
                      ))}
                    {profile.modes.includes("group") && (
                      <div className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="font-semibold">Group class</span>
                        <span className="text-muted-foreground">seat prices from the Group Classes page</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* offerings */}
                {!!profile.offerings.length && (
                  <div>
                    <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                      <GraduationCap className="w-4 h-4 text-brand-navy" /> What they teach
                    </h3>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {profile.offerings.slice(0, 8).map((o) => (
                        <div key={o.id} className="sk-well rounded-xl px-3 py-2 text-[12px] flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="font-semibold">{o.subject}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {MODE_LABEL[o.mode] ?? o.mode} · {o.board} {o.grade}
                            </span>
                          </span>
                          <span className="shrink-0 font-bold text-brand-navy tabular">₹{fils(o.price)}</span>
                        </div>
                      ))}
                    </div>
                    {profile.offerings.length > 8 && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">+ {profile.offerings.length - 8} more offerings</p>
                    )}
                  </div>
                )}

                {/* recent reviews */}
                {!!profile.reviews.length && (
                  <div>
                    <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                      <Star className="w-4 h-4 text-brand-navy" /> Recent reviews
                    </h3>
                    <div className="space-y-1.5">
                      {profile.reviews.slice(0, 2).map((r, i) => (
                        <div key={i} className="sk-well rounded-xl px-3.5 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Stars rating={r.rating} />
                            <span className="text-[12px] font-semibold">{r.name}</span>
                            <span className="text-[11px] text-muted-foreground ml-auto">{fromNow(r.at)}</span>
                          </div>
                          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* footer CTA — booking flow lives in Find Tutors */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/70 flex-wrap">
                <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> Replies in ~{profile.responseMins}m
                </span>
                <button className="sk-btn sk-btn-orange" onClick={() => setView("s-find")}>
                  <Search className="w-4 h-4" /> Open Find Tutors to book
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
