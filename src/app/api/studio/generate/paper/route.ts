import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";
import {
  resolveChain, extractJson, normalizePaper, fallbackPaper, buildAnswerKey,
  type QType, type SectionSpec,
} from "@/lib/question-gen";

/** Hard ceiling for the whole AI attempt. The endpoint ALWAYS answers within ~45s + DB time. */
const LLM_TIMEOUT_MS = 45_000;

/* ============================================================
 * POST /api/studio/generate/paper
 * ============================================================ */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can generate question papers.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const boardCode = String(body.board ?? "").trim();
  const gradeName = String(body.grade ?? "").trim();
  const subjectName = String(body.subject ?? "").trim();
  const chapters = Array.isArray(body.chapters) ? body.chapters.map(String).filter((c) => c.trim()) : [];
  const difficulty = ["Easy", "Medium", "Hard"].includes(String(body.difficulty)) ? String(body.difficulty) : "Medium";
  const totalMarks = Math.round(Number(body.totalMarks) || 0);
  const durationMin = Math.min(240, Math.max(10, Math.round(Number(body.durationMin) || 45)));
  // Set flavour (M1/M4 multi-set delivery): A mixed · B harder · C easier.
  const setFlavor = ["A", "B", "C", "D"].includes(String(body.setFlavor)) ? String(body.setFlavor) : null;
  const setLabel = setFlavor ? `Set ${setFlavor}` : null;
  const flavorHint =
    setFlavor === "B" ? " This is the HARDER track of a multi-set paper: bias questions toward medium and hard difficulty."
    : setFlavor === "C" ? " This is the EASIER track of a multi-set paper: bias questions toward easy and medium difficulty, same blueprint."
    : setFlavor === "A" ? " This is the MIXED track of a multi-set paper: balance easy, medium and hard questions."
    : "";

  if (!boardCode || !gradeName || !subjectName) return badRequest("Board, grade and subject are required.");
  if (chapters.length === 0) return badRequest("Select at least one chapter.");
  if (totalMarks <= 0 || totalMarks > 200) return badRequest("Total marks must be between 1 and 200.");

  const rawSections = Array.isArray(body.sections) ? body.sections : [];
  if (rawSections.length === 0) return badRequest("Add at least one section to the blueprint.");
  const specs: SectionSpec[] = [];
  let computed = 0;
  let totalQuestions = 0;
  for (const rs of rawSections) {
    const o = (rs ?? {}) as Record<string, unknown>;
    const type = String(o.type ?? "").toUpperCase();
    if (!["MCQ", "SA", "LA"].includes(type)) return badRequest("Each section type must be MCQ, SA or LA.");
    const count = Math.round(Number(o.count) || 0);
    const marksEach = Math.round(Number(o.marksEach) || 0);
    if (count < 1 || count > 30) return badRequest("Each section needs between 1 and 30 questions.");
    if (marksEach < 1 || marksEach > 10) return badRequest("Marks per question must be between 1 and 10.");
    specs.push({ name: typeof o.name === "string" ? o.name : undefined, type: type as QType, count, marksEach });
    computed += count * marksEach;
    totalQuestions += count;
  }
  if (totalQuestions > 40) return badRequest("Blueprint too large — keep the paper at 40 questions or fewer.");
  if (computed !== totalMarks) {
    return badRequest(
      `Marks do not balance: sections add up to ${computed} but total marks is ${totalMarks}. Adjust counts or marks so they match.`,
      "MARKS_MISMATCH",
    );
  }

  // Curriculum chain validation
  const chain = await resolveChain(boardCode, gradeName, subjectName);
  if ("error" in chain) return badRequest(chain.error ?? "Curriculum chain mismatch — re-select board, grade and subject.", "CURRICULUM_MISMATCH");
  const validNames = new Map(chain.subject.chapters.map((c) => [c.name.toLowerCase(), c.name]));
  const missing = chapters.filter((c) => !validNames.has(c.toLowerCase()));
  if (missing.length > 0) {
    return badRequest(
      `These chapters are not in the verified ${chain.board.code} ${chain.grade.name} ${chain.subject.name} registry: ${missing.join(", ")}.`,
      "CURRICULUM_MISMATCH",
    );
  }
  const canonicalChapters = chapters.map((c) => validNames.get(c.toLowerCase()) as string);
  const chapterByLower = new Map(canonicalChapters.map((c) => [c.toLowerCase(), c]));

  const started = Date.now();

  // Try the LLM — the ENTIRE pipeline (SDK init + completion) is bounded by the race,
  // so this endpoint can never hang and always falls back within the timeout.
  try {
    const systemPrompt =
      "You are an expert examination paper setter for K-10 tutoring. You output ONLY valid JSON — no markdown fences, no commentary. You write exam-style questions grounded ONLY in the chapter names provided, with correct answers and step-wise marking schemes, calibrated to the requested difficulty.";

    const userPrompt = `Create a question paper.
Board: ${chain.board.name} (${chain.board.code})
Grade: ${chain.grade.name}
Subject: ${chain.subject.name}
Chapters (the ONLY allowed content source; tag each question with exactly one of these): ${canonicalChapters.join("; ")}
Difficulty: ${difficulty}${flavorHint}
${setLabel ? `Set: ${setLabel} of a multi-set delivery — write ORIGINAL questions distinct from any other set (same blueprint, different questions).` : ""}
Total marks: ${totalMarks}
Duration: ${durationMin} minutes
Blueprint (follow EXACTLY): ${specs.map((s, i) => `Section ${i + 1}: type ${s.type}, ${s.count} questions × ${s.marksEach} marks${s.name ? `, name "${s.name}"` : ""}`).join("; ")}

Return JSON EXACTLY in this shape:
{
 "instructions": string (2-3 sentences, exam-board style),
 "sections": [ one per blueprint entry, in order:
   {"name": string (e.g. "Section A — Multiple Choice (1 mark each)"), "type": "${specs[0].type}",
    "marksEach": ${specs[0].marksEach},
    "questions": [ exactly ${specs[0].count} items:
      {"q": string, "options": ["A","B","C","D"] (MCQ only — exactly 4 plausible options, one correct),
       "answer": "A"|"B"|"C"|"D" for MCQ, or a marking-scheme string for SA/LA (e.g. "LHS: … ; method 2 marks, answer 1 mark"),
       "chapter": one of the chapters listed above, "difficulty": "easy"|"medium"|"hard", "cognitive": "Remember"|"Understand"|"Apply"|"Analyse"}
    ]}
 ]
}
HARD RULES: MCQ distractors must be plausible but wrong; answers must be unambiguous and correct; SA/LA answers are marking schemes with mark splits; distribute questions across ALL listed chapters; age-appropriate for ${chain.grade.name}; do NOT prefix options with letters.`;

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

    const text = completion.choices?.[0]?.message?.content ?? "";
    const normalized = normalizePaper(extractJson(text), specs, canonicalChapters, chapterByLower, chain.subject.name);
    if (normalized) {
      const { content, aiCount } = normalized;
      const totalQ = content.sections.reduce((a, s) => a + s.questions.length, 0);
      const provenance = aiCount >= totalQ ? "AI draft" : "AI draft + structured completion";
      return Response.json({ data: { contentJson: content, answerKeyJson: buildAnswerKey(content), provenance, generationMs: Date.now() - started } });
    }
  } catch {
    // fall through to deterministic fallback
  }

  const fallbackDiff =
    setFlavor === "B" ? (difficulty === "Easy" ? "Medium" : "Hard")
    : setFlavor === "C" ? (difficulty === "Hard" ? "Medium" : "Easy")
    : difficulty;
  const content = fallbackPaper({
    subject: chain.subject.name, chapters: canonicalChapters, sections: specs, difficulty: fallbackDiff, totalMarks, durationMin,
  });
  return Response.json({
    data: { contentJson: content, answerKeyJson: buildAnswerKey(content), provenance: "Structured fallback", generationMs: Date.now() - started },
  });
}
