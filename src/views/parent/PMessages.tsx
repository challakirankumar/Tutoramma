"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoadingView, EmptyState } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { toast } from "@/hooks/use-toast";
import { maskSensitive, timeOf, dateOf, fromNow } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare,
  Send,
  Flag,
  ShieldAlert,
  RefreshCw,
  MessagesSquare,
  Eye,
  Lock,
  Ban,
} from "lucide-react";

/* ---------- types (defensive against the shared /api/messages contract) ---------- */
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
  lastAt?: string;
  unread?: number;
  blocked?: boolean;
  viewingChildName?: string | null;
  other?: { id?: string; name?: string; color?: string; avatarColor?: string; role?: string } | null;
  tutor?: { id?: string; name?: string; color?: string } | null;
  tutorId?: string;
  tutorName?: string;
  tutorColor?: string;
  messages?: ChatMessage[];
}

const REPORT_REASONS = [
  "Inappropriate content",
  "Off-platform payment request",
  "Harassment",
  "Spam",
];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
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

function threadTutor(t: Thread): { name: string; color: string; id?: string } {
  return {
    name: t.other?.name ?? t.tutor?.name ?? t.tutorName ?? "Tutor",
    color: t.other?.color ?? t.other?.avatarColor ?? t.tutor?.color ?? t.tutorColor ?? "#14246B",
    id: t.other?.id ?? t.tutor?.id ?? t.tutorId,
  };
}

