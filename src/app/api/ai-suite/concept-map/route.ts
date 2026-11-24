import { getAuthUser, unauthorized, badRequest } from "@/lib/auth";
import { aiJson } from "@/lib/ai-json";
import { findChapter } from "@/lib/learning";

interface Node {
  label: string;
  children?: Node[];
}

/** POST /api/ai-suite/concept-map — { subject, topic, grade? } → chapter mind map (curriculum first, AI second). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let b: { subject?: string; topic?: string; grade?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const subject = String(b.subject ?? "Mathematics").slice(0, 40);
  const topic = String(b.topic ?? "").trim().slice(0, 100);
  if (!topic) return badRequest("Enter a chapter or topic.");

  const found = findChapter(subject, String(b.grade ?? "Grade 8"), topic);
  if (found) {
    return Response.json({
      data: { root: found.chapter, children: found.specs.map((s) => ({ label: s.t, children: s.s.map((x) => ({ label: x })) })), source: "curriculum" },
    });
  }
  const ai = await aiJson<{ root: string; children: Node[] }>(
    'Build a concept map of a school chapter. Return STRICT JSON {"root": string, "children": [{"label": string, "children": [{"label": string}]}]} with 4-6 main branches and 2-4 short leaves each (max 6 words per label).',
    `Subject: ${subject}. Chapter/topic: ${topic}.`,
    { temperature: 0.3, max_tokens: 700 }
  );
  if (!ai?.children?.length) return Response.json({ error: { code: "AI_UNAVAILABLE", message: "This chapter is not in the verified registry yet and AI is unavailable." } }, { status: 503 });
  return Response.json({ data: { root: ai.root || topic, children: ai.children.slice(0, 6), source: "ai" } });
}
