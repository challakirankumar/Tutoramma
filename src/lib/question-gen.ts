import { db } from "@/lib/db";

/* ============================================================
 * Shared question-generation library
 * Extracted verbatim from /api/studio/generate/paper so the paper
 * route and the question-level routes (single question, question
 * bank) share ONE implementation — no copy-paste drift.
 * ============================================================ */

/* ============================================================
 * Types — question paper (identical to seeded structures)
 * ============================================================ */
export type QType = "MCQ" | "SA" | "LA";
export interface PaperQuestion {
  q: string; options?: string[]; answer: string;
  chapter: string; difficulty: string; cognitive: string; note?: string;
}
export interface PaperSection { name: string; type: QType; marksEach: number; questions: PaperQuestion[] }
export interface PaperContent { instructions: string; sections: PaperSection[] }

export interface SectionSpec { name?: string; type: QType; count: number; marksEach: number }

export const TYPE_LABEL: Record<QType, string> = { MCQ: "Multiple Choice", SA: "Short Answer", LA: "Long Answer" };
export const LETTERS = ["A", "B", "C", "D"];

/* ============================================================
 * Curriculum chain validation
 * ============================================================ */
export async function resolveChain(boardCode: string, gradeName: string, subjectName: string) {
  const board = await db.curriculumBoard.findFirst({ where: { OR: [{ code: boardCode }, { id: boardCode }] } });
  if (!board) return { error: `Board "${boardCode}" is not in the curriculum registry.` };
  const boardWithGrades = await db.curriculumBoard.findUnique({ where: { id: board.id }, include: { grades: true } });
  const grade = boardWithGrades?.grades.find((g) => g.name.toLowerCase() === gradeName.trim().toLowerCase());
  if (!grade) return { error: `Grade "${gradeName}" does not belong to board ${board.code}.` };
  const subjectCandidates = await db.curriculumSubject.findMany({
    where: { boardId: board.id, gradeId: grade.id },
    include: { chapters: { orderBy: { number: "asc" } } },
  });
  const subject = subjectCandidates.find((s) => s.name.toLowerCase() === subjectName.trim().toLowerCase());
  if (!subject) return { error: `Subject "${subjectName}" is not offered for ${board.code} ${grade.name}.` };
  return { board, grade, subject };
}

/* ============================================================
 * JSON extraction / validation + repair
 * ============================================================ */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export function normalizeAnswer(q: Record<string, unknown>, options: string[]): string | null {
  const raw = q.answer;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let a = String(raw).trim();
  if (!a) return null;
  const up = a.toUpperCase();
  if (LETTERS.includes(up)) return up;
  const idx = Number(a);
  if (!Number.isNaN(idx) && idx >= 0 && idx < options.length) return LETTERS[idx];
  const pos = options.findIndex((o) => o.trim().toLowerCase() === a.toLowerCase());
  if (pos >= 0) return LETTERS[pos];
  if (up.startsWith("OPTION ")) return LETTERS.includes(up.slice(7)) ? up.slice(7) : null;
  return null;
}

/** LLMs often prefix options with "A. ", "B) " etc — strip that so the paper prints "(A) A. text". */
export function stripOptionPrefix(o: string): string {
  return String(o)
    .replace(/^\s*(?:option\s*)?[(]?[A-Da-d][.):：]\s*/, "")
    .trim();
}

/* ============================================================
 * Deterministic fallback generator
 * (shared by the tolerant top-up and the full fallback path)
 * ============================================================ */
export function matchKeys(chapter: string, keys: string[]): boolean {
  const c = chapter.toLowerCase();
  return keys.some((k) => c.includes(k));
}

