import { db } from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

/**
 * GET /api/tutors?board=&grade=&subject=&mode=&q=
 * Search APPROVED tutors with filters + whyMatched chips.
 * Card shape (id = userId) consumed by student/parent Find views.
 * NOTE: Offering has no Prisma relations — board/grade/subject resolved manually.
 */

interface CardOffering {
  boardCode: string;
  boardName: string;
  gradeName: string;
  subjectName: string;
  mode: string;
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const board = url.searchParams.get("board")?.trim() || "";
  const grade = url.searchParams.get("grade")?.trim() || "";
  const subject = url.searchParams.get("subject")?.trim() || "";
  const mode = url.searchParams.get("mode")?.trim() || "";
  const q = (url.searchParams.get("q")?.trim() || "").toLowerCase();

  const profiles = await db.tutorProfile.findMany({
    where: { status: "approved" },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });

  /* curriculum lookup maps (registry is small — one query each).
     Offerings may store either cuids or logical keys ("CBSE|Grade 8|Mathematics"). */
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

  const offerings = await db.offering.findMany({
    where: { tutorId: { in: profiles.map((p) => p.id) } },
  });
  const offeringsByTutor = new Map<string, CardOffering[]>();
  for (const o of offerings) {
    const b = boardById.get(o.boardId) ?? boardByCode.get(o.boardId);
    const list = offeringsByTutor.get(o.tutorId) ?? [];
    list.push({
      boardCode: b?.code ?? o.boardId,
      boardName: b?.name ?? o.boardId,
      gradeName: resolveGrade(o.gradeId),
      subjectName: resolveSubject(o.subjectId),
      mode: o.mode,
    });
    offeringsByTutor.set(o.tutorId, list);
  }

  const subjectsSet = new Set<string>();
  const boardsMap = new Map<string, string>(); // code -> name

  const cards = profiles.map((p) => {
    const badges: string[] = JSON.parse(p.badges || "[]");
    const modes: string[] = JSON.parse(p.modes || "[]");
    const languages: string[] = JSON.parse(p.languages || "[]");
    const offs: CardOffering[] = offeringsByTutor.get(p.id) ?? [];
    offs.forEach((o) => {
      subjectsSet.add(o.subjectName);
      boardsMap.set(o.boardCode, o.boardName);
    });

    /* ---- filtering ---- */
    if (board && !offs.some((o) => o.boardCode === board || o.boardName === board)) return null;
    if (grade && !offs.some((o) => o.gradeName === grade)) return null;
    if (subject && !offs.some((o) => o.subjectName === subject)) return null;
    if (mode && !modes.includes(mode)) return null;
    if (q) {
      const hay = `${p.user.name} ${p.headline}`.toLowerCase();
      if (!hay.includes(q)) return null;
    }

    /* ---- curriculum-fit match score for ranking ---- */
    let match = 0;
    if (board && offs.some((o) => o.boardCode === board || o.boardName === board)) match += 1;
    if (grade && offs.some((o) => o.gradeName === grade)) match += 1;
    if (subject && offs.some((o) => o.subjectName === subject)) match += 1;

    /* ---- whyMatched chips ---- */
    const why: string[] = [];
    if (board) {
      const boardOff = offs.find((o) => o.boardCode === board || o.boardName === board);
      const boardLabel = boardOff ? boardOff.boardCode : board;
      why.push(grade ? `${boardLabel} ${grade}` : boardLabel);
    } else if (grade) {
      why.push(grade);
    }
    if (subject) why.push(subject);
    if (badges.includes("Background checked")) why.push("Background checked");
    if (p.responseMins <= 20 || badges.includes("Responds fast")) why.push("Responds fast");
    if (p.rating >= 4.8 || badges.includes("Top rated")) why.push("Top rated");
    if (p.yearsExperience >= 10) why.push(`${p.yearsExperience} yrs experience`);
    if (mode === "home" && modes.includes("home")) why.push("Home visits");
    if (mode === "online" && modes.includes("online")) why.push("Online 1:1");
    if (mode === "group" && modes.includes("group")) why.push("Group classes");
    if (!why.length) why.push("ID verified");
    const whyMatched = why.slice(0, 4);

    return {
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
      whyMatched,
      subjects: Array.from(new Set(offs.map((o) => o.subjectName))),
      boards: Array.from(new Set(offs.map((o) => o.boardName))),
      _match: match,
    };
  });

  const filtered = cards
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b._match - a._match || b.rating - a.rating)
    .map(({ _match, ...card }) => card);

  return Response.json({
    data: filtered,
    subjects: Array.from(subjectsSet).sort(),
    boards: Array.from(boardsMap.keys()).sort(),
  });
}