export function PMessages() {
  const { user } = useAppStore();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* report + block flow */
  const [reportFor, setReportFor] = useState<Thread | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [blockFor, setBlockFor] = useState<Thread | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = () => {
    setError("");
    getJson<Thread[] | { threads?: Thread[] }>("/api/messages")
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.threads ?? [];
        setThreads(list);
        setSelectedId((prev) => prev || list[0]?.id || "");
      })
      .catch((e) => setError(e.message || "Couldn't load messages."));
  };

  useEffect(load, []);

  // load messages for the selected thread (API always embeds them in each thread)
  useEffect(() => {
    if (!selectedId || !threads) return;
    const thread = threads.find((t) => t.id === selectedId);
    setMessagesLoading(!thread || thread.messages === undefined);
    setMessages(thread?.messages ?? []);
  }, [selectedId, threads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const selected = threads?.find((t) => t.id === selectedId) ?? null;
  const readOnly = !!selected?.viewingChildName; // child's thread — parents follow, not post

  const send = async () => {
    const body = draft.trim();
    if (!body || !selectedId) return;
    setSending(true);
    try {
      await postJson("/api/messages", { threadId: selectedId, body });
      setDraft("");
      // refresh thread + messages
      const list = await getJson<Thread[] | { threads?: Thread[] }>("/api/messages").catch(() => null);
      if (list) {
        const arr = Array.isArray(list) ? list : list?.threads ?? [];
        setThreads(arr);
        const t = arr.find((x) => x.id === selectedId);
        if (t?.messages?.length) setMessages(t.messages);
      }
    } catch (e) {
      toast({
        title: "Couldn't send",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
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
      toast({
        title: "Conversation blocked",
        description: "Messages can no longer be sent in this thread.",
      });
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

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load messages"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary" onClick={load}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!threads) return <LoadingView label="Loading your conversations…" />;

  const tutor = selected ? threadTutor(selected) : null;
  const blocked = !!selected?.blocked;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Messages</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Chat with your children's tutors. Phone numbers and emails are auto-masked for safety.
          </p>
        </div>
        <span className="sk-pill sk-pill-green">
          <Eye className="w-3 h-3" /> Parent-visible chats
        </span>
      </div>

      {threads.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            sub="When you book a session, a chat thread opens with the tutor automatically."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4">
          {/* ---------- thread list ---------- */}
          <div className="sk-card p-2 lg:max-h-[560px] lg:overflow-y-auto sk-scroll">
            {/* horizontal scroller on mobile */}
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible sk-scroll pb-1 lg:pb-0">
              {threads.map((t) => {
                const tu = threadTutor(t);
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-xl text-left min-w-[240px] lg:min-w-0 transition-colors ${
                      active ? "bg-white shadow-sm ring-1 ring-[#14246B]/20" : "hover:bg-white/60"
                    }`}
                    aria-pressed={active}
                  >
                    <AvatarTile name={tu.name} color={tu.color} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13px] truncate">{tu.name}</span>
                        {t.lastAt && <span className="text-[10.5px] text-muted-foreground shrink-0">{fromNow(t.lastAt)}</span>}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {t.viewingChildName ? `${t.viewingChildName.split(" ")[0]}'s · ` : ""}
                        {t.subject}
                      </div>
                    </div>
                    {t.blocked ? (
                      <Ban className="w-3.5 h-3.5 text-destructive shrink-0" aria-label="Blocked" />
                    ) : (t.unread ?? 0) > 0 ? (
                      <span className="sk-pill sk-pill-orange shrink-0">{t.unread}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- chat pane ---------- */}
          <div className="sk-card p-0 overflow-hidden flex flex-col min-h-[420px]">
            {!selected ? (
              <EmptyState icon={MessageSquare} title="Pick a conversation" sub="Select a tutor thread from the left." />
            ) : (
              <>
                {/* chat header */}
                <div className="p-3.5 border-b border-border flex items-center gap-3 flex-wrap">
                  <AvatarTile name={tutor!.name} color={tutor!.color} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[14px]">{tutor!.name}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{selected.subject}</div>
                  </div>
                  {selected.viewingChildName ? (
                    <span
                      className="sk-pill sk-pill-blue shrink-0"
                      title="You're viewing this thread because message visibility is on for your family"
                    >
                      <Eye className="w-3 h-3" /> Viewing {selected.viewingChildName?.split(" ")[0]}'s conversation
                    </span>
                  ) : (
                    <span className="sk-pill sk-pill-blue shrink-0" title="This thread runs parent ↔ tutor — visible to the guardian">
                      <Eye className="w-3 h-3" /> Parent thread
                    </span>
                  )}
                  <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setReportFor(selected)}>
                    <Flag className="w-3.5 h-3.5" /> Report
                  </button>
                  {!blocked && !readOnly && (
                    <button className="sk-btn sk-btn-ghost sk-btn-sm text-destructive" onClick={() => setBlockFor(selected)}>
                      <Ban className="w-3.5 h-3.5" /> Block
                    </button>
                  )}
                </div>

                {blocked && (
                  <div
                    className="px-4 py-2.5 text-[12.5px] font-semibold text-white flex items-center gap-2"
                    style={{ background: "#B3261E" }}
                    role="alert"
                  >
                    <Ban className="w-4 h-4 shrink-0" /> This conversation is blocked.
                  </div>
                )}
                {readOnly && !blocked && (
                  <div className="px-4 py-2 bg-[#FFF7EC] border-b border-[#F5D9B8] text-[12px] text-[#8A5A16] flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 shrink-0" />
                    Viewing {selected.viewingChildName}'s conversation — read-only, only {selected.viewingChildName?.split(" ")[0]} and the
                    tutor can post.
                  </div>
                )}

                {/* messages */}
                <div className="flex-1 overflow-y-auto sk-scroll p-4 space-y-3 max-h-[380px] bg-[linear-gradient(180deg,#F7F9FE,#F2F5FC)] dark:bg-none">
                  {messagesLoading ? (
                    <LoadingView label="Loading conversation…" />
                  ) : messages.length === 0 ? (
                    <EmptyState icon={MessageSquare} title="No messages yet" sub="Say hello to start the conversation." />
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === user?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[82%] sm:max-w-[70%]">
                            <div
                              className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                                mine
                                  ? "text-white rounded-br-md"
                                  : "bg-white border border-border rounded-bl-md shadow-sm"
                              }`}
                              style={mine ? { background: "linear-gradient(180deg,#33549E,#14246B)" } : undefined}
                            >
                              {maskSensitive(m.body)}
                            </div>
                            <div className={`text-[10.5px] text-muted-foreground mt-1 ${mine ? "text-right" : ""}`}>
                              {m.senderName} · {dateOf(m.createdAt)} {timeOf(m.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* composer */}
                <div className="p-3 border-t border-border flex items-center gap-2">
                  <input
                    className="sk-input flex-1"
                    placeholder={
                      blocked
                        ? "This conversation is blocked"
                        : readOnly
                          ? `Read-only — viewing ${selected.viewingChildName?.split(" ")[0]}'s conversation`
                          : `Message ${tutor!.name.split(" ")[0]}…`
                    }
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    disabled={blocked || readOnly}
                    aria-label="Message body"
                  />
                  <button className="sk-btn sk-btn-primary" onClick={send} disabled={blocked || readOnly || !draft.trim() || sending}>
                    <Send className="w-4 h-4" /> {sending ? "…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
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
              <label className="text-[12px] font-semibold mb-1.5 block" htmlFor="p-report-reason">
                Reason
              </label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger id="p-report-reason" className="w-full sk-input" aria-label="Report reason">
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
              <label className="text-[12px] font-semibold mb-1.5 block" htmlFor="p-report-note">
                Note (optional)
              </label>
              <Textarea
                id="p-report-note"
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
              Messages can no longer be sent in this thread. The safety team keeps a record of the block, and the tutor can
              request an unblock through support.
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

      <div className="sk-callout sk-callout-info flex gap-2.5">
        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          For your child's safety, phone numbers and email addresses are masked in every chat. Anything urgent — raise it
          with the Report button and our safety team steps in.
        </div>
      </div>
    </div>
  );
}