export interface McqSeed { q: string; options: string[]; answer: string; cognitive: string }
export function mcqFor(chapter: string, subject: string): McqSeed {
  const M = (q: string, options: string[], answer: string, cognitive = "Remember"): McqSeed => ({ q, options, answer, cognitive });
  if (matchKeys(chapter, ["rational", "real number", "number system"])) return M("Which of the following is a rational number?", ["π", "√2", "0.333… (repeating)", "√5"], "C");
  if (matchKeys(chapter, ["equation"])) return M("If 3(x − 2) = 15, then x =", ["3", "5", "7", "9"], "C", "Apply");
  if (matchKeys(chapter, ["square", "cube"])) return M("The square root of 144 is:", ["10", "11", "12", "14"], "C", "Apply");
  if (matchKeys(chapter, ["quadrilateral", "triangle", "angle", "circle", "geometry", "symmetry", "shape"])) return M("The sum of the interior angles of a quadrilateral is:", ["180°", "270°", "360°", "540°"], "C");
  if (matchKeys(chapter, ["data", "statistic", "graph", "probability"])) return M("The mode of the data 4, 6, 8, 6, 6 is:", ["4", "6", "8", "30"], "B", "Apply");
  if (matchKeys(chapter, ["mensuration", "area", "perimeter", "volume", "surface"])) return M("1 m³ equals:", ["10 L", "100 L", "1000 L", "10,000 L"], "C");
  if (matchKeys(chapter, ["factor"])) return M("x² + 7x + 12 factors as:", ["(x + 3)(x + 4)", "(x + 2)(x + 6)", "(x + 1)(x + 12)", "(x + 5)(x + 2)"], "A", "Apply");
  if (matchKeys(chapter, ["exponent", "power"])) return M("(2³)² equals:", ["2⁵", "2⁶", "2⁹", "4⁶"], "B", "Apply");
  if (matchKeys(chapter, ["ratio", "proportion", "percentage", "comparing", "quantit"])) return M("A car uses 20 L of fuel for 240 km. The fuel needed for 420 km is:", ["25 L", "30 L", "35 L", "40 L"], "C", "Apply");
  if (matchKeys(chapter, ["integer", "whole", "fraction", "decimal"])) return M("(−7) + 12 − (−5) =", ["0", "5", "10", "14"], "C", "Apply");
  if (matchKeys(chapter, ["polynomial", "algebra", "trigonometr", "arithmetic progression"])) return M("x² + 8x + 15 = (x + 3)(…)", ["x + 4", "x + 5", "x + 6", "x + 2"], "B", "Apply");
  if (matchKeys(chapter, ["light", "mirror", "reflection", "refraction", "eye"])) return M("The angle of incidence is 40°. The angle of reflection is:", ["20°", "40°", "50°", "80°"], "B", "Apply");
  if (matchKeys(chapter, ["force", "pressure", "motion", "gravitation"])) return M("Pressure is measured in:", ["newtons", "joules", "pascals", "watts"], "C");
  if (matchKeys(chapter, ["friction"])) return M("Friction can be reduced by:", ["sprinkling sand", "using lubricants", "increasing the weight", "roughening the surface"], "B", "Understand");
  if (matchKeys(chapter, ["sound"])) return M("Sound cannot travel through:", ["solids", "liquids", "gases", "a vacuum"], "D");
  if (matchKeys(chapter, ["electric", "current", "magnetic"])) return M("If V = IR, V = 6 V and I = 2 A, then R =", ["1 Ω", "3 Ω", "12 Ω", "0.33 Ω"], "B", "Apply");
  if (matchKeys(chapter, ["cell", "tissue", "life", "nutrition", "food", "reproduction", "organism"])) return M("The cell organelle that releases energy is the:", ["nucleus", "mitochondrion", "vacuole", "ribosome"], "B");
  if (matchKeys(chapter, ["atom", "molecule", "matter", "metal", "element", "periodic"])) return M("The smallest particle of an element that retains its properties is the:", ["molecule", "atom", "ion", "electron"], "B");
  if (matchKeys(chapter, ["acid", "base", "salt", "chemical", "reaction", "combustion", "carbon", "petroleum", "coal"])) return M("A solution with pH 2 is:", ["a strong acid", "a weak acid", "a base", "neutral"], "A");
  if (matchKeys(chapter, ["grammar"])) return M("Choose the correct sentence:", ["She dont like mangoes.", "She doesn't likes mangoes.", "She doesn't like mangoes.", "She not like mangoes."], "C", "Apply");
  if (matchKeys(chapter, ["vocab"])) return M("“Reluctant” most nearly means:", ["eager", "unwilling", "confident", "honest"], "B");
  if (matchKeys(chapter, ["writing", "letter", "notice", "creative", "essay"])) return M("A notice should always be:", ["long and detailed", "brief and formal", "poetic", "written as a dialogue"], "B", "Understand");
  if (matchKeys(chapter, ["poetry", "poem", "literature", "prose", "comprehension", "reading", "speaking", "listening"])) return M("The mood of a poem refers to:", ["its rhyme scheme", "the feeling it creates", "its length", "the poet's biography"], "B", "Understand");
  // Generic (study-skills honest) templates
  if (subject.toLowerCase().includes("math")) return M(`The first step when solving a problem from “${chapter}” is:`, ["understand what is asked and note the given data", "guess the answer quickly", "check the answer key first", "copy a classmate's working"], "A", "Understand");
  if (subject.toLowerCase().includes("science") || matchKeys(subject, ["physics", "chemistry", "biology"])) return M(`In “${chapter}”, a fair test changes:`, ["many variables at once", "one variable at a time", "no variables", "the final result"], "B", "Understand");
  return M(`A strong answer in “${chapter}” always:`, ["copies the question wording", "uses evidence from the text or rules learned", "uses the longest words possible", "is finished first"], "B", "Understand");
}

