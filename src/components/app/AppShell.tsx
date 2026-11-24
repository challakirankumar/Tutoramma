"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import { ViewRenderer } from "./ViewRenderer";
import { CommandPalette } from "./CommandPalette";
import { useAppStore } from "@/stores/app-store";

export function AppShell() {
  const { sidebarCollapsed, classroom, user } = useAppStore();

  /* the digital classroom is a full-screen experience */
  if (classroom) return <ViewRenderer />;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 min-h-screen">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          {user?.isDemo && (
            <div className="text-center text-[11px] font-bold tracking-wide text-white py-1 px-3" style={{ background: "linear-gradient(90deg,#F26B1D,#E05F12)" }} role="note">
              DEMO · synthetic data only — sandbox payments, no real SMS or WhatsApp
            </div>
          )}
          <Topbar />
          <ViewRenderer />
          <Footer />
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
