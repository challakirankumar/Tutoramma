import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";
import {
  resolveChain, extractJson, coerceQuestion, fallbackQuestion, conceptFromChapter, normKey,
  TYPE_LABEL, type QType, type PaperQuestion,
} from "@/lib/question-gen";

/** Hard ceiling for one text-LLM attempt (fresh + one retry ⇒ worst case ~60s). */
const LLM_TIMEOUT_MS = 30_000;
/** Vision analysis is slower — give the whole image attempt 45s. */
const VISION_TIMEOUT_MS = 45_000;

/** Max entries of the dedupe list taken into account. */
const MAX_EXCLUDE = 60;

type GeneratedQuestion = PaperQuestion & { concept?: string };
type Provenance = "AI generated" | "AI converted" | "AI analysed image" | "Structured fallback";

/** Instance type of the SDK client (its constructor is private, so derive it from ZAI.create). */
type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>;
type VisionBody = Parameters<ZAIInstance["chat"]["completions"]["createVision"]>[0];

/* ============================================================
 * POST /api/studio/generate/question
 * One exam question — fresh (AI), converted from tutor text, or
 * analysed from an image. Falls back to the deterministic
 * generator ONLY for the "fresh" kind.
 * ============================================================ */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can generate questions.");

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

  const source = body.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return badRequest("A source is required: { kind: 'fresh' } | { kind: 'text', text } | { kind: 'image', imageDataUrl }.");
  }
  const src = source as Record<string, unknown>;
  const kind = String(src.kind ?? "");
  if (!["fresh", "text", "image"].includes(kind)) return badRequest("Source kind must be 'fresh', 'text' or 'image'.");

  let tutorText = "";
  let imageDataUrl = "";
  if (kind === "text") {
    tutorText = typeof src.text === "string" ? src.text.trim() : "";
    if (tutorText.length < 3 || tutorText.length > 2000) return badRequest("Text source must be between 3 and 2000 characters.");
  }
  if (kind === "image") {
    imageDataUrl = typeof src.imageDataUrl === "string" ? src.imageDataUrl.trim() : "";
    if (!imageDataUrl.startsWith("data:image/")) return badRequest("Image source must be a data URL starting with 'data:image/'.");
    if (imageDataUrl.length >= 3_500_000) return badRequest("Image is too large — please use an image under 3.5 MB.");
  }

  // Cap the dedupe list so a huge paper cannot bloat the prompt.
  const exclude = (Array.isArray(body.exclude) ? body.exclude.map((e) => String(e)).filter((e) => e.trim()) : []).slice(0, MAX_EXCLUDE);
  const excludeSet = new Set(exclude.map(normKey));

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

  /* ---- shared prompt building + coercion ---- */
  const jsonShape = `{"q": string (the question text),
 "options": ["...","...","...","..."] (${type === "MCQ" ? "MCQ — exactly 4 plausible options, exactly one correct" : "omit for SA/LA"}),
 "answer": "A"|"B"|"C"|"D" for MCQ, or a marking-scheme string for SA/LA (e.g. "LHS: … ; method 2 marks, answer 1 mark"),
 "chapter": "${canonicalChapter}",
 "difficulty": "easy"|"medium"|"hard" (must be "${difficulty.toLowerCase()}"),
 "cognitive": "Remember"|"Understand"|"Apply"|"Analyse",
 "concept": string (a short 2-4 word concept label, e.g. "Linear equations")}`;

  const hardRules = `HARD RULES: the question must be self-contained, answerable and unambiguous; MCQ distractors must be plausible but wrong; SA/LA answers are marking schemes with mark splits; age-appropriate for ${chain.grade.name}; do NOT prefix options with letters.`;

  const excludeClause = exclude.length
    ? `\nThese questions are already in the paper — do NOT repeat or closely mirror any of them:\n${exclude.map((q) => `- ${q}`).join("\n")}`
    : "";

  const systemPrompt =
    "You are an expert examination paper setter for K-10 tutoring. You output ONLY valid JSON — no markdown fences, no commentary. You write exam-style questions grounded ONLY in the chapter provided, with a correct answer and, where needed, a step-wise marking scheme, calibrated to the requested difficulty.";

  /** LLM output → well-formed question (+ concept label when the model gave one). */
  const toQuestion = (raw: unknown): GeneratedQuestion | null => {
    const q = coerceQuestion(raw, { type }, [canonicalChapter], chapterByLower);
    if (!q) return null;
    const r = (raw ?? {}) as Record<string, unknown>;
    const concept = typeof r.concept === "string" && r.concept.trim() ? r.concept.trim().slice(0, 60) : undefined;
    return concept ? { ...q, concept } : q;
  };

  /** One bounded text-LLM attempt (SDK init + completion inside the race — same pattern as the paper route). */
  const askLlm = async (userPrompt: string): Promise<unknown> => {
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

    return extractJson(completion.choices?.[0]?.message?.content ?? "");
  };

  const respond = (question: GeneratedQuestion, provenance: Provenance) =>
    Response.json({ data: { question, provenance } });

  /* ============================================================
   * fresh — a brand-new AI question (deterministic fallback allowed)
   * ============================================================ */
  if (kind === "fresh") {
    const userPrompt = `Write EXACTLY ONE exam question.
Board: ${chain.board.name} (${chain.board.code})
Grade: ${chain.grade.name}
Subject: ${chain.subject.name}
Chapter (the ONLY allowed content source): ${canonicalChapter}
Question type: ${type} (${TYPE_LABEL[type]})
Difficulty: ${difficulty}

Return JSON EXACTLY in this shape:
${jsonShape}
${hardRules}${excludeClause}`;

    try {
      let question = toQuestion(await askLlm(userPrompt));
      if (!question || excludeSet.has(normKey(question.q))) {
        // one retry — the first attempt was invalid or too close to an existing question
        question = toQuestion(await askLlm(userPrompt));
      }
      if (question && !excludeSet.has(normKey(question.q))) {
        return respond(question, "AI generated");
      }
    } catch {
      // fall through to the deterministic fallback
    }

    // Deterministic fallback — seed the occurrence map so the candidate avoids
    // the excluded texts wherever practical (occurrences 0..7, then give up).
    const difficulties = [difficulty.toLowerCase()];
    let fallback = fallbackQuestion({ type }, chain.subject.name, [canonicalChapter], 0, new Map([[canonicalChapter, 0]]), difficulties);
    for (let occ = 1; occ < 8 && excludeSet.has(normKey(fallback.q)); occ++) {
      fallback = fallbackQuestion({ type }, chain.subject.name, [canonicalChapter], occ, new Map([[canonicalChapter, occ]]), difficulties);
    }
    if (type === "LA") fallback.difficulty = difficulties[0]; // laFor hardcodes "hard" — honour the request
    return respond({ ...fallback, concept: conceptFromChapter(canonicalChapter) }, "Structured fallback");
  }

  /* ============================================================
   * text — the tutor's rough note polished into an exam question
   * (no dishonest fallback: if the LLM fails, say so)
   * ============================================================ */
  if (kind === "text") {
    const userPrompt = `Convert the tutor's rough note below into EXACTLY ONE well-formed exam question.
Board: ${chain.board.name} (${chain.board.code})
Grade: ${chain.grade.name}
Subject: ${chain.subject.name}
Chapter: ${canonicalChapter}
Question type: ${type} (${TYPE_LABEL[type]})
Difficulty: ${difficulty}

Tutor's note (preserve the tutor's intended meaning, all numbers and any diagram references; fix grammar and phrasing; for MCQ invent 4 plausible options with exactly one correct):
"""
${tutorText}
"""

Return JSON EXACTLY in this shape:
${jsonShape}
${hardRules}`;

    try {
      const question = toQuestion(await askLlm(userPrompt));
      if (question) return respond(question, "AI converted");
    } catch {
      // no fallback — the tutor's own text must be honoured or the request fails honestly
    }
    return Response.json(
      { error: { message: "Could not turn your text into a well-formed question — please rephrase it and try again." } },
      { status: 502 },
    );
  }

  /* ============================================================
   * image — the vision model reads a diagram/photo and writes a
   * question grounded in what is actually visible (no fallback)
   * ============================================================ */
  const userPrompt = `Analyse the image and write EXACTLY ONE exam question grounded ONLY in what is actually visible in it.
Board: ${chain.board.name} (${chain.board.code})
Grade: ${chain.grade.name}
Subject: ${chain.subject.name}
Chapter: ${canonicalChapter}
Question type: ${type} (${TYPE_LABEL[type]})
Difficulty: ${difficulty}

Return JSON EXACTLY in this shape:
${jsonShape}
${hardRules} Base the question ONLY on what is visible in the image — do not invent labels, data or details that cannot be seen; the question must be answerable by a student looking at the image; do NOT include the image or a description of it inside the JSON.`;

  try {
    const visionBody = {
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: userPrompt },
            { type: "image_url" as const, image_url: { url: imageDataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" as const },
    };

    const llmTask = (async () => {
      const zai = await ZAI.create();
      return zai.chat.completions.createVision(visionBody as VisionBody);
    })();

    const completion = (await Promise.race([
      llmTask,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), VISION_TIMEOUT_MS)),
    ])) as { choices?: { message?: { content?: string } }[] };

    const question = toQuestion(extractJson(completion.choices?.[0]?.message?.content ?? ""));
    if (question) return respond(question, "AI analysed image");
  } catch {
    // no fallback — a wrong question about an unseen image would be dishonest
  }
  return Response.json(
    { error: { message: "Could not read the image into a question — try a clearer image or write the question yourself." } },
    { status: 502 },
  );
}
