import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";

/* ============================================================
 * Types — lesson-plan.v1 (identical to seeded structures)
 * ============================================================ */
interface PlanQuestion { q: string; expected: string }
interface WorkedExample { problem: string; solution: string }
interface Stage {
  stage: string; durationMinutes: number; title: string; teacherScript: string;
  analogy: string; boardWork: string[]; workedExamples: WorkedExample[];
  questions: PlanQuestion[]; differentiation: string;
}
interface LessonPlanV1 {
  schemaVersion: string; title: string; learningObjectives: string[]; successCriteria: string[];
  materials: string[]; stages: Stage[];
  homework: { tasks: string[]; expectedOutput: string };
  assessment: { formativeChecks: string[]; evidence: string; adjustment: string };
  sourceRefs: string[];
}

const STAGE_ORDER = ["ENGAGE", "EXPLORE", "EXPLAIN", "ELABORATE", "EVALUATE"];

/* ============================================================
 * Curriculum chain validation (server authority)
 * ============================================================ */
async function resolveChain(boardCode: string, gradeName: string, subjectName: string) {
  const board = await db.curriculumBoard.findFirst({ where: { OR: [{ code: boardCode }, { id: boardCode }] } });
  if (!board) return { error: `Board "${boardCode}" is not in the curriculum registry.` };
  const boardWithGrades = await db.curriculumBoard.findUnique({ where: { id: board.id }, include: { grades: true } });
  const grade = boardWithGrades?.grades.find((g) => g.name.toLowerCase() === gradeName.trim().toLowerCase());
  if (!grade) return { error: `Grade "${gradeName}" does not belong to board ${board.code}.` };
  // SQLite has no case-insensitive mode filter — fetch and match in JS.
  const subjectCandidates = await db.curriculumSubject.findMany({
    where: { boardId: board.id, gradeId: grade.id },
    include: { chapters: { orderBy: { number: "asc" } } },
  });
  const subject = subjectCandidates.find((s) => s.name.toLowerCase() === subjectName.trim().toLowerCase());
  if (!subject) return { error: `Subject "${subjectName}" is not offered for ${board.code} ${grade.name}.` };
  return { board, grade, subject };
}

/* ============================================================
 * JSON extraction / plan validation + repair
 * ============================================================ */
function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

function normalizePlan(raw: unknown, targetMinutes: number, defaultTitle: string): LessonPlanV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const rawStages = Array.isArray(p.stages) ? p.stages : [];
  if (rawStages.length !== 5) return null;
  const names = rawStages.map((s) => String(((s as Record<string, unknown>)?.stage ?? "")).toUpperCase());
  if (!STAGE_ORDER.every((n, i) => names[i]?.includes(n))) return null;

  const objectives = (Array.isArray(p.learningObjectives) ? p.learningObjectives : []).map(String).filter((s) => s.trim());
  if (objectives.length === 0) return null;

  const title = typeof p.title === "string" && p.title.trim() ? p.title.trim() : defaultTitle;
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((s) => s.trim()) : []);

  let durations = rawStages.map((s) => Math.max(0, Math.round(Number((s as Record<string, unknown>)?.durationMinutes) || 0)));
  if (durations.some((d) => d <= 0)) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - targetMinutes) > Math.max(2, targetMinutes * 0.5)) return null; // wildly off → unusable
  if (Math.abs(sum - targetMinutes) > 2) {
    durations = durations.map((d) => Math.max(3, Math.round((d * targetMinutes) / sum)));
  }
  let diff = targetMinutes - durations.reduce((a, b) => a + b, 0);
  const adjustOrder = [2, 3, 1, 0, 4];
  let guard = 0;
  while (diff !== 0 && guard < 40) {
    const i = adjustOrder[guard % adjustOrder.length];
    if (diff > 0) {
      durations[i] += 1;
      diff -= 1;
    } else if (durations[i] > 3) {
      durations[i] -= 1;
      diff += 1;
    }
    guard++;
  }
  if (Math.abs(targetMinutes - durations.reduce((a, b) => a + b, 0)) > 2) return null;

  const stages: Stage[] = rawStages.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      stage: STAGE_ORDER[i],
      durationMinutes: durations[i],
      title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : `${STAGE_ORDER[i]} — ${title}`,
      teacherScript: typeof o.teacherScript === "string" ? o.teacherScript.trim() : "",
      analogy: typeof o.analogy === "string" ? o.analogy.trim() : "",
      boardWork: strArr(o.boardWork),
      workedExamples: (Array.isArray(o.workedExamples) ? o.workedExamples : [])
        .map((w) => {
          const wo = (w ?? {}) as Record<string, unknown>;
          return { problem: String(wo.problem ?? "").trim(), solution: String(wo.solution ?? "").trim() };
        })
        .filter((w) => w.problem && w.solution),
      questions: (Array.isArray(o.questions) ? o.questions : [])
        .map((q) => {
          const qo = (q ?? {}) as Record<string, unknown>;
          return { q: String(qo.q ?? "").trim(), expected: String(qo.expected ?? "").trim() };
        })
        .filter((q) => q.q),
      differentiation: typeof o.differentiation === "string" ? o.differentiation.trim() : "",
    };
  });

  const homeworkRaw = (p.homework ?? {}) as Record<string, unknown>;
  const assessmentRaw = (p.assessment ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: "lesson-plan.v1",
    title,
    learningObjectives: objectives,
    successCriteria: strArr(p.successCriteria).length ? strArr(p.successCriteria) : ["Students can attempt the chapter questions independently"],
    materials: strArr(p.materials),
    stages,
    homework: {
      tasks: strArr(homeworkRaw.tasks),
      expectedOutput: typeof homeworkRaw.expectedOutput === "string" ? homeworkRaw.expectedOutput : "Notebook work checked next class",
    },
    assessment: {
      formativeChecks: strArr(assessmentRaw.formativeChecks),
      evidence: typeof assessmentRaw.evidence === "string" ? assessmentRaw.evidence : "",
      adjustment: typeof assessmentRaw.adjustment === "string" ? assessmentRaw.adjustment : "",
    },
    sourceRefs: strArr(p.sourceRefs),
  };
}

