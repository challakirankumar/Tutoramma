"use client";

import { useEffect, useState } from "react";
import { useAppStore, type AuthUser } from "@/stores/app-store";
import dynamic from "next/dynamic";
import { navFor } from "@/config/nav";
import { OfflineScreen } from "@/views/shared/OfflineKits";

/* The app is a client-side workspace (auth boots in the browser), so the heavy
   role workspaces are code-split and never bundled into the server worker. */
const AppShell = dynamic(() => import("@/components/app/AppShell").then((m) => m.AppShell), { ssr: false });
const Landing = dynamic(() => import("@/views/auth/Landing").then((m) => m.Landing), { ssr: false });
const PublicPortfolio = dynamic(() => import("@/views/shared/Portfolio").then((m) => m.PublicPortfolio), { ssr: false });
const GuestClassroom = dynamic(() => import("@/views/live/GuestClassroom").then((m) => m.GuestClassroom), { ssr: false });

export default function Page() {
  const { user, booted, setUser, setBooted, setClassroom } = useAppStore();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Daylight mode is the only mode — clear any stale dark preference from older sessions.
    if (typeof document !== "undefined") document.documentElement.classList.remove("dark");
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("amma-theme");
      } catch {}
    }

    // installable app: register the service worker in production
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // remember a referral code (?ref=AMMA-XXXXXX) for sign-up
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) sessionStorage.setItem("ta-ref", ref.slice(0, 20));
    } catch {}

    // remember a classroom link opened while signed out, so it joins right after sign-in
    try {
      const c = new URLSearchParams(window.location.search).get("classroom");
      if (c) sessionStorage.setItem("ta-pending-classroom", c);
    } catch {}

    // auth boot
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setUser(json.data as AuthUser);
          /* PWA shortcuts deep-link into a view (?view=s-focus) */
          const deepView = new URLSearchParams(window.location.search).get("view");
          if (deepView && navFor((json.data as AuthUser).role).some((n) => n.id === deepView)) {
            useAppStore.getState().setView(deepView);
            try {
              window.history.replaceState(null, "", window.location.pathname);
            } catch {}
          }
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
      .catch(() => {
        /* no connection: offer the class kits saved on this device */
        if (!navigator.onLine) setOffline(true);
      })
      .finally(() => setBooted(true));
  }, [setBooted, setUser, setClassroom]);

  /* a classroom link opened before signing in joins once a student signs in */
  useEffect(() => {
    if (user?.role !== "student") return;
    try {
      const c = sessionStorage.getItem("ta-pending-classroom");
      if (c) {
        sessionStorage.removeItem("ta-pending-classroom");
        useAppStore.getState().setView("s-classrooms", { classroomCode: c, classroomAt: Date.now() });
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
  }, [user]);

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

  /* public verified teaching portfolio (?portfolio=<tutorId>) — no sign-in needed */
  const portfolioId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("portfolio") : null;
  if (portfolioId) return <PublicPortfolio id={portfolioId} />;

  /* guests with a class link → branded join screen (no account needed) */
  if (joinSlug && !user) return <GuestClassroom slug={joinSlug.trim()} />;

  if (!user && offline) return <OfflineScreen />;
  if (!user) return <Landing />;
  return <AppShell />;
}
