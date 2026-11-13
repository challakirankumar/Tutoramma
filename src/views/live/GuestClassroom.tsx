"use client";

/**
 * Tutor Amma — guest join screen for digital classrooms.
 * Anyone holding the class link (?join=slug) lands here — no account
 * needed. They see the class card and join by entering their name.
 */
import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { ClassroomView } from "@/views/live/ClassroomView";
import { Loader2, ShieldCheck, Lock, Radio, CalendarClock, Clock, Video } from "lucide-react";

interface ClassInfo {
  slug: string; // canonical room key (differs from a TA-code entry link)
  title: string;
  subject: string;
  grade: string | null;
  agenda: string;
  batchTitle: string | null;
  scheduledAt: string;
  durationMin: number;
  code: string;
  status: string;
  tutorName: string;
}

export function GuestClassroom({ slug }: { slug: string }) {
  const { classroom, setClassroom } = useAppStore();
  const [info, setInfo] = useState<ClassInfo | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => {
    /* remembered guest name — component only mounts client-side */
    try {
      return typeof window !== "undefined" ? localStorage.getItem("amma-guest-name") ?? "" : "";
    } catch {
      return "";
    }
  });

  /* once the store classroom targets the canonical slug, the full-screen
     ClassroomView takes over (exiting the room returns here) */
  const roomKey = info?.slug || slug;
  const inRoom = classroom?.slug === roomKey;

  useEffect(() => {
    let alive = true;
    fetch(`/api/live-classes/join/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json?.error?.message || "This class link is not valid.");
        setInfo(json.data);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "This class link is not valid."));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (inRoom) {
    return <ClassroomView guestName={name.trim() || "Guest"} />;
  }

  const join = () => {
    try {
      localStorage.setItem("amma-guest-name", name.trim());
    } catch {}
    setClassroom({ slug: info?.slug || slug, role: "participant" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "linear-gradient(160deg,#0E1A52,#14246B 55%,#26418F)" }}>
      <div className="w-full max-w-md">
        {/* brand */}
        <div className="text-center mb-5">
          <div className="sk-avatar mx-auto" style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 20 }}>
            TA
          </div>
          <p className="brand-wordmark text-[24px] mt-2.5">Tutor Amma</p>
          <p className="brand-wordmark-sub">Digital Classroom</p>
        </div>

        <div className="sk-card p-6">
          {error ? (
            <div className="text-center">
              <p className="text-[15px] font-bold text-[#C03342]">Class not found</p>
              <p className="text-[12.5px] text-muted-foreground mt-1.5">{error}</p>
              <p className="text-[11.5px] text-muted-foreground mt-3">Ask your teacher for a fresh link, or create a free account to find your classes.</p>
              <a className="sk-btn sk-btn-primary mt-4" href="/">Go to Tutor Amma</a>
            </div>
          ) : !info ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#315BE5]" />
              <p className="text-[13px] font-semibold text-muted-foreground">Opening the classroom…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {info.status === "live" ? (
                  <span className="sk-pill sk-pill-red"><Radio className="w-3 h-3" /> Live now</span>
                ) : (
                  <span className="sk-pill sk-pill-blue"><CalendarClock className="w-3 h-3" /> {info.status === "ended" ? "Class ended" : "Scheduled"}</span>
                )}
                <span className="sk-pill sk-pill-grey"><Clock className="w-3 h-3" /> {new Date(info.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>

              <h1 className="text-[19px] font-extrabold tracking-tight mt-3">{info.title}</h1>
              <p className="text-[12.5px] text-muted-foreground mt-1">
                {info.subject}{info.grade ? ` · ${info.grade}` : ""} · hosted by <span className="font-bold text-foreground">{info.tutorName}</span>
              </p>
              {info.agenda && <p className="text-[12.5px] leading-relaxed text-muted-foreground mt-2.5">{info.agenda}</p>}

              <div className="sk-well p-3.5 mt-4 flex items-center gap-2.5">
                <ShieldCheck className="w-4.5 h-4.5 text-[#1F9D68] shrink-0" />
                <p className="text-[11.5px] leading-relaxed">
                  You&apos;ll wait in a secure waiting room — <span className="font-bold">{info.tutorName}</span> admits every participant personally.
                </p>
              </div>

              <div className="mt-4">
                <label className="text-[11.5px] font-bold text-muted-foreground" htmlFor="guest-name">Your name</label>
                <input
                  id="guest-name"
                  className="sk-input mt-1"
                  placeholder="e.g. Aarav Menon"
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && join()}
                />
              </div>

              <button
                className="sk-btn sk-btn-primary sk-btn-lg w-full mt-3.5"
                disabled={!name.trim() || info.status === "ended"}
                onClick={join}
              >
                <Video className="w-4 h-4" /> {info.status === "ended" ? "This class has ended" : "Join the classroom"}
              </button>

              <p className="text-[10.5px] text-muted-foreground text-center mt-3 flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3" /> No account needed · the teacher controls who gets in
              </p>
            </>
          )}
        </div>

        <p className="text-center mt-4">
          <a href="/" className="text-[11.5px] font-semibold text-[#315BE5] hover:underline">← Back to Tutor Amma</a>
        </p>
      </div>
    </div>
  );
}