/** Generic-but-valid study-skills MCQ variants so fallback papers never repeat a question verbatim. */
export function genericMcqSeeds(chapter: string): McqSeed[] {
  return [
    { q: `The best first step when revising “${chapter}” for a test is:`, options: ["re-do questions and fix your errors", "read the chapter once and hope", "memorise only the summary", "skip it if it looks hard"], answer: "A", cognitive: "Understand" },
    { q: `In “${chapter}”, showing your working matters because:`, options: ["it earns method marks and reveals errors", "it makes the answer look longer", "the teacher asked nicely", "it replaces knowing the topic"], answer: "A", cognitive: "Understand" },
    { q: `Which statement about practising “${chapter}” is TRUE?`, options: ["Short daily practice beats one long night", "Only geniuses can master it", "It cannot be practised without a teacher", "Taking notes once is enough forever"], answer: "A", cognitive: "Understand" },
    { q: `Keeping a mistake log for “${chapter}” helps you:`, options: ["spot and fix your error patterns", "avoid practice altogether", "compare scores with friends", "finish the exam faster"], answer: "A", cognitive: "Analyse" },
  ];
}

export function saFor(chapter: string, subject: string, i: number): PaperQuestion {
  const math = subject.toLowerCase().includes("math");
  const sci = subject.toLowerCase().includes("science") || /physics|chemistry|biology/i.test(subject);
  const prompts: { q: string; a: string }[] = math
    ? [
        { q: `From “${chapter}”: state the rule or property, then solve one short problem that uses it. Show your working.`, a: `Rule/property stated correctly (1 mark); problem set up correctly (1 mark); complete correct working with final answer (remaining marks). Award method marks for valid attempts with slips.` },
        { q: `Using “${chapter}”, solve a two-step problem of your choice and verify your answer by substitution or estimation.`, a: `Correct method (1 mark each step), accurate arithmetic (1 mark), verification shown (1 mark). Accept any valid self-created problem at grade level.` },
        { q: `A student says they “cannot use ${chapter} outside school”. Correct them with one worked real-life example.`, a: `A valid real-life context (1 mark), correctly worked mathematics (2 marks), clear presentation (remaining mark).` },
      ]
    : sci
      ? [
          { q: `Define the key term from “${chapter}” and give one everyday example that shows it.`, a: `Definition matching the textbook meaning (1–2 marks), a genuine everyday example (1 mark), correct use of chapter vocabulary throughout (remaining marks).` },
          { q: `Describe the core process or experiment of “${chapter}”. State what is observed and what it proves.`, a: `Process described in correct sequence (2 marks), observation stated (1 mark), conclusion linked to the observation (remaining marks).` },
          { q: `From “${chapter}”: give one situation at home where the idea applies, and explain why in 3–4 sentences.`, a: `Valid situation (1 mark), explanation using the science of the chapter (2 marks), units/keywords correct (remaining mark).` },
        ]
      : [
          { q: `Identify one feature of “${chapter}” in a short example and explain its effect.`, a: `Feature correctly named (1 mark), example quoted or described (1 mark), effect explained in a full sentence (remaining marks).` },
          { q: `Using “${chapter}”, rewrite the plain sentence “It was very hot.” so it becomes vivid and precise.`, a: `Attempt shows the chapter's feature in use (2 marks), improved word choice (1 mark), meaning preserved (remaining mark).` },
          { q: `Explain how you would use “${chapter}” in your next piece of writing. Give a two-sentence example.`, a: `Plan references the feature accurately (2 marks), example demonstrates it (remaining marks).` },
        ];
  const p = prompts[i % prompts.length];
  return { q: p.q, answer: p.a, chapter, difficulty: "medium", cognitive: "Apply" };
}

