import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";
import { aiJson, isDistress, isGradedAnswerRequest } from "@/lib/ai-json";

/**
 * Live AI Tutor "Maya" (spec §15). Grounded, scaffolded, honest:
 *  · explains step by step and writes the steps on a shared whiteboard
 *  · scaffolding ladder (nudge → hint → similar example → step-by-step → human tutor)
 *  · never hands over graded homework answers
 *  · distress protocol: stop tutoring, alert guardian + safety desk, show helplines
 *  · transcripts are parent-visible and deletable
 */
interface Turn {
  role: "student" | "maya";
  text: string;
  board?: string[];
  at: string;
}

const LANG: Record<string, string> = { en: "English", hi: "Hindi (Devanagari)", hinglish: "Hinglish (Hindi in Roman script mixed with English)", kn: "Kannada", ta: "Tamil", te: "Telugu" };

function fallbackReply(message: string, action: string) {
  const nums = (message.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (nums.length >= 2) {
    /* unitary method: value for one unit first, then scale to the asked quantity */
    const [a, b, c] = nums;
    const r = +(a / b).toFixed(2);
    const target = c ?? 4;
    return {
      say: `Let's use the unitary method. First find the value for one unit: ${a} divided by ${b} is ${r}. Now you try the last step — what is ${r} times ${target}?`,
      board: [`${a} for ${b}`, `For 1: ${a} ÷ ${b} = ${r}`, `For ${target}: ${r} × ${target} = ?`],
      understanding: 60,
    };
  }
  const tips: Record<string, string> = {
    slower: "Okay, one tiny step at a time. First, tell me which numbers the question gives us.",
    example: "Here's a quick example: if 3 pencils cost ₹15, one pencil costs 15 ÷ 3 = ₹5. Now you try: 4 pencils cost?",
    quiz: "Quick check: if 5 notebooks cost ₹100, what does 1 notebook cost?",
    confused: "That's completely okay — confusion means you're learning. Which word in the question feels unclear?",
  };
  return {
    say: tips[action] ?? "I'm having trouble thinking right now. Let's break your question into small steps — what is the question asking you to find?",
    board: action === "example" ? ["3 pencils = ₹15", "1 pencil = 15 ÷ 3 = ₹5", "4 pencils = ?"] : action === "quiz" ? ["5 notebooks = ₹100", "1 notebook = ?"] : ["What do we know?", "What do we need?", "Which step first?"],
    understanding: 50,
  };
}

/** GET /api/ai-tutor — recent sessions. Student: own; parent: children's (read-only transcripts). */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let ids: string[] = [];
  if (auth.role === "student") ids = [auth.id];
  else if (auth.role === "parent") ids = (await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } })).map((c) => c.userId);
  else return forbidden();
  const id = new URL(req.url).searchParams.get("id");
  const sessions = await db.aiTutorSession.findMany({ where: { studentId: { in: ids }, ...(id ? { id } : {}) }, orderBy: { updatedAt: "desc" }, take: 20 });
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return Response.json({
    data: sessions.map((s) => ({ id: s.id, studentName: names.get(s.studentId), topic: s.topic, language: s.language, understanding: s.understanding, flagged: s.flagged, updatedAt: s.updatedAt, transcript: JSON.parse(s.transcript) as Turn[] })),
  });
}

/** DELETE /api/ai-tutor?id= — student or parent deletes a session's memory. */
export async function DELETE(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const s = await db.aiTutorSession.findUnique({ where: { id } });
  if (!s) return notFound("Session not found.");
  const allowed = auth.id === s.studentId || (auth.role === "parent" && (await db.studentProfile.count({ where: { userId: s.studentId, parentEmail: auth.email } })) > 0);
  if (!allowed) return forbidden();
  await db.aiTutorSession.delete({ where: { id } });
  await audit({ name: auth.name, role: auth.role }, "ai_tutor.memory_deleted", `AiTutorSession: ${id}`, "Transcript and memory deleted on request");
  return Response.json({ data: { ok: true } });
}

