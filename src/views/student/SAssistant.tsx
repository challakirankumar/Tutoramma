"use client";

/**
 * Tutor Amma — AI Study Buddy (student).
 * "Amma" is a Socratic study companion: hints before answers, adapted to
 * the student's grade & board, always ending with a check-question.
 */
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { clsx } from "clsx";
import ReactMarkdown from "react-markdown";
import { Bot, Send, Sparkles, Loader2, RefreshCw, BookOpenCheck, Lightbulb, Calculator, Languages, FlaskConical, Globe2 } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  { icon: BookOpenCheck, label: "Explain a chapter", prompt: "Explain today's chapter to me like I'm new to it, then quiz me with 3 quick questions." },
  { icon: Lightbulb, label: "Homework hint", prompt: "I'm stuck on my homework problem. Don't give me the answer — give me hints step by step." },
  { icon: Calculator, label: "Math walk-through", prompt: "Walk me through solving a tricky problem from my grade's syllabus, step by step." },
  { icon: Languages, label: "English practice", prompt: "Help me improve my English grammar with a fun 5-question practice round." },
  { icon: FlaskConical, label: "Science doubt", prompt: "I have a doubt in Science — can I ask you something from my textbook chapter?" },
  { icon: Globe2, label: "Revision plan", prompt: "Make me a quick 30-minute revision plan for my weakest subject." },
];

export function SAssistant() {
  const { user } = useAppStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Amma couldn't reply.");
      setMessages((m) => [...m, { role: "assistant", content: json.data.reply }]);
    } catch (e) {
      toast({ title: "Study Buddy unavailable", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (messages.length && !confirm("Start a fresh conversation with Amma?")) return;
    setMessages([]);
  };

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">AI Study Buddy</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Meet <span className="font-bold">Amma</span> — she guides with hints, never just answers, and always checks you understood.
          </p>
        </div>
        {messages.length > 0 && (
          <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={reset}>
            <RefreshCw className="w-3.5 h-3.5" /> New conversation
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px] items-start">
        {/* chat card */}
        <div className="sk-card p-0 overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
          <div className="shrink-0 px-5 py-3.5 border-b flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
            <span className="sk-avatar shrink-0" style={{ width: 38, height: 38, borderRadius: 13, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 15 }}>
              <Bot className="w-5 h-5 text-white" />
            </span>
            <div>
              <div className="text-[14px] font-extrabold">Amma</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F9D68]" />
                {busy ? "thinking…" : "online · Socratic tutor mode"}
              </div>
            </div>
            <span className="sk-pill sk-pill-navy ml-auto hidden sm:inline-flex">
              <Sparkles className="w-3 h-3" /> Hints first
            </span>
          </div>

          {/* messages */}
          <div className="flex-1 overflow-y-auto sk-scroll p-5 space-y-4 max-h-[480px]">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <span className="sk-avatar mx-auto" style={{ width: 64, height: 64, borderRadius: 22, background: "linear-gradient(180deg,#FFA24D,#E76E0F)", fontSize: 26 }}>
                  <Bot className="w-8 h-8 text-white" />
                </span>
                <h3 className="text-[15.5px] font-extrabold mt-3">Hello{user ? ` ${user.name.split(" ")[0]}` : ""}! 👋</h3>
                <p className="text-[12.5px] text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                  Ask me anything from your schoolwork. I&apos;ll help you figure it out yourself — that&apos;s how it sticks.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={clsx("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && (
                  <span className="sk-avatar shrink-0 mt-0.5" style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 12 }}>
                    <Bot className="w-4 h-4 text-white" />
                  </span>
                )}
                <div
                  className={clsx(
                    "max-w-[82%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "bg-[#14246B] text-white rounded-br-md"
                      : "bg-[#EDF1FA] text-foreground rounded-bl-md"
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="space-y-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_h1,&_h2,&_h3]:font-extrabold [&_code]:bg-white/70 [&_code]:px-1 [&_code]:rounded">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex gap-2.5">
                <span className="sk-avatar shrink-0 mt-0.5" style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 12 }}>
                  <Bot className="w-4 h-4 text-white" />
                </span>
                <div className="bg-[#EDF1FA] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#14246B]/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[#14246B]/40 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[#14246B]/40 animate-bounce" style={{ animationDelay: "240ms" }} />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* composer */}
          <div className="shrink-0 p-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <input
              className="sk-input"
              placeholder="Ask Amma anything about your studies…"
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
            />
            <button className="sk-btn sk-btn-primary !px-4" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* starters + tips */}
        <div className="space-y-4">
          <div className="sk-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Try asking</p>
            <div className="space-y-2">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  className="w-full sk-well p-2.5 flex items-center gap-2.5 text-left hover:brightness-[0.98] transition-all"
                  onClick={() => send(s.prompt)}
                  disabled={busy}
                >
                  <s.icon className="w-4 h-4 text-brand-navy shrink-0" />
                  <span className="text-[12px] font-bold">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sk-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">How Amma teaches</p>
            <ul className="space-y-2.5">
              {[
                "Hints before answers — you do the thinking",
                "Adapts to your grade and board",
                "Ends every reply with a check-question",
                "Builds practice around your weak topics",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-[12px] leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F47B20] mt-1.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