/* ============================================================
 * Deterministic fallback generator (pedagogical templates)
 * ============================================================ */
const DIFF_NOTE: Record<string, string> = {
  Easy: "Support group receives sentence starters and a partially-completed template; work in pairs.",
  Medium: "Mixed-ability pairs; circulate to the four neediest desks every 5 minutes.",
  Hard: "Extension challenge ready for early finishers; expect full written justification of every step.",
};

function matchChapter(chapter: string, keys: string[]): boolean {
  const c = chapter.toLowerCase();
  return keys.some((k) => c.includes(k));
}

function mathExample(chapter: string): WorkedExample {
  if (matchChapter(chapter, ["rational", "real number", "number system"])) {
    return { problem: `Write −3½ and 0.75 in p/q form, then order them from least to greatest.`, solution: "−3½ = −7/2 = −3.5 and 0.75 = 3/4. Order: −7/2 < 3/4 (negative values are always less than positives)." };
  }
  if (matchChapter(chapter, ["equation"])) {
    return { problem: `Solve: 3(x − 2) = 15. Verify your answer.`, solution: "x − 2 = 5 → x = 7. Check: 3(7 − 2) = 3 × 5 = 15 ✓. Always verify by substituting back." };
  }
  if (matchChapter(chapter, ["square", "cube"])) {
    return { problem: `Find √225 and ∛64.`, solution: "225 = 15² so √225 = 15. 64 = 4³ so ∛64 = 4. Use prime factorisation for non-obvious cases." };
  }
  if (matchChapter(chapter, ["quadrilateral", "triangle", "angle", "geometry", "circle", "symmetry", "shape"])) {
    return { problem: `The angles of a quadrilateral are in the ratio 1 : 2 : 3 : 4. Find each angle.`, solution: "Sum = 360° → 10x = 360 → x = 36°. Angles: 36°, 72°, 108°, 144°." };
  }
  if (matchChapter(chapter, ["data", "statistics", "graph", "probability"])) {
    return { problem: `For the data 4, 6, 8, 6, 6 — find the mean, median and mode.`, solution: "Mean = 30 ÷ 5 = 6. Ordered: 4, 6, 6, 6, 8 → median = 6. Mode (most frequent) = 6." };
  }
  if (matchChapter(chapter, ["mensuration", "area", "perimeter", "volume", "surface"])) {
    return { problem: `A tank is a cuboid 2 m × 1.5 m × 1 m. Find its capacity in litres.`, solution: "V = 2 × 1.5 × 1 = 3 m³. 1 m³ = 1000 L → capacity = 3000 L." };
  }
  if (matchChapter(chapter, ["factor"])) {
    return { problem: `Factorise: x² + 7x + 12.`, solution: "Find two numbers with sum 7 and product 12 → 3 and 4. So x² + 7x + 12 = (x + 3)(x + 4)." };
  }
  if (matchChapter(chapter, ["exponent", "power"])) {
    return { problem: `Simplify: (2³)² × 2⁻⁴.`, solution: "(2³)² = 2⁶; 2⁶ × 2⁻⁴ = 2² = 4. Multiply powers with the same base by adding exponents." };
  }
  if (matchChapter(chapter, ["ratio", "proportion", "comparing", "percentage", "quantit"])) {
    return { problem: `A car covers 240 km on 20 L of fuel. How far will it go on 35 L?`, solution: "Rate = 240 ÷ 20 = 12 km/L. Distance = 12 × 35 = 420 km (direct proportion)." };
  }
  if (matchChapter(chapter, ["polynomial", "algebra"])) {
    return { problem: `Divide (x² + 8x + 15) by (x + 3).`, solution: "x² + 8x + 15 = (x + 3)(x + 5), so the quotient is x + 5 with remainder 0." };
  }
  if (matchChapter(chapter, ["integer", "whole", "fraction", "decimal"])) {
    return { problem: `Evaluate: (−7) + 12 − (−5).`, solution: "−7 + 12 = 5; 5 − (−5) = 5 + 5 = 10. Subtracting a negative is adding." };
  }
  if (matchChapter(chapter, ["trigonometr"])) {
    return { problem: `In a right triangle, the side opposite 30° is 5 cm. Find the hypotenuse.`, solution: "sin 30° = opposite/hypotenuse = 5/h → h = 5 ÷ 0.5 = 10 cm." };
  }
  return { problem: `Work through the first solved example of “${chapter}” from the textbook on the board, narrating every step aloud.`, solution: "Model the textbook's solved example step-by-step; students copy the method into their notebooks and restate each step in their own words." };
}

