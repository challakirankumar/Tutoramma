"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "student" | "parent" | "tutor" | "institute" | "admin";
  avatarColor: string;
  isDemo: boolean;
  unreadNotifications?: number;
}

interface AppState {
  user: AuthUser | null;
  booted: boolean;
  view: string;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  /** generic context passed between views (e.g. selected tutor when booking) */
  context: Record<string, unknown>;
  /** active digital classroom session (renders the full-screen meeting room) */
  classroom: { slug: string; role: "host" | "participant"; hostKey?: string } | null;
  setUser: (u: AuthUser | null) => void;
  setBooted: (b: boolean) => void;
  setView: (v: string, ctx?: Record<string, unknown>) => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  patchUser: (patch: Partial<AuthUser>) => void;
  setClassroom: (c: { slug: string; role: "host" | "participant"; hostKey?: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  booted: false,
  view: "",
  sidebarCollapsed: false,
  mobileNavOpen: false,
  context: {},
  classroom: null,
  setUser: (user) =>
    set({
      user,
      view: user ? defaultViewFor(user.role) : "",
      context: {},
    }),
  setBooted: (booted) => set({ booted }),
  setView: (view, ctx) => set((s) => ({ view, context: ctx ? { ...s.context, ...ctx } : s.context, mobileNavOpen: false })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
  patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
  setClassroom: (classroom) => set({ classroom, mobileNavOpen: false }),
}));

export function defaultViewFor(role: string): string {
  switch (role) {
    case "student":
      return "s-dashboard";
    case "parent":
      return "p-dashboard";
    case "tutor":
      return "t-dashboard";
    case "institute":
      return "i-dashboard";
    case "admin":
      return "a-overview";
    default:
      return "";
  }
}
