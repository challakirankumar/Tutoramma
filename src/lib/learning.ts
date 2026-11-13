/**
 * Tutor Amma — Learning Toolkit engine (v2).
 *
 * Pure, dependency-free helpers shared by the Smart Flashcards, Focus Studio
 * and Revision Planner APIs: SM-2 spaced repetition, deterministic card
 * generation (used when AI is unavailable), XP/level maths and the smart
 * revision-plan scheduler.
 */
import { MATH_TOPICS, SCIENCE_TOPICS, ENGLISH_TOPICS, type TopicSpec } from "@/lib/curriculum-topics";

export const XP_PER_LEVEL = 400;

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

export { scheduleReview, previewInterval, type Rating, type CardSchedule } from "@/lib/srs";

const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Deterministic flashcard generation                                  */
/* ------------------------------------------------------------------ */

export interface CardDraft {
  front: string;
  back: string;
  hint?: string;
}

/** Turns pasted notes into cloze / definition cards. */
export function cardsFromNotes(notes: string, max = 12): CardDraft[] {
  const sentences = notes
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 260);
  const cards: CardDraft[] = [];
  for (const s of sentences) {
    if (cards.length >= max) break;
    // "X is/are/means Y" -> definition card
    const def = s.match(/^(.{3,60}?)\s+(is|are|means|refers to|is called|is defined as)\s+(.+)$/i);
    if (def) {
      cards.push({ front: `What ${def[2].toLowerCase().startsWith("is") || def[2] === "means" ? "is" : "are"} ${def[1].replace(/^(the|a|an)\s+/i, "")}?`, back: capitalise(def[3].replace(/[.!?]$/, "")) + ".", hint: `Starts with “${def[3].trim().split(" ").slice(0, 2).join(" ")}…”` });
      continue;
    }
    // cloze on the longest meaningful word
    const words = s.split(" ");
    const candidates = words
      .map((w, i) => ({ w: w.replace(/[^\p{L}\p{N}-]/gu, ""), i }))
      .filter(({ w }) => w.length >= 6 && !STOP.has(w.toLowerCase()));
    if (!candidates.length) continue;
    const pick = candidates.sort((a, b) => b.w.length - a.w.length)[0];
    const front = words.map((w, i) => (i === pick.i ? w.replace(pick.w, "_____") : w)).join(" ");
    cards.push({ front: `Fill in the blank: ${front}`, back: pick.w, hint: `${pick.w.length} letters, starts with “${pick.w[0]}”` });
  }
  return cards;
}

const STOP = new Set(["because", "therefore", "between", "through", "without", "another", "however", "although", "different", "important", "example", "following"]);

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function topicBank(subject: string): Record<string, Record<string, TopicSpec[]>> | null {
  const s = subject.toLowerCase();
  if (s.includes("math")) return MATH_TOPICS;
  if (s.includes("sci") || s.includes("phys") || s.includes("chem") || s.includes("bio")) return SCIENCE_TOPICS;
  return null;
}

/** Finds a chapter in the curriculum bank that matches the requested topic. */
export function findChapter(subject: string, grade: string, topic: string): { chapter: string; specs: TopicSpec[] } | null {
  const needle = topic.trim().toLowerCase();
  const banks: Record<string, TopicSpec[]>[] = [];
  const bank = topicBank(subject);
  if (bank) {
    if (bank[grade]) banks.push(bank[grade]);
    banks.push(...Object.values(bank));
  } else if (subject.toLowerCase().includes("eng")) {
    banks.push(ENGLISH_TOPICS);
  } else {
    banks.push(...Object.values(MATH_TOPICS), ...Object.values(SCIENCE_TOPICS), ENGLISH_TOPICS);
  }
  for (const b of banks) {
    for (const [chapter, specs] of Object.entries(b)) {
      const c = chapter.toLowerCase();
      if (c.includes(needle) || needle.includes(c) || specs.some((sp) => sp.t.toLowerCase().includes(needle))) return { chapter, specs };
    }
  }
  return null;
}

/** Curriculum-grounded recall cards (no AI): one card per topic + one per sub-topic group. */
export function cardsFromCurriculum(subject: string, grade: string, topic: string, max = 12): CardDraft[] {
  const found = findChapter(subject, grade, topic);
  const cards: CardDraft[] = [];
  if (found) {
    cards.push({
      front: `List the main topics of “${found.chapter}”.`,
      back: found.specs.map((s) => s.t).join(" · "),
      hint: `${found.specs.length} topics`,
    });
    for (const spec of found.specs) {
      if (cards.length >= max) break;
      cards.push({
        front: `${found.chapter}: what are the key ideas inside “${spec.t}”?`,
        back: spec.s.join(" · "),
        hint: `${spec.s.length} sub-topics — first one starts with “${spec.s[0]?.[0] ?? "?"}”`,
      });
      for (const sub of spec.s) {
        if (cards.length >= max) break;
        cards.push({
          front: `Explain “${sub}” in your own words, with one example.`,
          back: `Part of ${spec.t} (${found.chapter}). Self-check: could you teach “${sub}” to a friend in 60 seconds with an example? If not, revisit your notes for this sub-topic.`,
          hint: `Topic: ${spec.t}`,
        });
      }
    }
  } else {
    const t = topic.trim() || subject;
    cards.push(
      { front: `Define “${t}” in one sentence.`, back: `Self-check: your definition should name what ${t} is, where it is used, and one example.`, hint: "Who/what/where" },
      { front: `Give two real-life examples of ${t}.`, back: `Self-check: each example should clearly show the idea of ${t} at work.`, hint: "Think home, school, nature" },
      { front: `What is the most common mistake students make with ${t}?`, back: `Self-check: name the mistake, why it happens and how to avoid it.`, hint: "Recall your last test" },
      { front: `Write one exam-style question on ${t} and solve it.`, back: `Self-check: compare with your textbook exercise answers.`, hint: "Short answer type" },
    );
  }
  return cards.slice(0, max);
}

