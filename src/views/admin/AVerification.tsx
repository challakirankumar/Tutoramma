"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Briefcase, FileText, GraduationCap, Info, RefreshCw, ShieldQuestion, XCircle } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill, pillFor } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { MODE_LABEL, TUTOR_STATUS_PILL, dateOf, fromNow, kwd } from "@/lib/format";

interface PendingTutor {
  id: string;
  userId: string;
  name: string;
  email: string;
  color: string;
  headline: string;
  status: string;
  years: number;
  trustScore: number;
  verificationNote: string | null;
  modes: string[];
  languages: string[];
  rateOnline: number;
  rateHome: number;
  qualifications: { title: string; issuer: string; year: number; status: string }[];
  experience: { role: string; org: string; from: string; to: string; verified: boolean }[];
  documents: { id: string; type: string; name: string; issuer: string | null; status: string; uploadedAt: string }[];
  submittedAt: string;
}

type Decision = "approve" | "reject" | "needs_info";

const DOC_TYPES: Record<string, string> = {
  civil_id: "Aadhaar / Govt ID",
  degree: "Degree",
  teaching_cert: "Teaching cert",
  background_check: "Background check",
  conduct: "Conduct",
};

const QUAL_STATUS: Record<string, { label: string; cls: "green" | "orange" | "red" }> = {
  verified: { label: "Verified", cls: "green" },
  submitted: { label: "Submitted", cls: "orange" },
  rejected: { label: "Rejected", cls: "red" },
};

