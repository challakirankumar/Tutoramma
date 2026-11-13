/**
 * Tutor Amma — Demo Seed Data
 * Wipes and reseeds the database with realistic demo data for all 4 roles.
 * Fictional data only. Money in paise (INR minor units, 100 paise = Re. 1).
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { MATH_TOPICS, SCIENCE_TOPICS, ENGLISH_TOPICS } from "./curriculum-topics";

/* ---------- helpers ---------- */
const now = () => new Date();
function atToday(h: number, m: number) {
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}
function daysFromNow(n: number, h: number, m: number) {
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d;
}
function lastWeekday(weekday: number, weeksBack = 0, h = 17, m = 0) {
  const d = new Date();
  let diff = (d.getDay() - weekday + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() - diff - weeksBack * 7);
  d.setHours(h, m, 0, 0);
  return d;
}
function nextWeekday(weekday: number, weeksAhead = 0, h = 17, m = 0) {
  const d = new Date();
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff + weeksAhead * 7);
  d.setHours(h, m, 0, 0);
  return d;
}
const F = (rupees: number) => Math.round(rupees * 100); // rupees -> paise (100 paise = Re. 1)

/* ---------- curriculum chapter bank (real NCERT-flavoured names) ---------- */
const MATH: Record<string, string[]> = {
  "Grade 6": ["Knowing Our Numbers", "Whole Numbers", "Playing with Numbers", "Basic Geometrical Ideas", "Understanding Elementary Shapes", "Integers", "Fractions", "Decimals", "Data Handling", "Mensuration", "Algebra", "Ratio and Proportion"],
  "Grade 7": ["Integers", "Fractions and Decimals", "Data Handling", "Simple Equations", "Lines and Angles", "The Triangle and its Properties", "Comparing Quantities", "Rational Numbers", "Perimeter and Area", "Algebraic Expressions", "Exponents and Powers", "Symmetry", "Visualising Solid Shapes"],
  "Grade 8": ["Rational Numbers", "Linear Equations in One Variable", "Understanding Quadrilaterals", "Data Handling", "Squares and Square Roots", "Cubes and Cube Roots", "Comparing Quantities", "Algebraic Expressions and Identities", "Mensuration", "Exponents and Powers", "Direct and Inverse Proportions", "Factorisation", "Introduction to Graphs", "Playing with Numbers"],
  "Grade 9": ["Number Systems", "Polynomials", "Coordinate Geometry", "Linear Equations in Two Variables", "Introduction to Euclid's Geometry", "Lines and Angles", "Triangles", "Quadrilaterals", "Circles", "Heron's Formula", "Surface Areas and Volumes", "Statistics"],
  "Grade 10": ["Real Numbers", "Polynomials", "Pair of Linear Equations in Two Variables", "Quadratic Equations", "Arithmetic Progressions", "Triangles", "Coordinate Geometry", "Introduction to Trigonometry", "Some Applications of Trigonometry", "Circles", "Areas Related to Circles", "Surface Areas and Volumes", "Statistics", "Probability"],
};
const SCIENCE: Record<string, string[]> = {
  "Grade 6": ["Food: Where Does It Come From?", "Components of Food", "Fibre to Fabric", "Sorting Materials into Groups", "Separation of Substances", "Changes Around Us", "Getting to Know Plants", "Body Movements", "The Living Organisms and Their Surroundings", "Motion and Measurement of Distances", "Light, Shadows and Reflections", "Electricity and Circuits", "Fun with Magnets", "Water", "Air Around Us", "Garbage In, Garbage Out"],
  "Grade 7": ["Nutrition in Plants", "Nutrition in Animals", "Heat", "Acids, Bases and Salts", "Physical and Chemical Changes", "Respiration in Organisms", "Transportation in Animals and Plants", "Reproduction in Plants", "Motion and Time", "Electric Current and its Effects", "Light", "Forests: Our Lifeline", "Wastewater Story"],
  "Grade 8": ["Crop Production and Management", "Microorganisms: Friend and Foe", "Coal and Petroleum", "Combustion and Flame", "Conservation of Plants and Animals", "Reproduction in Animals", "Reaching the Age of Adolescence", "Force and Pressure", "Friction", "Sound", "Chemical Effects of Electric Current", "Some Natural Phenomena", "Light"],
  "Grade 9": ["Matter in Our Surroundings", "Is Matter Around Us Pure?", "Atoms and Molecules", "Structure of the Atom", "The Fundamental Unit of Life", "Tissues", "Motion", "Force and Laws of Motion", "Gravitation", "Work and Energy", "Sound", "Improvement in Food Resources"],
  "Grade 10": ["Chemical Reactions and Equations", "Acids, Bases and Salts", "Metals and Non-metals", "Carbon and its Compounds", "Periodic Classification of Elements", "Life Processes", "Control and Coordination", "How do Organisms Reproduce?", "Heredity and Evolution", "Light: Reflection and Refraction", "The Human Eye and the Colourful World", "Electricity", "Magnetic Effects of Electric Current", "Sources of Energy", "Our Environment", "Management of Natural Resources"],
};
const ENGLISH = ["Reading Comprehension", "Grammar Essentials", "Writing Skills: Notices & Letters", "Vocabulary Building", "Literature: Prose", "Literature: Poetry", "Speaking and Listening", "Creative Writing"];

