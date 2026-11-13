import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Tutor Amma AI gateway — Cloudflare Workers AI.
 *
 * Exposes the small OpenAI-style surface the generators use
 * (`ZAI.create() -> chat.completions.create / createVision`) so every
 * generator keeps its existing prompt + deterministic-fallback logic, while
 * inference now runs on Cloudflare's GPU network through the `AI` binding.
 *
 * Models can be overridden with the AI_TEXT_MODEL / AI_VISION_MODEL vars.
 */

type Role = "system" | "user" | "assistant";
type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
}
export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  /** accepted for compatibility with the previous SDK, ignored */
  thinking?: unknown;
  [k: string]: unknown;
}
export interface ChatCompletion {
  choices: { message: { role: "assistant"; content: string } }[];
  model: string;
}

const DEFAULT_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

function getAi(): { ai: AiBinding; env: Record<string, unknown> } {
  const { env } = getCloudflareContext();
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai) throw new Error("Workers AI binding `AI` is not configured.");
  return { ai, env: env as unknown as Record<string, unknown> };
}

/** The previous SDK passed the persona as a leading "assistant" turn; models expect "system". */
function normalise(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m, i) => (i === 0 && m.role === "assistant" ? { ...m, role: "system" as const } : m));
}

function toText(out: unknown): string {
  if (out == null) return "";
  if (typeof out === "string") return out;
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  if (typeof o.response === "string") return o.response;
  if (o.response && typeof o.response === "object") return JSON.stringify(o.response);
  if (Array.isArray(o.choices)) return o.choices[0]?.message?.content ?? "";
  return "";
}

async function run(model: string, req: ChatRequest): Promise<ChatCompletion> {
  const { ai } = getAi();
  const out = await ai.run(model, {
    messages: normalise(req.messages),
    max_tokens: Math.min(req.max_tokens ?? 2048, 4096),
    temperature: req.temperature ?? 0.6,
  });
  const content = toText(out).trim();
  return { model, choices: [{ message: { role: "assistant", content } }] };
}

export function aiAvailable(): boolean {
  try {
    getAi();
    return true;
  } catch {
    return false;
  }
}

const ZAI = {
  async create() {
    const { env } = getAi();
    const textModel = (env.AI_TEXT_MODEL as string) || DEFAULT_TEXT_MODEL;
    const visionModel = (env.AI_VISION_MODEL as string) || DEFAULT_VISION_MODEL;
    return {
      chat: {
        completions: {
          create: (req: ChatRequest) => run(textModel, req),
          createVision: (req: ChatRequest) => run(visionModel, req),
        },
      },
    };
  },
};

export default ZAI;

/** Convenience helper for new features: one-shot prompt -> text. */
export async function complete(system: string, user: string, opts: { temperature?: number; max_tokens?: number } = {}) {
  const zai = await ZAI.create();
  const res = await zai.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...opts,
  });
  return res.choices[0]?.message?.content ?? "";
}