/** POST /api/ai-tutor — { sessionId?, message, language, action?, topic? } */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("Maya is for students.");
  let b: { sessionId?: string; message?: string; language?: string; action?: string; topic?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const message = String(b.message ?? "").trim().slice(0, 1200);
  const action = String(b.action ?? "");
  if (!message && !action) return badRequest("Say or type your doubt.");
  const language = LANG[b.language ?? "en"] ? (b.language as string) : "en";

  let session = b.sessionId ? await db.aiTutorSession.findUnique({ where: { id: b.sessionId } }) : null;
  if (session && session.studentId !== auth.id) session = null;
  const transcript: Turn[] = session ? JSON.parse(session.transcript) : [];
  const now = new Date().toISOString();
  const studentText = message || { slower: "Please go slower.", example: "Give me an example.", quiz: "Quiz me.", confused: "I am confused." }[action] || action;
  transcript.push({ role: "student", text: studentText, at: now });

  const profile = await db.studentProfile.findUnique({ where: { userId: auth.id } });

  /* ---------- distress protocol (T56) ---------- */
  if (isDistress(message)) {
    const reply = {
      say: "Thank you for telling me. I'm going to pause our lesson. You matter, and you don't have to handle this alone — I've let your parent and our safety team know so a real person can help you now. If you are in danger, call 112. You can also call Childline 1098 any time, day or night.",
      board: ["You are not alone.", "Emergency: 112", "Childline (24×7): 1098", "Tele-MANAS: 14416"],
      understanding: session?.understanding ?? 50,
      distress: true,
    };
    transcript.push({ role: "maya", text: reply.say, board: reply.board, at: now });
    const saved = session
      ? await db.aiTutorSession.update({ where: { id: session.id }, data: { transcript: JSON.stringify(transcript), flagged: true } })
      : await db.aiTutorSession.create({ data: { studentId: auth.id, topic: "Wellbeing check", language, transcript: JSON.stringify(transcript), flagged: true } });
    const guardians = profile?.parentEmail ? await db.user.findMany({ where: { email: profile.parentEmail }, select: { id: true } }) : [];
    const desk = await db.user.findMany({ where: { role: { in: ["safety", "admin"] } }, select: { id: true } });
    await db.notification.createMany({
      data: [
        ...guardians.map((g) => ({ userId: g.id, title: `Please check in with ${auth.name.split(" ")[0]} now`, body: "During an AI Tutor session your child shared something that suggests they may need support. Tutoring was paused. Our safety desk has been alerted. Helplines: 112 · Childline 1098 · Tele-MANAS 14416.", type: "safety" })),
        ...desk.map((d) => ({ userId: d.id, title: "AI Tutor distress protocol triggered", body: `Student ${auth.name} — tutoring paused, guardian notified. Please follow up within the P0 window.`, type: "safety" })),
      ],
    });
    await audit({ name: "Maya (AI Tutor)", role: "system" }, "ai_tutor.distress_protocol", `AiTutorSession: ${saved.id}`, `Student ${auth.name}; guardian and safety desk alerted`, "critical");
    return Response.json({ data: { sessionId: saved.id, ...reply } });
  }

  /* ---------- graded homework policy ---------- */
  if (isGradedAnswerRequest(message)) {
    const reply = {
      say: "I can't hand over the final answer for graded homework — but I'll help you get there yourself. Tell me the question and what you've tried, and I'll give you a hint for the very next step.",
      board: ["Step 1: What is given?", "Step 2: What is asked?", "Step 3: Which rule connects them?"],
      understanding: session?.understanding ?? 50,
    };
    transcript.push({ role: "maya", text: reply.say, board: reply.board, at: now });
    const saved = session
      ? await db.aiTutorSession.update({ where: { id: session.id }, data: { transcript: JSON.stringify(transcript) } })
      : await db.aiTutorSession.create({ data: { studentId: auth.id, topic: b.topic ?? "", language, transcript: JSON.stringify(transcript) } });
    return Response.json({ data: { sessionId: saved.id, ...reply } });
  }

  const history = transcript.slice(-10).map((t) => `${t.role === "student" ? "Student" : "Maya"}: ${t.text}`).join("\n");
  const ladder = { slower: "Go slower: one tiny step, simpler words.", example: "Give a fresh, concrete worked example with numbers, then ask the student to try a similar one.", quiz: "Ask exactly one short quiz question on the current idea and wait for the answer.", confused: "The student is confused: reassure briefly, use a different representation (table, picture, story) and ask a very easy check question." }[action] ?? "";

  const ai = await aiJson<{ say: string; board: string[]; understanding: number }>(
    `You are Maya, a warm, patient AI tutor for Indian school students (${profile?.grade ?? "middle school"}, ${profile?.boardId ?? "CBSE"}). You are clearly an AI, never pretend to be human.
Rules: explain step by step in short spoken sentences (max 70 words); end with ONE check question; use the scaffolding ladder (nudge, hint, similar worked example, step-by-step with the student finishing the last step); never give the final answer to graded homework; if unsure, say so and suggest asking their tutor; stay on educational topics only; no personal questions.
Speak in ${LANG[language]}. Write whiteboard lines in maths notation (2-5 short lines, max 40 chars each).
Return STRICT JSON: {"say": string, "board": string[], "understanding": number 0-100 (your estimate of the student's current understanding)}`,
    `${ladder ? `Teaching move requested: ${ladder}\n` : ""}${b.topic ? `Topic: ${b.topic}\n` : ""}Conversation so far:\n${history}`,
    { temperature: 0.5, max_tokens: 500, timeoutMs: 20000 }
  );
  const reply = ai?.say ? { say: String(ai.say).slice(0, 900), board: (Array.isArray(ai.board) ? ai.board : []).map((x) => String(x).slice(0, 60)).slice(0, 6), understanding: Math.max(0, Math.min(100, Math.round(Number(ai.understanding) || 55))) } : fallbackReply(message, action);
  const aiUsed = !!ai?.say;

  transcript.push({ role: "maya", text: reply.say, board: reply.board, at: now });
  const saved = session
    ? await db.aiTutorSession.update({ where: { id: session.id }, data: { transcript: JSON.stringify(transcript.slice(-80)), understanding: reply.understanding, language } })
    : await db.aiTutorSession.create({ data: { studentId: auth.id, topic: (b.topic || message).slice(0, 80), language, transcript: JSON.stringify(transcript), understanding: reply.understanding } });
  return Response.json({ data: { sessionId: saved.id, ...reply, source: aiUsed ? "ai" : "fallback" } });
}