/** Parses an AI response into card drafts, tolerating code fences and stray prose. */
export function parseCardJson(raw: string): CardDraft[] {
  let text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const m = text.match(/\[[\s\S]*\]/);
  if (m) text = m[0];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => ({
        front: String(c?.front ?? c?.q ?? c?.question ?? "").trim().slice(0, 300),
        back: String(c?.back ?? c?.a ?? c?.answer ?? "").trim().slice(0, 600),
        hint: String(c?.hint ?? "").trim().slice(0, 140),
      }))
      .filter((c) => c.front && c.back);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Revision planner                                                     */
/* ------------------------------------------------------------------ */

export interface PlanTask {
  id: string;
  title: string;
  subject: string;
  minutes: number;
  kind: "learn" | "practice" | "revise" | "mock" | "rest";
  done: boolean;
}
export interface PlanDay {
  date: string; // YYYY-MM-DD
  tasks: PlanTask[];
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Smart deterministic scheduler: interleaves subjects, front-loads weak
 * topics, inserts spaced revision (1-3-7 days after first study), a weekly
 * light day and full mock tests in the final stretch.
 */
export function buildSmartPlan(opts: {
  examDate: Date;
  subjects: { name: string; topics: string[] }[];
  weakTopics: string[];
  hoursPerDay: number;
  start?: Date;
}): PlanDay[] {
  const start = new Date(opts.start ?? new Date());
  start.setHours(0, 0, 0, 0);
  const exam = new Date(opts.examDate);
  exam.setHours(0, 0, 0, 0);
  const totalDays = Math.max(1, Math.min(120, Math.round((exam.getTime() - start.getTime()) / DAY)));
  const budget = Math.max(30, Math.round(opts.hoursPerDay * 60));
  const weak = new Set(opts.weakTopics.map((w) => w.toLowerCase()));

  // queue of (subject, topic) — weak topics first, subjects interleaved
  const queues = opts.subjects.map((s) => ({
    name: s.name,
    topics: [...s.topics].sort((a, b) => Number(weak.has(b.toLowerCase())) - Number(weak.has(a.toLowerCase()))),
  }));
  const queue: { subject: string; topic: string }[] = [];
  for (let i = 0; queues.some((q) => q.topics.length); i++) {
    const q = queues[i % queues.length];
    const t = q.topics.shift();
    if (t) queue.push({ subject: q.name, topic: t });
  }

  const mockDays = totalDays >= 10 ? 3 : totalDays >= 5 ? 1 : 0;
  const learnDays = Math.max(1, totalDays - mockDays);
  const perDay = Math.max(1, Math.ceil(queue.length / Math.max(1, learnDays - Math.floor(learnDays / 7))));
  const revisions = new Map<number, { subject: string; topic: string; round: number }[]>();
  const days: PlanDay[] = [];
  let n = 0;
  let qi = 0;

  for (let d = 0; d < totalDays; d++) {
    const date = new Date(start.getTime() + d * DAY);
    const tasks: PlanTask[] = [];
    const add = (t: Omit<PlanTask, "id" | "done">) => tasks.push({ ...t, id: `t${++n}`, done: false });
    let left = budget;

    if (d >= totalDays - mockDays) {
      const subj = opts.subjects[(totalDays - d - 1) % Math.max(1, opts.subjects.length)]?.name ?? "All subjects";
      add({ title: `Full mock test — ${subj} (timed, exam conditions)`, subject: subj, minutes: Math.min(left, 120), kind: "mock" });
      left -= Math.min(left, 120);
      if (left >= 30) add({ title: `Review mock mistakes & update error log`, subject: subj, minutes: Math.min(left, 45), kind: "revise" });
    } else if (d > 0 && d % 7 === 6) {
      add({ title: "Light day — quick flashcard review & rest", subject: "All subjects", minutes: Math.min(left, 40), kind: "rest" });
    } else {
      for (const r of revisions.get(d) ?? []) {
        if (left < 15) break;
        add({ title: `Spaced revision #${r.round}: ${r.topic}`, subject: r.subject, minutes: 15, kind: "revise" });
        left -= 15;
      }
      for (let k = 0; k < perDay && qi < queue.length && left >= 30; k++) {
        const item = queue[qi++];
        const isWeak = weak.has(item.topic.toLowerCase());
        const learn = Math.min(left, isWeak ? 50 : 35);
        add({ title: `${isWeak ? "Strengthen (weak area)" : "Learn"}: ${item.topic}`, subject: item.subject, minutes: learn, kind: "learn" });
        left -= learn;
        if (left >= 20) {
          add({ title: `Practice questions: ${item.topic}`, subject: item.subject, minutes: 20, kind: "practice" });
          left -= 20;
        }
        [1, 3, 7].forEach((gap, i) => {
          const at = d + gap;
          if (at < totalDays - mockDays) {
            const list = revisions.get(at) ?? [];
            list.push({ ...item, round: i + 1 });
            revisions.set(at, list);
          }
        });
      }
      if (!tasks.length) add({ title: "Mixed practice: past-paper questions", subject: opts.subjects[d % Math.max(1, opts.subjects.length)]?.name ?? "All", minutes: Math.min(left, 45), kind: "practice" });
    }
    days.push({ date: isoDay(date), tasks });
  }
  return days;
}
