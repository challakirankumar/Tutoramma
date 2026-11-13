"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { navFor } from "@/config/nav";
import { clsx } from "clsx";
import { Bell, Menu, LogOut, Search, RefreshCcw } from "lucide-react";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { fromNow } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

interface Note {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export function Topbar() {
  const { user, setView, setMobileNav, setUser } = useAppStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications");
        const json = await res.json();
        if (alive && json?.data) setNotes(json.data);
      } catch {}
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) return null;
  const unread = notes.filter((n) => !n.read).length;
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const markAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
    setNotes((n) => n.map((x) => ({ ...x, read: true })));
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    toast({ title: "Signed out", description: "See you soon!" });
  };

  const resetDemo = async () => {
    toast({ title: "Resetting demo data…", description: "This takes a few seconds." });
    const res = await fetch("/api/demo/reset", { method: "POST" });
    if (res.ok) {
      toast({ title: "Demo data reset ✓", description: "All demo accounts restored to their original state." });
    } else {
      const j = await res.json().catch(() => null);
      toast({ title: "Reset failed", description: j?.error?.message, variant: "destructive" });
    }
  };

  return (
    <header
      className="sticky top-0 z-30 h-[56px] shrink-0 border-b flex items-center gap-2 px-3 sm:px-4 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--card) 82%, transparent)", borderColor: "var(--border)" }}
    >
      <button className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-[var(--accent)]" onClick={() => setMobileNav(true)} aria-label="Open menu">
        <Menu className="w-[18px] h-[18px]" />
      </button>

      {/* compact search */}
      <div className="relative hidden sm:block flex-1 max-w-[340px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="sk-input !py-[7px] !pl-8 !text-[12.5px]"
          placeholder="Search tutors, subjects, boards…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (user.role === "student" || user.role === "parent")) setView("s-find");
          }}
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5" ref={popRef}>
        {/* notifications */}
        <div className="relative">
          <button
            className="relative p-2 rounded-xl hover:bg-[var(--accent)] transition-colors"
            onClick={() => {
              setOpen((o) => !o);
              setMenuOpen(false);
            }}
            aria-label={`Notifications (${unread} unread)`}
          >
            <Bell className="w-[17px] h-[17px]" />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-bold text-white flex items-center justify-center"
                style={{ background: "linear-gradient(180deg,#E96A75,#C03342)", boxShadow: "0 1px 3px rgba(192,51,66,.5)" }}
              >
                {unread}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-[340px] sk-card !rounded-2xl overflow-hidden z-50" role="dialog" aria-label="Notifications">
              <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-[13px] font-bold">Notifications</span>
                {unread > 0 && (
                  <button className="text-[11px] font-bold text-[#315BE5] hover:underline" onClick={markAll}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto sk-scroll">
                {notes.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No notifications yet.</div>}
                {notes.map((n) => (
                  <div key={n.id} className={clsx("px-4 py-2.5 border-b last:border-0 gap-1", !n.read && "bg-[#F0F4FE] dark:bg-[#1A2348]")} style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#F47B20] shrink-0" />}
                      <span className="text-[12.5px] font-semibold truncate">{n.title}</span>
                      <span className="ml-auto text-[10.5px] text-muted-foreground shrink-0">{fromNow(n.createdAt)}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground leading-snug mt-0.5 pl-3.5">{n.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* user menu */}
        <div className="relative">
          <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-[var(--accent)] transition-colors" onClick={() => { setMenuOpen((o) => !o); setOpen(false); }}>
            <AvatarTile name={user.name} color={user.avatarColor} size={30} />
            <span className="hidden md:block text-left leading-tight">
              <span className="block text-[12.5px] font-bold">{user.name.split(" ")[0]}</span>
              <span className="block text-[10px] text-muted-foreground font-semibold">{roleLabel}</span>
            </span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-[230px] sk-card !rounded-2xl overflow-hidden z-50 p-1.5" role="menu">
              <div className="px-3 py-2">
                <div className="text-[13px] font-bold truncate">{user.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
              </div>
              <div className="h-px sk-divider my-1" />
              {user.isDemo && (
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold hover:bg-[var(--accent)]" onClick={resetDemo}>
                  <RefreshCcw className="w-4 h-4 text-muted-foreground" /> Reset data
                </button>
              )}
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold hover:bg-[var(--accent)] text-[#C03342]" onClick={logout} role="menuitem">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
