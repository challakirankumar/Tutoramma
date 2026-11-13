import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";
import {
  resolveChain, extractJson, coerceQuestion, mcqFor, genericMcqSeeds, saFor, laFor,
  conceptFromChapter, normKey, TYPE_LABEL, LETTERS,
  type QType, type PaperQuestion,
} from "@/lib/question-gen";

/** Hard ceiling for the whole AI attempt. */
const LLM_TIMEOUT_MS = 30_000;

/** Max entries of the dedupe list taken into account. */
const MAX_EXCLUDE = 60;

/** How many AI candidates to request from the LLM, and the cap on the returned list. */
const AI_CANDIDATES = 6;
const MAX_RESULTS = 10;

type BankQuestion = PaperQuestion & { concept?: string; source: "ai" | "bank" };

/* ============================================================
 * POST /api/studio/question-bank
 * Candidate questions of one type/chapter for the editor's "pick
 * from bank" flow — AI candidates first, deterministic bank items
 * after. NEVER errors when the LLM fails (bank-only result, 200).
 * ============================================================ */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can browse the question bank.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const boardCode = String(body.board ?? "").trim();
  const gradeName = String(body.grade ?? "").trim();
  const subjectName = String(body.subject ?? "").trim();
  const chapterName = String(body.chapter ?? "").trim();
  const type = String(body.type ?? "").toUpperCase() as QType;
  const difficulty = String(body.difficulty ?? "");

  if (!boardCode || !gradeName || !subjectName || !chapterName) return badRequest("Board, grade, subject and chapter are required.");
  if (!["MCQ", "SA", "LA"].includes(type)) return badRequest("Question type must be MCQ, SA or LA.");
  if (!["Easy", "Medium", "Hard"].includes(difficulty)) return badRequest("Difficulty must be Easy, Medium or Hard.");

  // Cap the dedupe list so a huge paper cannot bloat the prompt.
  const exclude = (Array.isArray(body.exclude) ? body.exclude.map((e) => String(e)).filter((e) => e.trim()) : []).slice(0, MAX_EXCLUDE);
  const excludeClause = exclude.length
    ? `\nThese questions are already in the paper — do NOT repeat or closely mirror any of them:\n${exclude.map((q) => `- ${q}`).join("\n")}`
    : "";

  // Curriculum chain validation — the chapter must be a REAL chapter of the subject.
  const chain = await resolveChain(boardCode, gradeName, subjectName);
  if ("error" in chain) return badRequest(chain.error ?? "Curriculum chain mismatch — re-select board, grade and subject.", "CURRICULUM_MISMATCH");
  const chapterByLower = new Map(chain.subject.chapters.map((c) => [c.name.toLowerCase(), c.name]));
  const canonicalChapter = chapterByLower.get(chapterName.toLowerCase());
  if (!canonicalChapter) {
    return badRequest(
      `Chapter "${chapterName}" is not in the verified ${chain.board.code} ${chain.grade.name} ${chain.subject.name} registry.`,
      "CURRICULUM_MISMATCH",
    );
  }

  // Dedupe set — starts as the excluded texts, then accumulates every accepted question.
  const seen = new Set(exclude.map(normKey));
  const aiQuestions: BankQuestion[] = [];
  const bankQuestions: BankQuestion[] = [];

  /* ============================================================
   * AI candidates — 6 of the requested type (best effort)
   * ============================================================ */
  try {
    const systemPrompt =
      "You are an expert examination paper setter for K-10 tutoring. You output ONLY valid JSON — no markdown fences, no commentary. You write exam-style questions grounded ONLY in the chapter provided, with correct answers and step-wise marking schemes, calibrated to the requested difficulty.";

    const userPrompt = `Write ${AI_CANDIDATES} DIFFERENT candidate exam questions, all of the SAME type.
Board: ${chain.board.name} (${chain.board.code})
Grade: ${chain.grade.name}
Subject: ${chain.subject.name}
Chapter (the ONLY allowed content source): ${canonicalChapter}
Question type: ${type} (${TYPE_LABEL[type]})
Difficulty: ${difficulty}

Return JSON EXACTLY in this shape:
{"questions": [ exactly ${AI_CANDIDATES} items:
  {"q": string,
   "options": ["...","...","...","..."] (MCQ only — exactly 4 plausible options, exactly one correct),
   "answer": "A"|"B"|"C"|"D" for MCQ, or a marking-scheme string for SA/LA (e.g. "LHS: … ; method 2 marks, answer 1 mark"),
   "chapter": "${canonicalChapter}",
   "difficulty": "easy"|"medium"|"hard" (must be "${difficulty.toLowerCase()}"),
   "cognitive": "Remember"|"Understand"|"Apply"|"Analyse",
   "concept": string (a short 2-4 word concept label, e.g. "Linear equations")}
]}
HARD RULES: every question must be self-contained, answerable and unambiguous; the ${AI_CANDIDATES} questions must cover DIFFERENT aspects of the chapter — no near-duplicates of each other; MCQ distractors must be plausible but wrong; SA/LA answers are marking schemes with mark splits; age-appropriate for ${chain.grade.name}; do NOT prefix options with letters.${excludeClause}`;

    // The ENTIRE pipeline (SDK init + completion) is bounded by the race — same pattern as the paper route.
    const llmTask = (async () => {
      const zai = await ZAI.create();
      return zai.chat.completions.create({
        messages: [
          { role: "assistant", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        thinking: { type: "disabled" },
      });
    })();

    const completion = (await Promise.race([
      llmTask,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), LLM_TIMEOUT_MS)),
    ])) as { choices?: { message?: { content?: string } }[] };

    const parsed = extractJson(completion.choices?.[0]?.message?.content ?? "");
    const arr = parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).questions)
      ? ((parsed as Record<string, unknown>).questions as unknown[])
      : [];

    for (const rq of arr) {
      if (aiQuestions.length >= AI_CANDIDATES) break;
      const q = coerceQuestion(rq, { type }, [canonicalChapter], chapterByLower);
      if (!q) continue; // drop invalid — never fail the whole batch
      const key = normKey(q.q);
      if (seen.has(key)) continue; // drop near-duplicates of the excluded texts or of each other
      seen.add(key);
      const r = (rq ?? {}) as Record<string, unknown>;
      const concept = typeof r.concept === "string" && r.concept.trim() ? r.concept.trim().slice(0, 60) : undefined;
      aiQuestions.push(concept ? { ...q, concept, source: "ai" } : { ...q, source: "ai" });
    }
  } catch {
    // LLM failed — the deterministic bank below still answers, always 200
  }

  /* ============================================================
   * Deterministic bank candidates (source: "bank")
   * ============================================================ */
  const bankDifficulty = difficulty.toLowerCase();
  const bankConcept = conceptFromChapter(canonicalChapter);

  /** Deduped push of one bank question. */
  const pushBank = (q: PaperQuestion) => {
    const key = normKey(q.q);
    if (seen.has(key)) return;
    seen.add(key);
    bankQuestions.push({ ...q, difficulty: bankDifficulty, concept: bankConcept, source: "bank" });
  };

  if (type === "MCQ") {
    // mcqFor + generic seeds, with the same option rotation fallbackQuestion applies.
    const seeds = [mcqFor(canonicalChapter, chain.subject.name), ...genericMcqSeeds(canonicalChapter)];
    seeds.forEach((seed, i) => {
      const rot = i % 4;
      const options = [...seed.options.slice(rot), ...seed.options.slice(0, rot)];
      const answerIdx = LETTERS.indexOf(seed.answer);
      const answer = LETTERS[(answerIdx - rot + 4) % 4];
      const prefix = seed.q.includes(canonicalChapter) ? "" : i > 0 && i % 2 === 1 ? `From ${canonicalChapter}: ` : "";
      pushBank({ q: prefix + seed.q, options, answer, chapter: canonicalChapter, difficulty: bankDifficulty, cognitive: seed.cognitive });
    });
  } else if (type === "SA") {
    // saFor rotates through 3 variants per subject family; repeats collapse via dedupe.
    for (let i = 0; i < 5; i++) pushBank(saFor(canonicalChapter, chain.subject.name, i));
  } else {
    // laFor rotates through 2 variants per subject family.
    for (let i = 0; i < 4; i++) pushBank(laFor(canonicalChapter, chain.subject.name, i));
  }

  /* ---- AI first, then bank; 5–10 items total ---- */
  const questions = [...aiQuestions, ...bankQuestions].slice(0, MAX_RESULTS);
  return Response.json({ data: { questions } });
}