export function laFor(chapter: string, subject: string, i: number): PaperQuestion {
  const math = subject.toLowerCase().includes("math");
  const sci = subject.toLowerCase().includes("science") || /physics|chemistry|biology/i.test(subject);
  const prompts: { q: string; a: string }[] = math
    ? [
        { q: `Real-life application of “${chapter}”: (a) set up the problem with the given data, (b) solve it step-by-step, (c) verify your answer and state whether it is reasonable.`, a: `(a) Correct set-up with the right relationship (2 marks). (b) Step-by-step solution with working (2 marks). (c) Verification and reasonableness check (1 mark).` },
        { q: `A fuller problem from “${chapter}” with three parts (increasing difficulty). Show all working; label each part clearly.`, a: `Part (i) routine recall (1 mark), part (ii) application with method (2 marks), part (iii) multi-step reasoning (2 marks). Method marks awarded even with arithmetic slips.` },
      ]
    : sci
      ? [
          { q: `Draw and label the key diagram of “${chapter}”, then explain in 4–5 sentences how it works and where you have seen it in daily life.`, a: `Diagram correctly drawn and fully labelled (2 marks), explanation in logical sequence using chapter vocabulary (2 marks), valid daily-life link (1 mark).` },
          { q: `Design a small, safe investigation connected to “${chapter}”: state the question, the variable you change, what you measure, and the result you expect.`, a: `Clear question (1 mark), fair-test design (1 mark), correct measurement plan (1 mark), sensible predicted result with reason (2 marks).` },
        ]
      : [
          { q: `Write a structured response that applies “${chapter}”: plan first, then write 120–150 words, then underline one sentence where you used the feature deliberately.`, a: `Plan shows structure (1 mark), writing applies the feature effectively (2 marks), underlined sentence named and justified (2 marks).` },
          { q: `Using “${chapter}”, respond to a situation of your choice (a notice, letter, description or poem-let) for a real audience.`, a: `Correct format for the audience (2 marks), feature of the chapter used well (2 marks), accuracy of spelling and punctuation (1 mark).` },
        ];
  const p = prompts[i % prompts.length];
  return { q: p.q, answer: p.a, chapter, difficulty: "hard", cognitive: "Analyse" };
}

