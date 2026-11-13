"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked, BookOpen, Layers, Search, ShieldQuestion } from "lucide-react";

import { StatusPill } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView, SectionTitle } from "@/components/shared/Section";
import { dateOf } from "@/lib/format";

interface BoardSummary {
  id: string;
  code: string;
  name: string;
  country: string;
  region: string;
  status: string;
  verifyState: string;
  lastExam: string | null;
  bodies: string;
  levels: string;
  gradeCount: number;
  subjectCount: number;
  chapterCount: number;
}

interface GradeNode {
  id: string;
  name: string;
  subjectCount: number;
  chapterCount: number;
  subjects: { id: string; name: string; chapterCount: number }[];
}

interface ChapterRow {
  id: string;
  number: number;
  name: string;
  status: string;
  source: string;
  verifiedAt: string;
  marks: number;
}

const BOARD_STATUS: Record<string, { label: string; cls: "green" | "orange" | "grey" }> = {
  active: { label: "Active", cls: "green" },
  transitional: { label: "Transitional", cls: "orange" },
  legacy: { label: "Legacy", cls: "grey" },
  retired: { label: "Retired", cls: "grey" },
};

const VERIFY_STATE: Record<string, { label: string; cls: "green" | "orange" | "grey" }> = {
  verified: { label: "Verified", cls: "green" },
  partial: { label: "Partial", cls: "orange" },
  ingesting: { label: "Ingesting", cls: "orange" },
  coming_soon: { label: "Coming soon", cls: "grey" },
};

const CHAPTER_STATUS: Record<string, { label: string; cls: "green" | "orange" | "grey" }> = {
  active: { label: "Active", cls: "green" },
  legacy: { label: "Legacy", cls: "grey" },
  retired: { label: "Retired", cls: "orange" },
  removed: { label: "Removed", cls: "grey" },
};

