import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";
import { aiJson } from "@/lib/ai-json";

const KINDS = ["notes", "worksheet", "mock", "slides"];

/** GET /api/resources?q=&subject=&grade=&mine=1 — the resource marketplace (spec §29). */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const u = new URL(req.url);
  const mine = u.searchParams.get("mine") === "1";
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase();
  const subject = u.searchParams.get("subject") ?? "";
  const grade = u.searchParams.get("grade") ?? "";
  const list = await db.resource.findMany({
    where: mine ? { authorId: auth.id, status: { not: "removed" } } : { status: "published", ...(subject ? { subject } : {}), ...(grade ? { grade } : {}) },
    orderBy: [{ downloads: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { purchases: { select: { userId: true, price: true } } },
  });
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(list.map((r) => r.authorId))] } }, select: { id: true, name: true, avatarColor: true } });
  const amap = new Map(authors.map((a) => [a.id, a]));
  const data = list
    .filter((r) => !q || `${r.title} ${r.description} ${r.subject}`.toLowerCase().includes(q))
    .map(({ purchases, content, ...r }) => ({
      ...r,
      preview: content.slice(0, 220),
      author: amap.get(r.authorId) ?? { id: r.authorId, name: "Tutor", avatarColor: "#315BE5" },
      owned: r.authorId === auth.id || purchases.some((p) => p.userId === auth.id),
      earnings: r.authorId === auth.id ? Math.round(purchases.reduce((a, p) => a + p.price, 0) * 0.85) : undefined,
    }));
  return Response.json({ data });
}

/** POST /api/resources — tutor publishes a resource; { aiDraft: true } drafts the content with AI first. */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor" && auth.role !== "institute") return forbidden("Only tutors and institutes publish resources.");
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const s = (k: string, m: number) => String(b[k] ?? "").trim().slice(0, m);
  const title = s("title", 120);
  const subject = s("subject", 40);
  const grade = s("grade", 30);
  const kind = KINDS.includes(s("kind", 20)) ? s("kind", 20) : "notes";
  if (!title || !subject || !grade) return badRequest("Title, subject and grade are required.");
  let content = s("content", 20000);
  let source = "author";
  if (b.aiDraft === true && !content) {
    const ai = await aiJson<{ content: string }>(
      `Write a high-quality ${kind === "worksheet" ? "worksheet with 10 graded questions and an answer key at the end" : kind === "mock" ? "mock test paper with sections A-C, marks per question and an answer key" : kind === "slides" ? "slide outline (8 slides, title + 3 bullets each)" : "set of concise revision notes with headings, key formulas and 2 worked examples"} for Indian school students. Use plain text with markdown headings. Return STRICT JSON {"content": string}.`,
      `${title} — ${subject}, ${grade}, ${s("board", 20) || "CBSE"}.`,
      { max_tokens: 2400, timeoutMs: 30000 }
    );
    if (ai?.content) {
      content = ai.content.slice(0, 20000);
      source = "ai";
    }
  }
  if (content.length < 40) return badRequest(b.aiDraft ? "AI drafting is unavailable right now — please paste your content." : "Add the resource content (at least a few lines).");
  const r = await db.resource.create({
    data: { authorId: auth.id, title, subject, grade, board: s("board", 20) || "CBSE", kind, description: s("description", 400), content, price: Math.max(0, Math.min(500000, Math.round(Number(b.price) || 0))), status: b.draft ? "draft" : "published" },
  });
  await audit({ name: auth.name, role: auth.role }, "resource.published", `Resource: ${title}`, `${kind} · ${source} · ₹${r.price / 100}`);
  return Response.json({ data: { ...r, source } }, { status: 201 });
}
