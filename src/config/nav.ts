import {
  LayoutDashboard,
  Search,
  CalendarDays,
  Users,
  BookOpenCheck,
  Trophy,
  MessageSquare,
  Receipt,
  Radar,
  Baby,
  Wallet,
  FileBarChart,
  ShieldCheck,
  ClipboardCheck,
  GraduationCap,
  Hourglass,
  BookOpen,
  MapPinned,
  Sparkles,
  Coins,
  UserCog,
  Star,
  ShieldAlert,
  Banknote,
  Scale,
  Library,
  ScrollText,
  UserRound,
  Bus,
  Video,
  Bot,
  MessagesSquare,
  Landmark,
  Gauge,
  Layers,
  Timer,
  CalendarClock,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  group?: string;
  /** small highlight pill, e.g. "New" */
  badge?: string;
}

export const NAV: Record<string, NavItem[]> = {
  student: [
    { id: "s-dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Learn" },
    { id: "s-find", label: "Find Tutors", icon: Search, group: "Learn" },
    { id: "s-concierge", label: "Concierge", icon: MessagesSquare, group: "Learn" },
    { id: "s-groups", label: "Group Classes", icon: Users, group: "Learn" },
    { id: "s-live", label: "Live Classes", icon: Video, group: "Learn" },
    { id: "s-bookings", label: "My Bookings", icon: ClipboardCheck, group: "Learn" },
    { id: "s-timetable", label: "Timetable", icon: CalendarDays, group: "Learn" },
    { id: "s-homework", label: "Homework & Tests", icon: BookOpenCheck, group: "Practice" },
    { id: "s-assistant", label: "AI Study Buddy", icon: Bot, group: "Practice" },
    { id: "s-flashcards", label: "Smart Flashcards", icon: Layers, group: "Practice", badge: "New" },
    { id: "s-focus", label: "Focus Studio", icon: Timer, group: "Practice", badge: "New" },
    { id: "s-planner", label: "Revision Planner", icon: CalendarClock, group: "Practice", badge: "New" },
    { id: "s-rewards", label: "Rewards", icon: Trophy, group: "Practice" },
    { id: "s-messages", label: "Messages", icon: MessageSquare, group: "Practice" },
    { id: "s-payments", label: "Invoices", icon: Receipt, group: "Account" },
  ],
  parent: [
    { id: "p-dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Family" },
    { id: "p-tracking", label: "Live Tracking", icon: Radar, group: "Safety" },
    { id: "p-safety", label: "Safety & Consent", icon: ShieldCheck, group: "Safety" },
    { id: "p-children", label: "My Children", icon: Baby, group: "Family" },
    { id: "p-find", label: "Find Tutors", icon: Search, group: "Family" },
    { id: "p-bookings", label: "Bookings", icon: ClipboardCheck, group: "Family" },
    { id: "p-live", label: "Live Classes", icon: Video, group: "Family" },
    { id: "p-timetable", label: "Timetable", icon: CalendarDays, group: "Family" },
    { id: "p-wallet", label: "Wallet & Payments", icon: Wallet, group: "Money" },
    { id: "p-reports", label: "Progress Reports", icon: FileBarChart, group: "Family" },
    { id: "p-messages", label: "Messages", icon: MessageSquare, group: "Family" },
  ],
  tutor: [
    { id: "t-dashboard", label: "Today", icon: LayoutDashboard, group: "Teaching" },
    { id: "t-requests", label: "Requests", icon: Hourglass, group: "Teaching" },
    { id: "t-bookings", label: "Bookings", icon: ClipboardCheck, group: "Teaching" },
    { id: "t-students", label: "My Students", icon: GraduationCap, group: "Teaching" },
    { id: "t-live", label: "Live Classes", icon: Video, group: "Teaching" },
    { id: "t-timetable", label: "Timetable", icon: CalendarDays, group: "Teaching" },
    { id: "t-availability", label: "Availability", icon: Bus, group: "Teaching" },
    { id: "t-homevisits", label: "Home Visits", icon: MapPinned, group: "Safety" },
    { id: "t-studio", label: "Teaching Studio", icon: Sparkles, group: "Studio" },
    { id: "t-papers", label: "Question Papers", icon: BookOpen, group: "Studio" },
    { id: "t-earnings", label: "Earnings", icon: Coins, group: "Money" },
    { id: "t-profile", label: "Profile & Verification", icon: UserCog, group: "Account" },
    { id: "t-messages", label: "Messages", icon: MessageSquare, group: "Account" },
    { id: "t-reviews", label: "Reviews", icon: Star, group: "Account" },
  ],
  institute: [
    { id: "i-dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Academy" },
    { id: "i-batches", label: "Batches", icon: Users, group: "Academy" },
    { id: "i-tutors", label: "Academy Tutors", icon: GraduationCap, group: "Academy" },
    { id: "i-revenue", label: "Revenue & Payouts", icon: Banknote, group: "Money" },
    { id: "i-performance", label: "Performance", icon: Gauge, group: "Academy" },
  ],
  admin: [
    { id: "a-overview", label: "Overview", icon: LayoutDashboard, group: "Operations" },
    { id: "a-verification", label: "Tutor Verification", icon: ShieldCheck, group: "Operations" },
    { id: "a-bookings", label: "Bookings", icon: ClipboardCheck, group: "Operations" },
    { id: "a-timetable", label: "Master Timetable", icon: CalendarDays, group: "Operations" },
    { id: "a-safety", label: "Safety Console", icon: ShieldAlert, group: "Safety" },
    { id: "a-payments", label: "Payments & Escrow", icon: Banknote, group: "Finance" },
    { id: "a-disputes", label: "Disputes", icon: Scale, group: "Finance" },
    { id: "a-curriculum", label: "Curriculum Registry", icon: Library, group: "Governance" },
    { id: "a-reports", label: "Reports", icon: FileBarChart, group: "Governance" },
    { id: "a-audit", label: "Audit Log", icon: ScrollText, group: "Governance" },
    { id: "a-users", label: "Users & Roles", icon: UserRound, group: "Governance" },
  ],
};

export function navFor(role: string): NavItem[] {
  return NAV[role] ?? [];
}

export function findNav(view: string): NavItem | undefined {
  for (const list of Object.values(NAV)) {
    const item = list.find((i) => i.id === view);
    if (item) return item;
  }
  return undefined;
}
