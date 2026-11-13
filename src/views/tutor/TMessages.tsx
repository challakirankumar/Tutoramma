"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { fromNow, maskSensitive, timeOf } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Ban, Flag, LockOpen, MessageSquare, Send, ShieldCheck, UserRound } from "lucide-react";

interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: string;
}

interface Thread {
  id: string;
  subject: string;
  lastAt: string;
  unread: number;
  blocked?: boolean;
  other?: { id: string; name: string; avatarColor?: string; color?: string; role?: string } | null;
  student?: { id: string; name: string; avatarColor?: string; color?: string; role?: string } | null;
  tutor?: { id: string; name: string; avatarColor?: string; color?: string } | null;
  messages?: ChatMessage[];
}

interface ParsedThread extends Thread {
  otherName: string;
  otherColor: string;
  otherRole: string;
  msgs: ChatMessage[];
}

const REPORT_REASONS = [
  "Inappropriate content",
  "Off-platform payment request",
  "Harassment",
  "Spam",
];

function parseThreads(json: unknown): ParsedThread[] {
  const container = json as { data?: unknown } | unknown[] | null;
  const raw = Array.isArray(container)
    ? container
    : Array.isArray((container as { data?: unknown })?.data)
      ? (container as { data: unknown[] }).data
      : Array.isArray((container as { data?: { threads?: unknown[] } })?.data?.threads)
        ? (container as { data: { threads: unknown[] } }).data.threads
        : [];
  return (raw as Thread[]).map((t) => {
    const other = t.other ?? t.student ?? t.tutor ?? { name: "Chat", avatarColor: "#315BE5", role: "student" };
    return {
      ...t,
      otherName: other.name ?? "Chat",
      otherColor: (other as { avatarColor?: string; color?: string }).avatarColor ?? (other as { color?: string }).color ?? "#315BE5",
      otherRole: (other as { role?: string }).role ?? "student",
      msgs: Array.isArray(t.messages) ? t.messages : [],
    };
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

export function TMessages() {
  const { user } = useAppStore();
  const [threads, setThreads] = useState<ParsedThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* report + block/unblock flow */
  const [reportFor, setReportFor] = useState<ParsedThread | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [blockFor, setBlockFor] = useState<ParsedThread | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [unblockFor, setUnblockFor] = useState<ParsedThread | null>(null);
  const [unblockBusy, setUnblockBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/messages");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load messages.");
      const parsed = parseThreads(json);
      parsed.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      setThreads(parsed);
      setActiveId((cur) => cur ?? parsed[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
      setThreads([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = threads?.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.msgs.length, activeId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: active.id, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Message failed to send.");
      setDraft("");
      await load();
    } catch (e) {
      toast({ title: "Send failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const submitReport = async () => {
    if (!reportFor || !reportReason) return;
    setReportBusy(true);
    try {
      await postJson("/api/messages/report", {
        threadId: reportFor.id,
        reason: reportNote.trim() ? `${reportReason} — ${reportNote.trim()}` : reportReason,
      });
      toast({ title: "Report sent to the safety team", description: "We've logged this conversation for review." });
      setReportFor(null);
      setReportReason("");
      setReportNote("");
    } catch (e) {
      toast({
        title: "Couldn't send the report",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setReportBusy(false);
    }
  };

  const submitBlock = async () => {
    if (!blockFor) return;
    setBlockBusy(true);
    try {
      await postJson("/api/messages/block", { threadId: blockFor.id, action: "block" });
      toast({ title: "Conversation blocked", description: "Messages can no longer be exchanged in this thread." });
      setBlockFor(null);
      load();
    } catch (e) {
      toast({
        title: "Couldn't block",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBlockBusy(false);
    }
  };

  const submitUnblock = async () => {
    if (!unblockFor) return;
    setUnblockBusy(true);
    try {
      await postJson("/api/messages/block", { threadId: unblockFor.id, action: "unblock" });
      toast({ title: "Conversation unblocked", description: "You and the family can message each other again." });
      setUnblockFor(null);
      load();
    } catch (e) {
      toast({
        title: "Couldn't unblock",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUnblockBusy(false);
    }
  };

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={MessageSquare}
          title="Messages unavailable"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={load}>
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!threads) return <LoadingView label="Loading conversations…" />;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Messages</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {threads.length} conversation{threads.length === 1 ? "" : "s"} · phone numbers & emails are masked automatically
          </p>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            sub="Students and parents can message you about sessions, homework and progress — threads open here."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {/* thread list */}
          <section
            className={`sk-card p-3 md:max-h-[560px] overflow-y-auto sk-scroll ${active ? "hidden md:block" : ""}`}
            aria-label="Conversations"
          >
            <ul className="space-y-1.5">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition ${
                      t.id === activeId ? "bg-[#EDF2FE] border border-[#C9D7F8]" : "hover:bg-[#F6F9FF] border border-transparent"
                    }`}
                    onClick={() => setActiveId(t.id)}
                  >
                    <AvatarTile name={t.otherName} color={t.otherColor} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13px] truncate">{t.otherName}</span>
                        <span className="text-[10.5px] text-muted-foreground shrink-0">{fromNow(t.lastAt)}</span>
                      </div>
                      <div className="text-[11.5px] text-muted-foreground truncate flex items-center gap-1.5">
                        {t.blocked && <Ban className="w-3 h-3 text-destructive shrink-0" aria-label="Blocked" />}
                        {t.subject}
                      </div>
                    </div>
                    {!t.blocked && t.unread > 0 && (
                      <span className="sk-pill sk-pill-orange !px-1.5 !py-0.5 tabular">{t.unread}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* chat pane */}
          {active && (
            <section className="md:col-span-2 sk-card p-0 flex flex-col max-h-[560px] min-h-[420px]" aria-label="Chat">
              <header className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
                <button
                  className="sk-btn sk-btn-ghost sk-btn-sm !px-2 md:hidden"
                  onClick={() => setActiveId(null)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <AvatarTile name={active.otherName} color={active.otherColor} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[13.5px] truncate">{active.otherName}</div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{active.subject}</div>
                </div>
                {active.otherRole === "parent" && !active.blocked && (
                  <span className="sk-pill sk-pill-blue shrink-0">
                    <ShieldCheck className="w-3 h-3" /> Parent thread — visible to guardian
                  </span>
                )}
                <button
                  className="sk-btn sk-btn-ghost sk-btn-sm !px-2 shrink-0"
                  aria-label="Report conversation"
                  title="Report this conversation to the safety team"
                  onClick={() => setReportFor(active)}
                >
                  <Flag className="w-3.5 h-3.5" /> Report
                </button>
                {active.blocked ? (
                  <button
                    className="sk-btn sk-btn-ghost sk-btn-sm !px-2 shrink-0"
                    aria-label="Unblock conversation"
                    title="Unblock this conversation"
                    onClick={() => setUnblockFor(active)}
                  >
                    <LockOpen className="w-3.5 h-3.5" /> Unblock
                  </button>
                ) : (
                  <button
                    className="sk-btn sk-btn-ghost sk-btn-sm !px-2 shrink-0 text-destructive"
                    aria-label="Block conversation"
                    title="Block this conversation"
                    onClick={() => setBlockFor(active)}
                  >
                    <Ban className="w-3.5 h-3.5" /> Block
                  </button>
                )}
              </header>

              {active.blocked && (
                <div
                  className="px-4 py-2.5 text-[12.5px] font-semibold text-white flex items-center gap-2"
                  style={{ background: "#B3261E" }}
                  role="alert"
                >
                  <Ban className="w-4 h-4 shrink-0" /> This conversation is blocked. Unblock to resume messaging.
                </div>
              )}

              <div ref={scrollRef} className="flex-1 overflow-y-auto sk-scroll p-4 space-y-3">
                {active.msgs.length === 0 ? (
                  <EmptyState icon={UserRound} title="No messages in this thread yet" sub="Say hello to get the conversation going." />
                ) : (
                  active.msgs.map((m) => {
                    const mine = m.senderId === user?.id || m.senderRole === "tutor";
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                            mine
                              ? "bg-[#14246B] text-white rounded-br-md"
                              : "sk-well rounded-bl-md"
                          }`}
                        >
                          {!mine && <div className="text-[10.5px] font-bold opacity-80 mb-0.5">{m.senderName}</div>}
                          {maskSensitive(m.body)}
                          <div className={`text-[10px] mt-1 tabular ${mine ? "text-white/70" : "text-muted-foreground"}`}>
                            {timeOf(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <footer className="p-3 border-t border-border flex items-center gap-2">
                <input
                  className="sk-input flex-1"
                  placeholder={active.blocked ? "This conversation is blocked" : "Write a reply… (contact details are masked)"}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={active.blocked}
                  aria-label="Message"
                />
                <button className="sk-btn sk-btn-primary" disabled={sending || active.blocked || !draft.trim()} onClick={send}>
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </footer>
            </section>
          )}
        </div>
      )}

      {/* ---------- report dialog ---------- */}
      <Dialog open={!!reportFor} onOpenChange={(o) => !o && setReportFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report this conversation</DialogTitle>
            <DialogDescription>
              Our safety team reviews every report. Contact details stay masked while they investigate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-semibold mb-1.5 block" htmlFor="t-report-reason">
                Reason
              </label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger id="t-report-reason" className="w-full sk-input" aria-label="Report reason">
                  <SelectValue placeholder="Pick a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-semibold mb-1.5 block" htmlFor="t-report-note">
                Note (optional)
              </label>
              <Textarea
                id="t-report-note"
                className="sk-input min-h-[80px] text-[13px]"
                placeholder="Anything the safety team should know…"
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                maxLength={400}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setReportFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={!reportReason || reportBusy} className="bg-destructive text-white hover:bg-destructive/90">
              <Flag className="w-3.5 h-3.5" /> {reportBusy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- block confirm ---------- */}
      <Dialog open={!!blockFor} onOpenChange={(o) => !o && setBlockFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Block this conversation?</DialogTitle>
            <DialogDescription>
              Messages can no longer be exchanged in this thread. The safety team keeps a record, and you can unblock it
              any time from this chat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setBlockFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitBlock} disabled={blockBusy} className="bg-destructive text-white hover:bg-destructive/90">
              <Ban className="w-3.5 h-3.5" /> {blockBusy ? "Blocking…" : "Block conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- unblock confirm ---------- */}
      <Dialog open={!!unblockFor} onOpenChange={(o) => !o && setUnblockFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unblock this conversation?</DialogTitle>
            <DialogDescription>
              {unblockFor?.otherName} will be able to message you again, and they'll be notified the thread is open.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setUnblockFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitUnblock} disabled={unblockBusy}>
              <LockOpen className="w-3.5 h-3.5" /> {unblockBusy ? "Unblocking…" : "Unblock conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
