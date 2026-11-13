"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { toast } from "@/hooks/use-toast";
import { kwd, fils } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Search,
  Sparkles,
  BadgeCheck,
  Star,
  Video,
  MapPin,
  Users,
  Languages,
  Clock,
  RefreshCw,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Briefcase,
  CreditCard,
  CheckCircle2,
  Lock,
  CalendarCheck,
  ShieldCheck,
  Wand2,
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
interface Offering {
  id: string;
  mode: string;
  board: string;
  boardCode: string;
  grade: string;
  subject: string;
  price: number;
}
interface TutorProfile extends Omit<TutorCard, "reviews"> {
  bio: string;
  qualifications: { title: string; issuer: string; year: number; status: string }[];
  experience: { role: string; org: string; from: string; to: string; verified: boolean }[];
  offerings: Offering[];
  reviews: { name: string; rating: number; comment: string; at: string }[];
  reviewCount: number;
  availableSlots: { startAt: string; label: string }[];
}
interface Filters {
  board: string;
  grade: string;
  subject: string;
  mode: string;
  q: string;
}

/* ---------------- constants ---------------- */
const BOARD_CHIPS = ["CBSE", "ICSE", "IGCSE", "IB-MYP", "AMERICAN", "TN-STATE"];
const BOARD_CHIP_LABEL: Record<string, string> = { "TN-STATE": "TN State Board" };
const GRADE_CHIPS = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const SUBJECT_CHIPS = ["Mathematics", "Science", "English"];
const SUGGESTIONS = ["CBSE Grade 8 maths at home", "Top rated English online", "IGCSE Science", "Cheap maths tutor"];
const DEFAULT_FILTERS: Filters = { board: "", grade: "", subject: "", mode: "", q: "" };

/* ---------------- helpers ---------------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) {
    const err = new Error(json?.error?.message || `Request failed (${res.status})`) as Error & { payload?: any };
    err.payload = json;
    throw err;
  }
  return json.data as T;
}

/** Client-side concierge parsing: plain english → filters + sort. */
function parseQuery(text: string): { filters: Partial<Filters>; sort: "fit" | "rating" | "price"; label: string } {
  const t = ` ${text.toLowerCase()} `;
  const f: Partial<Filters> = {};
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (has("cbse")) f.board = "CBSE";
  else if (has("icse", "isc")) f.board = "ICSE";
  else if (has("igcse", "cambridge")) f.board = "IGCSE";
  else if (has("ib myp", "ib-myp", "ibmyp", " myp ")) f.board = "IB-MYP";
  else if (has("american", "us curriculum")) f.board = "AMERICAN";
  else if (has("tamil nadu", "samacheer", "state board", "tn state")) f.board = "TN-STATE";

  const g = t.match(/(grade|class|year)\s*([6-9]|10)/) || t.match(/\b([6-9]|10)(?:th|st|nd|rd)\b/);
  if (g) f.grade = `Grade ${g[2] ?? g[1]}`;

  if (has("math", "maths", "mathematics", "algebra", "geometry")) f.subject = "Mathematics";
  else if (has("science", "physics", "chemistry", "biology")) f.subject = "Science";
  else if (has("english", "writing", "literature")) f.subject = "English";

  if (has("at home", "home visit", " home ", "house visit")) f.mode = "home";
  else if (has("online", "virtual", "remote")) f.mode = "online";
  else if (has("group", "batch")) f.mode = "group";

  let sort: "fit" | "rating" | "price" = "fit";
  if (has("cheap", "budget", "affordable", "low price", "lowest")) sort = "price";
  if (has("top", "best", "highest rated")) sort = "rating";

  const labelParts = [f.board, f.grade, f.subject].filter(Boolean).join(" ");
  return { filters: f, sort, label: labelParts || "your request" };
}

