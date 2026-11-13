import { db } from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

/** GET /api/curriculum/boards — v2 registry: profile cards with selection state,
 *  region tabs with counts, header counters (verified / in progress / planned)
 *  and per-profile taxonomy, year format, languages and pathways. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const boards = await db.curriculumBoard.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      country: true,
      region: true,
      status: true,
      verifyState: true,
      lastExam: true,
      bodies: true,
      levels: true,
      sourceUrl: true,
      verifiedAt: true,
      language: true,
      languages: true,
      taxonomy: true,
      yearFormat: true,
      pathways: true,
      approvedQ: true,
      _count: { select: { grades: true, subjects: true } },
    },
  });

  // Chapter + topic counts per board (grouped queries — no N+1).
  const subjects = await db.curriculumSubject.findMany({
    where: { boardId: { in: boards.map((b) => b.id) } },
    select: { id: true, boardId: true, _count: { select: { chapters: true } } },
  });
  const chapterCount = new Map<string, number>();
  for (const s of subjects) chapterCount.set(s.boardId, (chapterCount.get(s.boardId) ?? 0) + s._count.chapters);

  const topicByBoard = new Map<string, number>();
  if (subjects.length) {
    const chapterRows = await db.curriculumChapter.findMany({
      where: { subjectId: { in: subjects.map((s) => s.id) } },
      select: { id: true, subject: { select: { boardId: true } }, _count: { select: { topics: true } } },
    });
    for (const c of chapterRows) topicByBoard.set(c.subject.boardId, (topicByBoard.get(c.subject.boardId) ?? 0) + c._count.topics);
  }

  const rows = boards.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    country: b.country,
    region: b.region,
    status: b.status,
    verifyState: b.verifyState,
    lastExam: b.lastExam,
    bodies: b.bodies,
    levels: b.levels,
    sourceUrl: b.sourceUrl,
    verifiedAt: b.verifiedAt?.toISOString() ?? null,
    language: b.language,
    languages: b.languages, // JSON string — client parses
    taxonomy: b.taxonomy, // JSON string — client parses
    yearFormat: b.yearFormat,
    pathways: b.pathways, // JSON string — client parses
    approvedQ: b.approvedQ,
    grades: b._count.grades,
    subjects: b._count.subjects,
    chapters: chapterCount.get(b.id) ?? 0,
    topics: topicByBoard.get(b.id) ?? 0,
    selectable: b.verifyState === "verified" && b.status !== "retired",
  }));

  // header counters: "N verified, M in progress, K planned"
  const counters = {
    verified: rows.filter((r) => r.verifyState === "verified").length,
    inProgress: rows.filter((r) => r.verifyState === "partial" || r.verifyState === "ingesting").length,
    planned: rows.filter((r) => r.verifyState === "coming_soon").length,
  };

  // region tabs with counts (All / India / State boards / International / Africa)
  const regionTabs: { region: string; count: number }[] = [
    { region: "All", count: rows.length },
    ...["India", "State boards", "International", "Africa"]
      .map((region) => ({ region, count: rows.filter((r) => r.region === region).length }))
      .filter((t) => t.count > 0),
  ];

  // Selectable boards first, then grouped by region for a friendly wizard grid.
  const regionOrder = ["India", "State boards", "International", "Africa"];
  const data = rows.sort((a, b) => {
    if (a.selectable !== b.selectable) return a.selectable ? -1 : 1;
    const ra = regionOrder.indexOf(a.region);
    const rb = regionOrder.indexOf(b.region);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.name.localeCompare(b.name);
  });

  return Response.json({ data, counters, regionTabs });
}