export function ACurriculum() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [totals, setTotals] = useState({ boards: 0, grades: 0, subjects: 0, chapters: 0 });
  const [boardId, setBoardId] = useState("");
  const [detail, setDetail] = useState<{ board: BoardSummary; grades: GradeNode[] } | null>(null);
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/curriculum")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "Failed to load the registry.");
        return json.data;
      })
      .then((d: { boards: BoardSummary[]; totals: typeof totals }) => {
        setBoards(d.boards);
        setTotals(d.totals);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the registry."))
      .finally(() => setLoading(false));
  }, []);

  const loadChapters = useCallback(async (sid: string) => {
    setChaptersLoading(true);
    try {
      const res = await fetch(`/api/admin/curriculum?subjectId=${sid}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load chapters.");
      setChapters(json.data.chapters as ChapterRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chapters.");
    } finally {
      setChaptersLoading(false);
    }
  }, []);

  const selectBoard = async (id: string) => {
    setBoardId(id);
    setDetail(null);
    setChapters(null);
    setQuery("");
    setError("");
    try {
      const res = await fetch(`/api/admin/curriculum?boardId=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load the board.");
      const d = json.data as { board: BoardSummary; grades: GradeNode[] };
      setDetail(d);
      const first = d.grades[0];
      if (first) {
        setGradeId(first.id);
        const firstSubject = first.subjects[0];
        if (firstSubject) {
          setSubjectId(firstSubject.id);
          loadChapters(firstSubject.id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the board.");
    }
  };

  const selectGrade = (gid: string) => {
    setGradeId(gid);
    setChapters(null);
    const grade = detail?.grades.find((g) => g.id === gid);
    const first = grade?.subjects[0];
    if (first) {
      setSubjectId(first.id);
      loadChapters(first.id);
    } else {
      setSubjectId("");
    }
  };

  const activeGrade = detail?.grades.find((g) => g.id === gradeId);
  const activeSubject = activeGrade?.subjects.find((s) => s.id === subjectId);
  const filteredChapters = (chapters ?? []).filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (loading) return <LoadingView label="Loading curriculum registry…" />;
  if (error && boards.length === 0) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Registry unavailable" sub={error} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Curriculum Registry</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {totals.boards} boards · {totals.grades} grades · {totals.subjects} subjects ·{" "}
            {totals.chapters.toLocaleString()} verified chapters — lesson plans and papers draw from this registry.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px,1fr] items-start">
        {/* board list */}
        <div className="sk-card p-3 lg:max-h-[720px] overflow-y-auto sk-scroll">
          <SectionTitle title="Boards" sub={`${boards.length} tracked`} className="px-1" />
          <div className="mt-3 space-y-2">
            {boards.map((b) => {
              const st = BOARD_STATUS[b.status] ?? { label: b.status, cls: "grey" as const };
              const vs = VERIFY_STATE[b.verifyState] ?? { label: b.verifyState, cls: "grey" as const };
              const selected = b.id === boardId;
              return (
                <button
                  key={b.id}
                  onClick={() => selectBoard(b.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${
                    selected
                      ? "border-[#315BE5] bg-[#315BE5]/8 shadow-[0_2px_8px_rgba(20,36,107,0.12)]"
                      : "border-transparent bg-white/70 dark:bg-transparent hover:border-[#B9C6E4]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold truncate">{b.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{b.code}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {b.country} · {b.region}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <StatusPill tone={st.cls}>{st.label}</StatusPill>
                    <StatusPill tone={vs.cls}>{vs.label}</StatusPill>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1.5">
                    {b.gradeCount} grades · {b.subjectCount} subjects ·{" "}
                    <span className="font-semibold text-foreground">{b.chapterCount} chapters</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* drill-down */}
        <div className="space-y-4">
          {!detail ? (
            <div className="sk-card p-6">
              <EmptyState
                icon={BookMarked}
                title="Select a board to browse"
                sub="Every grade, subject and chapter — with verification status and exam weightage — is browsable from here."
              />
            </div>
          ) : (
            <>
              <div className="sk-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-[16px] font-bold flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#315BE5]" />
                      {detail.board.name}
                    </h2>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {detail.board.bodies} · {detail.board.levels}
                      {detail.board.lastExam ? ` · last exam ${detail.board.lastExam}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill tone={(BOARD_STATUS[detail.board.status] ?? { cls: "grey" }).cls}>
                      {(BOARD_STATUS[detail.board.status] ?? { label: detail.board.status }).label}
                    </StatusPill>
                    <StatusPill tone={(VERIFY_STATE[detail.board.verifyState] ?? { cls: "grey" }).cls}>
                      {(VERIFY_STATE[detail.board.verifyState] ?? { label: detail.board.verifyState }).label}
                    </StatusPill>
                  </div>
                </div>

                {/* grades */}
                <div className="mt-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Grades</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {detail.grades.map((g) => (
                      <button
                        key={g.id}
                        className={`sk-chip text-[12px] ${g.id === gradeId ? "sk-chip-active" : ""}`}
                        onClick={() => selectGrade(g.id)}
                      >
                        {g.name} <span className="opacity-70">· {g.chapterCount}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* subjects */}
                {activeGrade && (
                  <div className="mt-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {activeGrade.name} subjects
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {activeGrade.subjects.map((s) => (
                        <button
                          key={s.id}
                          className={`sk-chip text-[12px] ${s.id === subjectId ? "sk-chip-active" : ""}`}
                          onClick={() => {
                            setSubjectId(s.id);
                            loadChapters(s.id);
                          }}
                        >
                          {s.name} <span className="opacity-70">· {s.chapterCount}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* chapters */}
              <div className="sk-card p-4">
                <SectionTitle
                  title={activeSubject ? `${activeSubject.name} — ${activeGrade?.name}` : "Chapters"}
                  sub={activeSubject ? `${activeSubject.chapterCount} chapters · ${detail.board.name}` : ""}
                  right={
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className="sk-input pl-8 text-[12.5px] w-[190px]"
                        placeholder="Filter chapters…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  }
                />
                {chaptersLoading ? (
                  <div className="text-[12.5px] text-muted-foreground py-4">Loading chapters…</div>
                ) : !filteredChapters.length ? (
                  <div className="text-[12.5px] text-muted-foreground py-4">No chapters match “{query}”.</div>
                ) : (
                  <div className="mt-3 rounded-2xl border overflow-hidden overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-semibold w-12">#</th>
                          <th className="px-3 py-2 font-semibold">Chapter</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Source</th>
                          <th className="px-3 py-2 font-semibold">Verified</th>
                          <th className="px-3 py-2 font-semibold text-right">Marks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredChapters.map((c) => {
                          const st = CHAPTER_STATUS[c.status] ?? { label: c.status, cls: "grey" as const };
                          return (
                            <tr key={c.id} className="border-t">
                              <td className="px-3 py-2 text-muted-foreground tabular">{c.number}</td>
                              <td className="px-3 py-2 font-medium">{c.name}</td>
                              <td className="px-3 py-2">
                                <StatusPill tone={st.cls}>{st.label}</StatusPill>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{c.source}</td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{dateOf(c.verifiedAt)}</td>
                              <td className="px-3 py-2 text-right">
                                <StatusPill tone="navy" dot={false}>
                                  {c.marks} marks
                                </StatusPill>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Layers className="w-4 h-4" />
        This catalog is registry-driven — tutors can only offer what is verified here. Chapter lifecycle: active → legacy → retired.
      </div>
    </div>
  );
}