function scienceExample(chapter: string): WorkedExample {
  if (matchChapter(chapter, ["light", "reflection", "refraction", "mirror", "eye"])) {
    return { problem: `A ray strikes a plane mirror at 35° to the normal. Find the angle of reflection.`, solution: "By the first law of reflection, angle of incidence = angle of reflection → r = 35°." };
  }
  if (matchChapter(chapter, ["force", "pressure", "gravitation", "motion", "law of motion"])) {
    return { problem: `A girl of weight 400 N stands on one foot of area 0.01 m². Find the pressure she exerts.`, solution: "P = F/A = 400 ÷ 0.01 = 40,000 Pa = 40 kPa." };
  }
  if (matchChapter(chapter, ["friction"])) {
    return { problem: `A box is pushed with 50 N and friction resists with 20 N. Find the net force.`, solution: "Net force = 50 − 20 = 30 N in the direction of the push (unbalanced force causes acceleration)." };
  }
  if (matchChapter(chapter, ["sound"])) {
    return { problem: `A tuning fork vibrates 256 times every second. State its frequency.`, solution: "Frequency = vibrations per second = 256 Hz. Higher frequency → higher pitch." };
  }
  if (matchChapter(chapter, ["electric", "current", "magnetic"])) {
    return { problem: `A 6 V battery drives a current of 2 A through a bulb. Find its resistance.`, solution: "Ohm's law: V = IR → R = 6 ÷ 2 = 3 Ω." };
  }
  if (matchChapter(chapter, ["cell", "tissue", "life", "organism", "reproduction", "nutrition", "food"])) {
    return { problem: `Draw and label the key structure studied in “${chapter}”, then state one function per label.`, solution: "A fully labelled diagram with correct spellings; each label paired with its function (e.g. in a cell: mitochondria → releases energy)." };
  }
  if (matchChapter(chapter, ["matter", "atom", "molecule", "acid", "base", "metal", "chemical", "reaction", "combustion"])) {
    return { problem: `Balance the key equation from “${chapter}” and state the observation made in the reaction.`, solution: "Atoms of each element must be equal on both sides; the observation (colour change / gas / temperature) is stated alongside the balanced equation." };
  }
  return { problem: `Explain the core idea of “${chapter}” using one diagram and three keywords from the chapter.`, solution: "A labelled sketch plus a 2–3 sentence explanation using the chapter's own vocabulary accurately." };
}

