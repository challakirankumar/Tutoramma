"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import { ViewRenderer } from "./ViewRenderer";
import { useAppStore } from "@/stores/app-store";

export function AppShell() {
  const { sidebarCollapsed, classroom } = useAppStore();

  /* the digital classroom is a full-screen experience */
  if (classroom) return <ViewRenderer />;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 min-h-screen">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar />
          <ViewRenderer />
          <Footer />
        </div>
      </div>
    </div>
  );
}
