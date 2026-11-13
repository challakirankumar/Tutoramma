"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { LoadingView, EmptyState, SectionTitle } from "@/components/shared/Section";
import { KpiCard } from "@/components/shared/KpiCard";
import { toast } from "@/hooks/use-toast";
import { useAppStore } from "@/stores/app-store";
import { previewInterval, type Rating } from "@/lib/srs";
import {
  Layers,
  Sparkles,
  BrainCircuit,
  CheckCircle2,
  Trash2,
  Play,
  RotateCcw,
  Lightbulb,
  ArrowLeft,
  Trophy,
  NotebookPen,
  PenLine,
  Plus,
  X,
  Zap,
  Eye,
  RefreshCw,
} from "lucide-react";

/* ---------------- types ---------------- */
interface Deck {
  id: string;
  title: string;
  subject: string;
  topic: string;
  source: string;
  color: string;
  total: number;
  due: number;
  fresh: number;
  mastered: number;
}
interface Overview {
  decks: Deck[];
  totals: { cards: number; due: number; mastered: number; reviewedToday: number };
}
interface Card {
  id: string;
  front: string;
  back: string;
  hint: string;
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
}
interface DeckDetail {
  id: string;
  title: string;
  subject: string;
  color: string;
  total: number;
  queue: Card[];
}