/** One deterministic question of the requested type, varied by occurrence so repeats differ. */
export function fallbackQuestion(
  spec: { type: QType }, subject: string, chapters: string[],
  qIndex: number, mcqOccurrence: Map<string, number>, difficulties: string[],
): PaperQuestion {
  const chapter = chapters[qIndex % chapters.length];
  if (spec.type === "MCQ") {
    const occ = mcqOccurrence.get(chapter) ?? 0;
    mcqOccurrence.set(chapter, occ + 1);
    const seeds = [mcqFor(chapter, subject), ...genericMcqSeeds(chapter)];
    const seed = seeds[occ % seeds.length];
    // Rotate the options by occurrence so the answer letter varies deterministically.
    const rot = occ % 4;
    const options = [...seed.options.slice(rot), ...seed.options.slice(0, rot)];
    const answerIdx = LETTERS.indexOf(seed.answer);
    const answer = LETTERS[(answerIdx - rot + 4) % 4];
    const prefix = seed.q.includes(chapter) ? "" : occ > 0 && occ % 2 === 1 ? `From ${chapter}: ` : "";
    return { q: prefix + seed.q, options, answer, chapter, difficulty: difficulties[qIndex % difficulties.length], cognitive: seed.cognitive };
  }
  if (spec.type === "SA") {
    return { ...saFor(chapter, subject, qIndex), difficulty: difficulties[qIndex % difficulties.length] };
  }
  return laFor(chapter, subject, qIndex);
}

export function fallbackPaper(opts: {
  subject: string; chapters: string[]; sections: SectionSpec[]; difficulty: string; totalMarks: number; durationMin: number;
}): PaperContent {
  const { subject, chapters, sections } = opts;
  const difficulties = opts.difficulty === "Easy" ? ["easy", "easy", "medium"] : opts.difficulty === "Hard" ? ["medium", "hard", "hard"] : ["easy", "medium", "hard"];

  const instructions = opts.subject.toLowerCase().includes("math")
    ? "All questions are compulsory. Marks are shown against each question. Use of calculators is not permitted. Show full working — method marks are awarded."
    : /science|physics|chemistry|biology/i.test(opts.subject)
      ? "All questions are compulsory. Marks are shown against each question. Write units in all numerical answers. Draw neat, labelled diagrams wherever necessary."
      : "All questions are compulsory. Marks are shown against each question. Answer in complete sentences and support your answers with evidence.";

  let qIndex = 0;
  const mcqOccurrence = new Map<string, number>();
  const built: PaperSection[] = sections.map((spec, sIdx) => {
    const questions: PaperQuestion[] = [];
    for (let i = 0; i < spec.count; i++) {
      questions.push(fallbackQuestion(spec, subject, chapters, qIndex, mcqOccurrence, difficulties));
      qIndex++;
    }
    const name = spec.name && spec.name.trim() && spec.name.trim().length > 1 ? spec.name.trim() : `Section ${LETTERS[sIdx]} — ${TYPE_LABEL[spec.type]}`;
    return { name, type: spec.type, marksEach: spec.marksEach, questions };
  });

  return { instructions, sections: built };
}

/* ============================================================
 * Tolerant AI-paper normalisation
 * Keeps every valid AI question, trims the surplus, tops up the
 * gaps with deterministic questions so the blueprint is ALWAYS met
 * exactly. Returns how many questions are AI-origin.
 * ============================================================ */
export function coerceQuestion(
  rq: unknown, spec: { type: QType }, chapters: string[], chapterByLower: Map<string, string>,
): PaperQuestion | null {
  const q = (rq ?? {}) as Record<string, unknown>;
  const text = String(q.q ?? "").trim();
  if (!text) return null;

  const difficulty = ["easy", "medium", "hard"].includes(String(q.difficulty).toLowerCase())
    ? String(q.difficulty).toLowerCase()
    : "medium";
  const cognitive = String(q.cognitive ?? "Understand").trim() || "Understand";
  const chapterRaw = String(q.chapter ?? "").trim().toLowerCase();
  const chapter = chapterByLower.get(chapterRaw)
    ?? (chapterRaw && chapters.some((c) => c.toLowerCase().includes(chapterRaw)) ? chapters.find((c) => c.toLowerCase().includes(chapterRaw)) as string : chapters[0]);

  if (spec.type === "MCQ") {
    const options = Array.isArray(q.options)
      ? (q.options as unknown[]).map((o) => stripOptionPrefix(String(o))).filter(Boolean)
      : [];
    if (options.length !== 4) return null;
    const answer = normalizeAnswer(q, options);
    if (!answer) return null;
    return { q: text, options, answer, chapter, difficulty, cognitive };
  }
  const answer = String(q.answer ?? "").trim();
  if (!answer) return null;
  return { q: text, answer, chapter, difficulty, cognitive };
}