export function AVerification() {
  const [tutors, setTutors] = useState<PendingTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{ tutor: PendingTutor; action: Decision } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verification");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load the verification queue.");
      setTutors(json.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the verification queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (tutor: PendingTutor, action: Decision) => {
    setNote(tutor.verificationNote ?? "");
    setDialog({ tutor, action });
  };

  const submitDecision = async () => {
    if (!dialog) return;
    const { tutor, action } = dialog;
    if (action !== "approve" && !note.trim()) {
      toast({ title: "A note is required", description: "Tell the tutor why, so they can act on it.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/verification/${tutor.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Decision failed.");
      if (action === "approve") {
        setTutors((list) => list.filter((t) => t.id !== tutor.id));
        toast({ title: `${tutor.name} approved`, description: "All badges granted · trust score 75 · profile is live." });
      } else if (action === "reject") {
        setTutors((list) => list.filter((t) => t.id !== tutor.id));
        toast({ title: `${tutor.name} rejected`, description: "The tutor has been notified with your reason." });
      } else {
        setTutors((list) => list.map((t) => (t.id === tutor.id ? { ...t, status: "needs_info", verificationNote: note.trim() } : t)));
        toast({ title: "Information requested", description: `${tutor.name} was asked for more details.` });
      }
      setDialog(null);
    } catch (e) {
      toast({ title: "Decision failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- render ---------- */

  if (loading && tutors.length === 0) return <LoadingView label="Loading verification queue…" />;
  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Queue unavailable" sub={error} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Tutor Verification</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {tutors.length > 0 ? `${tutors.length} tutor${tutors.length > 1 ? "s" : ""} awaiting review — check documents before granting badges.` : "Review submitted documents before tutors go live."}
          </p>
        </div>
        <button className="sk-btn sk-btn-ghost sk-btn-sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {tutors.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={BadgeCheck}
            title="Queue is clear — every tutor is verified ✓"
            sub="New submissions will appear here the moment a tutor uploads documents."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {tutors.map((t) => {
            const status = pillFor(TUTOR_STATUS_PILL, t.status);
            return (
              <article key={t.id} className="sk-card p-5">
                {/* header */}
                <div className="flex items-start gap-3.5 flex-wrap">
                  <AvatarTile name={t.name} color={t.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-bold">{t.name}</h2>
                      <StatusPill tone={status.cls}>{status.label}</StatusPill>
                    </div>
                    <p className="text-[12.5px] text-muted-foreground mt-0.5">{t.headline}</p>
                    <p className="text-[11.5px] text-muted-foreground/80">
                      {t.email} · {t.years} yrs experience · submitted {fromNow(t.submittedAt)} ({dateOf(t.submittedAt)})
                    </p>
                    {t.verificationNote && (
                      <p className="text-[11.5px] mt-1 rounded-lg bg-[#FFF6EC] dark:bg-transparent border border-[#F47B20]/30 text-[#9A5A16] dark:text-orange-300 px-2 py-1 inline-block">
                        Last note: {t.verificationNote}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {/* declared profile */}
                  <div className="sk-well rounded-2xl p-4">
                    <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5" /> Declared profile
                    </h3>
                    <div className="mt-2.5 space-y-1.5">
                      {t.qualifications.map((q, i) => {
                        const p = QUAL_STATUS[q.status] ?? QUAL_STATUS.submitted;
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 dark:bg-transparent border px-2.5 py-1.5">
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold truncate">{q.title}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{q.issuer} · {q.year}</div>
                            </div>
                            <StatusPill tone={p.cls}>{p.label}</StatusPill>
                          </div>
                        );
                      })}
                    </div>
                    <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mt-4">
                      <Briefcase className="w-3.5 h-3.5" /> Experience
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {t.experience.map((x, i) => (
                        <div key={i} className="rounded-lg bg-white/70 dark:bg-transparent border px-2.5 py-1.5">
                          <div className="text-[12.5px] font-semibold">{x.role} · {x.org}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            {x.from} – {x.to}
                            <StatusPill tone={x.verified ? "green" : "orange"}>{x.verified ? "Verified" : "Unverified"}</StatusPill>
                          </div>
                        </div>
                      ))}
                    </div>
                    <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mt-4">
                      <Info className="w-3.5 h-3.5" /> Teaching scope
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {t.modes.map((m) => (
                        <StatusPill key={m} tone="navy">{MODE_LABEL[m] ?? m}</StatusPill>
                      ))}
                      <span className="text-[11.5px] text-muted-foreground">
                        · Online {kwd(t.rateOnline, 2)} / Home {kwd(t.rateHome, 2)} · {t.languages.join(", ")}
                      </span>
                    </div>
                  </div>

                  {/* documents */}
                  <div>
                    <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Uploaded documents ({t.documents.length})
                    </h3>
                    <div className="mt-2.5 rounded-2xl border overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-semibold">Document</th>
                            <th className="px-3 py-2 font-semibold">Issuer</th>
                            <th className="px-3 py-2 font-semibold">Status</th>
                            <th className="px-3 py-2 font-semibold text-right">Uploaded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.documents.map((d) => {
                            const p = QUAL_STATUS[d.status] ?? QUAL_STATUS.submitted;
                            return (
                              <tr key={d.id} className="border-t">
                                <td className="px-3 py-2">
                                  <div className="font-semibold">{d.name}</div>
                                  <div className="text-[10.5px] text-muted-foreground">{DOC_TYPES[d.type] ?? d.type}</div>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{d.issuer ?? "—"}</td>
                                <td className="px-3 py-2">
                                  <StatusPill tone={p.cls}>{p.label}</StatusPill>
                                </td>
                                <td className="px-3 py-2 text-right text-muted-foreground">{dateOf(d.uploadedAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* actions */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                  <button className="sk-btn sk-btn-success sk-btn-sm" onClick={() => openDialog(t, "approve")}>
                    <BadgeCheck className="w-4 h-4" /> Approve
                  </button>
                  <button className="sk-btn sk-btn-orange sk-btn-sm" onClick={() => openDialog(t, "needs_info")}>
                    <Info className="w-4 h-4" /> Request info
                  </button>
                  <button className="sk-btn sk-btn-danger sk-btn-sm" onClick={() => openDialog(t, "reject")}>
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* decision dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => !busy && setDialog(o ? dialog : null)}>
        <DialogContent className="sm:max-w-md">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.action === "approve" && `Approve ${dialog.tutor.name}?`}
                  {dialog.action === "reject" && `Reject ${dialog.tutor.name}?`}
                  {dialog.action === "needs_info" && `Request information from ${dialog.tutor.name}`}
                </DialogTitle>
                <DialogDescription>
                  {dialog.action === "approve" &&
                    "Grant all badges (ID, qualification, experience, background check), set trust score to 75 and allow home tuition. All submitted documents will be marked verified."}
                  {dialog.action === "reject" && "The tutor will be notified and their profile marked rejected. They can re-apply with fresh documents."}
                  {dialog.action === "needs_info" && "The tutor will be asked to provide the missing information before review continues."}
                </DialogDescription>
              </DialogHeader>
              {dialog.action !== "approve" && (
                <Textarea
                  className="sk-input min-h-[90px]"
                  placeholder={dialog.action === "reject" ? "Reason for rejection (required)…" : "What is missing? Be specific (required)…"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
              <DialogFooter className="gap-2">
                <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button
                  className={`sk-btn sk-btn-sm ${dialog.action === "approve" ? "sk-btn-success" : dialog.action === "reject" ? "sk-btn-danger" : "sk-btn-orange"}`}
                  disabled={busy}
                  onClick={submitDecision}
                >
                  {busy ? "Saving…" : dialog.action === "approve" ? "Confirm approval" : dialog.action === "reject" ? "Confirm rejection" : "Send request"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