const SUBJECTS = ["Mathematics", "Science", "English", "Social Science", "Computer Science", "Other"];
const SOURCE_PILL: Record<string, { label: string; cls: string }> = {
  ai: { label: "AI generated", cls: "sk-pill-blue" },
  notes: { label: "From notes", cls: "sk-pill-orange" },
  curriculum: { label: "Curriculum", cls: "sk-pill-green" },
  manual: { label: "Hand-written", cls: "sk-pill-grey" },
};
const RATINGS: { r: Rating; label: string; key: string; style: string }[] = [
  { r: "again", label: "Again", key: "1", style: "linear-gradient(180deg,#E96A75,#C03342)" },
  { r: "hard", label: "Hard", key: "2", style: "linear-gradient(180deg,#FFB067,#E76E0F)" },
  { r: "good", label: "Good", key: "3", style: "linear-gradient(180deg,#5A83F0,#315BE5)" },
  { r: "easy", label: "Easy", key: "4", style: "linear-gradient(180deg,#46BD85,#1F9D68)" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

/* ======================================================================= */

export function SFlashcards() {
  const { context } = useAppStore();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [study, setStudy] = useState<{ deckId: string; mode: "due" | "all" } | null>(null);

  const load = useCallback(() => {
    api<Overview>("/api/flashcards")
      .then((d) => {
        setError("");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  /* deep link from the command palette: "review due cards" */
  useEffect(() => {
    const ts = Number(context?.flashStudyDue ?? 0);
    if (ts && Date.now() - ts < 6000 && data) {
      const first = data.decks.find((d) => d.due > 0);
      if (first) setStudy({ deckId: first.id, mode: "due" });
    }
  }, [context?.flashStudyDue, data]);

  if (study) {
    return (
      <StudySession
        deckId={study.deckId}
        mode={study.mode}
        onExit={() => {
          setStudy(null);
          load();
        }}
      />
    );
  }

  if (error)
    return (
      <div className="sk-card p-6">
        <EmptyState icon={Layers} title="Couldn't load your flashcards" sub={error} action={<button className="sk-btn sk-btn-primary" onClick={load}><RefreshCw className="w-4 h-4" /> Try again</button>} />
      </div>
    );
  if (!data) return <LoadingView label="Shuffling your decks…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
            Smart Flashcards <span className="sk-pill sk-pill-blue"><BrainCircuit className="w-3 h-3" /> Spaced repetition</span>
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            AI writes the cards, the SM-2 memory engine decides when you see them again — so you revise right before you'd forget.
          </p>
        </div>
        {data.totals.due > 0 && (
          <button className="sk-btn sk-btn-orange" onClick={() => setStudy({ deckId: data.decks.find((d) => d.due > 0)!.id, mode: "due" })}>
            <Play className="w-4 h-4" /> Review {data.totals.due} due
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Due now" value={data.totals.due} sub="cards waiting" icon={Zap} tone="orange" />
        <KpiCard label="Reviewed today" value={data.totals.reviewedToday} sub="+2 XP each" icon={CheckCircle2} tone="green" />
        <KpiCard label="Total cards" value={data.totals.cards} sub={`${data.decks.length} deck${data.decks.length === 1 ? "" : "s"}`} icon={Layers} tone="navy" />
        <KpiCard label="Mastered" value={data.totals.mastered} sub="interval ≥ 21 days" icon={Trophy} tone="royal" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-2">
          <CreateDeck onCreated={load} />
        </div>
        <div className="xl:col-span-3 space-y-3">
          <SectionTitle title="Your decks" sub="Tap Study to review what's due, or Browse to flip through everything." />
          {data.decks.length === 0 ? (
            <div className="sk-card p-4">
              <EmptyState icon={Layers} title="No decks yet" sub="Generate your first deck from any chapter — it takes about ten seconds." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.decks.map((d) => (
                <DeckCard key={d.id} deck={d} onStudy={(mode) => setStudy({ deckId: d.id, mode })} onDeleted={load} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- deck card ---------------- */
function DeckCard({ deck, onStudy, onDeleted }: { deck: Deck; onStudy: (m: "due" | "all") => void; onDeleted: () => void }) {
  const pct = deck.total ? Math.round((deck.mastered / deck.total) * 100) : 0;
  const src = SOURCE_PILL[deck.source] ?? SOURCE_PILL.manual;
  const remove = async () => {
    if (!confirm(`Delete “${deck.title}” and its ${deck.total} cards?`)) return;
    try {
      await api(`/api/flashcards/${deck.id}`, { method: "DELETE" });
      toast({ title: "Deck deleted" });
      onDeleted();
    } catch (e) {
      toast({ title: "Couldn't delete", description: (e as Error).message, variant: "destructive" });
    }
  };
  return (
    <div className="sk-card p-4 relative overflow-hidden ta-pop-in">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: deck.color }} />
      <div className="flex items-start gap-3 pl-1.5">
        <div className="sk-avatar shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: deck.color }}>
          <Layers className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-tight truncate" title={deck.title}>{deck.title}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-muted-foreground font-semibold">{deck.subject}</span>
            <span className={clsx("sk-pill !text-[10px]", src.cls)}>{src.label}</span>
          </div>
        </div>
        <button className="p-1.5 rounded-lg hover:bg-[var(--accent)] text-muted-foreground" onClick={remove} aria-label={`Delete ${deck.title}`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="pl-1.5 mt-3">
        <div className="flex justify-between text-[11px] text-muted-foreground font-semibold mb-1">
          <span>{deck.mastered}/{deck.total} mastered</span>
          <span>{deck.fresh} new</span>
        </div>
        <div className="sk-progress-track">
          <div className="sk-progress-fill" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        <div className="flex gap-2 mt-3">
          <button className={clsx("sk-btn sk-btn-sm flex-1", deck.due ? "sk-btn-primary" : "")} disabled={!deck.due} onClick={() => onStudy("due")}>
            <Play className="w-3.5 h-3.5" /> {deck.due ? `Study ${deck.due} due` : "All caught up"}
          </button>
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => onStudy("all")}>
            <Eye className="w-3.5 h-3.5" /> Browse
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- create deck ---------------- */
function CreateDeck({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<"ai" | "notes" | "manual">("ai");
  const [subject, setSubject] = useState("Science");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(10);
  const [manual, setManual] = useState<{ front: string; back: string }[]>([{ front: "", back: "" }]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body =
        mode === "manual"
          ? { subject, topic, title: topic, cards: manual.filter((c) => c.front.trim() && c.back.trim()) }
          : { subject, topic, notes: mode === "notes" ? notes : "", count };
      const res = await api<{ id: string; cards: number; source: string }>("/api/flashcards", { method: "POST", body: JSON.stringify(body) });
      toast({
        title: `Deck ready — ${res.cards} cards ✨`,
        description:
          res.source === "ai" ? "Written by Workers AI. Review them once to start the memory engine." : res.source === "notes" ? "Built from your notes." : res.source === "curriculum" ? "AI was busy, so we built recall cards from the syllabus." : "Your cards are saved.",
      });
      setTopic("");
      setNotes("");
      setManual([{ front: "", back: "" }]);
      onCreated();
    } catch (e) {
      toast({ title: "Couldn't create deck", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sk-card p-5 space-y-4">
      <SectionTitle title="New deck" sub="Pick how you want your cards made." />
      <div className="sk-segment w-full grid grid-cols-3">
        {(
          [
            ["ai", "AI topic", Sparkles],
            ["notes", "My notes", NotebookPen],
            ["manual", "Write", PenLine],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} className={clsx("sk-segment-item flex items-center justify-center gap-1.5", mode === id && "sk-segment-item-active")} onClick={() => setMode(id)}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <div>
        <label className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide">Subject</label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {SUBJECTS.map((s) => (
            <button key={s} className={clsx("sk-chip", subject === s && "sk-chip-active")} onClick={() => setSubject(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide" htmlFor="fc-topic">
          {mode === "manual" ? "Deck title" : "Chapter / topic"}
        </label>
        <input id="fc-topic" className="sk-input mt-1.5" placeholder={mode === "manual" ? "e.g. Tricky spellings" : "e.g. Light: Reflection, Factorisation, Photosynthesis"} value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>

      {mode === "notes" && (
        <div>
          <label className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide" htmlFor="fc-notes">Paste your notes</label>
          <textarea id="fc-notes" className="sk-input mt-1.5 min-h-[130px] resize-y" placeholder="Paste a page of class notes or a textbook paragraph — cards will be built only from this text." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="text-[10.5px] text-muted-foreground mt-1">{notes.length}/6000 characters</div>
        </div>
      )}

      {mode !== "manual" ? (
        <div>
          <div className="flex justify-between text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide">
            <span>Cards</span>
            <span className="tabular text-foreground">{count}</span>
          </div>
          <input type="range" min={4} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full mt-1.5 accent-[#315BE5]" aria-label="Number of cards" />
        </div>
      ) : (
        <div className="space-y-2">
          {manual.map((c, i) => (
            <div key={i} className="sk-well p-2.5 space-y-1.5 relative">
              <input className="sk-input !py-1.5" placeholder={`Front ${i + 1} — question`} value={c.front} onChange={(e) => setManual((m) => m.map((x, k) => (k === i ? { ...x, front: e.target.value } : x)))} />
              <input className="sk-input !py-1.5" placeholder="Back — answer" value={c.back} onChange={(e) => setManual((m) => m.map((x, k) => (k === i ? { ...x, back: e.target.value } : x)))} />
              {manual.length > 1 && (
                <button className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border flex items-center justify-center" onClick={() => setManual((m) => m.filter((_, k) => k !== i))} aria-label="Remove card">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button className="sk-btn sk-btn-sm sk-btn-ghost w-full" onClick={() => setManual((m) => [...m, { front: "", back: "" }])}>
            <Plus className="w-3.5 h-3.5" /> Add card
          </button>
        </div>
      )}

      <button className="sk-btn sk-btn-primary w-full sk-btn-lg" disabled={busy || (mode === "notes" ? notes.trim().length < 40 : mode === "manual" ? !manual.some((c) => c.front.trim() && c.back.trim()) : !topic.trim())} onClick={submit}>
        {busy ? (
          <>
            <Sparkles className="w-4 h-4 animate-pulse" /> Amma is writing your cards…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" /> {mode === "manual" ? "Save deck" : "Generate deck"}
          </>
        )}
      </button>
    </div>
  );
}

/* ---------------- study session ---------------- */
function StudySession({ deckId, mode, onExit }: { deckId: string; mode: "due" | "all"; onExit: () => void }) {
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, good: 0, xp: 0 });
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState(0);

  useEffect(() => {
    api<DeckDetail>(`/api/flashcards/${deckId}?mode=${mode}`)
      .then((d) => {
        setDeck(d);
        setQueue(d.queue);
        setInitial(d.queue.length);
      })
      .catch((e) => setError(e.message));
  }, [deckId, mode]);

  const card = queue[0];

  const rate = useCallback(
    async (r: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const res = await api<{ xp: { xp: number; level: number; levelUp: boolean } | null }>("/api/flashcards/review", { method: "POST", body: JSON.stringify({ cardId: card.id, rating: r }) });
        if (res.xp?.levelUp) toast({ title: `Level ${res.xp.level} unlocked! 🎉`, description: "Your flashcard streak is paying off." });
        setStats((s) => ({ reviewed: s.reviewed + 1, good: s.good + (r === "good" || r === "easy" ? 1 : 0), xp: s.xp + (res.xp ? (r === "again" ? 1 : 2) : 0) }));
        setQueue((q) => {
          const [first, ...rest] = q;
          // "Again" re-queues the card a few positions later within this session
          if (r === "again") {
            const at = Math.min(rest.length, 3);
            return [...rest.slice(0, at), { ...first, reps: 0 }, ...rest.slice(at)];
          }
          return rest;
        });
        setFlipped(false);
        setShowHint(false);
      } catch (e) {
        toast({ title: "Couldn't save review", description: (e as Error).message, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [card, busy]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key.toLowerCase() === "h") setShowHint(true);
      else if (flipped && ["1", "2", "3", "4"].includes(e.key)) rate(RATINGS[Number(e.key) - 1].r);
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, rate, onExit]);

  const previews = useMemo(() => (card ? RATINGS.map((x) => previewInterval(card, x.r)) : []), [card]);

  if (error)
    return (
      <div className="sk-card p-6">
        <EmptyState icon={Layers} title="Couldn't open deck" sub={error} action={<button className="sk-btn" onClick={onExit}><ArrowLeft className="w-4 h-4" /> Back</button>} />
      </div>
    );
  if (!deck) return <LoadingView label="Opening deck…" />;

  const progress = initial ? Math.round(((initial - Math.min(queue.length, initial)) / initial) * 100) : 100;

  if (!card) {
    const acc = stats.reviewed ? Math.round((stats.good / stats.reviewed) * 100) : 0;
    return (
      <div className="max-w-xl mx-auto sk-card p-8 text-center ta-pop-in">
        <div className="sk-avatar mx-auto" style={{ width: 72, height: 72, borderRadius: 24, background: "linear-gradient(180deg,#FFD86B,#E8A20C)" }}>
          <Trophy className="w-9 h-9 text-[#5C3A00]" />
        </div>
        <h2 className="text-[20px] font-extrabold mt-4">Session complete!</h2>
        <p className="text-[12.5px] text-muted-foreground mt-1">{stats.reviewed ? "Your memory engine has scheduled the next reviews." : "Nothing due in this deck right now — come back later."}</p>
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="sk-well p-3"><div className="text-[20px] font-extrabold tabular">{stats.reviewed}</div><div className="text-[11px] text-muted-foreground">reviews</div></div>
          <div className="sk-well p-3"><div className="text-[20px] font-extrabold tabular">{acc}%</div><div className="text-[11px] text-muted-foreground">recalled</div></div>
          <div className="sk-well p-3"><div className="text-[20px] font-extrabold tabular text-[#E76E0F]">+{stats.xp}</div><div className="text-[11px] text-muted-foreground">XP</div></div>
        </div>
        <button className="sk-btn sk-btn-primary mt-6" onClick={onExit}>
          <ArrowLeft className="w-4 h-4" /> Back to decks
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={onExit}>
          <ArrowLeft className="w-3.5 h-3.5" /> Decks
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold truncate">{deck.title}</div>
          <div className="sk-progress-track mt-1">
            <div className="sk-progress-fill-orange sk-progress-fill" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
        </div>
        <span className="sk-pill sk-pill-navy tabular">{queue.length} left</span>
      </div>

      <div className="flip-scene h-[320px] sm:h-[340px] cursor-pointer select-none" onClick={() => setFlipped((f) => !f)} role="button" aria-label={flipped ? "Show question" : "Reveal answer"} tabIndex={0}>
        <div className={clsx("flip-card", flipped && "is-flipped")}>
          <div className="flip-face sk-card flex flex-col p-7" style={{ borderTop: `5px solid ${deck.color}` }}>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Question</span>
              {card.reps === 0 ? <span className="sk-pill sk-pill-blue !text-[10px]">New</span> : <span className="sk-pill sk-pill-grey !text-[10px]">Seen {card.reps}×</span>}
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              <div className="text-[19px] sm:text-[21px] font-bold leading-snug">{card.front}</div>
            </div>
            <div className="text-center text-[11.5px] text-muted-foreground">
              {showHint && card.hint ? (
                <span className="sk-pill sk-pill-orange"><Lightbulb className="w-3 h-3" /> {card.hint}</span>
              ) : (
                <>
                  Tap or press <span className="ta-kbd">Space</span> to reveal {card.hint && <>· <span className="ta-kbd">H</span> hint</>}
                </>
              )}
            </div>
          </div>
          <div className="flip-face flip-back flex flex-col p-7 text-white" style={{ background: "linear-gradient(135deg,#33549E 0%,#1B2F79 55%,#14246B 100%)", boxShadow: "0 12px 40px rgba(20,36,107,.25)" }}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">Answer</div>
            <div className="flex-1 flex items-center justify-center text-center">
              <div className="text-[17px] sm:text-[19px] font-semibold leading-relaxed">{card.back}</div>
            </div>
            <div className="text-center text-[11.5px] text-white/60">How well did you remember it?</div>
          </div>
        </div>
      </div>

      <div className={clsx("grid grid-cols-4 gap-2 transition-opacity", flipped ? "opacity-100" : "opacity-40 pointer-events-none")}>
        {RATINGS.map((x, i) => (
          <button key={x.r} className="rounded-2xl py-2.5 text-white font-bold text-[13px] shadow-md active:translate-y-px disabled:opacity-50" style={{ background: x.style }} disabled={busy || !flipped} onClick={() => rate(x.r)}>
            <div>{x.label}</div>
            <div className="text-[10.5px] font-semibold text-white/80 flex items-center justify-center gap-1">
              <span className="hidden sm:inline ta-kbd !h-4 !min-w-4 !text-[9px]">{x.key}</span> {previews[i]}
            </div>
          </button>
        ))}
      </div>
      {!flipped && (
        <div className="text-center">
          <button className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setShowHint(true)} disabled={!card.hint || showHint}>
            <Lightbulb className="w-3.5 h-3.5" /> Show hint
          </button>
          <button className="sk-btn sk-btn-sm sk-btn-ghost ml-2" onClick={() => setFlipped(true)}>
            <RotateCcw className="w-3.5 h-3.5" /> Flip
          </button>
        </div>
      )}
    </div>
  );
}