export function normalizePaper(
  raw: unknown,
  specs: SectionSpec[],
  chapters: string[],
  chapterByLower: Map<string, string>,
  subject: string,
): { content: PaperContent; aiCount: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const rawSections = Array.isArray(p.sections) ? p.sections : [];
  if (rawSections.length === 0) return null;

  const difficulties = ["easy", "medium", "hard"];
  const mcqOccurrence = new Map<string, number>();
  const sections: PaperSection[] = [];
  let aiCount = 0;
  let qIndex = 0;
  const seenText = new Set<string>();

  for (let s = 0; s < specs.length; s++) {
    const spec = specs[s];
    // Prefer the raw section that declares this type; otherwise take by order.
    let so = rawSections[s] as Record<string, unknown> | undefined;
    if (!so || String(so.type ?? "").toUpperCase() !== spec.type) {
      const byType = rawSections.find(
        (r) => String(((r ?? {}) as Record<string, unknown>).type ?? "").toUpperCase() === spec.type,
      ) as Record<string, unknown> | undefined;
      if (byType) so = byType;
    }
    const rawQs = so && Array.isArray(so.questions) ? (so.questions as unknown[]) : [];

    const questions: PaperQuestion[] = [];
    for (const rq of rawQs) {
      if (questions.length >= spec.count) break; // trim surplus
      const cq = coerceQuestion(rq, spec, chapters, chapterByLower);
      if (!cq) continue; // repair, don't reject the paper
      const key = cq.q.toLowerCase().replace(/\s+/g, " ");
      if (seenText.has(key)) continue; // drop exact duplicates
      seenText.add(key);
      questions.push(cq);
      aiCount++;
      qIndex++;
    }
    // Top up any gap so the blueprint count is met exactly.
    while (questions.length < spec.count) {
      questions.push(fallbackQuestion(spec, subject, chapters, qIndex, mcqOccurrence, difficulties));
      qIndex++;
    }

    const name =
      typeof so?.name === "string" && so.name.trim().length > 1
        ? so.name.trim()
        : spec.name && spec.name.trim() && spec.name.trim().length > 1
          ? spec.name.trim()
          : `Section ${LETTERS[s]} — ${TYPE_LABEL[spec.type]}`;
    sections.push({ name, type: spec.type, marksEach: spec.marksEach, questions });
  }

  if (aiCount === 0) return null; // nothing usable — let the deterministic path run

  const instructions =
    typeof p.instructions === "string" && p.instructions.trim()
      ? p.instructions.trim()
      : subject.toLowerCase().includes("math")
        ? "All questions are compulsory. Marks are shown against each question. Show full working — method marks are awarded."
        : "All questions are compulsory. Marks are shown against each question.";

  return { content: { instructions, sections }, aiCount };
}

export function buildAnswerKey(content: PaperContent) {
  return {
    note: "Answer key + step-wise marking scheme — visible to tutor only",
    sections: content.sections.map((s) => ({ name: s.name, answers: s.questions.map((q) => q.answer) })),
  };
}

/* ============================================================
 * Question-level route helpers (single question + question bank)
 * Not part of the paper pipeline above — shared by the
 * /generate/question and /question-bank endpoints.
 * ============================================================ */

/** Case-insensitive, whitespace-collapsed comparison key for question texts. */
export function normKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Short concept label derived from a chapter name (first 2-3 meaningful words). */
export function conceptFromChapter(chapter: string): string {
  const stop = new Set(["and", "or", "of", "the", "a", "an", "in", "to", "for", "with", "at", "by", "on", "&"]);
  const words = chapter
    .split(/[\s–—-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !stop.has(w.toLowerCase()));
  const concept = words.slice(0, 3).join(" ").trim();
  return (concept || "Chapter practice").slice(0, 48);
}
