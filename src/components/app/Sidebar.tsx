"use client";

import { useAppStore } from "@/stores/app-store";
import { navFor } from "@/config/nav";
import { clsx } from "clsx";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";

export function Sidebar() {
  const { user, view, setView, sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav } = useAppStore();
  if (!user) return null;
  const items = navFor(user.role);
  const collapsed = sidebarCollapsed;

  const groups = items.reduce<Record<string, typeof items>>((acc, item) => {
    const g = item.group ?? "";
    (acc[g] ||= []).push(item);
    return acc;
  }, {});

  return (
    <>
      {/* mobile scrim */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-[#0E1A52]/40 backdrop-blur-[2px] z-40 lg:hidden" onClick={() => setMobileNav(false)} aria-hidden />
      )}
      <aside
        className={clsx(
          "fixed lg:sticky top-0 z-50 h-screen shrink-0 flex flex-col border-r transition-[width,transform] duration-300 ease-out",
          collapsed ? "w-[72px]" : "w-[228px]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
      >
        {/* brand — two-tone premium wordmark: Tutor midnight blue · Amma rich orange */}
        <div className={clsx("flex items-center h-[56px] shrink-0 border-b", collapsed ? "justify-center px-0" : "px-5")} style={{ borderColor: "var(--sidebar-border)" }}>
          <button
            onClick={() => setView(view)}
            className="flex items-center min-w-0"
            aria-label="Tutor Amma home"
          >
            {collapsed ? (
              <span className="brand-monogram leading-none" aria-hidden>
                <span className="word-tutor">T</span>
                <span className="word-amma">A</span>
              </span>
            ) : (
              <span className="brand-wordmark">
                <span className="word-tutor">Tutor</span>
                <span className="word-amma">Amma</span>
              </span>
            )}
          </button>
          <button
            className="lg:hidden ml-auto p-1.5 rounded-lg hover:bg-[var(--sidebar-accent)]"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden sk-scroll py-3 px-2.5 space-y-4" aria-label="Main navigation">
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group}>
              {!collapsed && group && (
                <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground/70">{group}</div>
              )}
              <ul className="space-y-1">
                {groupItems.map((item) => {
                  const active = view === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setView(item.id)}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "w-full flex items-center gap-2.5 rounded-xl text-[13px] font-semibold transition-all relative group",
                          collapsed ? "justify-center py-2.5" : "px-3 py-2",
                          active
                            ? "text-white shadow-[0_3px_10px_rgba(20,36,107,0.35)]"
                            : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
                        )}
                        style={
                          active
                            ? { background: "linear-gradient(180deg,#33549E,#14246B)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 3px 10px rgba(20,36,107,0.35)" }
                            : undefined
                        }
                      >
                        <item.icon className={clsx("w-[17px] h-[17px] shrink-0", active && "text-[#FFD9AE]")} strokeWidth={2.1} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {!collapsed && item.badge && (
                          <span className={clsx("ml-auto text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-[1px] rounded-full", active ? "bg-white/20 text-white" : "bg-[#FFF1E4] text-[#E76E0F]")}>{item.badge}</span>
                        )}
                        {collapsed && (
                          <span className="pointer-events-none absolute left-[64px] z-50 whitespace-nowrap rounded-lg bg-[#14246B] text-white text-[11.5px] font-semibold px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                            {item.label}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* collapse */}
        <div className="shrink-0 border-t p-2.5" style={{ borderColor: "var(--sidebar-border)" }}>
          <button
            onClick={toggleSidebar}
            className={clsx(
              "hidden lg:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-muted-foreground hover:bg-[var(--sidebar-accent)] transition-colors",
              collapsed && "justify-center px-0"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>
    </>
  );
}
