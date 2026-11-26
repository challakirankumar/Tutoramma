/**
 * Learning-gap diagnostic bank (spec §30) — deterministic, seed-reproducible
 * maths items tagged by topic, so a quiz can be graded server-side without
 * storing an answer key and without AI.
 */
export interface DiagQ {
  topic: string;
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return (n: number) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s % n;
  };
}

function opts(ans: number, r: (n: number) => number, step = 1): { options: string[]; answer: number } {
  const set = new Set<number>([ans]);
  const cands = [ans + step * (1 + r(3)), ans - step * (1 + r(3)), ans + step * (4 + r(3)), Math.round(ans * 1.5), ans * 2];
  for (const c of cands) if (set.size < 4 && c > 0 && !set.has(c)) set.add(c);
  while (set.size < 4) set.add(ans + set.size * 7);
  const arr = [...set];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = r(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { options: arr.map(String), answer: arr.indexOf(ans) };
}

type Gen = (r: (n: number) => number) => DiagQ;

const GENS: Gen[] = [
  (r) => {
    const a = 3 + r(8), unit = 5 * (2 + r(9)), b = 2 + r(7);
    const ans = unit * b;
    return { topic: "Unitary method", q: `${a} pens cost ₹${a * unit}. What do ${b} pens cost?`, ...opts(ans, r, unit), explanation: `One pen = ${a * unit} ÷ ${a} = ₹${unit}; ${b} pens = ₹${ans}.` };
  },
  (r) => {
    const w = 3 + r(6), d = 4 + r(9), k = 2;
    const ans = (w * d * k) / (w * k);
    return { topic: "Inverse proportion", q: `${w} taps fill a tank in ${d * k} hours. How long will ${w * k} taps take?`, ...opts(ans, r), explanation: `Inverse proportion: ${w} × ${d * k} = ${w * k} × t ⇒ t = ${ans} h.` };
  },
  (r) => {
    const p = 100 * (4 + r(16)), pct = [10, 12, 15, 20, 25][r(5)];
    const ans = (p * pct) / 100;
    return { topic: "Percentages", q: `A bag costs ₹${p}. It is sold at ${pct}% discount. How much is the discount?`, ...opts(ans, r, 10), explanation: `${pct}% of ${p} = ${p} × ${pct}/100 = ₹${ans}.` };
  },
  (r) => {
    const x = 2 + r(9), a = 2 + r(5), b = 1 + r(9);
    return { topic: "Linear equations", q: `Solve for x: ${a}x + ${b} = ${a * x + b}`, ...opts(x, r), explanation: `${a}x = ${a * x + b} − ${b} = ${a * x} ⇒ x = ${x}.` };
  },
  (r) => {
    const a = 1 + r(6), b = 2 + r(6);
    const ans = a + b;
    return { topic: "Factorisation", q: `x² + ${a + b}x + ${a * b} = (x + p)(x + q). What is p + q?`, ...opts(ans, r), explanation: `Two numbers with product ${a * b} and sum ${a + b}: ${a} and ${b}.` };
  },
  (r) => {
    const l = 4 + r(9), w = 3 + r(7);
    const ans = 2 * (l + w);
    return { topic: "Mensuration", q: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`, ...opts(ans, r, 2), explanation: `Perimeter = 2(l + w) = 2(${l} + ${w}) = ${ans} cm.` };
  },
];

export const DIAG_TOPICS = ["Unitary method", "Inverse proportion", "Percentages", "Linear equations", "Factorisation", "Mensuration"];

/** 12 questions: two per topic, reproducible from the seed. */
export function buildDiagnostic(seed: number): DiagQ[] {
  const r = rng(seed);
  const out: DiagQ[] = [];
  for (let round = 0; round < 2; round++) for (const g of GENS) out.push(g(r));
  return out;
}

/** n questions for one topic (used by auto-differentiated homework). */
export function questionsForTopic(topic: string, n: number, seed: number): DiagQ[] {
  const idx = DIAG_TOPICS.indexOf(topic);
  const gen = GENS[idx >= 0 ? idx : 0];
  const r = rng(seed);
  return Array.from({ length: n }, () => gen(r));
}

/** Maps free-text weak topics ("Word problems with fractions") onto bank topics. */
export function matchTopics(weak: string[]): string[] {
  const out = new Set<string>();
  const hints: [RegExp, string][] = [
    [/unitary|rate|cost of one|per unit/i, "Unitary method"],
    [/inverse|proportion|work|taps|time and work/i, "Inverse proportion"],
    [/percent|discount|profit|interest|%/i, "Percentages"],
    [/equation|linear|solve for/i, "Linear equations"],
    [/factor|identit|algebra|polynomial/i, "Factorisation"],
    [/mensuration|area|perimeter|volume|geometry|quadrilateral/i, "Mensuration"],
  ];
  for (const w of weak) for (const [re, t] of hints) if (re.test(w)) out.add(t);
  return [...out];
}