function englishExample(chapter: string): WorkedExample {
  if (matchChapter(chapter, ["grammar"])) {
    return { problem: `Spot and fix the error: “She dont like mangoes.”`, solution: "dont → doesn't. With he/she/it in simple present, the verb takes -s/-es." };
  }
  if (matchChapter(chapter, ["vocab"])) {
    return { problem: `Use “reluctant” and “determined” in one sentence each — in context.`, solution: "e.g. “He was reluctant to read aloud, but determined to improve.” Context shows meaning, not a dictionary copy." };
  }
  if (matchChapter(chapter, ["writing", "letter", "notice", "creative", "essay"])) {
    return { problem: `Turn this brief into a 40-word notice: “Lost — a blue water bottle, school playground, yesterday.”`, solution: "NOTICE (centre) + title + date + body answering what/where/when/contact + signature block. Max 40 words, formal tone." };
  }
  if (matchChapter(chapter, ["poetry", "poem", "literature", "prose"])) {
    return { problem: `Pick any two lines from today's text and explain the mood they create.`, solution: "Quotation + adjective for the mood (e.g. 'gloomy', 'playful') + one reason referring to a word choice." };
  }
  return { problem: `Identify one feature of “${chapter}” in the model text and use it in your own sentence.`, solution: "The feature is named (e.g. heading, connective, imagery) and the new sentence uses it correctly." };
}

function analogyFor(chapter: string, subject: string): string {
  if (matchChapter(chapter, ["rational", "fraction", "decimal"]))
    return "A rational number is a pizza promise — any share, even a debt, can be written as a fraction of the whole.";
  if (matchChapter(chapter, ["equation"]))
    return "An equation is a balanced seesaw: whatever you do to one side, you must do to the other.";
  if (matchChapter(chapter, ["data", "statistics", "graph"]))
    return "A graph is a picture diary of numbers — it tells the story at a glance.";
  if (matchChapter(chapter, ["geometry", "angle", "shape", "triangle", "quadrilateral", "circle", "symmetry"]))
    return "Geometry is the art of drawing conclusions — every line you draw is an argument.";
  if (matchChapter(chapter, ["light", "mirror", "reflection"]))
    return "A mirror is a very polite bouncer: light must leave at exactly the angle it arrived.";
  if (matchChapter(chapter, ["friction"]))
    return "Friction is the invisible handbrake of the universe — sometimes a hero (brakes), sometimes a villain (wear and tear).";
  if (matchChapter(chapter, ["force", "pressure", "motion"]))
    return "Force is a polite push — nothing starts, stops or turns without one.";
  if (matchChapter(chapter, ["sound"]))
    return "Sound is a drum skin's gossip — the vibration passes the message on without travelling itself.";
  if (matchChapter(chapter, ["electric", "current"]))
    return "Current is water in a pipe: voltage is the pressure, resistance is the narrow squeeze.";
  if (matchChapter(chapter, ["cell", "tissue"]))
    return "A cell is a tiny factory — every organelle is a department with one job.";
  if (matchChapter(chapter, ["atom", "molecule", "matter"]))
    return "Matter is a crowded school corridor: solid = lesson time, liquid = break time, gas = home time.";
  if (matchChapter(chapter, ["grammar"]))
    return "Grammar is the traffic police of language — rules keep meaning moving safely.";
  if (matchChapter(chapter, ["vocab"]))
    return "Vocabulary is a toolbox — every new word is one more tool you can pick up without googling.";
  if (matchChapter(chapter, ["writing", "essay", "letter", "notice", "creative"]))
    return "Writing is a journey — the plan is the map, the draft is the walk, the edit is the polish.";
  if (subject === "Mathematics") return `“${chapter}” is a ladder — every rule you master is one rung higher.`;
  if (subject === "Science") return `“${chapter}” works like a well-drilled team — every part has exactly one job.`;
  return `“${chapter}” is a muscle — it only grows when you use it today, not tomorrow.`;
}

