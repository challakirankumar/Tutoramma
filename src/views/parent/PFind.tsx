"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { toast } from "@/hooks/use-toast";
import { kwd, dateTimeOf, untilLabel, MODE_LABEL } from "@/lib/format";
import {
  Search,
  Star,
  BadgeCheck,
  ShieldCheck,
  Clock,
  GraduationCap,
  MapPin,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Lock,
  CalendarCheck,
  MessageSquare,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/* ---------- types ---------- */
interface TutorCardData {
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
interface Slot {
  startAt: string;
  label: string;
}
interface TutorDetail extends Omit<TutorCardData, "reviews"> {
  bio: string;
  qualifications: unknown[];
  experience: unknown[];
  offerings: Offering[];
  reviewCount: number;
  reviews: { name: string; rating: number; comment: string; at: string }[];
  availableSlots: Slot[];
}
interface ChildLite {
  id: string;
  name: string;
  color: string;
  profile: { grade: string; board: string };
}
interface AddressLite {
  id: string;
  label: string;
  area: string;
  line1: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

const SUBJECT_FALLBACK = ["Mathematics", "Science", "English"];
const BOARD_FALLBACK = ["CBSE", "ICSE", "IGCSE", "IB-MYP", "AMERICAN", "TN-STATE"];
const MODE_FILTERS = ["online", "home", "group"];

type WizStep = "child" | "slot" | "address" | "review" | "paying" | "done" | "error";

/* ---------- trust ring ---------- */
function TrustRing({ score }: { score: number }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 85 ? "#1F9D68" : "#14246B";
  return (
    <div className="relative shrink-0" style={{ width: 52, height: 52 }} role="img" aria-label={`Trust score ${score} of 100`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="#E2E8F4" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-extrabold leading-none tabular">{score}</span>
        <span className="text-[7.5px] font-bold uppercase tracking-wider text-muted-foreground">trust</span>
      </div>
    </div>
  );
}

export function PFind() {
  const { setView } = useAppStore();
  const [tutors, setTutors] = useState<TutorCardData[] | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [board, setBoard] = useState("");
  const [mode, setMode] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<string[]>(SUBJECT_FALLBACK);
  const [boardOptions, setBoardOptions] = useState<string[]>(BOARD_FALLBACK);
  const [nonce, setNonce] = useState(0);

  const [children, setChildren] = useState<ChildLite[]>([]);
  const [addresses, setAddresses] = useState<AddressLite[]>([]);

  const [detail, setDetail] = useState<TutorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [offeringId, setOfferingId] = useState<string>("");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wiz, setWiz] = useState<{
    step: WizStep;
    childId: string;
    offering: Offering | null;
    slot: Slot | null;
    addressId: string;
    invoiceNo: string | null;
    payError: string;
  }>({ step: "child", childId: "", offering: null, slot: null, addressId: "", invoiceNo: null, payError: "" });

  /* tutors are filtered server-side — board codes & subject names from the registry */
  useEffect(() => {
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (board) params.set("board", board);
    if (mode) params.set("mode", mode);
    const qs = params.toString();
    setFetching(true);
    fetch(`/api/tutors${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
        const list: TutorCardData[] = Array.isArray(json.data) ? json.data : [];
        setTutors(list);
        if (Array.isArray(json.subjects) && json.subjects.length) setSubjectOptions(json.subjects);
        if (Array.isArray(json.boards) && json.boards.length) setBoardOptions(json.boards);
      })
      .catch((e) => setError(e.message || "Couldn't load tutors."))
      .finally(() => setFetching(false));
  }, [subject, board, mode, nonce]);

  const loadTutors = () => setNonce((n) => n + 1);

  useEffect(() => {
    getJson<{ children: ChildLite[]; addresses: AddressLite[] }>("/api/parent/children")
      .then((d) => {
        setChildren(d.children ?? []);
        setAddresses(d.addresses ?? []);
        setWiz((w) => ({ ...w, childId: w.childId || d.children?.[0]?.id || "" }));
      })
      .catch(() => setChildren([]));
  }, []);

  const openProfile = (t: TutorCardData) => {
    setProfileOpen(true);
    setDetailLoading(true);
    setDetail(null);
    getJson<TutorDetail>(`/api/tutors/${t.id}`)
      .then((d) => {
        setDetail(d);
        // default offering: match first child's board + grade, else first
        const firstChild = children[0];
        const preferred =
          (firstChild &&
            d.offerings?.find(
              (o) => o.boardCode === firstChild.profile.board && o.grade === firstChild.profile.grade
            )) ||
          d.offerings?.[0];
        setOfferingId(preferred?.id ?? "");
      })
      .catch((e) => {
        setProfileOpen(false);
        toast({ title: "Couldn't open profile", description: e.message, variant: "destructive" });
      })
      .finally(() => setDetailLoading(false));
  };

  const startWizard = () => {
    const offering = detail?.offerings.find((o) => o.id === offeringId) ?? null;
    if (!offering) {
      toast({ title: "Pick a class option first", description: "Choose a subject, mode and grade from the price table.", variant: "destructive" });
      return;
    }
    const defaultAddr = addresses.find((a) => a.label.toLowerCase() === "home") ?? addresses[0];
    setWiz({
      step: "child",
      childId: wiz.childId || children[0]?.id || "",
      offering,
      slot: null,
      addressId: defaultAddr?.id ?? "",
      invoiceNo: null,
      payError: "",
    });
    setProfileOpen(false);
    setWizardOpen(true);
  };

  const pay = async () => {
    if (!detail || !wiz.offering || !wiz.slot) return;
    setWiz((w) => ({ ...w, step: "paying" }));
    try {
      const booking = await postJson<{ id: string }>("/api/bookings", {
        tutorId: detail.id,
        studentId: wiz.childId,
        mode: wiz.offering.mode,
        subject: wiz.offering.subject,
        board: wiz.offering.board,
        grade: wiz.offering.grade,
        startAt: wiz.slot.startAt,
        ...(wiz.offering.mode === "home" && wiz.addressId ? { addressId: wiz.addressId } : {}),
      });
      const intent = await postJson<{ paymentId: string; alreadyPaid?: boolean }>("/api/payments/intents", {
        bookingId: booking.id,
        method: "upi",
      });
      let invoiceNo: string | null = null;
      if (!intent.alreadyPaid) {
        const conf = await postJson<{ invoiceNo: string }>("/api/payments/confirm", { paymentId: intent.paymentId });
        invoiceNo = conf.invoiceNo;
      }
      setWiz((w) => ({ ...w, step: "done", invoiceNo }));
      toast({
        title: "Booking requested & payment held",
        description: "Your UPI payment is safe in escrow — it's released to the tutor only after the session.",
      });
      loadTutors();
    } catch (e) {
      setWiz((w) => ({ ...w, step: "error", payError: e instanceof Error ? e.message : "Payment failed" }));
    }
  };

  const child = children.find((c) => c.id === wiz.childId);
  const defaultAddr = addresses.find((a) => a.label.toLowerCase() === "home") ?? addresses[0];

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Find a Tutor</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Verified tutors for every child — each booking is protected by escrow payments and safety check-ins.
          </p>
        </div>
      </div>

      {/* ---------- filters ---------- */}
      <div className="sk-card p-4 space-y-3">
        <FilterRow label="Subject" options={subjectOptions} value={subject} onChange={setSubject} />
        <FilterRow label="Board" options={boardOptions} value={board} onChange={setBoard} />
        <FilterRow label="Mode" options={MODE_FILTERS} value={mode} onChange={setMode} labels={MODE_LABEL} />
      </div>

      {/* ---------- tutor grid ---------- */}
      {error ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load tutors"
            sub={error}
            action={
              <button className="sk-btn sk-btn-primary" onClick={loadTutors}>
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            }
          />
        </div>
      ) : !tutors ? (
        <LoadingView label="Finding the best tutors…" />
      ) : !tutors || tutors.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={Search}
            title="No tutors match those filters"
            sub="Try widening the board or subject — new verified tutors join every week."
            action={
              <button
                className="sk-btn sk-btn-ghost"
                onClick={() => {
                  setSubject("");
                  setBoard("");
                  setMode("");
                }}
              >
                Clear filters
              </button>
            }
          />
        </div>
      ) : fetching ? (
        <LoadingView label="Updating matches…" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tutors.map((t) => (
            <div key={t.id} className="sk-card p-5 flex flex-col">
              <div className="flex items-start gap-3">
                <AvatarTile name={t.name} color={t.color} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[14.5px]">{t.name}</span>
                    {t.badges?.includes("ID verified") && (
                      <span className="sk-pill sk-pill-green">
                        <BadgeCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{t.headline}</p>
                </div>
                <TrustRing score={t.trustScore} />
              </div>

              <div className="flex items-center gap-3 flex-wrap mt-3 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <Star className="w-3.5 h-3.5 text-brand-orange" style={{ fill: "currentColor" }} /> {t.rating.toFixed(1)}
                </span>
                <span>({t.reviews} reviews)</span>
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5" /> {t.years} yrs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> ~{t.responseMins}m reply
                </span>
              </div>

              {t.whyMatched?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.whyMatched.slice(0, 3).map((m) => (
                    <span key={m} className="sk-pill sk-pill-blue">
                      {m}
                    </span>
                  ))}
                </div>
              )}

              <div className="sk-well p-2.5 mt-3 flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">From</span>
                <span className="font-bold tabular">{kwd(minRate(t))} / session</span>
              </div>

              <button className="sk-btn sk-btn-primary w-full mt-3.5" onClick={() => openProfile(t)}>
                View profile &amp; book <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- profile dialog ---------- */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[88vh] overflow-y-auto sk-scroll">
          {detailLoading || !detail ? (
            <div className="py-10">
              <LoadingView label="Opening tutor profile…" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <AvatarTile name={detail.name} color={detail.color} size={48} />
                  <div className="min-w-0">
                    <DialogTitle className="leading-tight">{detail.name}</DialogTitle>
                    <DialogDescription className="mt-0.5">{detail.headline}</DialogDescription>
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <span className="sk-pill sk-pill-orange">
                        <Star className="w-3 h-3" style={{ fill: "currentColor" }} /> {detail.rating.toFixed(1)} ({detail.reviewCount})
                      </span>
                      <span className="sk-pill sk-pill-green">
                        <ShieldCheck className="w-3 h-3" /> Trust {detail.trustScore}
                      </span>
                      <span className="sk-pill sk-pill-navy">{detail.sessionsDone}+ sessions</span>
                      {detail.badges.slice(0, 2).map((b) => (
                        <span key={b} className="sk-pill sk-pill-grey">
                          <BadgeCheck className="w-3 h-3" /> {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {detail.bio && <p className="text-[13px] leading-relaxed mt-3 text-muted-foreground">{detail.bio}</p>}

              {/* price table */}
              <div className="mt-4">
                <SectionTitle title="Classes &amp; prices" sub="Session fee + 8% platform service fee — held in escrow" />
                <div className="sk-well p-1.5 mt-2.5 max-h-56 overflow-y-auto sk-scroll">
                  {detail.offerings.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground p-3">No structured offerings listed — rates shown on the card apply.</p>
                  ) : (
                    detail.offerings.map((o) => {
                      const active = o.id === offeringId;
                      return (
                        <button
                          key={o.id}
                          onClick={() => setOfferingId(o.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${
                            active ? "bg-white shadow-sm ring-1 ring-[#14246B]/25" : "hover:bg-white/60"
                          }`}
                          aria-pressed={active}
                        >
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-semibold">
                              {o.subject} · {MODE_LABEL[o.mode] ?? o.mode}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {o.board} · {o.grade}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-[12.5px] font-bold tabular">{kwd(o.price)}</span>
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                active ? "border-[#14246B] bg-[#14246B]" : "border-[#C3CDE6]"
                              }`}
                            >
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* slots preview */}
              <div className="mt-4">
                <SectionTitle title="Available slots" sub="Pick one in the booking flow" />
                {detail.availableSlots.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground mt-2">
                    No published slots right now — you can still request a session and the tutor will confirm a time.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {detail.availableSlots.slice(0, 5).map((s, i) => (
                      <span key={i} className="sk-pill sk-pill-grey">
                        <CalendarCheck className="w-3 h-3" /> {s.label || dateTimeOf(s.startAt)}
                      </span>
                    ))}
                    {detail.availableSlots.length > 5 && (
                      <span className="sk-pill sk-pill-grey">+{detail.availableSlots.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>

              {/* reviews */}
              {detail.reviews.length > 0 && (
                <div className="mt-4">
                  <SectionTitle title="What parents say" />
                  <div className="space-y-2.5 mt-2.5 max-h-52 overflow-y-auto sk-scroll pr-1">
                    {detail.reviews.slice(0, 4).map((r, i) => (
                      <div key={i} className="sk-well p-3">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-semibold">{r.name}</span>
                          <span className="flex items-center gap-1 font-bold">
                            <Star className="w-3 h-3 text-brand-orange" style={{ fill: "currentColor" }} /> {r.rating}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-snug mt-1">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
                <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Payments stay in escrow until after the session
                </p>
                <button className="sk-btn sk-btn-orange" onClick={startWizard}>
                  Book for child <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- booking wizard ---------- */}
      <Dialog open={wizardOpen} onOpenChange={(open) => setWizardOpen(open)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto sk-scroll">
          <DialogHeader>
            <DialogTitle className="pr-6">
              {wiz.step === "done" ? "Booking confirmed" : `Book with ${detail?.name ?? "tutor"}`}
            </DialogTitle>
            {wiz.step !== "done" && (
              <DialogDescription>
                {wiz.offering ? `${wiz.offering.subject} · ${MODE_LABEL[wiz.offering.mode] ?? wiz.offering.mode} · ${wiz.offering.grade}` : ""}
              </DialogDescription>
            )}
          </DialogHeader>

          {wiz.step === "child" && (
            <div className="space-y-3">
              <StepDots step={0} labels={["Child", "Slot", wiz.offering?.mode === "home" ? "Address" : "", "Pay"]} />
              <p className="text-[12.5px] font-semibold text-muted-foreground">Who is this session for?</p>
              {children.length === 0 ? (
                <EmptyState icon={AlertTriangle} title="No children linked" sub="Link a student account to book sessions." />
              ) : (
                children.map((c) => (
                  <button
                    key={c.id}
                    className={`w-full sk-well p-3 flex items-center gap-3 text-left ${
                      wiz.childId === c.id ? "ring-2 ring-[#14246B]/40" : ""
                    }`}
                    onClick={() => setWiz((w) => ({ ...w, childId: c.id }))}
                  >
                    <AvatarTile name={c.name} color={c.color} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[13px]">{c.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {c.profile.grade} · {c.profile.board}
                      </div>
                    </div>
                    {wiz.childId === c.id && <CheckCircle2 className="w-4.5 h-4.5 text-[#1F9D68]" />}
                  </button>
                ))
              )}
              <div className="flex justify-between pt-2">
                <button className="sk-btn sk-btn-ghost" onClick={() => setWizardOpen(false)}>
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  className="sk-btn sk-btn-primary"
                  disabled={!wiz.childId}
                  onClick={() => setWiz((w) => ({ ...w, step: "slot" }))}
                >
                  Next: pick a slot <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {wiz.step === "slot" && (
            <div className="space-y-3">
              <StepDots step={1} labels={["Child", "Slot", wiz.offering?.mode === "home" ? "Address" : "", "Pay"]} />
              <p className="text-[12.5px] font-semibold text-muted-foreground">Choose a time</p>
              {!detail || detail.availableSlots.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="No open slots listed"
                  sub="This tutor confirms times on request — close this and message them from Messages."
                />
              ) : (
                <div className="sk-well p-1.5 max-h-64 overflow-y-auto sk-scroll space-y-1">
                  {detail.availableSlots.map((s, i) => {
                    const active = wiz.slot?.startAt === s.startAt;
                    return (
                      <button
                        key={i}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left ${
                          active ? "bg-white shadow-sm ring-1 ring-[#14246B]/25" : "hover:bg-white/60"
                        }`}
                        onClick={() => setWiz((w) => ({ ...w, slot: s }))}
                      >
                        <div className="text-[12.5px] font-semibold">{s.label || "Session slot"}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11.5px] text-muted-foreground">{dateTimeOf(s.startAt)}</span>
                          {active && <CheckCircle2 className="w-4 h-4 text-[#1F9D68]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between pt-2">
                <button className="sk-btn sk-btn-ghost" onClick={() => setWiz((w) => ({ ...w, step: "child" }))}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  className="sk-btn sk-btn-primary"
                  disabled={!wiz.slot}
                  onClick={() => setWiz((w) => ({ ...w, step: w.offering?.mode === "home" ? "address" : "review" }))}
                >
                  {wiz.offering?.mode === "home" ? "Next: address" : "Next: review"} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {wiz.step === "address" && (
            <div className="space-y-3">
              <StepDots step={2} labels={["Child", "Slot", "Address", "Pay"]} />
              <p className="text-[12.5px] font-semibold text-muted-foreground">
                Where should {child?.name?.split(" ")[0] ?? "your child"} meet the tutor?
              </p>
              {addresses.length === 0 ? (
                <div className="sk-callout sk-callout-warn">
                  No home address saved on your account yet — contact support to add one before booking home visits.
                </div>
              ) : (
                <div className="space-y-2">
                  {addresses.map((a) => {
                    const active = wiz.addressId === a.id;
                    return (
                      <button
                        key={a.id}
                        className={`w-full sk-well p-3 flex items-center gap-3 text-left ${active ? "ring-2 ring-[#14246B]/40" : ""}`}
                        onClick={() => setWiz((w) => ({ ...w, addressId: a.id }))}
                      >
                        <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[13px]">
                            {a.label} — {a.area}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate">{a.line1}</div>
                        </div>
                        {active && <CheckCircle2 className="w-4.5 h-4.5 text-[#1F9D68]" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11.5px] text-muted-foreground flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Home visits include OTP check-in, a 150 m geofence and live tracking to your door.
              </p>
              <div className="flex justify-between pt-2">
                <button className="sk-btn sk-btn-ghost" onClick={() => setWiz((w) => ({ ...w, step: "slot" }))}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  className="sk-btn sk-btn-primary"
                  disabled={!wiz.addressId}
                  onClick={() => setWiz((w) => ({ ...w, step: "review" }))}
                >
                  Next: review <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {wiz.step === "review" && wiz.offering && wiz.slot && (
            <div className="space-y-3.5">
              <StepDots step={3} labels={["Child", "Slot", wiz.offering.mode === "home" ? "Address" : "", "Pay"]} />
              <div className="sk-well p-4 space-y-2 text-[12.5px]">
                <Row label="Child" value={child ? `${child.name} (${child.profile.grade})` : "—"} />
                <Row label="Tutor" value={detail?.name ?? "—"} />
                <Row label="Session" value={`${wiz.offering.subject} · ${MODE_LABEL[wiz.offering.mode] ?? wiz.offering.mode}`} />
                <Row label="When" value={`${dateTimeOf(wiz.slot.startAt)} (${untilLabel(wiz.slot.startAt)})`} />
                {wiz.offering.mode === "home" && (
                  <Row
                    label="Address"
                    value={
                      addresses.find((a) => a.id === wiz.addressId)
                        ? `${addresses.find((a) => a.id === wiz.addressId)!.label} — ${addresses.find((a) => a.id === wiz.addressId)!.area}`
                        : "—"
                    }
                  />
                )}
              </div>
              <div className="sk-well p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Price breakdown
                </div>
                <div className="space-y-1.5 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Session fee</span>
                    <span className="tabular font-semibold">{kwd(wiz.offering.price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform service fee (8%)</span>
                    <span className="tabular font-semibold">{kwd(Math.round(wiz.offering.price * 0.08))}</span>
                  </div>
                  <div className="sk-divider my-1.5" />
                  <div className="flex justify-between text-[14px]">
                    <span className="font-bold">Escrow total</span>
                    <span className="font-extrabold tabular">{kwd(wiz.offering.price + Math.round(wiz.offering.price * 0.08))}</span>
                  </div>
                </div>
              </div>
              <div className="sk-callout sk-callout-info flex gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  Free cancellation up to 12 hours before start. Funds release to the tutor only after session check-out
                  and the dispute window closes.
                </div>
              </div>
              <div className="flex justify-between pt-1">
                <button
                  className="sk-btn sk-btn-ghost"
                  onClick={() => setWiz((w) => ({ ...w, step: w.offering?.mode === "home" ? "address" : "slot" }))}
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button className="sk-btn sk-btn-orange" onClick={pay}>
                  <CreditCard className="w-4 h-4" /> Pay with UPI ·{" "}
                  {kwd(wiz.offering.price + Math.round(wiz.offering.price * 0.08))}
                </button>
              </div>
            </div>
          )}

          {wiz.step === "paying" && (
            <div className="py-10">
              <LoadingView label="Processing UPI payment…" />
            </div>
          )}

          {wiz.step === "error" && (
            <div className="space-y-4 py-2">
              <EmptyState
                icon={AlertTriangle}
                title="Booking didn't go through"
                sub={wiz.payError || "The payment could not be completed. No money has left your account."}
              />
              <div className="flex justify-center gap-2">
                <button className="sk-btn sk-btn-ghost" onClick={() => setWizardOpen(false)}>
                  Close
                </button>
                <button className="sk-btn sk-btn-primary" onClick={() => setWiz((w) => ({ ...w, step: "review" }))}>
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              </div>
            </div>
          )}

          {wiz.step === "done" && (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center text-center gap-2 pt-2">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white"
                  style={{ background: "linear-gradient(180deg,#46BD85,#1F9D68)", boxShadow: "0 6px 18px rgba(31,157,104,.35)" }}
                >
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-[16px] font-extrabold">Request sent &amp; payment secured</h3>
                <p className="text-[12.5px] text-muted-foreground max-w-sm leading-relaxed">
                  {detail?.name} will confirm shortly. Your payment is held safely in escrow — not released until the
                  session is checked out and the dispute window closes.
                </p>
                {wiz.invoiceNo && (
                  <span className="sk-pill sk-pill-green">
                    <CreditCard className="w-3 h-3" /> Invoice {wiz.invoiceNo}
                  </span>
                )}
              </div>
              <div className="flex justify-center gap-2 flex-wrap pt-1">
                <button
                  className="sk-btn sk-btn-primary"
                  onClick={() => {
                    setWizardOpen(false);
                    setView("p-bookings");
                  }}
                >
                  <CalendarCheck className="w-4 h-4" /> View bookings
                </button>
                <button className="sk-btn sk-btn-ghost" onClick={() => setWizardOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* help strip */}
      <div className="sk-callout sk-callout-info flex gap-2.5">
        <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Not sure who fits best? Message a tutor before booking — chats with minors are visible to you under{" "}
          <button className="underline font-semibold" onClick={() => setView("p-messages")}>
            Messages
          </button>
          .
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */
function minRate(t: TutorCardData): number {
  const rates = [t.rateOnline, t.rateHome].filter((r) => r > 0);
  return rates.length ? Math.min(...rates) : 0;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-semibold text-right min-w-0 truncate">{value}</span>
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground w-14 shrink-0">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          className={`sk-chip ${value === o ? "sk-chip-active" : ""}`}
          onClick={() => onChange(value === o ? "" : o)}
          aria-pressed={value === o}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function StepDots({ step, labels }: { step: number; labels: string[] }) {
  const items = labels.filter(Boolean);
  let shown = -1;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {items.map((l) => {
        shown++;
        const idx = shown;
        return (
          <span key={l} className={`sk-step ${idx < step ? "sk-step-done" : idx === step ? "sk-step-active" : ""}`}>
            <span className="sk-step-dot">{idx < step ? "✓" : idx + 1}</span> {l}
          </span>
        );
      })}
    </div>
  );
}
