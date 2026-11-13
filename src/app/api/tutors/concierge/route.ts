import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest } from "@/lib/auth";
import ZAI from "@/lib/ai";

/**
 * POST /api/tutors/concierge — natural-language tutor search (students & parents).
 *
 * Chat message → allow-listed filter extraction → FIXED db query → ranked cards.
 * The LLM is used ONLY to extract a strict JSON filter (12s timeout, every field
 * validated against the allow-lists below); a deterministic keyword parser is the
 * fallback. The database is never queried with free-form user text.
 */

/* ================= allow-lists (the only values that can reach the DB) ================= */

const BOARDS = ["CBSE", "ICSE", "IGCSE", "IB-MYP", "AMERICAN", "TN-STATE"];
const GRADES = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const SUBJECTS = ["Mathematics", "Science", "English"];
const MODES = ["online", "home", "group"];

interface Filters {
  board: string | null;
  grade: string | null;
  subject: string | null;
  mode: string | null;
  maxPrice: number | null; // rupees per session (100–5000)
  keywords: string | null;
}
const EMPTY_FILTERS: Filters = { board: null, grade: null, subject: null, mode: null, maxPrice: null, keywords: null };

const PARSE_PROMPT = `You convert a student's tutoring request into a JSON tutor-search filter. Respond ONLY with JSON: {"board":"CBSE"|"ICSE"|"IGCSE"|"IB-MYP"|"AMERICAN"|"TN-STATE"|null, "grade":"Grade 6".."Grade 10"|null, "subject":"Mathematics"|"Science"|"English"|null, "mode":"online"|"home"|"group"|null, "maxPrice": number|null (rupees per session), "keywords": string|null (short topic like 'algebra', 'light', max 4 words)}. Use null when not mentioned. No other text.`;

/* ================= in-memory rate guard: 20 requests/minute per user ================= */

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt < now) rateBuckets.delete(key); // cleanup
  const bucket = rateBuckets.get(userId);
  if (!bucket) {
    rateBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (bucket.resetAt < now) {
    bucket.count = 1;
    bucket.resetAt = now + 60_000;
    return false;
  }
  bucket.count += 1;
  return bucket.count > 20;
}

/* ================= parsing (LLM first, deterministic keyword fallback) ================= */

/** Validates raw LLM output against the allow-lists; invalid values become null. */
function sanitizeFilters(raw: unknown): Filters | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  let maxPrice: number | null = null;
  if (typeof r.maxPrice === "number" && Number.isFinite(r.maxPrice)) maxPrice = r.maxPrice;
  else if (typeof r.maxPrice === "string" && r.maxPrice.trim() && Number.isFinite(Number(r.maxPrice))) maxPrice = Number(r.maxPrice);
  if (maxPrice !== null && (maxPrice < 100 || maxPrice > 5000)) maxPrice = null;

  let keywords: string | null = null;
  if (typeof r.keywords === "string" && r.keywords.trim()) {
    keywords =
      r.keywords
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join(" ") || null;
  }

  return {
    board: BOARDS.includes(r.board as string) ? (r.board as string) : null,
    grade: GRADES.includes(r.grade as string) ? (r.grade as string) : null,
    subject: SUBJECTS.includes(r.subject as string) ? (r.subject as string) : null,
    mode: MODES.includes(r.mode as string) ? (r.mode as string) : null,
    maxPrice,
    keywords,
  };
}

/** LLM JSON extraction with a hard 12-second cap. Returns null on any failure. */
async function parseWithLLM(message: string, history: { role: "user" | "assistant"; text: string }[]): Promise<Filters | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      const zai = await ZAI.create();
      return zai.chat.completions.create({
        messages: [
          { role: "assistant", content: PARSE_PROMPT },
          ...history.map((h) => ({ role: h.role, content: h.text })),
          { role: "user", content: message },
        ],
        thinking: { type: "disabled" },
      });
    })();
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 12_000);
    });
    const completion = await Promise.race([work, timeout]);
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) return null;
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    return sanitizeFilters(JSON.parse(raw.slice(first, last + 1)));
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------- deterministic fallback: keyword scan of the message ---------- */

