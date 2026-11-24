import ZAI from "@/lib/ai";
import { withTimeout } from "@/lib/xp";

/** Runs a chat completion that must return JSON; returns null on any failure so callers fall back. */
export async function aiJson<T>(system: string, user: string, opts: { temperature?: number; max_tokens?: number; timeoutMs?: number; vision?: string } = {}): Promise<T | null> {
  try {
    const zai = await ZAI.create();
    const req = {
      messages: [
        { role: "system" as const, content: system },
        opts.vision
          ? { role: "user" as const, content: [{ type: "text" as const, text: user }, { type: "image_url" as const, image_url: { url: opts.vision } }] }
          : { role: "user" as const, content: user },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.max_tokens ?? 900,
    };
    const res = await withTimeout(opts.vision ? zai.chat.completions.createVision(req) : zai.chat.completions.create(req), opts.timeoutMs ?? 25000);
    const raw = (res.choices[0]?.message?.content ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
    const m = raw.match(/[[{][\s\S]*[\]}]/);
    return m ? (JSON.parse(m[0]) as T) : null;
  } catch {
    return null;
  }
}

/** Distress phrases (English, Hinglish) — the AI tutor stops and alerts a guardian (spec §15, T56). */
const DISTRESS = [
  /\b(kill|hurt|harm)\s+(my\s*self|myself)\b/i,
  /\bsuicid/i,
  /\bwant\s+to\s+die\b/i,
  /\bend\s+my\s+life\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\b(someone|he|she|they)\s+(is\s+)?(hurting|touching|abusing)\s+me\b/i,
  /\bbeing\s+(bullied|abused)\b/i,
  /\bmarna\s+chaht/i,
  /\bjeena\s+nahi\b/i,
  /\bmar\s+jaun/i,
];
export function isDistress(text: string): boolean {
  return DISTRESS.some((r) => r.test(text));
}

/** Requests that ask the tutor to simply hand over a graded homework answer. */
export function isGradedAnswerRequest(text: string): boolean {
  return /\b(just|only)\s+(give|tell)\b.*\banswer\b|\b(do|solve|write)\s+my\s+(homework|assignment)\b|\bhomework\s+answer/i.test(text);
}
