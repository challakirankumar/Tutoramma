/**
 * Tutor Amma — Curriculum configuration module (v2).
 *
 * Shared metadata for the Question Paper wizard's Step 1 (Curriculum):
 * region tabs, card states, lifecycle pills, per-profile year formats,
 * taxonomy labels, exam types with the Smart Preset Engine, delivery
 * modes (M1–M4), set letters and allotment strategies.
 * Follows LearnX_Curriculum_Config_Africa_Module_Spec_v6 + Master v5 §11B.
 */

/* ----------------------------- region tabs ----------------------------- */

export const REGION_TABS = ["All", "India", "State boards", "International", "Africa"] as const;
export type RegionTab = (typeof REGION_TABS)[number];

/* --------------------- Africa sub-regions (spec §3.3) --------------------- */
/* Country → sub-region map transcribed from LearnX_Africa_Seed_Catalog_v6.json
   (all 54 African countries). The Africa tab groups profile cards into
   collapsible sections: East, West, Southern, Central, North Africa. */

export const AFRICA_SUBREGION_ORDER = ["East Africa", "West Africa", "Southern Africa", "Central Africa", "North Africa"] as const;

const AFRICA_SUBREGION_COUNTRIES: Record<string, string[]> = {
  "East Africa": ["Burundi", "Comoros", "Djibouti", "Eritrea", "Ethiopia", "Kenya", "Madagascar", "Malawi", "Mauritius", "Mozambique", "Rwanda", "Seychelles", "Somalia", "South Sudan", "Tanzania", "Uganda", "Zambia", "Zimbabwe"],
  "West Africa": ["Benin", "Burkina Faso", "Cabo Verde", "Cote d'Ivoire", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Liberia", "Mali", "Mauritania", "Niger", "Nigeria", "Senegal", "Sierra Leone", "Togo"],
  "Southern Africa": ["Botswana", "Eswatini", "Lesotho", "Namibia", "South Africa"],
  "Central Africa": ["Angola", "Cameroon", "Central African Republic", "Chad", "Congo", "DR Congo", "Equatorial Guinea", "Gabon", "Sao Tome and Principe"],
  "North Africa": ["Algeria", "Egypt", "Libya", "Morocco", "Sudan", "Tunisia"],
};

const COUNTRY_TO_SUBREGION = new Map<string, string>(
  Object.entries(AFRICA_SUBREGION_COUNTRIES).flatMap(([sub, countries]) => countries.map((c) => [c, sub])),
);

/** Sub-region of an African country ("East Africa" …) — null for non-African or unknown. */
export function africaSubRegion(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_TO_SUBREGION.get(country) ?? null;
}

/* ----------------------------- card states ----------------------------- */

export type VerifyState = "verified" | "partial" | "ingesting" | "coming_soon";

export const VERIFY_STATE_META: Record<VerifyState, { label: string; hint: string; tone: "green" | "amber" | "blue" | "grey" }> = {
  verified: { label: "Verified", hint: "Registry ingested, reviewed and signed off", tone: "green" },
  partial: { label: "Partial", hint: "Some subjects verified — only those are selectable", tone: "amber" },
  ingesting: { label: "Ingesting", hint: "Official syllabus pipeline running — not selectable yet", tone: "blue" },
  coming_soon: { label: "Coming soon", hint: "No verified registry yet — request priority to speed it up", tone: "grey" },
};

/* ---------------------------- lifecycle pills ---------------------------- */

export type TrackStatus = "active" | "legacy" | "transitional" | "retired" | "under_review";

export const TRACK_PILL: Record<TrackStatus, { label: string; tone: "green" | "amber" | "blue" | "grey" | "orange" }> = {
  active: { label: "Active", tone: "green" },
  legacy: { label: "Legacy", tone: "amber" },
  transitional: { label: "Transitional", tone: "blue" },
  retired: { label: "Retired", tone: "grey" },
  under_review: { label: "Under review", tone: "orange" },
};

/* ------------------------- taxonomy labels (per profile) ------------------------- */

export interface TaxonomyLabels {
  top: string; // chapter / strand / theme
  mid: string; // topic / sub-strand
  leaf: string; // sub-topic / outcome / indicator
  subject: string; // subject / learning area
}

export const DEFAULT_TAXONOMY: TaxonomyLabels = { subject: "Subject", top: "Chapter", mid: "Topic", leaf: "Sub-topic" };

export function parseTaxonomy(json: string | null | undefined): TaxonomyLabels {
  if (!json) return DEFAULT_TAXONOMY;
  try {
    const t = JSON.parse(json);
    return {
      subject: t.subject || DEFAULT_TAXONOMY.subject,
      top: t.top || DEFAULT_TAXONOMY.top,
      mid: t.mid || DEFAULT_TAXONOMY.mid,
      leaf: t.leaf || DEFAULT_TAXONOMY.leaf,
    };
  } catch {
    return DEFAULT_TAXONOMY;
  }
}

export function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/* ------------------------- academic year (per profile) ------------------------- */

export interface YearOption {
  label: string;
  current: boolean;
  ingested: boolean;
}

export function yearOptions(yearFormat: string | null | undefined): YearOption[] {
  if (yearFormat === "calendar") {
    return [
      { label: "2026 (current)", current: true, ingested: true },
      { label: "2025", current: false, ingested: false },
    ];
  }
  return [
    { label: "2026-27 (current)", current: true, ingested: true },
    { label: "2025-26", current: false, ingested: false },
  ];
}

/* --------------------- exam types + Smart Preset Engine --------------------- */

export interface PresetSection {
  type: "MCQ" | "SA" | "LA";
  count: number;
  marksEach: number;
}

export interface ExamPreset {
  marks: number;
  durationMin: number;
  sections: PresetSection[];
  instructions: string;
}

export interface ExamType {
  id: string;
  label: string;
  scope: "school" | "national";
  preset: ExamPreset;
}

const INSTR = (markStr: string) =>
  `All questions are compulsory. Marks are shown against each question. Total: ${markStr}. Use of calculators is not permitted unless stated. Draw neat diagrams wherever necessary.`;

export const EXAM_TYPES: ExamType[] = [
  {
    id: "opener",
    label: "Opener test",
    scope: "school",
    preset: {
      marks: 20, durationMin: 40,
      sections: [{ type: "MCQ", count: 8, marksEach: 1 }, { type: "SA", count: 4, marksEach: 3 }],
      instructions: INSTR("20 marks"),
    },
  },
  {
    id: "unit-test",
    label: "Unit test",
    scope: "school",
    preset: {
      marks: 25, durationMin: 45,
      sections: [{ type: "MCQ", count: 5, marksEach: 1 }, { type: "SA", count: 4, marksEach: 3 }, { type: "LA", count: 2, marksEach: 4 }],
      instructions: INSTR("25 marks"),
    },
  },
  {
    id: "mid-term",
    label: "Mid-term",
    scope: "school",
    preset: {
      marks: 60, durationMin: 120,
      sections: [{ type: "MCQ", count: 10, marksEach: 1 }, { type: "SA", count: 10, marksEach: 3 }, { type: "LA", count: 4, marksEach: 5 }],
      instructions: INSTR("60 marks"),
    },
  },
  {
    id: "end-term",
    label: "End-term",
    scope: "school",
    preset: {
      marks: 80, durationMin: 180,
      sections: [
        { type: "MCQ", count: 20, marksEach: 1 },
        { type: "SA", count: 8, marksEach: 2 },
        { type: "SA", count: 8, marksEach: 3 },
        { type: "LA", count: 4, marksEach: 5 },
      ],
      instructions: INSTR("80 marks"),
    },
  },
  {
    id: "mock",
    label: "Mock exam",
    scope: "national",
    preset: {
      marks: 80, durationMin: 180,
      sections: [
        { type: "MCQ", count: 20, marksEach: 1 },
        { type: "SA", count: 8, marksEach: 2 },
        { type: "SA", count: 8, marksEach: 3 },
        { type: "LA", count: 4, marksEach: 5 },
      ],
      instructions: INSTR("80 marks") + " Follow the exact pattern of the final board / public paper.",
    },
  },
  {
    id: "pre-board",
    label: "Pre-board",
    scope: "national",
    preset: {
      marks: 80, durationMin: 180,
      sections: [
        { type: "MCQ", count: 16, marksEach: 1 },
        { type: "SA", count: 10, marksEach: 2 },
        { type: "SA", count: 6, marksEach: 3 },
        { type: "LA", count: 4, marksEach: 5 },
      ],
      instructions: INSTR("80 marks") + " Pre-board conditions: no hints, full syllabus of the selected chapters.",
    },
  },
  {
    id: "promotion",
    label: "Promotion test",
    scope: "school",
    preset: {
      marks: 50, durationMin: 90,
      sections: [{ type: "MCQ", count: 10, marksEach: 1 }, { type: "SA", count: 10, marksEach: 3 }, { type: "LA", count: 2, marksEach: 5 }],
      instructions: INSTR("50 marks"),
    },
  },
  {
    id: "custom",
    label: "Custom (no preset)",
    scope: "school",
    preset: {
      marks: 40, durationMin: 90,
      sections: [{ type: "MCQ", count: 10, marksEach: 1 }, { type: "SA", count: 5, marksEach: 3 }, { type: "LA", count: 3, marksEach: 5 }],
      instructions: INSTR("40 marks"),
    },
  },
];

export function examTypeById(id: string | null | undefined): ExamType | null {
  if (!id) return null;
  return EXAM_TYPES.find((t) => t.id === id) ?? null;
}

/* --------------------------- delivery modes (M1–M4) --------------------------- */

export interface DeliveryMode {
  id: "M1" | "M2" | "M3" | "M4";
  label: string;
  hint: string;
}

export const DELIVERY_MODES: DeliveryMode[] = [
  { id: "M1", label: "M1 — Print sets", hint: "N papers + N keys with the same blueprint, distinct questions. Sets: A mixed · B hard · C easy." },
  { id: "M2", label: "M2 — Single paper", hint: "One paper, one key. Best for practice tests and small classes." },
  { id: "M3", label: "M3 — Shuffled per student", hint: "Same questions, unique order per student with a per-student key and QR." },
  { id: "M4", label: "M4 — Hybrid", hint: "Sets, each also shuffled per student. Best for high-stakes mock exams." },
];

export const SET_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export const SET_FLAVORS: Record<string, string> = {
  A: "Mixed difficulty",
  B: "Harder track",
  C: "Easier track",
  D: "Make-up / absentee",
  E: "Extra variant",
  F: "Extra variant",
};

/* ------------------------------ allotment ------------------------------ */

export interface AllotmentStrategy {
  id: "roll" | "seating" | "random" | "manual";
  label: string;
  hint: string;
}

export const ALLOTMENT_STRATEGIES: AllotmentStrategy[] = [
  { id: "roll", label: "Roll rule", hint: "Roll mod N (odd/even, ranges, alphabetical). For tutors, roll = enrolment order in the classroom." },
  { id: "seating", label: "Seating-aware", hint: "Adjacent seats never share a set — balanced per hall (recommended for offline batches)." },
  { id: "random", label: "Random with seed", hint: "Balanced draw; the seed is stored for audit and exact reproduction." },
  { id: "manual", label: "Manual", hint: "Assign sets by hand, one student at a time." },
];

/* --------------------- deterministic per-student shuffle --------------------- */

/** mulberry32 seeded PRNG — reproducible from a numeric seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash (FNV-1a) → 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministically shuffle an array from (paperId, studentId, seed) — same inputs always produce the same copy. */
export function shuffledForStudent<T>(items: T[], paperId: string, studentId: string, seed?: number): T[] {
  const rng = seededRandom((seed ?? 0) ^ hashSeed(`${paperId}::${studentId}`));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Allot sets with the chosen strategy. Students without a set get null. */
export function allotSets(
  strategy: string,
  studentIds: string[],
  setCount: number,
  seed: number,
): Record<string, number> {
  const map: Record<string, number> = {};
  if (setCount <= 1) {
    studentIds.forEach((id) => (map[id] = 0));
    return map;
  }
  if (strategy === "roll") {
    studentIds.forEach((id, i) => (map[id] = i % setCount));
  } else if (strategy === "seating") {
    // alternate sets strictly so adjacent (consecutive) students never share
    studentIds.forEach((id, i) => (map[id] = i % setCount));
  } else {
    // random with seed (also the fallback) — balanced draw
    const rng = seededRandom(seed);
    const counts = new Array(setCount).fill(0);
    studentIds.forEach((id) => {
      // pick among the least-used sets to keep the draw balanced
      const min = Math.min(...counts);
      const pool = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
      const pick = pool[Math.floor(rng() * pool.length)];
      counts[pick]++;
      map[id] = pick;
    });
  }
  return map;
}

/* ------------------------------ compliance ------------------------------ */

/** How closely a paper config matches its exam preset (0–100). */
export function presetCompliance(
  cfg: { totalMarks: number; durationMin: number; sections: { type: string; count: number; marksEach: number }[] },
  preset: ExamPreset,
): { score: number; diffs: string[] } {
  const diffs: string[] = [];
  if (cfg.totalMarks !== preset.marks) diffs.push(`marks ${cfg.totalMarks} vs preset ${preset.marks}`);
  if (cfg.durationMin !== preset.durationMin) diffs.push(`duration ${cfg.durationMin} vs preset ${preset.durationMin} min`);
  const a = JSON.stringify(cfg.sections.map((s) => `${s.count}×${s.type}(${s.marksEach})`));
  const b = JSON.stringify(preset.sections.map((s) => `${s.count}×${s.type}(${s.marksEach})`));
  if (a !== b) diffs.push("section pattern differs from preset");
  const score = Math.max(0, Math.round(100 - diffs.length * 30 - (diffs.length ? 10 : 0)));
  return { score, diffs };
}