const TOPIC_WORDS = [
  "algebra", "geometry", "fractions", "trigonometry", "statistics", "probability", "calculus", "arithmetic",
  "light", "electricity", "magnetism", "motion", "forces", "atoms", "cells", "photosynthesis", "physics", "chemistry", "biology",
  "grammar", "essay", "comprehension", "vocabulary", "writing", "reading", "speaking",
];

function parseWithKeywords(message: string): Filters {
  const t = ` ${message.toLowerCase()} `;
  const f: Filters = { ...EMPTY_FILTERS };

  if (/cbse/.test(t)) f.board = "CBSE";
  else if (/\bicse\b|\bisc\b/.test(t)) f.board = "ICSE";
  else if (/igcse|cambridge/.test(t)) f.board = "IGCSE";
  else if (/\bib\b|\bmyp\b|ib[-\s]?myp/.test(t)) f.board = "IB-MYP";
  else if (/american/.test(t)) f.board = "AMERICAN";
  else if (/tamil nadu|samacheer|state board/.test(t)) f.board = "TN-STATE";

  const g = t.match(/(?:grade|class|year)\s*([6-9]|10)\b/) || t.match(/\b([6-9]|10)\s*(?:th|st|nd|rd)\b/);
  if (g) f.grade = `Grade ${g[1]}`;

  if (/math|algebra|geometry|trigonometr|calculus|arithmetic/.test(t)) f.subject = "Mathematics";
  else if (/science|physic|chemist|biolog/.test(t)) f.subject = "Science";
  else if (/english|grammar|literature|essay/.test(t)) f.subject = "English";

  if (/online|virtual/.test(t)) f.mode = "online";
  else if (/home\s*tuition|at\s+my\s+home|home\s*visit|house\s*visit|\bhome\b/.test(t)) f.mode = "home";
  else if (/\bgroup\b|\bbatch\b/.test(t)) f.mode = "group";

  const p = t.match(
    /(?:under|below|less\s+than|up\s+to|cheaper\s+than|max(?:imum)?\s*(?:of)?|budget\s+of)\s*(?:₹\s*|rs\.?\s*|inr\s*|rupees\s*)?(\d{1,4})(?:[.,](\d{1,2}))?\s*(?:₹|rs\.?|inr|rupees)?\b/
  );
  if (p) {
    const price = Number(`${p[1]}.${p[2] ?? "0"}`);
    if (price >= 100 && price <= 5000) f.maxPrice = price;
  }

  const topic = TOPIC_WORDS.find((w) => t.includes(w));
  if (topic) f.keywords = topic;

  return f;
}

/** If only a topic keyword was mentioned, map it to a subject (allow-listed). */
function enrichFromTopic(f: Filters): Filters {
  if (f.subject || !f.keywords) return f;
  const k = f.keywords;
  if (/math|algebra|geometr|fraction|trigonometr|statistic|probabilit|calculus|arithmetic/.test(k)) return { ...f, subject: "Mathematics" };
  if (/physic|chemist|biolog|light|electric|magnet|motion|force|atom|cell|photosynth|science/.test(k)) return { ...f, subject: "Science" };
  if (/grammar|essay|comprehension|vocabular|writing|reading|speaking|english/.test(k)) return { ...f, subject: "English" };
  return f;
}

/* ---------- greeting / small-talk detection (skip the LLM entirely) ---------- */

const GREETING_RE = /^(?:hi+|hey+|hello+|yo|howdy|salam|hola|namaste|good\s*(?:morning|afternoon|evening))[\s!.,?]*$/i;
const SMALLTALK_RE =
  /^(?:hi+|hey+|hello+|yo|howdy|salam|hola|namaste|good\s*(?:morning|afternoon|evening)|thank(?:s|\s+you)|thx|ok(?:ay)?|great|awesome|nice|cool|bye|goodbye|see\s*you)[\s!.,?]*$/i;

/* ================= search (same query pattern as GET /api/tutors) ================= */

