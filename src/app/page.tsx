"use client";

import { useEffect } from "react";
import { useAppStore, type AuthUser } from "@/stores/app-store";
import dynamic from "next/dynamic";

/* The app is a client-side workspace (auth boots in the browser), so the heavy
   role workspaces are code-split and never bundled into the server worker. */
const AppShell = dynamic(() => import("@/components/app/AppShell").then((m) => m.AppShell), { ssr: false });
const Landing = dynamic(() => import("@/views/auth/Landing").then((m) => m.Landing), { ssr: false });
const GuestClassroom = dynamic(() => import("@/views/live/GuestClassroom").then((m) => m.GuestClassroom), { ssr: false });

export default function Page() {
  const { user, booted, setUser, setBooted, setClassroom } = useAppStore();

  useEffect(() => {
    // Daylight mode is the only mode — clear any stale dark preference from older sessions.
    if (typeof document !== "undefined") document.documentElement.classList.remove("dark");
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("amma-theme");
      } catch {}
    }

    // auth boot
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setUser(json.data as AuthUser);
          /* a signed-in user opening a class link joins the classroom directly */
          const joinSlug = new URLSearchParams(window.location.search).get("join");
          if (joinSlug) {
            /* the link may carry a TA-code — resolve the canonical room slug
               first so the participant lands in the host's hub room */
            fetch(`/api/live-classes/join/${encodeURIComponent(joinSlug.trim())}`, { cache: "no-store" })
              .then((r) => r.json())
              .then((j) => {
                setClassroom({ slug: j?.data?.slug || joinSlug.trim(), role: "participant" });
              })
              .catch(() => {
                setClassroom({ slug: joinSlug.trim(), role: "participant" });
              });
            /* consume the param so a refresh after leaving doesn't re-join */
            try {
              window.history.replaceState(null, "", window.location.pathname);
            } catch {}
          }
        }
      })
      .catch(() => {})
      .finally(() => setBooted(true));
  }, [setBooted, setUser, setClassroom]);

  /* guest class link (?join=slug) works without any account */
  const joinSlug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("join") : null;

  if (!booted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" role="status">
        <div
          className="sk-avatar"
          style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(180deg,#33549E,#14246B)", fontSize: 24 }}
        >
          TA
        </div>
        <div className="text-[14px] font-bold gloss-title text-[20px]">Tutor Amma</div>
        <div
          className="w-7 h-7 rounded-full animate-spin"
          style={{
            background: "conic-gradient(from 0deg, #E2E8F4, #14246B)",
            mask: "radial-gradient(farthest-side, transparent 58%, #000 60%)",
            WebkitMask: "radial-gradient(farthest-side, transparent 58%, #000 60%)",
          }}
        />
      </div>
    );
  }

  /* guests with a class link → branded join screen (no account needed) */
  if (joinSlug && !user) return <GuestClassroom slug={joinSlug.trim()} />;

  if (!user) return <Landing />;
  return <AppShell />;
}