function fallbackPlan(opts: {
  board: string; grade: string; subject: string; chapters: string[];
  difficulty: string; periods: number; periodMinutes: number;
}): LessonPlanV1 {
  const { board, grade, subject, chapters, difficulty } = opts;
  const total = opts.periods * opts.periodMinutes;
  const primary = chapters[0];
  const chapterList = chapters.join(", ");
  const isMath = subject.toLowerCase().includes("math");
  const isSci = subject.toLowerCase().includes("science") || subject.toLowerCase().includes("physics") || subject.toLowerCase().includes("chemistry") || subject.toLowerCase().includes("biology");

  // durations: 18 / 22 / 27 / 20 / 13 % of total, min 3, sum exact
  const ratios = [0.18, 0.22, 0.27, 0.2, 0.13];
  let durations = ratios.map((r) => Math.max(3, Math.round(total * r)));
  let diff = total - durations.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (diff !== 0 && idx < 5) {
    const step = Math.sign(diff);
    durations[idx] += step;
    diff -= step;
    idx++;
  }

  const example = isMath ? mathExample(primary) : isSci ? scienceExample(primary) : englishExample(primary);
  const analogy = analogyFor(primary, subject);
  const diffNote = DIFF_NOTE[difficulty] ?? DIFF_NOTE.Medium;

  const titleSuffix = isMath ? "Worked-Example Workshop" : isSci ? "Hands-On Investigation" : "Language Lab";
  const title = chapters.length > 1 ? `${primary} & ${chapters.length - 1} more — ${titleSuffix}` : `${primary} — ${titleSuffix}`;

  const objectives =
    isMath
      ? [
          `Define the key vocabulary of ${chapterList} and use it precisely`,
          `Solve ${grade} level problems from ${chapterList} showing complete working`,
          `Connect ${chapterList} to real-life situations (money, measurements, daily routines)`,
          ...(difficulty !== "Easy" ? [`Justify the method chosen for at least one non-routine problem`] : []),
        ]
      : isSci
        ? [
            `State the key ideas of ${chapterList} in their own words`,
            `Conduct or describe the core investigation of ${primary} safely and record observations`,
            `Interpret results and draw one evidence-based conclusion`,
            `Link ${chapterList} to everyday phenomena`,
          ]
        : [
            `Identify the defining features of ${chapterList} in a model text`,
            `Apply the core skill of ${primary} in a short piece of their own`,
            `Use five new words from ${chapterList} accurately in context`,
            ...(difficulty !== "Easy" ? [`Give and act on one piece of peer feedback`] : []),
          ];

  const materials = isMath
    ? ["Whiteboard + grid markers", "Textbook / chapter worksheets", "Squared notebooks", "Mini whiteboards for quick checks"]
    : isSci
      ? ["Lab kit or household substitutes", "Observation table printouts", "Safety goggles (if applicable)", "Textbook / chapter diagrams"]
      : ["Model text handouts", "Anchor chart paper + markers", "Vocabulary word wall cards", "Notebooks"];

  const exploreScript = isMath
    ? `Pairs attempt 2 entry-level questions from ${chapterList} BEFORE any teaching — "show me your best guess method". Circulate, note the methods students invent, and choose two to discuss publicly.`
    : isSci
      ? `Group investigation: set up the simple ${primary} activity (textbook activity or demonstration). Students predict → observe → record in a two-column table (What I saw | What it means).`
      : `Pairs annotate the model text connected to ${primary}: highlight one thing they like, one thing they find tricky, one thing they want to steal for their own writing.`;

  const explainScript = isMath
    ? `Formalise the rules of ${chapterList} on the board. Work the solved example below step-by-step aloud ("first I…, because…"). Students copy the method, then you re-run the same steps on a fresh question with the class calling out each move.`
    : isSci
      ? `Formalise the science: definitions, the key diagram of ${primary}, and the mechanism behind each observation from the EXPLORE table. Students copy the labelled diagram and write the 3 core sentences of the chapter.`
      : `Teach the core skill of ${primary} explicitly: name it, show it in the model text, then model it live on the board thinking aloud. Students capture the steps as a mini-checklist.`;

  const elaborateScript = isMath
    ? `Real-world round: students apply ${chapterList} to everyday Indian contexts (shopping bills, fuel, cricket scores, building plans). Each pair solves one applied problem and presents the solution in under 60 seconds.`
    : isSci
      ? `Application round: teams match ${primary} to one phenomenon at home / in the news and prepare a 60-second "science spot" explaining it using today's keywords.`
      : `Freewrite: students produce a short independent piece using ${primary} (10 minutes, low-stakes). Volunteer readers share; class spots the feature in use.`;

  const evaluateScript = isMath
    ? `Exit ticket — 3 quick ones: (1) one definition, (2) one routine problem, (3) one ${difficulty === "Hard" ? "twist" : "confidence"} question from ${chapterList}. Review instantly; log common errors.`
    : isSci
      ? `Exit ticket: (1) define one keyword, (2) explain one observation from the activity, (3) one application question on ${primary}. Review instantly; reteach tomorrow if >30% slip.`
      : `Exit ticket: (1) name the feature, (2) use it in one sentence, (3) list one word you will steal. Review instantly and praise precise usage.`;

  const questions: PlanQuestion[][] = isMath
    ? [
        [{ q: `Where have you met ${primary} outside school this week?`, expected: "Any genuine example (shopping, timings, scores) — accept and display on the board." }],
        [{ q: `What did your pair try first? Did it work?`, expected: "Description of an attempt — value the method, not just the answer." }],
        [{ q: `Which step of the worked example is the easiest to get wrong, and why?`, expected: "Names a specific step with a reason (signs, ordering, units…)." }],
        [{ q: `Create one question of your own from ${primary} for your partner.`, expected: "A solvable question at grade level, with the asker able to verify the answer." }],
        [{ q: `One thing I can now do / One thing I still need`, expected: "Honest self-report collected on the exit slip." }],
      ]
    : isSci
      ? [
          [{ q: `Predict: what will happen in the ${primary} activity?`, expected: "Any reasoned prediction — record before revealing." }],
          [{ q: `What did you observe, and what might explain it?`, expected: "Observation separated from explanation — both stated." }],
          [{ q: `Define the chapter's key term in one sentence.`, expected: "A definition matching the textbook meaning in the student's own words." }],
          [{ q: `Where does ${primary} show up in your home?`, expected: "One concrete everyday example." }],
          [{ q: `One thing I learned / One question I still have`, expected: "Collected on exit slips; informs the starter next lesson." }],
        ]
      : [
          [{ q: `What do you notice about this text before reading it?`, expected: "Layout, title, image — any feature-based prediction." }],
          [{ q: `Which part was tricky, and what did your pair do about it?`, expected: "Names the tricky part and a strategy used." }],
          [{ q: `Name the feature we learned today.`, expected: "The feature is named accurately." }],
          [{ q: `Use one new word from today in your own sentence.`, expected: "Correct, contextual usage — not a dictionary copy." }],
          [{ q: `What will you steal for your next piece of writing?`, expected: "One named technique the student commits to reusing." }],
        ];

  const boardWork = isMath
    ? [`Headed board: "${chapterList}" — vocabulary strip down the left`, "Worked example with every step numbered", "Common-error corner (❌ vs ✓)"]
    : isSci
      ? [`Key diagram of ${primary}, fully labelled`, "Observation table: What I saw → What it means", "Word bank: 5 chapter keywords"]
      : ["Model text annotated live", "Feature checklist (success criteria in kid language)", "Word wall: 5 steal-worthy words"];

  const stages: Stage[] = [
    {
      stage: "ENGAGE", durationMinutes: durations[0], title: `The ${primary} Hook`,
      teacherScript: isMath
        ? `Open with: "Where have you met ${chapterList} in real life — shopping, gaming, engineering?" Collect 3–4 answers on the board, then bridge: "By the end of today you'll be able to ${objectives[1]?.toLowerCase() ?? "solve these with confidence"}."`
        : isSci
          ? `Show a quick demonstration or photo connected to ${primary}. Ask students to PREDICT what will happen before revealing. Tease out today's keyword and write it large on the board.`
          : `Display the hook text or image for ${primary}. Ask: "What do you notice? What do you wonder?" Collect responses without correcting — curiosity first, correction later.`,
      analogy,
      boardWork: [boardWork[0]],
      workedExamples: [],
      questions: questions[0],
      differentiation: diffNote,
    },
    {
      stage: "EXPLORE", durationMinutes: durations[1], title: isSci ? "Investigate First" : "Try Before I Teach",
      teacherScript: exploreScript,
      analogy: isMath ? "Exploring before teaching is tasting the batter before baking the cake." : "First-hand discovery beats second-hand description every time.",
      boardWork: [boardWork[1]],
      workedExamples: [],
      questions: questions[1],
      differentiation: difficulty === "Easy" ? "Pre-filled observation/working template for the support group." : "Challenge card ready for pairs who finish early.",
    },
    {
      stage: "EXPLAIN", durationMinutes: durations[2], title: "The Formal Bit — Nailed Down",
      teacherScript: explainScript,
      analogy: "",
      boardWork,
      workedExamples: [example],
      questions: questions[2],
      differentiation: isMath
        ? "Support: printed property/rule table. Extension: prove or generalise the rule."
        : "Support: partially-completed diagram/checklist. Extension: apply the idea to a second context.",
    },
    {
      stage: "ELABORATE", durationMinutes: durations[3], title: isMath ? "Real-World Round" : isSci ? "Science Spot" : "Freewrite Studio",
      teacherScript: elaborateScript,
      analogy: isSci ? "Science explains the home, not just the exam." : "Skills grow only when used on your own ground.",
      boardWork: [],
      workedExamples: [],
      questions: questions[3],
      differentiation: difficulty === "Hard" ? "Expect justification with evidence; push for a second, harder context." : "Sentence starters available for presentations.",
    },
    {
      stage: "EVALUATE", durationMinutes: durations[4], title: "Exit Ticket",
      teacherScript: evaluateScript,
      analogy: "",
      boardWork: [],
      workedExamples: [],
      questions: questions[4],
      differentiation: "Oral exit option for students with writing fatigue.",
    },
  ];

  const homeworkTasks = isMath
    ? [`Textbook exercise from ${chapterList} — first 8 questions, full working shown`, `Create one original problem from ${primary}, solve it, and design one wrong answer a classmate might give`, ...(difficulty === "Hard" ? [`Challenge: attempt the last, starred question of ${primary}`] : [])]
    : isSci
      ? [`Read the ${primary} summary and redraw the key diagram from memory`, `Record 3 real-life examples of ${primary} at home — one line of explanation each`, ...(difficulty === "Hard" ? [`Challenge: explain ${primary} to a family member and write down their hardest question`] : [])]
      : [`Draft and polish a short piece using today's skill from ${primary}`, `Collect 5 new words from ${chapterList} with meanings and one sentence each`, ...(difficulty === "Hard" ? [`Challenge: rewrite yesterday's homework applying today's improvement`] : [])];

  return {
    schemaVersion: "lesson-plan.v1",
    title,
    learningObjectives: objectives,
    successCriteria: [
      `Students can define the key terms of ${chapterList} without notes`,
      `Students can solve/explain ${difficulty === "Easy" ? "guided" : difficulty === "Hard" ? "challenge-level" : "standard"} questions from ${primary} independently`,
      `Students can present one example to the class in under 60 seconds`,
    ],
    materials,
    stages,
    homework: {
      tasks: homeworkTasks,
      expectedOutput: isMath ? "Notebook work with full working; self-made problem on a slip" : isSci ? "Labelled diagram + examples chart" : "Draft + polished piece in the writing folder",
    },
    assessment: {
      formativeChecks: [
        "Exit ticket accuracy ≥ 2/3",
        isSci ? "Observation tables completed with a 'what it means' column" : "Pair/presentation quality during ELABORATE",
      ],
      evidence: "Exit slips collected and graded; common errors logged for the next lesson starter",
      adjustment: `If the core skill is shaky, open the next lesson with a 5-minute ${isMath ? "relay drill" : "retrieval quiz"} on ${primary}`,
    },
    sourceRefs: [
      `${board} ${grade} ${subject} — ${chapterList}`,
      "Verified chapter registry (Tutor Amma) — no invented page numbers",
    ],
  };
}