interface ResolvedOffering {
  boardCode: string;
  boardName: string;
  gradeName: string;
  subjectName: string;
  mode: string;
  price: number;
}

async function loadTutorBase() {
  const profiles = await db.tutorProfile.findMany({
    where: { status: "approved" },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });
  if (!profiles.length) return [];

  /* curriculum lookup maps (Offering has no Prisma relations — resolved manually) */
  const [boards, grades, subjects] = await Promise.all([
    db.curriculumBoard.findMany({ select: { id: true, code: true, name: true } }),
    db.curriculumGrade.findMany({ select: { id: true, name: true } }),
    db.curriculumSubject.findMany({ select: { id: true, name: true } }),
  ]);
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const boardByCode = new Map(boards.map((b) => [b.code, b]));
  const gradeMap = new Map(grades.map((g) => [g.id, g.name]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const resolveGrade = (key: string) => gradeMap.get(key) ?? (key.includes("|") ? key.split("|").slice(1).join("|") : key);
  const resolveSubject = (key: string) => subjectMap.get(key) ?? (key.includes("|") ? key.split("|").pop()! : key);

  const offerings = await db.offering.findMany({ where: { tutorId: { in: profiles.map((p) => p.id) } } });
  const offeringsByTutor = new Map<string, ResolvedOffering[]>();
  for (const o of offerings) {
    const b = boardById.get(o.boardId) ?? boardByCode.get(o.boardId);
    const list = offeringsByTutor.get(o.tutorId) ?? [];
    list.push({
      boardCode: b?.code ?? o.boardId,
      boardName: b?.name ?? o.boardId,
      gradeName: resolveGrade(o.gradeId),
      subjectName: resolveSubject(o.subjectId),
      mode: o.mode,
      price: o.price,
    });
    offeringsByTutor.set(o.tutorId, list);
  }

  return profiles.map((p) => ({ profile: p, offerings: offeringsByTutor.get(p.id) ?? [] }));
}
type TutorBase = Awaited<ReturnType<typeof loadTutorBase>>;

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** The rate that applies to the requested mode (for the price ceiling). */
function relevantRate(profile: TutorBase[number]["profile"], offs: ResolvedOffering[], mode: string | null): number {
  if (mode === "home" && profile.rateHome > 0) return profile.rateHome;
  if (mode === "online" && profile.rateOnline > 0) return profile.rateOnline;
  if (mode === "group") {
    const groupPrices = offs.filter((o) => o.mode === "group").map((o) => o.price).filter((x) => x > 0);
    if (groupPrices.length) return Math.min(...groupPrices);
  }
  const rates = [profile.rateOnline, profile.rateHome].filter((x) => x > 0);
  return rates.length ? Math.min(...rates) : Number.POSITIVE_INFINITY;
}

interface TutorCard {
  id: string;
  name: string;
  color: string;
  headline: string;
  rating: number;
  reviews: number;
  trustScore: number;
  years: number;
  badges: string[];
  modes: string[];
  languages: string[];
  rateOnline: number;
  rateHome: number;
  responseMins: number;
  sessionsDone: number;
  whyMatched: string[];
  subjects: string[];
  boards: string[];
}

function buildCards(base: TutorBase, f: Filters, limit: number): TutorCard[] {
  const maxPricePaise = f.maxPrice ? Math.round(f.maxPrice * 100) : null;
  const priceLabel = f.maxPrice ? `Under ₹${f.maxPrice}` : "";
  const out: (TutorCard & { match: number })[] = [];

  for (const { profile: p, offerings: offs } of base) {
    const badges = parseJsonArray(p.badges);
    const modes = parseJsonArray(p.modes);
    const languages = parseJsonArray(p.languages);

    /* ---- filtering (fixed, allow-listed values only) ---- */
    if (f.board && !offs.some((o) => o.boardCode === f.board || o.boardName === f.board)) continue;
    if (f.grade && !offs.some((o) => o.gradeName === f.grade)) continue;
    if (f.subject && !offs.some((o) => o.subjectName === f.subject)) continue;
    if (f.mode && !modes.includes(f.mode)) continue;
    if (maxPricePaise !== null && relevantRate(p, offs, f.mode) > maxPricePaise) continue;

    /* ---- curriculum-fit match score for ranking ---- */
    let match = 0;
    if (f.board && offs.some((o) => o.boardCode === f.board || o.boardName === f.board)) match += 1;
    if (f.grade && offs.some((o) => o.gradeName === f.grade)) match += 1;
    if (f.subject && offs.some((o) => o.subjectName === f.subject)) match += 1;

    /* ---- whyMatched chips (built from which filters matched) ---- */
    const why: string[] = [];
    if (f.board) {
      const boardOff = offs.find((o) => o.boardCode === f.board || o.boardName === f.board);
      const boardLabel = boardOff ? boardOff.boardCode : f.board;
      why.push(f.grade ? `${boardLabel} ${f.grade}` : boardLabel);
    } else if (f.grade) {
      why.push(f.grade);
    }
    if (f.subject) why.push(f.subject);
    if (f.mode === "home" && modes.includes("home")) why.push("Home visits");
    if (f.mode === "online" && modes.includes("online")) why.push("Online 1:1");
    if (f.mode === "group" && modes.includes("group")) why.push("Group classes");
    if (priceLabel) why.push(priceLabel);
    if (badges.includes("Background checked")) why.push("Background checked");
    if (p.responseMins <= 20 || badges.includes("Responds fast")) why.push("Responds fast");
    if (p.rating >= 4.8 || badges.includes("Top rated")) why.push("Top rated");
    if (p.yearsExperience >= 10) why.push(`${p.yearsExperience} yrs experience`);
    if (!why.length) why.push("ID verified");

    out.push({
      id: p.user.id,
      name: p.user.name,
      color: p.user.avatarColor,
      headline: p.headline,
      rating: p.rating,
      reviews: p.reviewCount,
      trustScore: p.trustScore,
      years: p.yearsExperience,
      badges,
      modes,
      languages,
      rateOnline: p.rateOnline,
      rateHome: p.rateHome,
      responseMins: p.responseMins,
      sessionsDone: p.sessionsDone,
      whyMatched: why.slice(0, 4),
      subjects: Array.from(new Set(offs.map((o) => o.subjectName))),
      boards: Array.from(new Set(offs.map((o) => o.boardName))),
      match,
    });
  }

  return out
    .sort((a, b) => b.match - a.match || b.rating - a.rating || b.trustScore - a.trustScore)
    .slice(0, limit)
    .map(({ match, ...card }) => card);
}

/* ================= reply text ================= */

function describeFilters(f: Filters): string {
  return [f.board, f.grade, f.subject].filter(Boolean).join(" ");
}

function guidanceReply(message: string, firstName: string): string {
  if (GREETING_RE.test(message.trim())) {
    return `Hello${firstName ? ` ${firstName}` : ""}! 👋 I'm your tutor concierge. Tell me your board, grade and subject — for example "I need a CBSE Grade 8 Maths tutor for algebra" — and I'll find your best-matched verified tutors.`;
  }
  return 'I can search verified tutors by board, grade, subject, teaching mode and budget. Try "I need a CBSE Grade 8 Maths tutor for algebra" or "Any IGCSE Science tutor under ₹600?" — I\'ll rank your best matches.';
}

function buildReply(effective: Filters, parsed: Filters, count: number, topRatedFallback: boolean): string {
  if (topRatedFallback) {
    return "No verified tutors match that exact request right now — here are our top-rated tutors in the meantime. Try another subject or board, or a bigger budget, for closer matches.";
  }
  const dropped: string[] = [];
  if (parsed.subject && !effective.subject) dropped.push("subject");
  if (parsed.board && !effective.board) dropped.push("board");
  if (parsed.grade && !effective.grade) dropped.push("grade");

  const desc = describeFilters(effective);
  const noun = count === 1 ? "tutor" : "tutors";
  let s = `Here ${count === 1 ? "is" : "are"} ${count} verified ${desc ? `${desc} ` : ""}${noun}`;
  if (effective.mode === "online") s += " for online sessions";
  else if (effective.mode === "home") s += " for home tuition";
  else if (effective.mode === "group") s += " for group classes";
  if (effective.maxPrice) s += ` under ₹${effective.maxPrice} per session`;
  s += " — best matches first.";

  if (dropped.length) {
    const parsedDesc = describeFilters(parsed);
    s =
      `I couldn't find exact ${parsedDesc ? `${parsedDesc} matches` : "matches"}, so I widened the search (relaxed ${dropped.join(" and ")}). ` +
      s;
  }
  return s;
}

/* ================= route ================= */

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student" && auth.role !== "parent") {
    return forbidden("The Concierge is available to students and parents.");
  }

  if (rateLimited(auth.id)) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "You're sending messages very quickly — give the concierge a few seconds and try again." } },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as { message?: unknown; history?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!message) {
    return badRequest('Tell me what you need — e.g. "I need a CBSE Grade 8 Maths tutor for algebra".');
  }

  /* history: last 6 turns max, capped lengths, shape-validated */
  const history: { role: "user" | "assistant"; text: string }[] = [];
  if (Array.isArray(body?.history)) {
    for (const m of body.history) {
      if (history.length >= 6) break;
      if (!m || typeof m !== "object") continue;
      const rec = m as { role?: unknown; text?: unknown };
      if ((rec.role === "user" || rec.role === "assistant") && typeof rec.text === "string" && rec.text.trim()) {
        history.push({ role: rec.role, text: rec.text.slice(0, 400) });
      }
    }
  }

  /* ---------- 1) parse: pure small-talk short-circuits, then LLM, then keywords ---------- */
  let filters: Filters;
  let provenance: "AI parsed" | "Keyword parsed" = "Keyword parsed";

  if (SMALLTALK_RE.test(message)) {
    filters = { ...EMPTY_FILTERS };
  } else {
    const llm = await parseWithLLM(message, history);
    if (llm) {
      provenance = "AI parsed";
      const llmHasAny = !!(llm.board || llm.grade || llm.subject || llm.mode || llm.maxPrice || llm.keywords);
      if (llmHasAny) {
        filters = llm;
      } else {
        /* LLM understood the message but found nothing — double-check with keywords */
        const kw = parseWithKeywords(message);
        const kwHasAny = !!(kw.board || kw.grade || kw.subject || kw.mode || kw.maxPrice || kw.keywords);
        if (kwHasAny) {
          filters = kw;
          provenance = "Keyword parsed";
        } else {
          filters = llm;
        }
      }
    } else {
      filters = parseWithKeywords(message);
    }
  }

  filters = enrichFromTopic(filters);

  const hasIntent = !!(filters.board || filters.grade || filters.subject || filters.mode || filters.maxPrice || filters.keywords);

  /* ---------- 2) no tutor-search intent at all → guidance ---------- */
  if (!hasIntent) {
    const firstName = auth.name.split(/\s+/)[0] || "";
    return Response.json({
      data: {
        reply: guidanceReply(message, firstName),
        filters,
        tutors: [],
        provenance,
      },
    });
  }

  /* ---------- 3) search: full filters → relax subject/board/grade → top-rated ---------- */
  const base = await loadTutorBase();
  const parsed: Filters = { ...filters };
  let effective: Filters = { ...filters };
  let cards = buildCards(base, effective, 4);

  for (const key of ["subject", "board", "grade"] as const) {
    if (cards.length || !effective[key]) continue;
    effective = { ...effective, [key]: null };
    const next = buildCards(base, effective, 4);
    if (next.length) cards = next;
  }

  let topRatedFallback = false;
  if (!cards.length) {
    effective = { ...EMPTY_FILTERS };
    cards = buildCards(base, effective, 3);
    topRatedFallback = cards.length > 0;
  }

  const reply = cards.length
    ? buildReply(effective, parsed, cards.length, topRatedFallback)
    : "No verified tutors are available right now — please check back soon, new tutors join every week.";

  return Response.json({
    data: {
      reply,
      filters: effective,
      tutors: cards,
      provenance,
    },
  });
}
