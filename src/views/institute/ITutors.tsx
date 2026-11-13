"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill } from "@/components/shared/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeCheck, GraduationCap, RefreshCw, ShieldAlert, Star, TrendingUp, Users } from "lucide-react";

/* ---------------- types ---------------- */
interface TutorRow {
  id: string;
  name: string;
  color: string;
  headline: string;
  subjects: string[];
  rating: number;
  sessionsDone: number;
  trustScore: number;
  verified: boolean;
  badges: string[];
  utilisation: number;
  batches: number;
  studentsTaught: number;
}

/* ---------------- view ---------------- */
export function ITutors() {
  const [tutors, setTutors] = useState<TutorRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/institute/tutors", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json?.error) throw new Error(json?.error?.message || "Couldn't load academy tutors.");
        setTutors(json.data as TutorRow[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load academy tutors.");
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load academy tutors"
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
  if (!tutors) return <LoadingView label="Loading academy tutors…" />;

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Academy Tutors</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Individually verified teachers at your academy — every tutor clears Tutor Amma's document checks before teaching.
          </p>
        </div>
        <span className="sk-pill sk-pill-navy">
          <GraduationCap className="w-3 h-3" /> {tutors.length} tutor{tutors.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* ---------- tutor table ---------- */}
      {tutors.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState
            icon={GraduationCap}
            title="No academy tutors yet"
            sub="Tutors join your academy when their TutorProfile is linked to your academy email. Invite verified tutors to get started."
          />
        </div>
      ) : (
        <section className="sk-card p-0 overflow-hidden" aria-label="Academy tutors">
          <div className="overflow-x-auto sk-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tutor</TableHead>
                  <TableHead className="hidden md:table-cell">Subjects</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="hidden sm:table-cell">Sessions</TableHead>
                  <TableHead className="hidden lg:table-cell">Trust</TableHead>
                  <TableHead>Utilisation</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tutors.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarTile name={t.name} color={t.color} size={36} />
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] truncate flex items-center gap-1.5">
                            {t.name}
                            {t.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#1F9D68]" />}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{t.headline}</div>
                          <div className="text-[10.5px] text-muted-foreground mt-0.5">
                            {t.batches} academy batch{t.batches === 1 ? "" : "es"} · {t.studentsTaught} student{t.studentsTaught === 1 ? "" : "s"} taught
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {(t.subjects.length ? t.subjects : ["General"]).slice(0, 3).map((s) => (
                          <span key={s} className="sk-pill sk-pill-grey">{s}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold tabular">
                        <Star className="w-3.5 h-3.5 text-[#E8A20C] fill-[#E8A20C]" /> {t.rating.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular text-[12.5px] text-muted-foreground">
                      {t.sessionsDone.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell tabular text-[12.5px] text-muted-foreground">{t.trustScore}</TableCell>
                    <TableCell>
                      <div className="w-[120px] space-y-1">
                        <div className="sk-progress-track">
                          <div
                            className={`sk-progress-fill ${t.utilisation >= 60 ? "sk-progress-fill-green" : "sk-progress-fill-orange"}`}
                            style={{ width: `${Math.max(4, t.utilisation)}%` }}
                            role="progressbar"
                            aria-valuenow={t.utilisation}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${t.name} utilisation ${t.utilisation}%`}
                          />
                        </div>
                        <div className="text-[10.5px] text-muted-foreground tabular flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> {t.utilisation}% this week
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.verified ? (
                        <StatusPill tone="green">Approved</StatusPill>
                      ) : (
                        <StatusPill tone="orange">In review</StatusPill>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-5 py-3 border-t border-border/70 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Utilisation = weekly sessions (1:1 + confirmed batches) against a 10-session week.
          </div>
        </section>
      )}
    </div>
  );
}