/* ---------- curriculum board registry ---------- */
const CH_TAX = { top: "Chapter", mid: "Topic", leaf: "Sub-topic" };
const BOARDS = [
  { code: "CBSE", name: "CBSE (NCERT)", country: "India", region: "India", status: "active", verifyState: "verified", lastExam: null, bodies: "CBSE · NCERT", levels: "Grades 6–10", language: "English", languages: ["English", "Hindi"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 1178, sourceUrl: "https://www.cbse.gov.in", verifiedAt: daysFromNow(-21, 10, 0) },
  { code: "ICSE", name: "ICSE / ISC", country: "India", region: "India", status: "active", verifyState: "verified", lastExam: null, bodies: "CISCE", levels: "Grades 6–10", language: "English", languages: ["English", "Hindi"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 842, sourceUrl: "https://www.cisce.org", verifiedAt: daysFromNow(-34, 9, 30) },
  { code: "TN-STATE", name: "Tamil Nadu State Board", country: "India", region: "State boards", status: "active", verifyState: "verified", lastExam: null, bodies: "TNSCERT · DGE Tamil Nadu", levels: "Grades 6–10", language: "English", languages: ["English", "Tamil"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 764, sourceUrl: "https://www.dge.tn.gov.in", verifiedAt: daysFromNow(-28, 11, 0) },
  { code: "KA-SSLC", name: "Karnataka SSLC", country: "India", region: "State boards", status: "active", verifyState: "verified", lastExam: null, bodies: "KSEEB", levels: "Grades 6–10", language: "English", languages: ["English", "Kannada"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 691, sourceUrl: "https://kseeb.karnataka.gov.in", verifiedAt: daysFromNow(-40, 10, 30) },
  { code: "MH-SSC", name: "Maharashtra SSC", country: "India", region: "State boards", status: "active", verifyState: "partial", lastExam: null, bodies: "MSBSHSE", levels: "Grades 6–10", language: "English", languages: ["English", "Marathi"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 322, sourceUrl: "https://mahahsscboard.in", verifiedAt: null },
  { code: "IGCSE", name: "Cambridge IGCSE", country: "United Kingdom", region: "International", status: "active", verifyState: "verified", lastExam: null, bodies: "Cambridge Assessment", levels: "Grades 6–10", language: "English", languages: ["English"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 1054, sourceUrl: "https://www.cambridgeinternational.org", verifiedAt: daysFromNow(-18, 9, 0) },
  { code: "IB-MYP", name: "IB MYP", country: "Switzerland", region: "International", status: "active", verifyState: "verified", lastExam: null, bodies: "IBO", levels: "Grades 6–10", language: "English", languages: ["English"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 486, sourceUrl: "https://www.ibo.org", verifiedAt: daysFromNow(-45, 14, 0) },
  { code: "AMERICAN", name: "American Curriculum", country: "USA", region: "International", status: "active", verifyState: "verified", lastExam: null, bodies: "US Common Core", levels: "Grades 6–10", language: "English", languages: ["English"], taxonomy: CH_TAX, yearFormat: "split", pathways: [], approvedQ: 578, sourceUrl: "http://www.corestandards.org", verifiedAt: daysFromNow(-25, 10, 0) },
  { code: "KE-CBC", name: "Kenya CBC", country: "Kenya", region: "Africa", status: "active", verifyState: "coming_soon", lastExam: null, bodies: "KICD · KNEC", levels: "PP1–Grade 12", language: "English", languages: ["English", "Kiswahili"], taxonomy: { top: "Strand", mid: "Sub-strand", leaf: "Specific learning outcome" }, yearFormat: "calendar", pathways: ["STEM", "Social Sciences", "Arts and Sports Science"], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "KE-844", name: "Kenya 8-4-4 (KCSE)", country: "Kenya", region: "Africa", status: "legacy", verifyState: "coming_soon", lastExam: "2027", bodies: "KNEC", levels: "Form 1–4", language: "English", languages: ["English", "Kiswahili"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Specific objective" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "KE-KCPE", name: "Kenya KCPE", country: "Kenya", region: "Africa", status: "retired", verifyState: "coming_soon", lastExam: "2023", bodies: "KNEC", levels: "Standard 1–8", language: "English", languages: ["English", "Kiswahili"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Objective" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "UG-NLSC", name: "Uganda NLSC", country: "Uganda", region: "Africa", status: "active", verifyState: "ingesting", lastExam: null, bodies: "NCDC · UNEB", levels: "S1–S4", language: "English", languages: ["English"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Learning outcome" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "UG-UACE", name: "Uganda UACE (A-Level)", country: "Uganda", region: "Africa", status: "transitional", verifyState: "coming_soon", lastExam: null, bodies: "NCDC · UNEB", levels: "S5–S6", language: "English", languages: ["English"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Objective" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "UG-PLE", name: "Uganda Primary (PLE)", country: "Uganda", region: "Africa", status: "under_review", verifyState: "coming_soon", lastExam: null, bodies: "NCDC · UNEB", levels: "P1–P7", language: "English", languages: ["English"], taxonomy: { top: "Theme", mid: "Topic", leaf: "Competency" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "TZ-SEC", name: "Tanzania Secondary", country: "Tanzania", region: "Africa", status: "transitional", verifyState: "coming_soon", lastExam: null, bodies: "TIE · NECTA", levels: "Form I–VI", language: "English", languages: ["English", "Kiswahili"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Competence" }, yearFormat: "calendar", pathways: ["General", "Vocational"], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "TZ-PRI", name: "Tanzania Primary", country: "Tanzania", region: "Africa", status: "transitional", verifyState: "coming_soon", lastExam: null, bodies: "TIE · NECTA", levels: "Standard I–VII", language: "English", languages: ["English", "Kiswahili"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Competence" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "GH-SBC", name: "Ghana Standards-Based", country: "Ghana", region: "Africa", status: "active", verifyState: "coming_soon", lastExam: null, bodies: "NaCCA · GES · WAEC", levels: "KG1–B9 · SHS1–3", language: "English", languages: ["English"], taxonomy: { top: "Strand", mid: "Sub-strand", leaf: "Content standard / indicator" }, yearFormat: "split", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "NG-NAT", name: "Nigeria National", country: "Nigeria", region: "Africa", status: "active", verifyState: "coming_soon", lastExam: null, bodies: "NERDC · WAEC · NECO · NABTEB", levels: "Primary 1–SSS3", language: "English", languages: ["English"], taxonomy: { top: "Theme", mid: "Topic", leaf: "Objective" }, yearFormat: "split", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
  { code: "ZA-CAPS", name: "South Africa CAPS", country: "South Africa", region: "Africa", status: "active", verifyState: "coming_soon", lastExam: null, bodies: "DBE · IEB", levels: "Grade R–12", language: "English", languages: ["English"], taxonomy: { top: "Topic", mid: "Sub-topic", leaf: "Skill / concept" }, yearFormat: "calendar", pathways: [], approvedQ: 0, sourceUrl: null, verifiedAt: null },
];

const CHAPTER_SOURCE: Record<string, string> = {
  CBSE: "NCERT Textbook 2026-27",
  ICSE: "CISCE Prescribed Text 2026-27",
  "TN-STATE": "Samacheer Kalvi Textbook 2026-27",
  "KA-SSLC": "KSEEB Textbook 2026-27",
  "MH-SSC": "Balbharati Textbook 2026-27",
  IGCSE: "Cambridge Coursebook 2026-27",
  "IB-MYP": "IB MYP Framework 2026",
  AMERICAN: "US Common Core 2026",
};

const GRADES = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const SUBJECTS = ["Mathematics", "Science", "English"];

/* ---------- 5E lesson plan content ---------- */
function lessonPlanRationalNumbers() {
  return {
    schemaVersion: "lesson-plan.v1",
    title: "Rational Numbers — The Number Line Sprint",
    learningObjectives: [
      "Define rational numbers and identify them on a number line",
      "Apply closure, commutative and associative properties to rational numbers",
      "Find rational numbers between two given rationals",
      "Represent real-life quantities (temperature, bank balance) as rationals",
    ],
    successCriteria: [
      "Students can classify numbers as rational/irrational with reasons",
      "Students can order four rational numbers from least to greatest",
      "Students can insert 3 rational numbers between 1/4 and 1/2",
    ],
    materials: ["Number line printouts", "Fraction cards set A–D", "Whiteboard markers", "Classwork notebook"],
    stages: [
      {
        stage: "ENGAGE", durationMinutes: 8, title: "The Thermometer Hook",
        teacherScript: "Ask: 'Yesterday Chennai was 38°C, today it dropped 3 degrees, and my bank app shows −₹1,275.50. What kind of numbers are these?' Collect answers on the board. Introduce the term 'rational number' — any number expressible as p/q, q ≠ 0.",
        analogy: "A rational number is like a pizza promise: you can always describe your share as a fraction of the whole — even if the pizza is debt (negative)!",
        boardWork: ["Draw a giant number line from -3 to +3", "Place -1/2, 3/4, -2.25 on it with student volunteers"],
        workedExamples: [],
        questions: [
          { q: "Is 0 a rational number? Why?", expected: "Yes — 0 = 0/1, denominator non-zero." },
          { q: "Can -5 be written as p/q?", expected: "Yes, -5 = -5/1." },
        ],
        differentiation: "Pair weaker readers with picture cards first; let advanced students challenge with π and √2.",
      },
      {
        stage: "EXPLORE", durationMinutes: 10, title: "Between Two Numbers",
        teacherScript: "Groups get cards 1/4 and 1/2. Challenge: 'Find a number that lives between them.' Then find another. Then another. Guide discovery that infinitely many rationals exist between any two.",
        analogy: "Numbers are like houses on a street — between any two houses you can always build another house.",
        boardWork: ["Show 1/4 = 0.25 and 1/2 = 0.50; mark midpoint 0.375 = 3/8"],
        workedExamples: [{ problem: "Find a rational number between 2/5 and 3/5", solution: "Mean = (2/5 + 3/5) ÷ 2 = 1/2 ÷ 2 = 1/2 × 1/2 = 1/4… wait — (1) ÷ 2 = 0.5 = 1/2. Correct: 1/2 lies between 0.4 and 0.6." }],
        questions: [
          { q: "Between which two integers does -7/4 lie?", expected: "Between -2 and -1." },
        ],
        differentiation: "Struggling students use decimal conversions; advanced students prove infinitude using p+q/2 recursively.",
      },
      {
        stage: "EXPLAIN", durationMinutes: 12, title: "Properties That Power Arithmetic",
        teacherScript: "Formally present closure, commutativity, associativity and the role of 0 and 1. Emphasise: rationals are closed under +, −, ×, ÷ (except ÷0). Write the property table and have students copy it.",
        analogy: "Commutativity is a two-door room: you enter from either side, you reach the same place.",
        boardWork: ["Property table: a+b = b+a, a×b = b×a, (a+b)+c = a+(b+c)", "Additive identity 0, multiplicative identity 1, reciprocal of a/b is b/a"],
        workedExamples: [
          { problem: "Verify: -3/7 + 5/6 = 5/6 + (-3/7)", solution: "LHS: (-18 + 35)/42 = 17/42. RHS: (35 - 18)/42 = 17/42. ✓ Equal." },
          { problem: "Multiply: -2/9 × 3/4", solution: "= (-2×3)/(9×4) = -6/36 = -1/6." },
        ],
        questions: [
          { q: "What is the additive inverse of -4/9?", expected: "4/9." },
          { q: "Are rationals closed under division?", expected: "Yes, except division by zero." },
        ],
        differentiation: "Provide a printed property table to students with note-taking difficulties.",
      },
      {
        stage: "ELABORATE", durationMinutes: 10, title: "Chennai Market Math",
        teacherScript: "Students apply rationals to real contexts: currency exchange (1 USD = ₹84.10), temperature, and recipe scaling. Solve in pairs, then present one solution each.",
        analogy: "Exchange rates are rational numbers working overtime!",
        boardWork: ["Exchange table: USD→INR, EUR→INR, AED→INR", "1 USD = ₹84.10 · 1 EUR = ₹91.25 · 1 AED = ₹22.89"],
        workedExamples: [{ problem: "Convert 2.5 USD to INR at 84.10", solution: "2.5 × 84.10 = ₹210.25. Both 2.5 and 210.25 are rationals." }],
        questions: [{ q: "If 3 pizzas are shared by 4 friends, what rational describes each share?", expected: "3/4 pizza each." }],
        differentiation: "Advanced: solve a two-step exchange problem through a third currency.",
      },
      {
        stage: "EVALUATE", durationMinutes: 5, title: "Exit Ticket — 3 Quick Ones",
        teacherScript: "Hand exit slips: (1) Write -2⅓ as p/q. (2) Insert one rational between 3/5 and 4/5. (3) True/False: subtraction of rationals is commutative. Review answers immediately; reteach inverse operations tomorrow if >30% slip.",
        analogy: "",
        boardWork: [],
        workedExamples: [],
        questions: [
          { q: "-2⅓ as p/q?", expected: "-7/3." },
          { q: "One rational between 3/5 and 4/5?", expected: "7/10 (or 0.65 etc.)." },
          { q: "Is subtraction commutative?", expected: "False." },
        ],
        differentiation: "Oral exit option for students with writing fatigue.",
      },
    ],
    homework: {
      tasks: ["NCERT Ex 1.1 Q1–Q8", "Create a number-line poster placing 10 rationals", "Challenge: find three rationals between -1/3 and -1/4"],
      expectedOutput: "Notebook work + poster submitted next class",
    },
    assessment: {
      formativeChecks: ["Exit ticket accuracy ≥ 2/3", "Group presentation of market-math solution"],
      evidence: "Exit slips collected and graded; common errors logged in Passport",
      adjustment: "If closure property is shaky, start next lesson with a 5-minute properties relay",
    },
    sourceRefs: ["NCERT Mathematics Grade 8, Chapter 1", "CBSE 2026-27 syllabus (active)"],
  };
}

function lessonPlanForceFriction() {
  return {
    schemaVersion: "lesson-plan.v1",
    title: "Force, Pressure & The Friction Playground",
    learningObjectives: [
      "Define force and describe its effects with everyday examples",
      "Explain pressure = Force/Area and why sharp knives cut better",
      "Identify factors affecting friction and suggest ways to reduce or increase it",
    ],
    successCriteria: [
      "Students diagram at least 3 forces acting on a book on a table",
      "Students calculate pressure given force and area in SI units",
      "Students classify surfaces by expected friction",
    ],
    materials: ["Spring balance", "Wooden block + glass sheet + sandpaper", "Balloons", "Push pins"],
    stages: [
      { stage: "ENGAGE", durationMinutes: 7, title: "Why Do We Slip?", teacherScript: "Show two shoes: one smooth sole, one ribbed. Ask why the ribbed one is safer on tiles. Tease out 'grip' → today's word: friction.", analogy: "Friction is the invisible handbrake of the universe — sometimes a hero, sometimes a villain.", boardWork: ["Word map: force → push/pull → friction"], workedExamples: [], questions: [{ q: "Name one hero-case and one villain-case of friction.", expected: "Hero: brakes stop a car. Villain: machine parts wearing out." }], differentiation: "Let ESL students draw instead of describe." },
      { stage: "EXPLORE", durationMinutes: 12, title: "Drag Race Lab", teacherScript: "Groups drag a wooden block with a spring balance across desk, glass and sandpaper. Record readings. Compare and infer factors affecting friction.", analogy: "Dragging a suitcase over airport carpet vs. marble floor.", boardWork: ["Table: surface vs. spring-balance reading"], workedExamples: [], questions: [{ q: "Which surface showed maximum friction? Why?", expected: "Sandpaper — rough interlocking surfaces." }], differentiation: "Pre-filled observation tables for support group." },
      { stage: "EXPLAIN", durationMinutes: 12, title: "Pressure = Force ÷ Area", teacherScript: "Formalise force (SI unit newton), pressure (pascal) and friction. Derive P = F/A. Why do camels have wide feet? Why does a nail have a sharp tip?", analogy: "Standing on one foot vs. two — same weight, double the area, half the ouch.", boardWork: ["P = F/A with units", "Worked derivation: 200 N on 2 m² → 100 Pa"], workedExamples: [{ problem: "A girl of weight 400 N stands on one foot of area 0.01 m². Pressure?", solution: "P = 400/0.01 = 40,000 Pa = 40 kPa." }], questions: [{ q: "Why do shoulder bags have wide straps?", expected: "Larger area → less pressure on the shoulder." }], differentiation: "Advanced: compare pressure in Pa vs N/cm²." },
      { stage: "ELABORATE", durationMinutes: 9, title: "Design a Better Shoe", teacherScript: "Teams design a sole for: (a) an ice rink, (b) a desert trek, (c) a football pitch. Justify friction choices.", analogy: "Engineers fight friction in engines but buy friction in tyres.", boardWork: [], workedExamples: [], questions: [{ q: "How do we reduce friction in machines?", expected: "Lubricants, ball bearings, smoothing surfaces." }], differentiation: "Sentence starters for the design justification." },
      { stage: "EVALUATE", durationMinutes: 5, title: "One-Minute Paper", teacherScript: "Students write: the most surprising thing learned + one question they still have. Review papers; address top question immediately if time permits.", analogy: "", boardWork: [], workedExamples: [], questions: [{ q: "Unit of force?", expected: "Newton (N)." }, { q: "Friction always opposes…?", expected: "Relative motion between surfaces." }], differentiation: "Verbal one-minute reflection allowed." },
    ],
    homework: { tasks: ["NCERT Ex 11.1–12.2 selected questions", "Find 5 friction examples at home — classify helpful/harmful"], expectedOutput: "Chart of 5 examples with classification" },
    assessment: { formativeChecks: ["Spring-balance readings within ±0.5 N across group trials", "One-minute paper insight quality"], evidence: "Lab sheet + one-minute papers", adjustment: "If P=F/A confuses, run the balloon + pin demo again with numbers" },
    sourceRefs: ["NCERT Science Grade 8, Chapters 9 & 10", "CBSE 2026-27 syllabus (active)"],
  };
}

function lessonPlanLight() {
  return {
    schemaVersion: "lesson-plan.v1",
    title: "Light — Laws of Reflection Lab",
    learningObjectives: [
      "State and verify the laws of reflection",
      "Draw ray diagrams for plane mirrors",
      "Explain lateral inversion with examples",
    ],
    successCriteria: ["Students trace incident and reflected rays with correct angles", "Students predict image position for a plane mirror"],
    materials: ["Plane mirrors", "Laser pointers (Class-safe)", "Protractors", "Ray boxes"],
    stages: [
      { stage: "ENGAGE", durationMinutes: 6, title: "Mirror, Mirror", teacherScript: "Hold text to a mirror — why is it reversed left-right but not up-down? Collect hypotheses.", analogy: "A mirror is a very polite bouncer: light goes in, must leave at the same angle it arrived.", boardWork: ["Normal, incident ray, reflected ray diagram"], workedExamples: [], questions: [{ q: "What is the 'normal'?", expected: "Perpendicular to the mirror surface at the point of incidence." }], differentiation: "Provide labelled diagram handout." },
      { stage: "EXPLORE", durationMinutes: 14, title: "Angle Hunt", teacherScript: "Groups shine rays at 20°, 45°, 60° and measure reflection angles. Tabulate i vs r.", analogy: "Billiards: the angle you hit the cushion is the angle it returns.", boardWork: ["i vs r table"], workedExamples: [], questions: [{ q: "If i = 35°, r = ?", expected: "35° — laws of reflection." }], differentiation: "Pre-set laser stations for support group." },
      { stage: "EXPLAIN", durationMinutes: 10, title: "Two Laws, One Image", teacherScript: "Formalise: (1) i = r, (2) incident ray, reflected ray and normal lie in one plane. Image formation: virtual, erect, laterally inverted, same size, image distance = object distance.", analogy: "", boardWork: ["Full ray diagram of image formation in plane mirror"], workedExamples: [{ problem: "You stand 2 m from a mirror. Where is your image and how far from you?", solution: "Image is 2 m behind mirror; 4 m from you." }], questions: [{ q: "Why is the image called virtual?", expected: "Rays only appear to come from it — no actual light converges there." }], differentiation: "Peer diagram-checking protocol." },
      { stage: "ELABORATE", durationMinutes: 10, title: "Ambulance Writing", teacherScript: "Why is AMBULANCE written in mirror script? Students sketch the mirror-word design for their own name.", analogy: "Lateral inversion flips your handshake: right hand meets left hand.", boardWork: [], workedExamples: [], questions: [{ q: "Is the image in a plane mirror magnified?", expected: "No — same size." }], differentiation: "Advanced: periscope design bonus." },
      { stage: "EVALUATE", durationMinutes: 5, title: "Ray-Diagram Relay", teacherScript: "Each row completes one step of a ray diagram on the board under time pressure. Grade for accuracy of angles and normals.", analogy: "", boardWork: [], workedExamples: [], questions: [{ q: "State both laws of reflection.", expected: "i = r; incident, reflected, normal coplanar." }], differentiation: "Verbal law-statement option." },
    ],
    homework: { tasks: ["Draw ray diagrams: object at 3 cm, 5 cm from mirror", "List 4 uses of plane mirrors at home"], expectedOutput: "Diagram sheet with labels" },
    assessment: { formativeChecks: ["i vs r tables consistent", "Relay diagram accuracy"], evidence: "Lab table + relay board photo", adjustment: "Redo laser demo with larger protractors if angles exceed ±3° error" },
    sourceRefs: ["NCERT Science Grade 8, Chapter 13", "CBSE 2026-27 syllabus (active)"],
  };
}

/* ---------- question paper content ---------- */
function paperMathHalfYearly() {
  return {
    instructions: "All questions are compulsory. Marks are shown against each question. Use of calculators is not permitted. Draw neat diagrams wherever necessary.",
    sections: [
      {
        name: "Section A — Multiple Choice", type: "MCQ", marksEach: 1,
        questions: [
          { q: "Which of the following is a rational number?", options: ["π", "√2", "0.333… (repeating)", "√5"], answer: "C", chapter: "Rational Numbers", difficulty: "easy", cognitive: "Remember" },
          { q: "The additive inverse of -7/13 is:", options: ["7/13", "-13/7", "13/7", "0"], answer: "A", chapter: "Rational Numbers", difficulty: "easy", cognitive: "Remember" },
          { q: "A square tile has area 144 cm². Its side is:", options: ["12 cm", "14 cm", "24 cm", "72 cm"], answer: "A", chapter: "Squares and Square Roots", difficulty: "easy", cognitive: "Apply" },
          { q: "The sum of interior angles of a quadrilateral is:", options: ["180°", "270°", "360°", "540°"], answer: "C", chapter: "Understanding Quadrilaterals", difficulty: "easy", cognitive: "Remember" },
          { q: "If 3(x - 2) = 15, then x =", options: ["3", "5", "7", "9"], answer: "C", chapter: "Linear Equations in One Variable", difficulty: "easy", cognitive: "Apply" },
          { q: "Which is a perfect cube?", options: ["64", "100", "125", "200"], answer: "C", chapter: "Cubes and Cube Roots", difficulty: "medium", cognitive: "Understand", note: "64 and 125 are both cubes — corrected key: accept A or C" },
          { q: "The multiplicative identity for rationals is:", options: ["0", "1", "-1", "1/2"], answer: "B", chapter: "Rational Numbers", difficulty: "easy", cognitive: "Remember" },
          { q: "Data: 4, 6, 8, 6, 6. The mode is:", options: ["4", "6", "8", "30"], answer: "B", chapter: "Data Handling", difficulty: "easy", cognitive: "Apply" },
          { q: "(a + b)² equals:", options: ["a² + b²", "a² + 2ab + b²", "a² - 2ab + b²", "2ab"], answer: "B", chapter: "Algebraic Expressions and Identities", difficulty: "easy", cognitive: "Remember" },
          { q: "1 kW h (unit of electricity) equals:", options: ["3.6 × 10⁶ J", "3.6 × 10³ J", "1000 J", "6 × 10⁵ J"], answer: "A", chapter: "Chemical Effects of Electric Current", difficulty: "medium", cognitive: "Remember" },
        ],
      },
      {
        name: "Section B — Short Answer", type: "SA", marksEach: 3,
        questions: [
          { q: "Represent -3/5 and 7/5 on a number line. Insert two rational numbers between them.", answer: "Diagram; e.g. -2/5 and 1/5 (any correct pair). 1 mark diagram, 2 marks insertions.", chapter: "Rational Numbers", difficulty: "medium", cognitive: "Understand" },
          { q: "Solve: (2x - 1)/3 + (x + 2)/4 = 5. Show all steps.", answer: "Multiply by 12: 4(2x-1) + 3(x+2) = 60 → 8x - 4 + 3x + 6 = 60 → 11x = 58 → x = 58/11. Steps 2 marks, answer 1 mark.", chapter: "Linear Equations in One Variable", difficulty: "medium", cognitive: "Apply" },
          { q: "The angles of a quadrilateral are in ratio 1:2:3:4. Find all angles.", answer: "x + 2x + 3x + 4x = 360 → 10x = 360 → x = 36°. Angles: 36°, 72°, 108°, 144°. Ratio setup 1, solve 1, answer 1.", chapter: "Understanding Quadrilaterals", difficulty: "medium", cognitive: "Apply" },
          { q: "Find the smallest square number divisible by 8, 12 and 15.", answer: "LCM(8,12,15) = 120 = 2³×3×5. For a perfect square make exponents even: 2⁴×3²×5² = 3600. Method 2 marks, answer 1 mark.", chapter: "Squares and Square Roots", difficulty: "hard", cognitive: "Analyse" },
        ],
      },
      {
        name: "Section C — Long Answer", type: "LA", marksEach: 5,
        questions: [
          { q: "A water tank is a cuboid of dimensions 2 m × 1.5 m × 1 m. (a) Find its capacity in litres. (b) If water costs ₹72.00 per 1000 L, find the cost to fill it.", answer: "(a) Volume = 3 m³ = 3000 L. (b) Cost = 3 × 72.00 = ₹216.00. Volume 2 marks, conversion 1, cost 2.", chapter: "Mensuration", difficulty: "hard", cognitive: "Apply" },
          { q: "Verify the identity (a + b)² = a² + 2ab + b² for a = 3, b = -4, then use it to expand (2x + 5)².", answer: "LHS: (3-4)² = 1. RHS: 9 + 2(3)(-4) + 16 = 25 - 24 = 1 ✓. (2x+5)² = 4x² + 20x + 25. Verification 2, expansion 3.", chapter: "Algebraic Expressions and Identities", difficulty: "medium", cognitive: "Apply" },
          { q: "Draw a frequency table and a bar chart for the marks of 20 students: 5, 7, 8, 6, 5, 9, 7, 8, 5, 6, 7, 8, 9, 5, 6, 7, 8, 6, 5, 7. Which mark occurs most?", answer: "Tally table (2), correct bar chart with labels (2), mode = 7 (1).", chapter: "Data Handling", difficulty: "medium", cognitive: "Apply" },
        ],
      },
    ],
  };
}

/* ---------- MAIN SEED ---------- */
export async function seedDemoData() {
  /* wipe (order matters for relations) */
  await db.message.deleteMany();
  await db.messageThread.deleteMany();
  await db.notification.deleteMany();
  await db.auditEvent.deleteMany();
  await db.dispute.deleteMany();
  await db.savedTutor.deleteMany();
  await db.passportTopic.deleteMany();
  await db.testResult.deleteMany();
  await db.homework.deleteMany();
  await db.timetableEntry.deleteMany();
  await db.invoice.deleteMany();
  await db.ledgerEntry.deleteMany();
  await db.payment.deleteMany();
  await db.payout.deleteMany();
  await db.wallet.deleteMany();
  await db.alertEvent.deleteMany();
  await db.homeSession.deleteMany();
  await db.booking.deleteMany();
  await db.address.deleteMany();
  await db.batchSeat.deleteMany();
  await db.batch.deleteMany();
  await db.liveClass.deleteMany();
  await db.lessonPlan.deleteMany();
  await db.questionPaper.deleteMany();
  await db.offering.deleteMany();
  await db.curriculumTopic.deleteMany();
  await db.curriculumChapter.deleteMany();
  await db.curriculumSubject.deleteMany();
  await db.curriculumGrade.deleteMany();
  await db.curriculumBoard.deleteMany();
  await db.tutorDocument.deleteMany();
  await db.tutorProfile.deleteMany();
  await db.parentProfile.deleteMany();
  await db.studentProfile.deleteMany();
  await db.instituteProfile.deleteMany();
  await db.user.deleteMany();

  const pw = hashPassword("demo1234");

  /* ===== curriculum registry ===== */
  const gradeIds: Record<string, string> = {};
  const subjectIds: Record<string, string> = {}; // `${boardCode}|${grade}|${subject}`
  for (const b of BOARDS) {
    const board = await db.curriculumBoard.create({
      data: {
        code: b.code, name: b.name, country: b.country, region: b.region, status: b.status, verifyState: b.verifyState,
        lastExam: b.lastExam ?? null, bodies: b.bodies, levels: b.levels, sourceUrl: b.sourceUrl ?? null, verifiedAt: b.verifiedAt ?? null,
        language: b.language, languages: JSON.stringify(b.languages), taxonomy: JSON.stringify(b.taxonomy),
        yearFormat: b.yearFormat, pathways: JSON.stringify(b.pathways), approvedQ: b.approvedQ,
      },
    });
    /* Africa / coming-soon boards stay registry-only cards — no grades, subjects or chapters yet */
    if (b.verifyState !== "verified" && b.verifyState !== "partial") continue;
    const boardSubjects = b.code === "MH-SSC" ? ["Mathematics", "Science"] : SUBJECTS;
    for (const g of GRADES) {
      const grade = await db.curriculumGrade.create({ data: { boardId: board.id, name: g } });
      gradeIds[`${b.code}|${g}`] = grade.id;
      for (const s of boardSubjects) {
        const subject = await db.curriculumSubject.create({ data: { boardId: board.id, gradeId: grade.id, name: s } });
        subjectIds[`${b.code}|${g}|${s}`] = subject.id;
        const bank = s === "Mathematics" ? MATH[g] : s === "Science" ? SCIENCE[g] : ENGLISH;
        const topicBank = s === "Mathematics" ? MATH_TOPICS[g] : s === "Science" ? SCIENCE_TOPICS[g] : ENGLISH_TOPICS;
        for (let i = 0; i < bank.length; i++) {
          const chapter = await db.curriculumChapter.create({
            data: { subjectId: subject.id, name: bank[i], number: i + 1, status: "active", source: CHAPTER_SOURCE[b.code] ?? `${b.name} Syllabus 2026-27`, marks: i % 3 === 0 ? 8 : 5 },
          });
          const topics = topicBank[bank[i]] ?? [];
          for (let ti = 0; ti < topics.length; ti++) {
            await db.curriculumTopic.create({
              data: { chapterId: chapter.id, name: topics[ti].t, number: ti + 1, subTopics: JSON.stringify(topics[ti].s.map((name) => ({ name }))), marks: 2 },
            });
          }
        }
      }
    }
  }

  /* ===== users ===== */
  const mkUser = (id: string, data: Partial<Parameters<typeof db.user.create>[0]["data"]> & { name: string; email: string; role: string }) =>
    db.user.create({ data: { id, password: pw, country: "India", city: "Chennai", isDemo: true, avatarColor: "#315BE5", ...data } as any });

  await mkUser("u-admin", { name: "Arjun Mehta", email: "admin.demo@tutoramma.test", role: "admin", avatarColor: "#14246B", phone: "+91 98400 10001" });
  await mkUser("u-student-aarav", { name: "Aarav Menon", email: "student.demo@tutoramma.test", role: "student", avatarColor: "#F47B20", phone: "+91 95512 33440" });
  await mkUser("u-student-ananya", { name: "Ananya Menon", email: "ananya.student@tutoramma.test", role: "student", avatarColor: "#9A7EDB", phone: "+91 95512 33550" });
  await mkUser("u-parent", { name: "Priya Menon", email: "parent.demo@tutoramma.test", role: "parent", avatarColor: "#1F9D68", phone: "+91 95512 33000" });
  await mkUser("u-tutor-meera", { name: "Meera Krishnan", email: "tutor.demo@tutoramma.test", role: "tutor", avatarColor: "#14246B", phone: "+91 95512 28811" });

  const tutorSeeds = [
    { id: "u-tutor-farah", name: "Nikita Deshpande", email: "farah.tutor@tutoramma.test", color: "#E06A9B", headline: "English & Humanities Specialist — IGCSE + CBSE", boards: ["CBSE", "IGCSE", "TN-STATE"], subjects: ["English"], modes: ["online", "group"], rateOnline: F(650), rateHome: 0, rating: 4.9, reviews: 98, trust: 88, years: 11, radius: 0, langs: ["English", "Marathi", "Hindi"], responds: 9, sessions: 860 },
    { id: "u-tutor-sunil", name: "Dr. Sunil Menon", email: "sunil.tutor@tutoramma.test", color: "#1F9D68", headline: "Mathematics Professor — ICSE, CBSE Grades 9–10", boards: ["ICSE", "CBSE"], subjects: ["Mathematics"], modes: ["online"], rateOnline: F(850), rateHome: 0, rating: 4.7, reviews: 210, trust: 90, years: 18, radius: 0, langs: ["English", "Malayalam", "Hindi"], responds: 22, sessions: 1990 },
    { id: "u-tutor-ananya", name: "Ananya Iyer", email: "ananya.tutor@tutoramma.test", color: "#315BE5", headline: "Physics made visual — IGCSE & IB MYP", boards: ["IGCSE", "IB-MYP"], subjects: ["Science"], modes: ["online", "home"], rateOnline: F(700), rateHome: F(900), rating: 4.6, reviews: 76, trust: 84, years: 7, radius: 10, langs: ["English", "Tamil"], responds: 31, sessions: 540 },
    { id: "u-tutor-omar", name: "Arjun Pillai", email: "omar.tutor@tutoramma.test", color: "#DF8B32", headline: "Mathematics the American way + Tamil Nadu State Board", boards: ["AMERICAN", "TN-STATE"], subjects: ["Mathematics"], modes: ["online", "home"], rateOnline: F(600), rateHome: F(850), rating: 4.5, reviews: 64, trust: 81, years: 9, radius: 15, langs: ["English", "Malayalam", "Tamil"], responds: 44, sessions: 480 },
    { id: "u-tutor-lakshmi", name: "Lakshmi Nair", email: "lakshmi.tutor@tutoramma.test", color: "#9A7EDB", headline: "All-subject home tutor — Middle School CBSE", boards: ["CBSE"], subjects: ["Mathematics", "Science", "English"], modes: ["home"], rateOnline: 0, rateHome: F(750), rating: 4.8, reviews: 152, trust: 86, years: 12, radius: 8, langs: ["English", "Malayalam", "Hindi"], responds: 18, sessions: 1310 },
    { id: "u-tutor-noura", name: "Aishwarya Raghavan", email: "noura.tutor@tutoramma.test", color: "#E05A5A", headline: "English & IELTS prep — bilingual instruction", boards: ["TN-STATE", "IGCSE"], subjects: ["English"], modes: ["online"], rateOnline: F(600), rateHome: 0, rating: 4.4, reviews: 41, trust: 78, years: 5, radius: 0, langs: ["English", "Tamil"], responds: 52, sessions: 300 },
    { id: "u-tutor-ravi", name: "Ravi Shankar", email: "ravi.tutor@tutoramma.test", color: "#2C8A7B", headline: "Science group classes that feel like a lab", boards: ["CBSE"], subjects: ["Science"], modes: ["group", "online"], rateOnline: F(550), rateHome: 0, rating: 4.7, reviews: 89, trust: 83, years: 8, radius: 0, langs: ["English", "Hindi", "Telugu"], responds: 27, sessions: 720 },
    { id: "u-tutor-sofia", name: "Sofia Rahman", email: "sofia.tutor@tutoramma.test", color: "#5A6BD6", headline: "Chemistry & Biology — IGCSE home visits", boards: ["IGCSE"], subjects: ["Science"], modes: ["online", "home"], rateOnline: F(750), rateHome: F(950), rating: 4.6, reviews: 58, trust: 82, years: 6, radius: 12, langs: ["English", "Urdu", "Hindi"], responds: 35, sessions: 410 },
  ];
  for (const t of tutorSeeds) await mkUser(t.id, { name: t.name, email: t.email, role: "tutor", avatarColor: t.color });

  const pendingTutors = [
    { id: "u-tutor-rajesh", name: "Rajesh Kumar", email: "tutor.pending@tutoramma.test", color: "#7C88A8", headline: "Mathematics — CBSE Grades 6–10", subjects: ["Mathematics"], boards: ["CBSE"] },
    { id: "u-tutor-sara", name: "Sara Ali", email: "sara.pending@tutoramma.test", color: "#B87BD6", headline: "English Literature & Writing Coach", subjects: ["English"], boards: ["IGCSE", "TN-STATE"] },
    { id: "u-tutor-mohammed", name: "Mohammed Iqbal", email: "mohammed.pending@tutoramma.test", color: "#6BA36B", headline: "Physics & Mathematics — American Curriculum", subjects: ["Science", "Mathematics"], boards: ["AMERICAN"] },
    { id: "u-tutor-divya", name: "Divya Menon", email: "divya.pending@tutoramma.test", color: "#D6955A", headline: "Social Studies & Civics — CBSE + Tamil Nadu State Board", subjects: ["English"], boards: ["CBSE", "TN-STATE"] },
  ];
  for (const t of pendingTutors) await mkUser(t.id, { name: t.name, email: t.email, role: "tutor", avatarColor: t.color });

  /* Meera's roster students (11 + Aarav = 12) */
  const roster = [
    { id: "u-st-ishita", name: "Ishita Verma" }, { id: "u-st-rohan", name: "Rohan Das" },
    { id: "u-st-sneha", name: "Sneha Pillai" }, { id: "u-st-arjunn", name: "Arjun Nair" },
    { id: "u-st-diya", name: "Diya Sharma" }, { id: "u-st-kabir", name: "Kabir Singh" },
    { id: "u-st-anika", name: "Anika Rao" }, { id: "u-st-vihaan", name: "Vihaan Gupta" },
    { id: "u-st-zara", name: "Zara Sheikh" }, { id: "u-st-advait", name: "Advait Kulkarni" },
    { id: "u-st-leila", name: "Rhea Pillai" }, { id: "u-st-maya", name: "Nikhil Pillai" },
  ];
  for (const s of roster) await mkUser(s.id, { name: s.name, email: `${s.id.replace("u-st-", "")}@student.tutoramma.test`, role: "student", avatarColor: "#315BE5" });

  /* ===== profiles ===== */
  await db.studentProfile.create({
    data: {
      userId: "u-student-aarav", grade: "Grade 8", boardId: "CBSE", school: "Chennai Public School",
      xp: 1450, level: 4, streak: 6,
      badges: JSON.stringify(["Homework Hero", "7-Day Streak", "Quick Thinker", "Rising Star"]),
      goals: JSON.stringify(["Master Light & Sound before finals", "Score 90%+ in Class 8 finals", "Complete 20 group classes"]),
      weakTopics: JSON.stringify(["Light: Reflection", "Sound: Frequency & Amplitude", "Factorisation"]),
      examDate: daysFromNow(38, 9, 0), parentEmail: "parent.demo@tutoramma.test",
    },
  });
  await db.studentProfile.create({
    data: { userId: "u-student-ananya", grade: "Grade 6", boardId: "CBSE", school: "CPS", xp: 620, level: 2, streak: 2, badges: JSON.stringify(["First Review"]), goals: JSON.stringify(["Read 10 books this term"]), weakTopics: JSON.stringify(["Fractions"]), parentEmail: "parent.demo@tutoramma.test" },
  });
  for (const s of roster) {
    await db.studentProfile.create({
      data: { userId: s.id, grade: "Grade 8", boardId: "CBSE", school: "CPS / DAV Senior Secondary", xp: 400 + Math.floor(Math.random() * 900), level: 2 + (Math.floor(Math.random() * 3)), streak: Math.floor(Math.random() * 8), badges: JSON.stringify([]), goals: JSON.stringify([]), weakTopics: JSON.stringify([]) },
    });
  }

  await db.parentProfile.create({
    data: {
      userId: "u-parent", emergencyName: "Kumar Menon", emergencyPhone: "+91 95544 77880",
      consents: JSON.stringify({ location: true, recording: false, messageVisibility: true, whatsapp: true, adultPresent: true }),
      childrenEmails: JSON.stringify(["student.demo@tutoramma.test", "ananya.student@tutoramma.test"]),
    },
  });

  /* Meera — the verified tutor */
  const allBadges = JSON.stringify(["ID verified", "Qualification verified", "Experience verified", "Background checked", "Top rated", "Responds fast"]);
  await db.tutorProfile.create({
    data: {
      userId: "u-tutor-meera", headline: "Mathematics & Science — concept-first teaching, CBSE Grade 8–10",
      bio: "M.Sc. Mathematics with 14 years teaching across Chennai. I teach concept-first with visual models, weekly progress notes to parents, and AI-generated practice papers matched to your textbook chapters. Home visits follow the full Tutor Amma safety protocol — OTP check-in, live tracking, and session summaries after every visit.",
      yearsExperience: 14, rating: 4.8, reviewCount: 127, sessionsDone: 1240, trustScore: 92, status: "approved",
      badges: allBadges, languages: JSON.stringify(["English", "Tamil", "Hindi", "Malayalam"]),
      modes: JSON.stringify(["online", "home", "group"]), rateOnline: F(750), rateHome: F(900), travelRadiusKm: 12, responseMins: 12,
      qualifications: JSON.stringify([
        { title: "M.Sc. Mathematics", issuer: "University of Madras", year: 2009, status: "verified" },
        { title: "B.Ed.", issuer: "Tamil Nadu Teachers Education University", year: 2011, status: "verified" },
        { title: "TRB Tamil Nadu Teaching Licence", issuer: "Teachers Recruitment Board, Tamil Nadu", year: 2022, status: "verified" },
      ]),
      experience: JSON.stringify([
        { role: "Senior Mathematics Teacher", org: "DAV Senior Secondary, Chennai", from: "2018", to: "Present", verified: true },
        { role: "Science Faculty", org: "Chennai Public School", from: "2012", to: "2018", verified: true },
      ]),
    },
  });
  for (const d of [
    { type: "civil_id", name: "Aadhaar card (front & back)", issuer: "UIDAI" },
    { type: "degree", name: "M.Sc. Mathematics degree", issuer: "University of Madras" },
    { type: "teaching_cert", name: "B.Ed. + TRB teaching licence", issuer: "TNTEU / TRB Tamil Nadu" },
    { type: "background_check", name: "Criminal background check", issuer: "Tamil Nadu Police" },
    { type: "conduct", name: "Code of Conduct — signed", issuer: "Tutor Amma" },
  ]) {
    await db.tutorDocument.create({ data: { tutorId: (await db.tutorProfile.findFirst({ where: { userId: "u-tutor-meera" } }))!.id, type: d.type, name: d.name, issuer: d.issuer, status: "verified", reviewedBy: "Arjun Mehta", uploadedAt: daysFromNow(-220, 10, 0) } });
  }

  for (const t of tutorSeeds) {
    const meeraLike = await db.tutorProfile.create({
      data: {
        userId: t.id, headline: t.headline, bio: `${t.years} years of classroom and 1:1 experience. Verified on Tutor Amma with background checks and curriculum-matched offerings.`,
        yearsExperience: t.years, rating: t.rating, reviewCount: t.reviews, sessionsDone: t.sessions, trustScore: t.trust, status: "approved",
        badges: JSON.stringify(["ID verified", "Qualification verified", "Experience verified", "Background checked", ...(t.rating >= 4.8 ? ["Top rated"] : []), ...(t.responds < 20 ? ["Responds fast"] : [])]),
        languages: JSON.stringify(t.langs), modes: JSON.stringify(t.modes), rateOnline: t.rateOnline, rateHome: t.rateHome,
        travelRadiusKm: t.radius, responseMins: t.responds,
        qualifications: JSON.stringify([{ title: "Postgraduate in subject", issuer: "Verified university", year: 2010, status: "verified" }]),
        experience: JSON.stringify([{ role: "Teacher", org: "Verified school", from: "2015", to: "Present", verified: true }]),
      },
    });
    /* offerings */
    for (const b of t.boards) for (const sub of t.subjects) for (const g of ["Grade 8", "Grade 9", "Grade 10"]) {
      if (t.modes.includes("online")) await db.offering.create({ data: { tutorId: meeraLike.id, boardId: b, gradeId: `${b}|${g}`, subjectId: `${b}|${g}|${sub}`, mode: "online", price: t.rateOnline } });
      if (t.modes.includes("home") && t.rateHome) await db.offering.create({ data: { tutorId: meeraLike.id, boardId: b, gradeId: `${b}|${g}`, subjectId: `${b}|${g}|${sub}`, mode: "home", price: t.rateHome } });
    }
  }
  /* pending tutors */
  for (const t of pendingTutors) {
    const tp = await db.tutorProfile.create({
      data: {
        userId: t.id, headline: t.headline, bio: "Documents submitted — awaiting Tutor Amma verification.",
        yearsExperience: 3 + Math.floor(Math.random() * 10), rating: 0, reviewCount: 0, sessionsDone: 0, trustScore: 35, status: "in_review",
        badges: JSON.stringify(["ID verified"]), languages: JSON.stringify(["English"]), modes: JSON.stringify(["online"]),
        rateOnline: F(550), rateHome: 0, travelRadiusKm: 0, responseMins: 60,
        qualifications: JSON.stringify([{ title: "Degree certificate", issuer: "University", year: 2015, status: "submitted" }]),
        experience: JSON.stringify([{ role: "Teacher", org: "School", from: "2018", to: "Present", verified: false }]),
      },
    });
    await db.tutorDocument.create({ data: { tutorId: tp.id, type: "civil_id", name: "Aadhaar card", issuer: "UIDAI", status: "submitted" } });
    await db.tutorDocument.create({ data: { tutorId: tp.id, type: "degree", name: "Degree certificate", issuer: "University", status: "submitted" } });
    await db.tutorDocument.create({ data: { tutorId: tp.id, type: "background_check", name: "Background check", issuer: "Tamil Nadu Police", status: "submitted" } });
  }
  /* Meera offerings */
  const meeraProfileId = (await db.tutorProfile.findFirst({ where: { userId: "u-tutor-meera" } }))!.id;
  for (const g of ["Grade 8", "Grade 9", "Grade 10"]) {
    for (const sub of ["Mathematics", "Science"]) {
      await db.offering.create({ data: { tutorId: meeraProfileId, boardId: "CBSE", gradeId: `CBSE|${g}`, subjectId: `CBSE|${g}|${sub}`, mode: "online", price: F(750) } });
      await db.offering.create({ data: { tutorId: meeraProfileId, boardId: "CBSE", gradeId: `CBSE|${g}`, subjectId: `CBSE|${g}|${sub}`, mode: "home", price: F(900) } });
    }
  }

  /* ===== addresses ===== */
  await db.address.create({ data: { id: "addr-aarav", ownerId: "u-parent", label: "Home", area: "Anna Nagar West, Block 5", line1: "Building 42, Street 5, Anna Nagar West", lat: 13.0878, lng: 80.2105 } });
  await db.address.create({ data: { id: "addr-maya", ownerId: "u-st-maya", label: "Home", area: "Mylapore, Block 4", line1: "Villa 18, Street 4, Mylapore", lat: 13.033, lng: 80.2681 } });
  await db.address.create({ data: { id: "addr-leila", ownerId: "u-st-leila", label: "Home", area: "Adyar, Block 1", line1: "Flat 6, Street 1, Adyar", lat: 13.0067, lng: 80.257 } });

  /* ===== THE live-demo home session (Aarav ← Meera, today 18:30) ===== */
  const homeBooking = await db.booking.create({
    data: {
      id: "bk-live-home", studentId: "u-student-aarav", tutorId: "u-tutor-meera", mode: "home",
      subject: "Science", board: "CBSE", grade: "Grade 8", title: "Science — Light: Reflection & Refraction",
      startAt: atToday(18, 30), endAt: atToday(19, 15), state: "accepted",
      sessionFee: F(1600), platformFee: F(250), total: F(1850), addressId: "addr-aarav",
      policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50", geofenceMeters: 150, otpRequired: true }),
    },
  });
  await db.homeSession.create({
    data: {
      bookingId: homeBooking.id, stage: "scheduled", otp: "4821", otpAttempts: 0,
      battery: 87, destLat: 13.0878, destLng: 80.2105, destArea: "Anna Nagar West, Block 5", geofenceMeters: 150,
      routeJson: JSON.stringify([
        { lat: 13.0067, lng: 80.257 }, { lat: 13.0153, lng: 80.2519 }, { lat: 13.0313, lng: 80.2466 },
        { lat: 13.0423, lng: 80.2406 }, { lat: 13.0571, lng: 80.2341 }, { lat: 13.0681, lng: 80.2276 },
        { lat: 13.0767, lng: 80.2214 }, { lat: 13.0841, lng: 80.216 }, { lat: 13.0878, lng: 80.2105 },
      ]),
    },
  });
  await db.payment.create({
    data: {
      bookingId: homeBooking.id, payerId: "u-parent", tutorId: "u-tutor-meera", purpose: "booking", method: "upi",
      provider: "razorpay", sessionFee: F(1600), platformFee: F(250), total: F(1850), status: "held",
      ledgerEntries: {
        create: [
          { account: "payer_cash", debit: F(1850), credit: 0, memo: "UPI hold — escrow for home session" },
          { account: "escrow", debit: 0, credit: F(1850), memo: "Funds held in escrow until check-out" },
        ],
      },
      invoice: { create: { number: "INV-2026-0341", payerId: "u-parent", amount: F(1850) } },
    },
  });

  /* second live session — Sofia enroute to Maya (variety for admin console) */
  const sofiaBooking = await db.booking.create({
    data: {
      id: "bk-live-sofia", studentId: "u-st-maya", tutorId: "u-tutor-sofia", mode: "home",
      subject: "Science", board: "IGCSE", grade: "Grade 9", title: "Chemistry — Atomic Structure",
      /* started 25 min ago, on-my-way 11 min ago, still not checked in → the
         alert-rule engine fires a live no_checkin alert when the console loads it */
      startAt: new Date(Date.now() - 25 * 60 * 1000), endAt: new Date(Date.now() + 20 * 60 * 1000), state: "in_progress",
      sessionFee: F(950), platformFee: F(142.5), total: F(1092.5), addressId: "addr-maya",
      policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
    },
  });
  await db.homeSession.create({
    data: {
      bookingId: sofiaBooking.id, stage: "enroute", otp: "7390", battery: 64,
      onMyWayAt: new Date(Date.now() - 11 * 60 * 1000),
      destLat: 13.033, destLng: 80.2681, destArea: "Mylapore, Block 4",
      routeJson: JSON.stringify([
        { lat: 13.0067, lng: 80.257 }, { lat: 13.012, lng: 80.2605 }, { lat: 13.0188, lng: 80.2632 },
        { lat: 13.0262, lng: 80.2657 }, { lat: 13.033, lng: 80.2681 },
      ]),
    },
  });

  /* ===== Aarav's other bookings ===== */
  const bookingRows: { id: string; days: Date[]; state: string; mode: string; subject: string; title: string; fee: number; pay?: string; rating?: number; review?: string; addressId?: string; meetUrl?: string }[] = [
    { id: "bk-today-online", days: [atToday(17, 0)], state: "accepted", mode: "online", subject: "Mathematics", title: "Mathematics — Factorisation sprint", fee: F(750), meetUrl: "https://class.tutoramma.test/join/mt-8842", pay: "held" },
    { id: "bk-past-1", days: [lastWeekday(1, 17, 0)], state: "released", mode: "online", subject: "Mathematics", title: "Mathematics — Algebraic Identities", fee: F(750), pay: "released", rating: 5, review: "Meera ma'am explains factorisation so clearly — Aarav finally enjoys maths!" },
    { id: "bk-past-2", days: [lastWeekday(3, 17, 0)], state: "released", mode: "online", subject: "Mathematics", title: "Mathematics — Linear Equations", fee: F(750), pay: "released", rating: 5 },
    { id: "bk-past-3", days: [lastWeekday(2, 18, 30)], state: "released", mode: "home", subject: "Science", title: "Science — Friction lab at home", fee: F(900), pay: "released", rating: 4, review: "Great session, arrived right on time with the OTP check-in." },
    { id: "bk-nw-1", days: [nextWeekday(1, 17, 0)], state: "accepted", mode: "online", subject: "Mathematics", title: "Mathematics — Playing with Numbers", fee: F(750), pay: "held" },
    { id: "bk-nw-2", days: [nextWeekday(3, 17, 0)], state: "accepted", mode: "online", subject: "Mathematics", title: "Mathematics — Introduction to Graphs", fee: F(750), pay: "held" },
    { id: "bk-nw-3", days: [nextWeekday(2, 18, 30)], state: "accepted", mode: "home", subject: "Science", title: "Science — Sound: Frequency & Amplitude", fee: F(900), addressId: "addr-aarav", pay: "held" },
  ];
  for (const b of bookingRows) {
    for (let i = 0; i < b.days.length; i++) {
      const start = b.days[i];
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      const created = await db.booking.create({
        data: {
          id: b.days.length > 1 ? `${b.id}-${i}` : b.id, studentId: "u-student-aarav", tutorId: "u-tutor-meera",
          mode: b.mode, subject: b.subject, board: "CBSE", grade: "Grade 8", title: b.title,
          startAt: start, endAt: end, state: b.state, sessionFee: b.fee, platformFee: Math.round(b.fee * 0.15), total: Math.round(b.fee * 1.15),
          addressId: b.addressId ?? null, meetUrl: b.meetUrl ?? null, rating: b.rating ?? null, reviewComment: b.review ?? null,
          policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
        },
      });
      if (b.pay) {
        await db.payment.create({
          data: {
            bookingId: created.id, payerId: "u-parent", tutorId: "u-tutor-meera", method: "upi",
            sessionFee: b.fee, platformFee: Math.round(b.fee * 0.15), total: Math.round(b.fee * 1.15),
            status: b.pay, escrowReleasedAt: b.pay === "released" ? new Date(start.getTime() + 26 * 60 * 60 * 1000) : null,
            createdAt: new Date(start.getTime() - 48 * 60 * 60 * 1000),
            ledgerEntries: {
              create: [
                { account: "payer_cash", debit: Math.round(b.fee * 1.15), credit: 0, memo: "UPI payment" },
                { account: "escrow", debit: 0, credit: Math.round(b.fee * 1.15), memo: "Held in escrow" },
                ...(b.pay === "released"
                  ? [
                      { account: "escrow", debit: Math.round(b.fee * 1.15), credit: 0, memo: "Released after dispute window" },
                      { account: "platform_revenue", debit: 0, credit: Math.round(b.fee * 0.15), memo: "Platform commission 15%" },
                      { account: "tutor_payable", debit: 0, credit: b.fee, memo: "Tutor earnings" },
                    ]
                  : []),
              ],
            },
            invoice: { create: { number: `INV-2026-0${300 + bookingRows.indexOf(b) + i}`, payerId: "u-parent", amount: Math.round(b.fee * 1.15) } },
          },
        });
      }
    }
  }

  /* ===== requests pending for Meera ===== */
  await db.booking.create({
    data: {
      id: "bk-req-sneha", studentId: "u-st-sneha", tutorId: "u-tutor-meera", mode: "online", subject: "Mathematics",
      board: "CBSE", grade: "Grade 8", title: "Mathematics — Rational Numbers catch-up",
      startAt: daysFromNow(1, 16, 0), endAt: daysFromNow(1, 16, 45), state: "requested",
      sessionFee: F(750), platformFee: F(112.5), total: F(862.5), meetUrl: null,
      policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
    },
  });
  await db.booking.create({
    data: {
      id: "bk-req-leila", studentId: "u-st-leila", tutorId: "u-tutor-meera", mode: "home", subject: "Mathematics",
      board: "CBSE", grade: "Grade 8", title: "Mathematics — home visit, Mensuration",
      startAt: daysFromNow(2, 17, 30), endAt: daysFromNow(2, 18, 15), state: "requested",
      sessionFee: F(900), platformFee: F(135), total: F(1035), addressId: "addr-leila",
      policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
    },
  });

  /* ===== Meera's other students bookings (spread for master timetable + earnings) ===== */
  const rostBooking: [string, string, string, number, number, string][] = [
    // [studentId, subject, title, dayOffsetOrWeekdayFlag, hour, state]
  ];
  const rostPlan: { sid: string; subject: string; title: string; when: Date; state: string; mode: string }[] = [];
  roster.forEach((s, idx) => {
    const subj = idx % 2 === 0 ? "Mathematics" : "Science";
    const titles = subj === "Mathematics" ? ["Quadrilaterals workshop", "Mensuration drills", "Data Handling lab"] : ["Sound & hearing", "Chemical effects of current", "Crop production quiz"];
    const hour = 15 + (idx % 4);
    rostPlan.push({ sid: s.id, subject: subj, title: titles[idx % 3], when: nextWeekday(idx % 5, 0, hour, 30), state: "accepted", mode: idx % 3 === 0 ? "home" : "online" });
    rostPlan.push({ sid: s.id, subject: subj, title: titles[(idx + 1) % 3], when: lastWeekday(idx % 5, 0, hour, 30), state: "released", mode: "online" });
  });
  for (const r of rostPlan) {
    const fee = r.mode === "home" ? F(900) : F(750);
    const b = await db.booking.create({
      data: {
        studentId: r.sid, tutorId: "u-tutor-meera", mode: r.mode, subject: r.subject, board: "CBSE", grade: "Grade 8",
        title: `${r.subject} — ${r.title}`, startAt: r.when, endAt: new Date(r.when.getTime() + 45 * 60 * 1000),
        state: r.state, sessionFee: fee, platformFee: Math.round(fee * 0.15), total: Math.round(fee * 1.15),
        addressId: r.mode === "home" ? "addr-leila" : null,
        policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
      },
    });
    await db.payment.create({
      data: {
        bookingId: b.id, payerId: "u-parent", tutorId: "u-tutor-meera", sessionFee: fee, platformFee: Math.round(fee * 0.15), total: Math.round(fee * 1.15),
        status: r.state === "released" ? "released" : "held",
        escrowReleasedAt: r.state === "released" ? new Date(r.when.getTime() + 26 * 3600 * 1000) : null,
        createdAt: new Date(r.when.getTime() - 48 * 3600 * 1000),
        ledgerEntries: {
          create: r.state === "released"
            ? [
                { account: "payer_cash", debit: Math.round(fee * 1.15), credit: 0, memo: "UPI payment" },
                { account: "escrow", debit: 0, credit: Math.round(fee * 1.15), memo: "Escrow hold" },
                { account: "escrow", debit: Math.round(fee * 1.15), credit: 0, memo: "Released" },
                { account: "platform_revenue", debit: 0, credit: Math.round(fee * 0.15), memo: "Commission 15%" },
                { account: "tutor_payable", debit: 0, credit: fee, memo: "Tutor earnings" },
              ]
            : [
                { account: "payer_cash", debit: Math.round(fee * 1.15), credit: 0, memo: "UPI payment" },
                { account: "escrow", debit: 0, credit: Math.round(fee * 1.15), memo: "Escrow hold" },
              ],
        },
      },
    });
  }

  /* ===== other tutors' sample bookings (admin master timetable) ===== */
  const othersPlan = [
    { tutor: "u-tutor-farah", student: "u-st-rohan", subject: "English", title: "Descriptive writing", when: nextWeekday(0, 0, 16, 0) },
    { tutor: "u-tutor-farah", student: "u-st-diya", subject: "English", title: "Poetry appreciation", when: nextWeekday(2, 0, 17, 0) },
    { tutor: "u-tutor-sunil", student: "u-st-kabir", subject: "Mathematics", title: "Trigonometry intro", when: nextWeekday(1, 0, 19, 0) },
    { tutor: "u-tutor-sunil", student: "u-st-advait", subject: "Mathematics", title: "Quadratic equations", when: nextWeekday(4, 0, 18, 0) },
    { tutor: "u-tutor-ananya", student: "u-st-zara", subject: "Science", title: "Forces & motion", when: nextWeekday(3, 0, 15, 30) },
    { tutor: "u-tutor-omar", student: "u-st-vihaan", subject: "Mathematics", title: "Linear functions", when: nextWeekday(6, 0, 11, 0) },
    { tutor: "u-tutor-lakshmi", student: "u-st-anika", subject: "Science", title: "Human body systems", when: nextWeekday(2, 0, 16, 30) },
    { tutor: "u-tutor-noura", student: "u-st-arjunn", subject: "English", title: "IELTS speaking", when: nextWeekday(5, 0, 12, 0) },
  ];
  for (const o of othersPlan) {
    await db.booking.create({
      data: {
        studentId: o.student, tutorId: o.tutor, mode: "online", subject: o.subject, board: "CBSE", grade: "Grade 8",
        title: `${o.subject} — ${o.title}`, startAt: o.when, endAt: new Date(o.when.getTime() + 45 * 60 * 1000),
        state: "accepted", sessionFee: F(600), platformFee: F(90), total: F(690),
        policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
      },
    });
  }

  /* ===== batches ===== */
  const batchEnglish = await db.batch.create({
    data: {
      id: "batch-english", tutorId: "u-tutor-farah", subject: "English", board: "CBSE", grade: "Grade 8",
      title: "English Lit & Writing Circle — Grade 8", schedule: "Saturdays 11:00–12:15",
      dayPattern: JSON.stringify([{ day: 6, start: 660, end: 735 }]),
      minSeats: 4, maxSeats: 12, seatsFilled: 8, pricePerSeat: F(350), mode: "online", status: "confirmed",
      startDate: daysFromNow(-21, 11, 0), rating: 4.8,
    },
  });
  const batchMath = await db.batch.create({
    data: {
      id: "batch-math", tutorId: "u-tutor-meera", subject: "Mathematics", board: "CBSE", grade: "Grade 8",
      title: "Grade 8 Math Power Group — weekly", schedule: "Thursdays 17:30–18:30",
      dayPattern: JSON.stringify([{ day: 4, start: 1050, end: 1110 }]),
      minSeats: 3, maxSeats: 10, seatsFilled: 2, pricePerSeat: F(300), mode: "online", status: "open",
      startDate: daysFromNow(5, 17, 30), rating: 0,
    },
  });
  const batchScience = await db.batch.create({
    data: {
      id: "batch-science", tutorId: "u-tutor-ravi", subject: "Science", board: "CBSE", grade: "Grade 7",
      title: "Science Explorers — hands-on lab group", schedule: "Wednesdays 16:00–17:00",
      dayPattern: JSON.stringify([{ day: 3, start: 960, end: 1020 }]),
      minSeats: 3, maxSeats: 10, seatsFilled: 6, pricePerSeat: F(350), mode: "venue", venue: "Anna Nagar Learning Hub, Block 6", status: "confirmed",
      startDate: daysFromNow(-14, 16, 0), rating: 4.7,
    },
  });
  await db.batchSeat.create({ data: { batchId: "batch-english", studentId: "u-student-aarav", status: "joined" } });
  await db.booking.create({
    data: {
      id: "bk-group-english", studentId: "u-student-aarav", tutorId: "u-tutor-farah", mode: "group", subject: "English",
      board: "CBSE", grade: "Grade 8", title: "English Lit & Writing Circle", startAt: nextWeekday(6, 0, 11, 0),
      endAt: new Date(nextWeekday(6, 0, 11, 0).getTime() + 75 * 60 * 1000), state: "accepted",
      sessionFee: F(350), platformFee: F(52.5), total: F(402.5), batchId: "batch-english",
      policySnapshot: JSON.stringify({ freeCancelHours: 24, lateCancelSplit: "100% refund if batch unconfirmed" }),
    },
  });
  await db.payment.create({
    data: {
      bookingId: "bk-group-english", payerId: "u-parent", tutorId: "u-tutor-farah", purpose: "batch_seat",
      sessionFee: F(350), platformFee: F(52.5), total: F(402.5), status: "held",
      ledgerEntries: { create: [{ account: "payer_cash", debit: F(402.5), credit: 0, memo: "Batch seat" }, { account: "escrow", debit: 0, credit: F(402.5), memo: "Seat escrow" }] },
      invoice: { create: { number: "INV-2026-0358", payerId: "u-parent", amount: F(402.5) } },
    },
  });
  await db.batchSeat.create({ data: { batchId: "batch-math", studentId: "u-st-rohan", status: "joined" } });
  await db.batchSeat.create({ data: { batchId: "batch-math", studentId: "u-student-aarav", status: "joined" } });

  /* ---- digital classroom (live class) ready for the demo flow ---- */
  await db.liveClass.create({
    data: {
      id: "live-algebra-revision", tutorId: "u-tutor-meera", batchId: "batch-math",
      title: "Algebra revision — live before finals", subject: "Mathematics", board: "CBSE", grade: "Grade 8",
      agenda: "Quick recap of linear equations, then a live quiz from the question-paper studio.",
      scheduledAt: daysFromNow(2, 17, 0), durationMin: 60,
      code: "TA-ALG268", slug: "live-algebra-revision-demo", hostKey: "demo-host-key-algebra-revision",
      waitingRoom: true, allowChat: true, status: "scheduled", notifiedCount: 2,
    },
  });
  await db.notification.createMany({
    data: [
      { userId: "u-student-aarav", title: "Live class scheduled: Algebra revision — live before finals", body: "Meera Krishnan scheduled a live class for Grade 8 Math Power Group — weekly. Open \"Live Classes\" to join with code TA-ALG268.", type: "system" },
      { userId: "u-parent", title: "Live class scheduled: Algebra revision — live before finals", body: "Meera Krishnan scheduled a live class for Grade 8 Math Power Group — weekly (code TA-ALG268).", type: "system" },
    ],
  });
  for (const sid of ["u-st-sneha", "u-st-diya", "u-st-kabir", "u-st-zara", "u-st-advait", "u-st-vihaan"]) {
    await db.batchSeat.create({ data: { batchId: "batch-science", studentId: sid, status: "joined" } });
  }
  for (const sid of ["u-st-ishita", "u-st-anika", "u-st-arjunn", "u-st-maya", "u-st-leila"]) {
    await db.batchSeat.create({ data: { batchId: "batch-english", studentId: sid, status: "joined" } });
  }

  /* ---- batch below minimum whose start date already passed (auto-refund demo):
     opening Group Classes evaluates it and auto-refunds the held seat ---- */
  await db.batch.create({
    data: {
      id: "batch-physics", tutorId: "u-tutor-sunil", subject: "Physics", board: "CBSE", grade: "Grade 9",
      title: "Physics Olympiad Prep — Mechanics", schedule: "Tuesdays 18:00–19:00",
      dayPattern: JSON.stringify([{ day: 2, start: 1080, end: 1140 }]),
      minSeats: 3, maxSeats: 8, seatsFilled: 1, pricePerSeat: F(375), mode: "online", status: "open",
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), rating: 0,
    },
  });
  await db.batchSeat.create({ data: { batchId: "batch-physics", studentId: "u-st-anika", status: "joined" } });
  await db.booking.create({
    data: {
      id: "bk-group-physics", studentId: "u-st-anika", tutorId: "u-tutor-sunil", mode: "group", subject: "Physics",
      board: "CBSE", grade: "Grade 9", title: "Physics Olympiad Prep — Mechanics",
      startAt: new Date(Date.now() - 24 * 60 * 60 * 1000), endAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
      state: "accepted", sessionFee: F(375), platformFee: F(56.25), total: F(431.25), batchId: "batch-physics",
      policySnapshot: JSON.stringify({ freeCancelHours: 24, lateCancelSplit: "100% refund if batch unconfirmed" }),
    },
  });
  await db.payment.create({
    data: {
      bookingId: "bk-group-physics", payerId: "u-parent", tutorId: "u-tutor-sunil", purpose: "batch_seat",
      sessionFee: F(375), platformFee: F(56.25), total: F(431.25), status: "held",
      ledgerEntries: { create: [{ account: "payer_cash", debit: F(431.25), credit: 0, memo: "Batch seat" }, { account: "escrow", debit: 0, credit: F(431.25), memo: "Seat escrow" }] },
      invoice: { create: { number: "INV-2026-0371", payerId: "u-parent", amount: F(431.25) } },
    },
  });

  /* ===== wallets ===== */
  await db.wallet.create({ data: { userId: "u-parent", available: F(5000), escrow: F(6250), currency: "INR" } });
  await db.wallet.create({ data: { userId: "u-tutor-meera", available: F(8500), escrow: F(1250), currency: "INR" } });
  await db.wallet.create({ data: { userId: "u-tutor-farah", available: F(3200), escrow: F(450), currency: "INR" } });

  /* ===== payouts (Meera) ===== */
  await db.payout.create({ data: { tutorId: "u-tutor-meera", amount: F(14000), status: "paid", createdAt: daysFromNow(-21, 10, 0), paidAt: daysFromNow(-19, 14, 0) } });
  await db.payout.create({ data: { tutorId: "u-tutor-meera", amount: F(15400), status: "paid", createdAt: daysFromNow(-14, 10, 0), paidAt: daysFromNow(-12, 12, 0) } });
  await db.payout.create({ data: { tutorId: "u-tutor-meera", amount: F(6800), status: "pending", createdAt: daysFromNow(-2, 9, 0) } });

  /* ===== teaching studio (Meera) ===== */
  await db.lessonPlan.create({
    data: {
      tutorId: "u-tutor-meera", title: "Rational Numbers — The Number Line Sprint", board: "CBSE", grade: "Grade 8",
      subject: "Mathematics", chapterNames: JSON.stringify(["Rational Numbers", "Squares and Square Roots"]),
      difficulty: "Medium", periods: 1, periodMinutes: 45, slideCount: 8, contentJson: JSON.stringify(lessonPlanRationalNumbers()),
      provenance: "AI draft + tutor edits", version: 2, status: "shared", sharedWith: JSON.stringify(["u-student-aarav", "u-st-ishita", "u-st-rohan"]),
      sourceRefs: JSON.stringify(["NCERT Mathematics Grade 8, Chapter 1", "CBSE 2026-27 syllabus (active)"]),
    },
  });
  await db.lessonPlan.create({
    data: {
      tutorId: "u-tutor-meera", title: "Force, Pressure & The Friction Playground", board: "CBSE", grade: "Grade 8",
      subject: "Science", chapterNames: JSON.stringify(["Force and Pressure", "Friction"]),
      difficulty: "Medium", periods: 1, periodMinutes: 45, slideCount: 10, contentJson: JSON.stringify(lessonPlanForceFriction()),
      provenance: "AI draft", version: 1, status: "saved", sharedWith: JSON.stringify([]),
      sourceRefs: JSON.stringify(["NCERT Science Grade 8, Chapters 9 & 10"]),
    },
  });
  await db.lessonPlan.create({
    data: {
      tutorId: "u-tutor-meera", title: "Light — Laws of Reflection Lab", board: "CBSE", grade: "Grade 8",
      subject: "Science", chapterNames: JSON.stringify(["Light"]),
      difficulty: "Medium", periods: 1, periodMinutes: 45, slideCount: 8, contentJson: JSON.stringify(lessonPlanLight()),
      provenance: "AI draft", version: 1, status: "draft", sharedWith: JSON.stringify([]),
      sourceRefs: JSON.stringify(["NCERT Science Grade 8, Chapter 13"]),
    },
  });
  await db.questionPaper.create({
    data: {
      tutorId: "u-tutor-meera", title: "Half-Yearly Mathematics — Class 8 CBSE", board: "CBSE", grade: "Grade 8", subject: "Mathematics",
      chapters: JSON.stringify(["Rational Numbers", "Linear Equations in One Variable", "Understanding Quadrilaterals", "Squares and Square Roots", "Algebraic Expressions and Identities", "Mensuration", "Data Handling"]),
      configJson: JSON.stringify({ totalMarks: 40, durationMin: 90, sections: [{ name: "A", type: "MCQ", count: 10, marksEach: 1 }, { name: "B", type: "SA", count: 4, marksEach: 3 }, { name: "C", type: "LA", count: 3, marksEach: 5 }], difficulty: "Medium", setsCount: 3, deliveryMode: "M1" }),
      contentJson: JSON.stringify(paperMathHalfYearly()),
      answerKeyJson: JSON.stringify({ note: "Answer key + step-wise marking scheme — visible to tutor only", sections: paperMathHalfYearly().sections.map((s) => ({ name: s.name, answers: s.questions.map((q) => q.answer) })) }),
      status: "shared", provenance: "AI draft + tutor edits",
    },
  });
  await db.questionPaper.create({
    data: {
      tutorId: "u-tutor-meera", title: "Light — Chapter Quiz (10 min)", board: "CBSE", grade: "Grade 8", subject: "Science",
      chapters: JSON.stringify(["Light"]),
      configJson: JSON.stringify({ totalMarks: 10, durationMin: 10, sections: [{ name: "A", type: "MCQ", count: 5, marksEach: 2 }], difficulty: "Easy", setsCount: 1, deliveryMode: "M2" }),
      contentJson: JSON.stringify({
        instructions: "Choose the correct option. Each question carries 2 marks.",
        sections: [{
          name: "Section A — MCQ", type: "MCQ", marksEach: 2,
          questions: [
            { q: "Angle of incidence is 40°. Angle of reflection is:", options: ["40°", "50°", "80°", "20°"], answer: "A", chapter: "Light", difficulty: "easy", cognitive: "Remember" },
            { q: "The image formed by a plane mirror is:", options: ["Real & inverted", "Virtual & erect", "Real & erect", "Virtual & inverted"], answer: "B", chapter: "Light", difficulty: "easy", cognitive: "Remember" },
            { q: "Two plane mirrors at 90° produce how many images of an object?", options: ["2", "3", "4", "Infinite"], answer: "B", chapter: "Light", difficulty: "medium", cognitive: "Apply" },
            { q: "Lateral inversion means:", options: ["Top-bottom flip", "Left-right flip", "Image shrinks", "Image magnifies"], answer: "B", chapter: "Light", difficulty: "easy", cognitive: "Understand" },
            { q: "If you stand 1.5 m from a mirror, your image is ___ behind it.", options: ["0 m", "1.5 m", "3 m", "0.75 m"], answer: "B", chapter: "Light", difficulty: "medium", cognitive: "Apply" },
          ],
        }],
      }),
      answerKeyJson: JSON.stringify({ sections: [{ name: "Section A", answers: ["A", "B", "B", "B", "B"] }] }),
      status: "draft", provenance: "AI draft",
    },
  });

  /* ===== homework & tests (Aarav) ===== */
  await db.homework.create({
    data: {
      tutorId: "u-tutor-meera", studentId: "u-student-aarav", title: "Factorisation — practice set 3", subject: "Mathematics",
      dueAt: daysFromNow(1, 20, 0), xp: 50, status: "assigned",
      questionsJson: JSON.stringify([
        { q: "Factorise: x² + 7x + 12", marks: 2 },
        { q: "Factorise: 9x² − 16", marks: 2 },
        { q: "Factorise using identity: 4p² − 20p + 25", marks: 2 },
        { q: "Divide: (x² + 8x + 15) ÷ (x + 3)", marks: 2 },
      ]),
    },
  });
  await db.homework.create({
    data: {
      tutorId: "u-tutor-meera", studentId: "u-student-aarav", title: "Sound — home experiment write-up", subject: "Science",
      dueAt: daysFromNow(-2, 20, 0), xp: 40, status: "graded", score: 85,
      feedback: "Excellent observations on pitch vs. loudness. Add units next time!",
      questionsJson: JSON.stringify([{ q: "Stretch a rubber band and pluck — describe what changes when you tighten it.", marks: 5 }, { q: "Record 3 sounds at home; classify high/low pitch.", marks: 5 }]),
    },
  });
  await db.testResult.create({
    data: { studentId: "u-student-aarav", title: "Linear Equations — Quick Test", subject: "Mathematics", score: 8, total: 10, xp: 30, weakTopics: JSON.stringify(["Word problems with fractions"]), takenAt: daysFromNow(-4, 17, 0) },
  });
  await db.testResult.create({
    data: { studentId: "u-student-aarav", title: "Friction — Quick Test", subject: "Science", score: 7, total: 10, xp: 20, weakTopics: JSON.stringify(["Rolling vs sliding friction"]), takenAt: daysFromNow(-8, 18, 0) },
  });

  /* ===== learning passport ===== */
  const passport: [string, string, number][] = [
    ["Mathematics", "Rational Numbers", 82], ["Mathematics", "Linear Equations", 76], ["Mathematics", "Quadrilaterals", 64],
    ["Mathematics", "Data Handling", 88], ["Mathematics", "Factorisation", 58],
    ["Science", "Force and Pressure", 71], ["Science", "Friction", 66], ["Science", "Sound", 52], ["Science", "Light", 44],
    ["English", "Descriptive Writing", 74],
  ];
  for (const [subject, topic, mastery] of passport) {
    await db.passportTopic.create({ data: { studentId: "u-student-aarav", subject, topic, mastery } });
  }

  /* ===== saved tutors ===== */
  for (const t of ["u-tutor-meera", "u-tutor-farah", "u-tutor-sunil", "u-tutor-ananya"]) {
    await db.savedTutor.create({ data: { studentId: "u-student-aarav", tutorId: t } });
  }

  /* ===== messages ===== */
  const thread1 = await db.messageThread.create({
    data: { id: "th-aarav-meera", studentId: "u-student-aarav", tutorId: "u-tutor-meera", subject: "Factorisation doubt", lastAt: daysFromNow(-1, 19, 0), unread: 1 },
  });
  const msgs1: [string, string, string, string, Date][] = [
    ["u-student-aarav", "student", "Aarav Menon", "Ma'am, in question 4 I got (x+3)(x+5) but the book says (x+3)(x+4). Which is right for x²+7x+12?", daysFromNow(-1, 18, 40)],
    ["u-tutor-meera", "tutor", "Meera Krishnan", "Good attempt Aarav! Check the product of constants: 3×4=12 and sum 3+4=7. So (x+3)(x+4) is correct. Try Q5 the same way.", daysFromNow(-1, 18, 52)],
    ["u-student-aarav", "student", "Aarav Menon", "Got it ma'am! Can we do 2 more like this in tomorrow's class?", daysFromNow(-1, 18, 55)],
    ["u-tutor-meera", "tutor", "Meera Krishnan", "Definitely — I'll bring a mini-drill. Also call me on +91 95512 28811 if you're stuck tonight before 9pm.", daysFromNow(-1, 19, 0)],
    ["u-student-aarav", "student", "Aarav Menon", "Thank you ma'am! 😊", daysFromNow(-1, 19, 2)],
  ];
  for (const [senderId, senderRole, senderName, body, at] of msgs1) {
    await db.message.create({ data: { threadId: thread1.id, senderId, senderRole, senderName, body, createdAt: at } });
  }
  const thread2 = await db.messageThread.create({
    data: { id: "th-priya-meera", studentId: "u-parent", tutorId: "u-tutor-meera", subject: "Aarav's progress", lastAt: daysFromNow(-3, 12, 0), unread: 0 },
  });
  const msgs2: [string, string, string, string, Date][] = [
    ["u-parent", "parent", "Priya Menon", "Hello Meera, how is Aarav coping with the Science chapters before finals?", daysFromNow(-3, 11, 30)],
    ["u-tutor-meera", "tutor", "Meera Krishnan", "Hi Priya! He's strong in Force & Pressure but Light needs 2 more sessions. I've prepared a reflection-lab plan for Thursday's visit.", daysFromNow(-3, 11, 45)],
    ["u-parent", "parent", "Priya Menon", "Perfect. The OTP check-in worked smoothly last time — very reassuring. Thank you!", daysFromNow(-3, 12, 0)],
  ];
  for (const [senderId, senderRole, senderName, body, at] of msgs2) {
    await db.message.create({ data: { threadId: thread2.id, senderId, senderRole, senderName, body, createdAt: at } });
  }

  /* ===== alerts ===== */
  await db.alertEvent.create({
    data: { sessionId: null, bookingRef: "bk-live-sofia", type: "eta_slip", severity: "warning", message: "Sofia Rahman's ETA slipped by 12 minutes en route to Mylapore — parent notified.", acknowledged: false, createdAt: new Date(Date.now() - 6 * 60 * 1000) },
  });
  await db.alertEvent.create({
    data: { sessionId: null, bookingRef: "bk-past-2-0", type: "sos", severity: "critical", message: "SOS raised by a parent during last week's home session (Anna Nagar). Safety team called in 40 seconds — false alarm, child opened the parent app. Resolved & debriefed.", acknowledged: true, createdAt: daysFromNow(-6, 18, 40) },
  });
  await db.alertEvent.create({
    data: { sessionId: null, bookingRef: null, type: "late_start", severity: "warning", message: "No travel start 15 minutes before session window — tutor reminded automatically.", acknowledged: true, createdAt: daysFromNow(-2, 17, 15) },
  });

  /* ===== dispute ===== */
  await db.dispute.create({
    data: { bookingId: "bk-req-leila", raisedBy: "Rhea Pillai", reason: "Tutor arrived 25 minutes late to the previous home session; requesting 30% refund.", status: "open" },
  });

  /* ===== institute (academy) — BrightSparks Academy ===== */
  await mkUser("u-institute-brightsparks", { name: "Kavitha Ramaswamy", email: "institute.demo@tutoramma.test", role: "institute", avatarColor: "#7C4D2A", phone: "+91 92266 77880" });
  await db.instituteProfile.create({
    data: {
      userId: "u-institute-brightsparks", academyName: "BrightSparks Academy", city: "Anna Nagar, Chennai",
      about: "A boutique coaching academy in Anna Nagar running CBSE and IGCSE group batches with 5 verified tutors.",
      verified: true,
    },
  });

  /* 5 existing verified tutors join the academy (Meera stays independent) */
  const academyTutorIds = ["u-tutor-farah", "u-tutor-sunil", "u-tutor-ravi", "u-tutor-noura", "u-tutor-sofia"];
  await db.tutorProfile.updateMany({
    where: { userId: { in: academyTutorIds } },
    data: { instituteEmail: "institute.demo@tutoramma.test" },
  });

  /* academy batches */
  await db.batch.create({
    data: {
      id: "batch-igcse-math", tutorId: "u-tutor-sunil", instituteEmail: "institute.demo@tutoramma.test",
      subject: "Mathematics", board: "IGCSE", grade: "Grade 9", title: "IGCSE Maths Booster — Grade 9",
      schedule: "Tuesdays 17:00–18:15", dayPattern: JSON.stringify([{ day: 2, start: 1020, end: 1095 }]),
      minSeats: 4, maxSeats: 12, seatsFilled: 9, pricePerSeat: F(7500), mode: "online", status: "confirmed",
      startDate: daysFromNow(-35, 17, 0), rating: 4.9,
    },
  });
  await db.batch.create({
    data: {
      id: "batch-cbse-science", tutorId: "u-tutor-ravi", instituteEmail: "institute.demo@tutoramma.test",
      subject: "Science", board: "CBSE", grade: "Grade 8", title: "CBSE Science Sprint — Grade 8",
      schedule: "Sundays 10:00–11:15", dayPattern: JSON.stringify([{ day: 0, start: 600, end: 675 }]),
      minSeats: 4, maxSeats: 10, seatsFilled: 7, pricePerSeat: F(4500), mode: "venue",
      venue: "BrightSparks Academy, Anna Nagar", status: "confirmed",
      startDate: daysFromNow(-28, 10, 0), rating: 4.7,
    },
  });
  await db.batch.create({
    data: {
      id: "batch-coding-club", tutorId: "u-tutor-noura", instituteEmail: "institute.demo@tutoramma.test",
      subject: "Mathematics", board: "CBSE", grade: "Grade 7", title: "Python Coding Club — Grades 6–8",
      schedule: "Saturdays 12:00–13:00", dayPattern: JSON.stringify([{ day: 6, start: 720, end: 780 }]),
      minSeats: 5, maxSeats: 14, seatsFilled: 2, pricePerSeat: F(2500), mode: "online", status: "open",
      startDate: daysFromNow(7, 12, 0), rating: 0,
    },
  });

  /* seats for the two running batches (supplementary — Batch row counts drive the UI) */
  for (const sid of ["u-st-ishita", "u-st-rohan", "u-st-sneha", "u-st-arjunn"]) {
    await db.batchSeat.create({ data: { batchId: "batch-igcse-math", studentId: sid, status: "joined" } });
  }
  for (const sid of ["u-st-diya", "u-st-kabir", "u-st-zara"]) {
    await db.batchSeat.create({ data: { batchId: "batch-cbse-science", studentId: sid, status: "joined" } });
  }

  /* academy 1:1 bookings (drives tutor utilisation for the institute dashboard) */
  const academyPlan: { tutor: string; student: string; subject: string; title: string; when: Date; state: string; fee: number }[] = [
    { tutor: "u-tutor-ravi", student: "u-st-rohan", subject: "Science", title: "Science — Cell structure revision", when: nextWeekday(2, 0, 15, 30), state: "accepted", fee: F(600) },
    { tutor: "u-tutor-ravi", student: "u-st-sneha", subject: "Science", title: "Science — Chemical equations drill", when: nextWeekday(3, 0, 16, 0), state: "accepted", fee: F(600) },
    { tutor: "u-tutor-ravi", student: "u-st-diya", subject: "Science", title: "Science — Photosynthesis lab recap", when: lastWeekday(3, 0, 16, 30), state: "released", fee: F(600) },
    { tutor: "u-tutor-sofia", student: "u-st-zara", subject: "Science", title: "Science — Periodic table sprint", when: nextWeekday(4, 0, 17, 0), state: "accepted", fee: F(850) },
    { tutor: "u-tutor-sofia", student: "u-st-ishita", subject: "Science", title: "Science — Atomic structure", when: lastWeekday(1, 0, 15, 0), state: "released", fee: F(850) },
    { tutor: "u-tutor-noura", student: "u-st-arjunn", subject: "English", title: "English — IELTS writing task 2", when: nextWeekday(5, 0, 12, 30), state: "accepted", fee: F(650) },
    { tutor: "u-tutor-sunil", student: "u-st-kabir", subject: "Mathematics", title: "Mathematics — Trigonometry identities", when: nextWeekday(6, 0, 11, 30), state: "accepted", fee: F(850) },
    { tutor: "u-tutor-farah", student: "u-st-advait", subject: "English", title: "English — Essay structure clinic", when: nextWeekday(0, 0, 12, 0), state: "accepted", fee: F(700) },
  ];
  for (const a of academyPlan) {
    await db.booking.create({
      data: {
        studentId: a.student, tutorId: a.tutor, mode: "online", subject: a.subject, board: "CBSE", grade: "Grade 8",
        title: a.title, startAt: a.when, endAt: new Date(a.when.getTime() + 45 * 60 * 1000), state: a.state,
        sessionFee: a.fee, platformFee: Math.round(a.fee * 0.15), total: Math.round(a.fee * 1.15),
        policySnapshot: JSON.stringify({ freeCancelHours: 12, lateCancelSplit: "50/50" }),
      },
    });
  }

  /* academy revenue history — ~6 months of collections by academy tutors (bookingId null; batchId for current batches) */
  const academyPayments: { tutorId: string; batchId: string | null; fee: number; status: "released" | "held"; at: Date; purpose: string }[] = [
    /* previous term seat collections (earlier batches) */
    { tutorId: "u-tutor-farah", batchId: null, fee: F(6000), status: "released", at: daysFromNow(-150, 11, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-sunil", batchId: null, fee: F(7500), status: "released", at: daysFromNow(-143, 17, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-ravi", batchId: null, fee: F(5300), status: "released", at: daysFromNow(-128, 10, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-noura", batchId: null, fee: F(4300), status: "released", at: daysFromNow(-115, 12, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-sofia", batchId: null, fee: F(5650), status: "released", at: daysFromNow(-100, 16, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-farah", batchId: null, fee: F(6300), status: "released", at: daysFromNow(-88, 11, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-sunil", batchId: null, fee: F(7000), status: "released", at: daysFromNow(-74, 17, 0), purpose: "batch_seat" },
    { tutorId: "u-tutor-ravi", batchId: null, fee: F(5000), status: "released", at: daysFromNow(-61, 10, 0), purpose: "batch_seat" },
    /* current batches — monthly seat collections */
    { tutorId: "u-tutor-sunil", batchId: "batch-igcse-math", fee: F(6750), status: "released", at: daysFromNow(-33, 17, 30), purpose: "batch_seat" },
    { tutorId: "u-tutor-ravi", batchId: "batch-cbse-science", fee: F(4650), status: "released", at: daysFromNow(-26, 10, 30), purpose: "batch_seat" },
    { tutorId: "u-tutor-sunil", batchId: "batch-igcse-math", fee: F(6750), status: "released", at: daysFromNow(-12, 17, 30), purpose: "batch_seat" },
    { tutorId: "u-tutor-ravi", batchId: "batch-cbse-science", fee: F(4650), status: "released", at: daysFromNow(-5, 10, 30), purpose: "batch_seat" },
    { tutorId: "u-tutor-sunil", batchId: "batch-igcse-math", fee: F(6750), status: "held", at: daysFromNow(-1, 17, 30), purpose: "batch_seat" },
  ];
  for (const p of academyPayments) {
    const platformFee = Math.round(p.fee * 0.15);
    const total = p.fee + platformFee;
    await db.payment.create({
      data: {
        payerId: "u-parent", tutorId: p.tutorId, batchId: p.batchId, purpose: p.purpose, method: "upi", provider: "razorpay",
        sessionFee: p.fee, platformFee, total, status: p.status,
        escrowReleasedAt: p.status === "released" ? new Date(p.at.getTime() + 26 * 3600 * 1000) : null,
        createdAt: p.at,
        ledgerEntries: {
          create: [
            { account: "payer_cash", debit: total, credit: 0, memo: "UPI — academy seat collection" },
            { account: "escrow", debit: 0, credit: total, memo: "Escrow hold" },
            ...(p.status === "released"
              ? [
                  { account: "escrow", debit: total, credit: 0, memo: "Released after dispute window" },
                  { account: "platform_revenue", debit: 0, credit: platformFee, memo: "Platform commission 15%" },
                  { account: "tutor_payable", debit: 0, credit: p.fee, memo: "Academy earnings" },
                ]
              : []),
          ],
        },
      },
    });
  }

  /* academy payouts */
  await db.payout.create({ data: { tutorId: "u-institute-brightsparks", amount: F(14000), status: "paid", bankMask: "HDFC •••• 3317", createdAt: daysFromNow(-40, 10, 0), paidAt: daysFromNow(-38, 10, 0) } });
  await db.payout.create({ data: { tutorId: "u-institute-brightsparks", amount: F(7600), status: "pending", bankMask: "HDFC •••• 3317", createdAt: daysFromNow(-3, 9, 30) } });
  await db.payout.create({ data: { tutorId: "u-institute-brightsparks", amount: F(9500), status: "processing", bankMask: "HDFC •••• 3317", createdAt: daysFromNow(-8, 9, 30) } });

  /* institute notifications */
  await db.notification.createMany({
    data: [
      { userId: "u-institute-brightsparks", title: "Python Coding Club needs 3 more students", body: "The batch confirms at 5 seats — currently 2 of 5. Share the batch link to fill the remaining seats.", type: "system", createdAt: new Date(Date.now() - 2 * 3600 * 1000) },
      { userId: "u-institute-brightsparks", title: "Payout of ₹7,600.00 is being prepared", body: "Your weekly academy payout covers IGCSE Maths Booster and CBSE Science Sprint seat collections.", type: "payment", createdAt: daysFromNow(-1, 9, 30) },
      { userId: "u-institute-brightsparks", title: "New seat joined: CBSE Science Sprint", body: "A new student joined the Sunday science batch. 7 of 10 seats filled.", type: "system", createdAt: daysFromNow(-3, 15, 0) },
    ],
  });

  /* ===== notifications ===== */
  const notes: [string, string, string, string, boolean, Date][] = [
    ["u-student-aarav", "Homework due tomorrow", "Factorisation — practice set 3 is due tomorrow 8 PM. 50 XP on completion!", "system", false, new Date(Date.now() - 2 * 3600 * 1000)],
    ["u-student-aarav", "Class today 5:00 PM", "Mathematics with Meera ma'am — Factorisation sprint. Join link is ready.", "booking", false, new Date(Date.now() - 5 * 3600 * 1000)],
    ["u-student-aarav", "New XP!", "You earned 30 XP for the Linear Equations Quick Test. Level 4 unlocked 🎉", "system", true, daysFromNow(-4, 17, 5)],
    ["u-parent", "Home session today 6:30 PM", "Meera Krishnan will visit for Aarav's Science session. Live tracking + check-in OTP will be available.", "safety", false, new Date(Date.now() - 3 * 3600 * 1000)],
    ["u-parent", "Invoice INV-2026-0341 issued", "₹1,850.00 held in escrow for tonight's home session. Released after check-out.", "payment", true, daysFromNow(-1, 9, 0)],
    ["u-tutor-meera", "2 new booking requests", "Sneha Pillai (online) and Rhea Pillai (home visit) requested sessions — respond before they expire.", "booking", false, new Date(Date.now() - 4 * 3600 * 1000)],
    ["u-tutor-meera", "Home visit today 6:30 PM", "Aarav Menon — Anna Nagar West, Block 5. Use On my way → OTP check-in → Check-out.", "safety", false, new Date(Date.now() - 2.5 * 3600 * 1000)],
    ["u-tutor-meera", "Payout processed", "₹15,400.00 paid to SBI •••• 4821 on " + daysFromNow(-12, 12, 0).toDateString(), "payment", true, daysFromNow(-12, 12, 5)],
    ["u-admin", "4 tutors awaiting verification", "Rajesh, Sara, Mohammed and Divya submitted documents for review.", "system", false, new Date(Date.now() - 8 * 3600 * 1000)],
    ["u-admin", "Safety alert — SOS resolved", "Yesterday's SOS was a false alarm. Review the incident trail.", "safety", true, daysFromNow(-6, 19, 0)],
    ["u-admin", "Escrow release run completed", "14 payments released after dispute windows closed. Ledger balanced.", "payment", true, daysFromNow(-1, 2, 0)],
  ];
  for (const [userId, title, body, type, read, at] of notes) {
    await db.notification.create({ data: { userId, title, body, type, read, createdAt: at } });
  }

  /* ===== audit events ===== */
  const audits: [string, string, string, string, string, string][] = [
    ["Arjun Mehta", "admin", "verification.approved", "TutorProfile: Meera Krishnan", "All 5 documents verified — badges granted", "info"],
    ["Meera Krishnan", "tutor", "session.on_my_way", "HomeSession: bk-live-home", "Tracking started en route to Anna Nagar West", "info"],
    ["Priya Menon", "parent", "payment.held", "Payment: INV-2026-0341", "₹1,850.00 UPI hold → escrow", "info"],
    ["System", "system", "escrow.released", "14 payments", "Post dispute-window release run", "info"],
    ["Priya Menon", "parent", "sos.raised", "Booking: bk-past-2-0", "False alarm — resolved in 40 seconds", "critical"],
    ["Arjun Mehta", "admin", "dispute.opened", "Booking: bk-req-leila", "Refund request 30% under review", "warning"],
    ["Meera Krishnan", "tutor", "otp.checkin", "HomeSession: bk-past-3-0", "OTP verified inside geofence (32 m)", "info"],
    ["System", "system", "alert.eta_slip", "Booking: bk-live-sofia", "ETA +12 min — parent notified", "warning"],
    ["Aarav Menon", "student", "homework.graded", "Homework: Sound experiment", "Scored 85/100, +40 XP", "info"],
    ["Arjun Mehta", "admin", "payout.approved", "Payout: Meera Krishnan", "₹15,400.00 to SBI •••• 4821", "info"],
  ];
  for (const [actorName, actorRole, action, resource, detail, severity] of audits) {
    await db.auditEvent.create({ data: { actorName, actorRole, action, resource, detail, severity } });
  }

  return { ok: true, seeded: true };
}
