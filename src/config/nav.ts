import {
  Route,
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
  School,
  BrainCircuit,
  Sparkle,
  Handshake,
  BadgeCheck,
  Gavel,
  RadioTower,
  ScanSearch,
  LibraryBig,
  HandHeart,
  Gift,
  Flame,
  Newspaper,
  Stethoscope,
  Inbox,
  IdCard,
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
    { id: "s-classrooms", label: "My Classrooms", icon: School, group: "Learn" },
    { id: "s-live", label: "Live Classes", icon: Video, group: "Learn" },
    { id: "s-bookings", label: "My Bookings", icon: ClipboardCheck, group: "Learn" },
    { id: "s-timetable", label: "Timetable", icon: CalendarDays, group: "Learn" },
    { id: "s-homework", label: "Homework & Tests", icon: BookOpenCheck, group: "Practice" },
    { id: "s-ai-suite", label: "AI Learning Suite", icon: Sparkle, group: "AI Tutor", badge: "New" },
    { id: "s-ai-tutor", label: "Live AI Tutor · Maya", icon: BrainCircuit, group: "AI Tutor", badge: "AI" },
    { id: "s-assistant", label: "AI Study Buddy", icon: Bot, group: "Practice" },
    { id: "s-diagnostic", label: "Gap Check", icon: Stethoscope, group: "Practice", badge: "New" },
    { id: "s-library", label: "Resource Library", icon: LibraryBig, group: "Practice", badge: "New" },
    { id: "s-flashcards", label: "Smart Flashcards", icon: Layers, group: "Practice", badge: "New" },
    { id: "s-focus", label: "Focus Studio", icon: Timer, group: "Practice", badge: "New" },
    { id: "s-planner", label: "Revision Planner", icon: CalendarClock, group: "Practice", badge: "New" },
    { id: "s-rewards", label: "Rewards", icon: Trophy, group: "Practice" },
    { id: "s-messages", label: "Messages", icon: MessageSquare, group: "Practice" },
    { id: "s-payments", label: "Invoices", icon: Receipt, group: "Account" },
    { id: "s-refer", label: "Refer & Earn", icon: Gift, group: "Account" },
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
    { id: "p-scholarships", label: "Scholarship Hours", icon: HandHeart, group: "Money" },
    { id: "p-refer", label: "Refer & Earn", icon: Gift, group: "Money" },
    { id: "p-reports", label: "Progress Reports", icon: FileBarChart, group: "Family" },
    { id: "p-messages", label: "Messages", icon: MessageSquare, group: "Family" },
    { id: "p-digest", label: "Weekly Digest", icon: Newspaper, group: "Family", badge: "New" },
    { id: "p-library", label: "Resource Library", icon: LibraryBig, group: "Family" },
    { id: "p-ptm", label: "Parent-Teacher Meetings", icon: Handshake, group: "Family", badge: "New" },
    { id: "p-trust", label: "Trust Dashboard", icon: BadgeCheck, group: "Safety", badge: "New" },
  ],
  tutor: [
    { id: "t-dashboard", label: "Today", icon: LayoutDashboard, group: "Teaching" },
    { id: "t-requests", label: "Requests", icon: Hourglass, group: "Teaching" },
    { id: "t-bookings", label: "Bookings", icon: ClipboardCheck, group: "Teaching" },
    { id: "t-students", label: "My Students", icon: GraduationCap, group: "Teaching" },
    { id: "t-classrooms", label: "Classrooms", icon: School, group: "Teaching", badge: "New" },
    { id: "t-live", label: "Live Classes", icon: Video, group: "Teaching" },
    { id: "t-timetable", label: "Timetable", icon: CalendarDays, group: "Teaching" },
    { id: "t-availability", label: "Availability", icon: Bus, group: "Teaching" },
    { id: "t-homevisits", label: "Home Visits", icon: MapPinned, group: "Safety" },
    { id: "t-route", label: "Route Planner", icon: Route, group: "Safety", badge: "New" },
    { id: "t-studio", label: "Teaching Studio", icon: Sparkles, group: "Studio" },
    { id: "t-papers", label: "Question Papers", icon: BookOpen, group: "Studio" },
    { id: "t-resources", label: "Resources", icon: LibraryBig, group: "Studio", badge: "New" },
    { id: "t-coach", label: "Teaching Coach", icon: BrainCircuit, group: "Studio", badge: "AI" },
    { id: "t-earnings", label: "Earnings", icon: Coins, group: "Money" },
    { id: "t-demand", label: "Demand Heatmap", icon: Flame, group: "Money", badge: "New" },
    { id: "t-scholarships", label: "Scholarship Hours", icon: HandHeart, group: "Money" },
    { id: "t-refer", label: "Refer & Earn", icon: Gift, group: "Money" },
    { id: "t-profile", label: "Profile & Verification", icon: UserCog, group: "Account" },
    { id: "t-portfolio", label: "Teaching Portfolio", icon: IdCard, group: "Account", badge: "New" },
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
    { id: "a-leads", label: "Leads & Demos", icon: Inbox, group: "Operations", badge: "New" },
    { id: "a-verification", label: "Tutor Verification", icon: ShieldCheck, group: "Operations" },
    { id: "a-bookings", label: "Bookings", icon: ClipboardCheck, group: "Operations" },
    { id: "a-timetable", label: "Master Timetable", icon: CalendarDays, group: "Operations" },
    { id: "a-safety", label: "Safety Console", icon: ShieldAlert, group: "Safety" },
    { id: "a-payments", label: "Payments & Escrow", icon: Banknote, group: "Finance" },
    { id: "a-disputes", label: "Disputes", icon: Scale, group: "Finance" },
    { id: "a-scholarships", label: "Scholarships", icon: HandHeart, group: "Finance" },
    { id: "a-curriculum", label: "Curriculum Registry", icon: Library, group: "Governance" },
    { id: "a-reports", label: "Reports", icon: FileBarChart, group: "Governance" },
    { id: "a-compliance", label: "Compliance & Rules", icon: Gavel, group: "Governance", badge: "New" },
    { id: "a-audit", label: "Audit Log", icon: ScrollText, group: "Governance" },
    { id: "a-users", label: "Users & Roles", icon: UserRound, group: "Governance" },
  ],
};

NAV.safety = [
  { id: "x-tower", label: "Control Tower", icon: RadioTower, group: "Safety desk" },
];
NAV.verifier = [
  { id: "v-queue", label: "Verification Queue", icon: ScanSearch, group: "Verification" },
];

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