/* ============================================================
 * POST /api/studio/generate/lesson-plan
 * ============================================================ */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can generate lesson plans.");

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
  const periods = Math.min(3, Math.max(1, Number(body.periods) || 1));
  const periodMinutes = [40, 45, 50].includes(Number(body.periodMinutes)) ? Number(body.periodMinutes) : 45;
  const slideCount = [6, 8, 10].includes(Number(body.slideCount)) ? Number(body.slideCount) : 8;
  const language = String(body.language ?? "English").trim().slice(0, 24) || "English";
  const includeImages = body.includeImages === false ? false : true;

  if (!boardCode || !gradeName || !subjectName) return badRequest("Board, grade and subject are required.");
  if (chapters.length === 0) return badRequest("Select at least one chapter.");
  if (chapters.length > 8) return badRequest("A single plan works best with up to 8 chapters.");

  // 1. Server-side curriculum chain validation
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
  const totalMinutes = periods * periodMinutes;

  const opts = { board: chain.board.code, grade: chain.grade.name, subject: chain.subject.name, chapters: canonicalChapters, difficulty, periods, periodMinutes, language, includeImages };
  const started = Date.now();

  // 2. Try the LLM
  try {
    const systemPrompt =
      "You are an expert K-10 instructional designer for a tutoring platform. You output ONLY valid JSON — no markdown fences, no commentary. Your lesson plans are famous for warm, say-it-aloud teacher scripts, vivid analogies, correct worked examples and tight 5E (Engage/Explore/Explain/Elaborate/Evaluate) pedagogy. You are grounded ONLY in the chapter names provided — you never invent textbook page numbers or exercise numbers.";

    const userPrompt = `Create a lesson plan for:
Board: ${chain.board.name} (${chain.board.code})
Grade: ${chain.grade.name}
Subject: ${chain.subject.name}
Chapters (the ONLY allowed content source): ${canonicalChapters.join("; ")}
Difficulty: ${difficulty}
Lesson length: ${periods} period(s) × ${periodMinutes} minutes = ${totalMinutes} total minutes
The tutor plans ~${slideCount} slides.
Instruction language: ${language}${includeImages ? " (include simple, describable board-work diagrams)" : " (text only — no diagrams)"}.

Return JSON EXACTLY in this shape:
{
 "title": string (catchy, includes the main chapter),
 "learningObjectives": string[3-4],
 "successCriteria": string[2-3] ("Students can …"),
 "materials": string[3-5],
 "stages": [ exactly 5 items in this order:
   {"stage":"ENGAGE","durationMinutes":int,"title":string,"teacherScript":string (what the tutor SAYS aloud, 2-4 sentences),"analogy":string,"boardWork":string[],"workedExamples":[{"problem":string,"solution":string}],"questions":[{"q":string,"expected":string}],"differentiation":string},
   {"stage":"EXPLORE", ... same shape, ${chain.subject.name === "Science" ? "experiment/investigation based" : "student-first discovery activity"}},
   {"stage":"EXPLAIN", ... include 1-2 fully worked examples with correct solutions${chain.subject.name.includes("Math") ? " (mathematics: show every step)" : ""}},
   {"stage":"ELABORATE", ... real-world application, Indian context welcome},
   {"stage":"EVALUATE", ... exit ticket}
 ],
 "homework": {"tasks": string[2-3], "expectedOutput": string},
 "assessment": {"formativeChecks": string[2], "evidence": string, "adjustment": string},
 "sourceRefs": string[1-2]
}
HARD RULES: durations are integers and MUST sum to ${totalMinutes}; every worked example must be mathematically/factually correct; age-appropriate for ${chain.grade.name}; ground everything in the chapter names only; questions need expected answers.`;

    // The ENTIRE pipeline (SDK init + completion) is bounded by the race, so this
    // endpoint can never hang and always falls back within the timeout.
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
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout after 45s")), 45_000)),
    ])) as { choices?: { message?: { content?: string } }[] };

    const text = completion.choices?.[0]?.message?.content ?? "";
    const plan = normalizePlan(extractJson(text), totalMinutes, canonicalChapters[0]);
    if (plan) {
      return Response.json({ data: { plan, provenance: "AI draft", generationMs: Date.now() - started } });
    }
  } catch {
    // fall through to deterministic fallback
  }

  // 3. Deterministic fallback
  const plan = fallbackPlan(opts);
  return Response.json({ data: { plan, provenance: "Structured fallback", generationMs: Date.now() - started } });
}