function Stars({ rating, size = 3.5 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-${size} h-${size} ${i <= Math.round(rating) ? "text-[#E8A20C] fill-[#E8A20C]" : "text-muted-foreground/40"}`}
          style={{ width: size * 4, height: size * 4 }}
        />
      ))}
    </span>
  );
}

function TrustRing({ score }: { score: number }) {
  return (
    <div className="relative w-11 h-11 shrink-0" title={`Trust score ${score}% — verification + reviews + reliability`}>
      <div className="w-11 h-11 rounded-full" style={{ background: `conic-gradient(#1F9D68 ${score}%, #DFE6F2 0)` }} />
      <div className="absolute inset-[4px] rounded-full bg-white dark:bg-[#161D3A] flex items-center justify-center">
        <div className="text-center leading-none">
          <div className="text-[10px] font-extrabold tabular text-brand-navy">{score}</div>
          <div className="text-[6.5px] font-bold text-muted-foreground tracking-wide">TRUST</div>
        </div>
      </div>
    </div>
  );
}

function ModeIcons({ modes }: { modes: string[] }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
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

/* ---------------- view ---------------- */
export function SFind() {
  const { user } = useAppStore();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<TutorCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"fit" | "rating" | "price">("fit");

  /* concierge */
  const [conciergeOpen, setConciergeOpen] = useState(true);
  const [chat, setChat] = useState<{ role: "bot" | "user"; text: string }[]>([
    { role: "bot", text: "Hi! I'm your tutor concierge ✨ Tell me what you need and I'll find verified tutors for you." },
  ]);
  const [draft, setDraft] = useState("");
  const announceRef = useRef<string | null>(null);

  /* my profile basics (grade/board) + addresses (from own bookings) */
  const [myInfo, setMyInfo] = useState<{ grade: string; board: string } | null>(null);
  const [addresses, setAddresses] = useState<{ id: string; label: string; area: string }[]>([]);

  /* profile dialog */
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  /* booking wizard */
  const [wizard, setWizard] = useState<{
    open: boolean;
    step: number;
    mode: string;
    subject: string;
    slot: { startAt: string; label: string } | null;
    addressId: string;
    cardNo: string;
    paying: boolean;
    error: string;
    slotTaken: { message: string; nextSlots: { startAt: string; label: string }[] } | null;
    success: { invoiceNo: string; amount: number } | null;
  }>({
    open: false, step: 1, mode: "online", subject: "", slot: null, addressId: "",
    cardNo: "", paying: false, error: "", slotTaken: null, success: null,
  });

  const setWiz = (patch: Partial<typeof wizard>) => setWizard((w) => ({ ...w, ...patch }));

  /* ---------- search effect (debounced) ---------- */
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (filters.board) params.set("board", filters.board);
      if (filters.grade) params.set("grade", filters.grade);
      if (filters.subject) params.set("subject", filters.subject);
      if (filters.mode) params.set("mode", filters.mode);
      if (filters.q) params.set("q", filters.q);
      fetch(`/api/tutors?${params.toString()}`, { cache: "no-store" })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
          return json.data as TutorCard[];
        })
        .then((data) => {
          setResults(data);
          if (announceRef.current) {
            setChat((c) => [
              ...c,
              {
                role: "bot",
                text:
                  data.length > 0
                    ? `Found ${data.length} verified tutor${data.length === 1 ? "" : "s"} for ${announceRef.current} — ranked by curriculum fit, rating and response time.`
                    : `No verified tutors match ${announceRef.current} yet — try removing a filter or another subject.`,
              },
            ]);
            announceRef.current = null;
          }
        })
        .catch((e) => setError(e.message || "Couldn't search tutors."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  /* ---------- my grade/board + home addresses ---------- */
  useEffect(() => {
    getJson<{ student: { grade: string; board: string } }>("/api/student/dashboard")
      .then((d) => setMyInfo({ grade: d.student.grade, board: d.student.board }))
      .catch(() => {});
    getJson<{ address: { id: string; label: string; area: string } | null }[]>("/api/bookings")
      .then((rows) => {
        const seen = new Map<string, { id: string; label: string; area: string }>();
        for (const r of rows) if (r.address) seen.set(r.address.id, r.address);
        setAddresses(Array.from(seen.values()));
      })
      .catch(() => {});
  }, []);

  /* ---------- concierge ---------- */
  const ask = (text?: string) => {
    const q = (text ?? draft).trim();
    if (!q) return;
    setDraft("");
    setChat((c) => [...c, { role: "user", text: q }]);
    const { filters: f, sort: s, label } = parseQuery(q);
    setSort(s);
    announceRef.current = label;
    setFilters((prev) => ({ ...DEFAULT_FILTERS, ...f, q: "" }));
  };

  /* ---------- profile dialog ---------- */
  const openProfile = (id: string) => {
    setProfileId(id);
    setProfile(null);
    setProfileError("");
    setProfileOpen(true);
    setProfileLoading(true);
    getJson<TutorProfile>(`/api/tutors/${id}`)
      .then(setProfile)
      .catch((e) => setProfileError(e.message || "Couldn't load this profile."))
      .finally(() => setProfileLoading(false));
  };

  /* ---------- booking wizard ---------- */
  const openWizard = (p: TutorProfile, slot?: { startAt: string; label: string }, mode?: string) => {
    const firstMode = mode && p.modes.includes(mode) ? mode : p.modes.includes("online") ? "online" : p.modes[0] || "online";
    setProfileOpen(false); // close profile dialog, keep profile data for the wizard
    setWizard({
      open: true,
      step: 1,
      mode: firstMode,
      subject: filters.subject && p.subjects.includes(filters.subject) ? filters.subject : p.subjects[0] || "",
      slot: slot ?? null,
      addressId: addresses[0]?.id ?? "",
      cardNo: "",
      paying: false,
      error: "",
      slotTaken: null,
      success: null,
    });
  };

  const wizOffering = profile
    ? (() => {
        const offs = profile.offerings.filter((o) => o.mode === wizard.mode && o.subject === wizard.subject);
        const grade = myInfo?.grade ?? "";
        const board = myInfo?.board ?? "";
        return offs.find((o) => o.grade === grade && o.boardCode === board) ?? offs.find((o) => o.grade === grade) ?? offs[0] ?? null;
      })()
    : null;

  const wizFees = (() => {
    const fee = wizOffering?.price ?? (wizard.mode === "home" ? profile?.rateHome : profile?.rateOnline) ?? 0;
    const platform = Math.round(fee * 0.08);
    return { sessionFee: fee, platformFee: platform, total: fee + platform };
  })();

  const pay = async () => {
    if (!profile || !wizard.slot) return;
    setWiz({ paying: true, error: "" });
    try {
      /* 1 — create the booking (server computes fees) */
      const booking = await postJson<{ id: string }>("/api/bookings", {
        tutorId: profile.id,
        studentId: user?.id,
        mode: wizard.mode,
        subject: wizard.subject,
        board: wizOffering?.boardCode ?? myInfo?.board ?? "CBSE",
        grade: wizOffering?.grade ?? myInfo?.grade ?? "Grade 8",
        startAt: wizard.slot.startAt,
        addressId: wizard.mode === "home" ? wizard.addressId || undefined : undefined,
      });
      /* 2 — payment intent (UPI) */
      const intent = await postJson<{ paymentId: string; amount: number }>("/api/payments/intents", {
        bookingId: booking.id,
        method: "upi",
      });
      /* 3 — confirm → escrow + invoice */
      const confirmed = await postJson<{ ok: boolean; invoiceNo: string }>("/api/payments/confirm", {
        paymentId: intent.paymentId,
      });
      setWiz({ paying: false, step: 4, success: { invoiceNo: confirmed.invoiceNo, amount: intent.amount } });
      toast({
        title: "Payment held in escrow 🔒",
        description: `${kwd(intent.amount)} paid via UPI — released to the tutor only after the session. Invoice ${confirmed.invoiceNo}.`,
      });
    } catch (e) {
      const err = e as Error & { payload?: any };
      if (err.payload?.error?.code === "SLOT_TAKEN") {
        setWiz({
          paying: false,
          step: 1,
          slot: null,
          slotTaken: {
            message: err.payload.error.message,
            nextSlots: err.payload.error.fields?.nextSlots ?? [],
          },
        });
      } else {
        setWiz({ paying: false, error: err.message || "Payment failed — please try again." });
      }
    }
  };

  const sorted = (results ?? []).slice().sort((a, b) => {
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "price") {
      const pa = Math.min(...[a.rateOnline, a.rateHome].filter((x) => x > 0), Infinity);
      const pb = Math.min(...[b.rateOnline, b.rateHome].filter((x) => x > 0), Infinity);
      return pa - pb;
    }
    return 0; /* API already ranks by curriculum fit */
  });

  const activeFilterCount = [filters.board, filters.grade, filters.subject, filters.mode, filters.q].filter(Boolean).length;

  /* ================= render ================= */
  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Find Tutors</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Every tutor here is document-verified — ID, qualifications and background checks.
          </p>
        </div>
        <span className="sk-pill sk-pill-green">
          <ShieldCheck className="w-3 h-3" /> 100% verified marketplace
        </span>
      </div>

      {/* ---------- concierge panel ---------- */}
      <div className="sk-card p-5">
        <button className="flex items-center gap-2.5 w-full text-left" onClick={() => setConciergeOpen((o) => !o)}>
          <span className="sk-avatar shrink-0" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 15, background: "linear-gradient(180deg,#5A83F0,#315BE5)" }}>
            <Wand2 className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[14.5px]">Tutor Concierge</div>
            <div className="text-[12px] text-muted-foreground">Describe what you need in plain words — I'll do the searching</div>
          </div>
          <span className="sk-pill sk-pill-grey">{conciergeOpen ? "Hide" : "Show"}</span>
        </button>
        {conciergeOpen && (
          <div className="mt-4">
            <div className="sk-well rounded-2xl p-3.5 space-y-2.5 max-h-56 overflow-y-auto sk-scroll">
              {chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-[12.5px] leading-relaxed ${
                      m.role === "user"
                        ? "text-white rounded-br-md"
                        : "bg-white border border-border rounded-bl-md shadow-sm"
                    }`}
                    style={m.role === "user" ? { background: "linear-gradient(180deg,#33549E,#14246B)" } : undefined}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="sk-chip" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                className="sk-input flex-1"
                placeholder="Tell me what you need — e.g. 'CBSE Grade 8 maths at home, evenings'"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ask();
                }}
                aria-label="Describe what you need"
              />
              <button className="sk-btn sk-btn-primary" onClick={() => ask()} disabled={!draft.trim()}>
                <Sparkles className="w-4 h-4" /> Ask
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- filter bar ---------- */}
      <div className="sk-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-14 shrink-0">Board</span>
          {BOARD_CHIPS.map((b) => (
            <button
              key={b}
              className={`sk-chip ${filters.board === b ? "sk-chip-active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, board: f.board === b ? "" : b }))}
            >
              {BOARD_CHIP_LABEL[b] ?? b}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-14 shrink-0">Grade</span>
          {GRADE_CHIPS.map((g) => (
            <button
              key={g}
              className={`sk-chip ${filters.grade === g ? "sk-chip-active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, grade: f.grade === g ? "" : g }))}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-14 shrink-0">Subject</span>
          {SUBJECT_CHIPS.map((s) => (
            <button
              key={s}
              className={`sk-chip ${filters.subject === s ? "sk-chip-active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, subject: f.subject === s ? "" : s }))}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-14 shrink-0">Mode</span>
            <div className="sk-segment">
              {[
                { id: "", label: "All" },
                { id: "online", label: "Online" },
                { id: "home", label: "Home" },
                { id: "group", label: "Group" },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`sk-segment-item ${filters.mode === m.id ? "sk-segment-item-active" : ""}`}
                  onClick={() => setFilters((f) => ({ ...f, mode: m.id }))}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-[200px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="sk-input pl-9"
                placeholder="Search by name or headline…"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                aria-label="Search tutors"
              />
            </div>
            {activeFilterCount > 0 && (
              <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- results header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight">
            {loading ? "Searching…" : `${sorted.length} verified tutor${sorted.length === 1 ? "" : "s"}`}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">Ranked by curriculum fit, rating and response time</p>
        </div>
        <div className="sk-segment">
          {[
            { id: "fit", label: "Best fit" },
            { id: "rating", label: "Top rated" },
            { id: "price", label: "Lowest price" },
          ].map((s) => (
            <button
              key={s.id}
              className={`sk-segment-item ${sort === s.id ? "sk-segment-item-active" : ""}`}
              onClick={() => setSort(s.id as typeof sort)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- results ---------- */}
      {error ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Couldn't load tutors"
            sub={error}
            action={
              <button className="sk-btn sk-btn-primary" onClick={() => setFilters({ ...filters })}>
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            }
          />
        </div>
      ) : loading ? (
        <LoadingView label="Finding your matches…" />
      ) : sorted.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Search}
            title="No tutors match those filters"
            sub="Try removing a filter, or ask the concierge above — new verified tutors join every week."
            action={
              <button className="sk-btn sk-btn-primary" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear all filters
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sorted.map((t) => {
            const rates = [t.rateOnline, t.rateHome].filter((x) => x > 0);
            const from = rates.length ? Math.min(...rates) : 0;
            return (
              <div key={t.id} className="sk-card p-5 flex flex-col gap-3">
                <div className="flex items-start gap-3.5">
                  <AvatarTile name={t.name} color={t.color} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[15px]">{t.name}</span>
                      <span className="sk-pill sk-pill-green">
                        <BadgeCheck className="w-3 h-3" /> Verified
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Stars rating={t.rating} />
                      <span className="text-[12px] font-semibold tabular">{t.rating.toFixed(1)}</span>
                      <span className="text-[11.5px] text-muted-foreground">({t.reviews} reviews)</span>
                    </div>
                    <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">{t.headline}</p>
                  </div>
                  <TrustRing score={t.trustScore} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {t.whyMatched.slice(0, 3).map((w) => (
                    <span key={w} className="sk-pill sk-pill-blue">
                      {w}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
                  {from > 0 && (
                    <span className="font-bold text-brand-navy text-[13px] tabular">from ₹{fils(from)}/session</span>
                  )}
                  <ModeIcons modes={t.modes} />
                  <span className="flex items-center gap-1">
                    <Languages className="w-3.5 h-3.5" /> {t.languages.slice(0, 3).join(", ")}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/70 mt-auto">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" /> Replies in ~{t.responseMins}m · {t.sessionsDone.toLocaleString()} sessions
                  </span>
                  <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => openProfile(t.id)}>
                    View profile
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- profile dialog ---------- */}
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
                      <span className="text-[11.5px] text-muted-foreground">· {profile.years} yrs · {profile.sessionsDone.toLocaleString()} sessions</span>
                    </div>
                  </div>
                  <TrustRing score={profile.trustScore} />
                </div>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* bio */}
                <p className="text-[13px] leading-relaxed text-muted-foreground">{profile.bio}</p>

                {/* badges */}
                <div className="flex flex-wrap gap-1.5">
                  {profile.badges.map((b) => (
                    <span key={b} className="sk-pill sk-pill-blue">
                      <BadgeCheck className="w-3 h-3" /> {b}
                    </span>
                  ))}
                </div>

                {/* qualifications */}
                <div>
                  <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                    <GraduationCap className="w-4 h-4 text-brand-navy" /> Qualifications
                  </h3>
                  <div className="space-y-1.5">
                    {profile.qualifications.map((q, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-[12.5px] sk-well rounded-xl px-3 py-2">
                        <span className="font-semibold truncate">{q.title}</span>
                        <span className="text-muted-foreground shrink-0">
                          {q.issuer} · {q.year}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* experience */}
                <div>
                  <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                    <Briefcase className="w-4 h-4 text-brand-navy" /> Experience
                  </h3>
                  <div className="space-y-1.5">
                    {profile.experience.map((x, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-[12.5px] sk-well rounded-xl px-3 py-2">
                        <span className="font-semibold truncate">
                          {x.role} <span className="text-muted-foreground font-normal">· {x.org}</span>
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {x.from}–{x.to}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* price table */}
                <div>
                  <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                    <CreditCard className="w-4 h-4 text-brand-navy" /> Pricing <span className="sk-pill sk-pill-grey">escrow protected</span>
                  </h3>
                  <div className="sk-well rounded-2xl overflow-hidden">
                    <table className="w-full text-[12.5px] tabular">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/70">
                          <th className="text-left py-2.5 pl-3.5 font-bold">Mode</th>
                          <th className="text-right py-2.5 font-bold">Session</th>
                          <th className="text-right py-2.5 font-bold">Platform 8%</th>
                          <th className="text-right py-2.5 pr-3.5 font-bold">Escrow total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: "online", label: "Online 1:1", fee: profile.rateOnline },
                          { key: "home", label: "Home visit", fee: profile.rateHome },
                        ]
                          .filter((r) => r.fee > 0)
                          .map((r) => (
                            <tr key={r.key} className="border-b border-border/50 last:border-0">
                              <td className="py-2.5 pl-3.5 font-semibold">{r.label}</td>
                              <td className="text-right py-2.5">₹{fils(r.fee)}</td>
                              <td className="text-right py-2.5 text-muted-foreground">₹{fils(Math.round(r.fee * 0.08))}</td>
                              <td className="text-right py-2.5 pr-3.5 font-bold text-brand-navy">₹{fils(r.fee + Math.round(r.fee * 0.08))}</td>
                            </tr>
                          ))}
                        {profile.modes.includes("group") && (
                          <tr>
                            <td className="py-2.5 pl-3.5 font-semibold">
                              Group class
                              <span className="block text-[10.5px] text-muted-foreground font-normal">from the Group Classes page</span>
                            </td>
                            <td className="text-right py-2.5 text-muted-foreground" colSpan={3}>
                              seat prices from ₹2,500
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* reviews */}
                <div>
                  <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                    <Star className="w-4 h-4 text-[#E8A20C] fill-[#E8A20C]" /> Recent reviews
                  </h3>
                  {profile.reviews.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">No written reviews yet — be the first after your session.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto sk-scroll pr-1">
                      {profile.reviews.map((r, i) => (
                        <div key={i} className="sk-well rounded-xl px-3.5 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[12.5px]">{r.name}</span>
                            <Stars rating={r.rating} size={3} />
                          </div>
                          {r.comment && <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* slots */}
                <div>
                  <h3 className="text-[13.5px] font-bold flex items-center gap-1.5 mb-2">
                    <CalendarCheck className="w-4 h-4 text-brand-navy" /> Available slots
                    <span className="text-[11px] font-normal text-muted-foreground">next 7 days · 45-min sessions</span>
                  </h3>
                  {profile.availableSlots.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">This tutor is fully booked this week — check back soon.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto sk-scroll p-1">
                      {profile.availableSlots.map((s) => (
                        <button key={s.startAt} className="sk-chip" onClick={() => openWizard(profile, s)}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Payments stay in escrow until after the session
                  </span>
                  <button className="sk-btn sk-btn-orange" onClick={() => openWizard(profile)}>
                    Book a session
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ---------- booking wizard dialog ---------- */}
      <Dialog
        open={wizard.open}
        onOpenChange={(o) => {
          if (!o) {
            setWiz({ open: false });
            setProfile(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto sk-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="w-4.5 h-4.5 text-brand-navy" style={{ width: 18, height: 18 }} />
              Book with {profile?.name ?? "tutor"}
            </DialogTitle>
            <DialogDescription>
              {wizard.success
                ? "All done — see you in class!"
                : wizard.step === 4
                  ? "Secure UPI checkout — held in escrow"
                  : `Step ${wizard.step} of 4 — ${wizard.step === 1 ? "session" : wizard.step === 2 ? "address" : wizard.step === 3 ? "review" : "pay"}`}
            </DialogDescription>
          </DialogHeader>

          {/* stepper */}
          {!wizard.success && (
            <div className="flex items-center justify-between px-1">
              {["Session", "Address", "Review", "Pay"].map((label, i) => {
                const n = i + 1;
                const active = wizard.step === n;
                const done = wizard.step > n || (wizard.step === 4 && wizard.success);
                return (
                  <div key={label} className={`sk-step ${active ? "sk-step-active" : done ? "sk-step-done" : ""}`}>
                    <span className="sk-step-dot">{done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3">
            {/* ---- step 1: mode + subject + slot ---- */}
            {wizard.step === 1 && profile && (
              <div className="space-y-4">
                {wizard.slotTaken && (
                  <div className="sk-callout sk-callout-warn">
                    <div className="font-semibold">{wizard.slotTaken.message}</div>
                    {wizard.slotTaken.nextSlots.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {wizard.slotTaken.nextSlots.map((s) => (
                          <button key={s.startAt} className="sk-chip" onClick={() => setWiz({ slot: s, slotTaken: null })}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Subject</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.subjects.map((s) => (
                      <button
                        key={s}
                        className={`sk-chip ${wizard.subject === s ? "sk-chip-active" : ""}`}
                        onClick={() => setWiz({ subject: s })}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Mode</div>
                  <div className="sk-segment">
                    {profile.modes.map((m) => (
                      <button
                        key={m}
                        className={`sk-segment-item ${wizard.mode === m ? "sk-segment-item-active" : ""}`}
                        onClick={() => setWiz({ mode: m })}
                      >
                        {m === "online" ? "Online 1:1" : m === "home" ? "Home visit" : "Group"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Pick a slot <span className="font-normal normal-case">· 45 minutes</span>
                  </div>
                  {profile.availableSlots.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">No free slots this week.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto sk-scroll p-1">
                      {profile.availableSlots.map((s) => (
                        <button
                          key={s.startAt}
                          className={`sk-chip ${wizard.slot?.startAt === s.startAt ? "sk-chip-active" : ""}`}
                          onClick={() => setWiz({ slot: s })}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {wizard.error && <div className="sk-callout sk-callout-danger">{wizard.error}</div>}
                <div className="flex justify-end">
                  <button
                    className="sk-btn sk-btn-primary"
                    disabled={!wizard.slot || !wizard.subject}
                    onClick={() => setWiz({ step: wizard.mode === "home" ? 2 : 3, error: "" })}
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ---- step 2: address (home only) ---- */}
            {wizard.step === 2 && (
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Home address</div>
                  {addresses.length === 0 ? (
                    <div className="sk-callout sk-callout-warn">
                      No home address on file yet. Ask your parent to add one from the Parent app, then come back to book a home visit.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {addresses.map((a) => (
                        <button
                          key={a.id}
                          className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition ${
                            wizard.addressId === a.id ? "bg-white ring-2 ring-[#315BE5]/50 shadow-sm" : "sk-well hover:brightness-[0.99]"
                          }`}
                          onClick={() => setWiz({ addressId: a.id })}
                        >
                          <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
                          <div>
                            <div className="font-semibold text-[13px]">
                              {a.label} — {a.area}
                            </div>
                            <div className="text-[11.5px] text-muted-foreground">OTP check-in + live tracking included for safety</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <button className="sk-btn sk-btn-ghost" onClick={() => setWiz({ step: 1 })}>
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    className="sk-btn sk-btn-primary"
                    disabled={!wizard.addressId}
                    onClick={() => setWiz({ step: 3 })}
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ---- step 3: review ---- */}
            {wizard.step === 3 && profile && (
              <div className="space-y-4">
                <div className="sk-well rounded-2xl p-4 space-y-2.5 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Tutor</span>
                    <span className="font-semibold">{profile.name}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Subject</span>
                    <span className="font-semibold">
                      {wizard.subject} · {wizOffering?.boardCode ?? myInfo?.board} {wizOffering?.grade ?? myInfo?.grade}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Mode</span>
                    <span className="font-semibold">{wizard.mode === "home" ? "Home visit" : wizard.mode === "group" ? "Group class" : "Online 1:1"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">When</span>
                    <span className="font-semibold">{wizard.slot?.label}</span>
                  </div>
                  {wizard.mode === "home" && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Address</span>
                      <span className="font-semibold text-right">
                        {addresses.find((a) => a.id === wizard.addressId)?.area ?? "—"}
                      </span>
                    </div>
                  )}
                  <div className="sk-divider" />
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Session fee</span>
                    <span className="tabular font-semibold">{kwd(wizFees.sessionFee)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Platform fee (8%)</span>
                    <span className="tabular font-semibold">{kwd(wizFees.platformFee)}</span>
                  </div>
                  <div className="flex justify-between gap-3 pt-1">
                    <span className="font-bold">Held in escrow</span>
                    <span className="tabular font-extrabold text-brand-navy text-[15px]">{kwd(wizFees.total)}</span>
                  </div>
                </div>
                <div className="sk-callout sk-callout-info flex gap-2.5">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Free cancellation until 12h before</span> the session starts · later cancellations split 50/50.
                    Funds are released to the tutor only after check-out and the dispute window closes.
                  </div>
                </div>
                {wizard.error && <div className="sk-callout sk-callout-danger">{wizard.error}</div>}
                <div className="flex justify-between">
                  <button className="sk-btn sk-btn-ghost" onClick={() => setWiz({ step: wizard.mode === "home" ? 2 : 1 })}>
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button className="sk-btn sk-btn-primary" onClick={() => setWiz({ step: 4 })}>
                    <CreditCard className="w-4 h-4" /> Continue to payment
                  </button>
                </div>
              </div>
            )}

            {/* ---- step 4: pay (UPI) or success ---- */}
            {wizard.step === 4 && (
              <div className="space-y-4">
                {wizard.success ? (
                  <div className="text-center py-4 space-y-3">
                    <div
                      className="sk-avatar mx-auto"
                      style={{ width: 62, height: 62, borderRadius: 20, background: "linear-gradient(180deg,#46BD85,#1F9D68)" }}
                    >
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="font-extrabold text-[17px]">Booking requested! 🎉</div>
                    <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
                      {profile?.name} usually replies within {profile?.responseMins ?? 30} minutes. Your{" "}
                      <span className="font-semibold text-foreground">{kwd(wizard.success.amount)}</span> is safely held in escrow.
                    </p>
                    <div className="sk-well rounded-xl px-4 py-2.5 inline-flex items-center gap-2 text-[12.5px]">
                      <CreditCard className="w-3.5 h-3.5 text-brand-navy" /> Invoice{" "}
                      <span className="font-bold tabular">{wizard.success.invoiceNo}</span>
                    </div>
                    <div>
                      <button className="sk-btn sk-btn-primary" onClick={() => setWiz({ open: false })}>
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="sk-card-flat p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-extrabold text-[15px] text-brand-navy">UPI</span>
                        <span className="sk-pill sk-pill-green">
                          <Lock className="w-3 h-3" /> Secure checkout
                        </span>
                      </div>
                      <div className="sk-well rounded-xl p-3.5 space-y-2 text-[12.5px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Merchant</span>
                          <span className="font-semibold">Tutor Amma Pvt. Ltd.</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Purpose</span>
                          <span className="font-semibold">
                            {wizard.subject} session · {wizard.slot?.label}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="font-bold">Amount</span>
                          <span className="font-extrabold tabular text-[16px] text-brand-navy">{kwd(wizFees.total)}</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground" htmlFor="upi-card">
                          Card number
                        </label>
                        <input
                          id="upi-card"
                          className="sk-input mt-1.5 tabular tracking-widest"
                          placeholder="0000 0000 0000 0000"
                          inputMode="numeric"
                          value={wizard.cardNo}
                          onChange={(e) =>
                            setWiz({
                              cardNo: e.target.value
                                .replace(/[^\d]/g, "")
                                .slice(0, 16)
                                .replace(/(\d{4})(?=\d)/g, "$1 "),
                            })
                          }
                        />
                        <p className="text-[11px] text-muted-foreground mt-1.5">Demo checkout — no real charge is made.</p>
                      </div>
                    </div>
                    {wizard.error && <div className="sk-callout sk-callout-danger">{wizard.error}</div>}
                    <div className="flex justify-between">
                      <button className="sk-btn sk-btn-ghost" disabled={wizard.paying} onClick={() => setWiz({ step: 3 })}>
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        className="sk-btn sk-btn-orange"
                        disabled={wizard.paying || wizard.cardNo.replace(/\s/g, "").length < 12}
                        onClick={pay}
                      >
                        {wizard.paying ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Processing…
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" /> Pay {kwd(wizFees.total)} securely
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
