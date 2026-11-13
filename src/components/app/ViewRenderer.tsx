"use client";

import { clsx } from "clsx";
import { useAppStore } from "@/stores/app-store";
import { findNav } from "@/config/nav";

import { SDashboard } from "@/views/student/SDashboard";
import { SFind } from "@/views/student/SFind";
import { SGroups } from "@/views/student/SGroups";
import { SBookings } from "@/views/student/SBookings";
import { STimetable } from "@/views/student/STimetable";
import { SHomework } from "@/views/student/SHomework";
import { SRewards } from "@/views/student/SRewards";
import { SMessages } from "@/views/student/SMessages";
import { SPayments } from "@/views/student/SPayments";
import { SLive } from "@/views/live/SLive";
import { SAssistant } from "@/views/student/SAssistant";
import { SConcierge } from "@/views/student/SConcierge";
import { SFlashcards } from "@/views/student/SFlashcards";
import { SFocus } from "@/views/student/SFocus";
import { SPlanner } from "@/views/student/SPlanner";

import { PDashboard } from "@/views/parent/PDashboard";
import { LiveTracking } from "@/views/parent/LiveTracking";
import { PSafety } from "@/views/parent/PSafety";
import { PChildren } from "@/views/parent/PChildren";
import { PFind } from "@/views/parent/PFind";
import { PBookings } from "@/views/parent/PBookings";
import { PTimetable } from "@/views/parent/PTimetable";
import { PWallet } from "@/views/parent/PWallet";
import { PReports } from "@/views/parent/PReports";
import { PMessages } from "@/views/parent/PMessages";

import { TDashboard } from "@/views/tutor/TDashboard";
import { TRequests } from "@/views/tutor/TRequests";
import { TBookings } from "@/views/tutor/TBookings";
import { TStudents } from "@/views/tutor/TStudents";
import { TTimetable } from "@/views/tutor/TTimetable";
import { TAvailability } from "@/views/tutor/TAvailability";
import { HomeVisits } from "@/views/tutor/HomeVisits";
import { TEarnings } from "@/views/tutor/TEarnings";
import { TProfile } from "@/views/tutor/TProfile";
import { TMessages } from "@/views/tutor/TMessages";
import { TReviews } from "@/views/tutor/TReviews";
import { TStudio } from "@/views/studio/TStudio";
import { TPapers } from "@/views/studio/TPapers";
import { TLive } from "@/views/live/TLive";
import { PLive } from "@/views/live/PLive";
import { ClassroomView } from "@/views/live/ClassroomView";

import { IDashboard } from "@/views/institute/IDashboard";
import { IBatches } from "@/views/institute/IBatches";
import { ITutors } from "@/views/institute/ITutors";
import { IRevenue } from "@/views/institute/IRevenue";
import { IPerformance } from "@/views/institute/IPerformance";

import { AOverview } from "@/views/admin/AOverview";
import { AVerification } from "@/views/admin/AVerification";
import { ABookings } from "@/views/admin/ABookings";
import { ATimetable } from "@/views/admin/ATimetable";
import { SafetyConsole } from "@/views/admin/SafetyConsole";
import { APayments } from "@/views/admin/APayments";
import { ADisputes } from "@/views/admin/ADisputes";
import { ACurriculum } from "@/views/admin/ACurriculum";
import { AReports } from "@/views/admin/AReports";
import { AAudit } from "@/views/admin/AAudit";
import { AUsers } from "@/views/admin/AUsers";

const VIEWS: Record<string, React.ComponentType> = {
  "s-dashboard": SDashboard,
  "s-find": SFind,
  "s-groups": SGroups,
  "s-live": SLive,
  "s-bookings": SBookings,
  "s-timetable": STimetable,
  "s-homework": SHomework,
  "s-assistant": SAssistant,
  "s-concierge": SConcierge,
  "s-flashcards": SFlashcards,
  "s-focus": SFocus,
  "s-planner": SPlanner,
  "s-rewards": SRewards,
  "s-messages": SMessages,
  "s-payments": SPayments,
  "p-dashboard": PDashboard,
  "p-tracking": LiveTracking,
  "p-safety": PSafety,
  "p-children": PChildren,
  "p-find": PFind,
  "p-bookings": PBookings,
  "p-timetable": PTimetable,
  "p-live": PLive,
  "p-wallet": PWallet,
  "p-reports": PReports,
  "p-messages": PMessages,
  "t-dashboard": TDashboard,
  "t-requests": TRequests,
  "t-bookings": TBookings,
  "t-students": TStudents,
  "t-live": TLive,
  "t-timetable": TTimetable,
  "t-availability": TAvailability,
  "t-homevisits": HomeVisits,
  "t-studio": TStudio,
  "t-papers": TPapers,
  "t-earnings": TEarnings,
  "t-profile": TProfile,
  "t-messages": TMessages,
  "t-reviews": TReviews,
  "i-dashboard": IDashboard,
  "i-batches": IBatches,
  "i-tutors": ITutors,
  "i-revenue": IRevenue,
  "i-performance": IPerformance,
  "a-overview": AOverview,
  "a-verification": AVerification,
  "a-bookings": ABookings,
  "a-timetable": ATimetable,
  "a-safety": SafetyConsole,
  "a-payments": APayments,
  "a-disputes": ADisputes,
  "a-curriculum": ACurriculum,
  "a-reports": AReports,
  "a-audit": AAudit,
  "a-users": AUsers,
};

export function ViewRenderer() {
  const { user, view, setView, classroom } = useAppStore();

  /* active digital classroom takes over the full screen */
  if (classroom) return <ClassroomView />;

  if (!user) return null;
  const Active = VIEWS[view];
  if (!Active) {
    const prefix = view.split("-")[0];
    const fallbackId =
      prefix === "s" ? "s-dashboard" : prefix === "p" ? "p-dashboard" : prefix === "t" ? "t-dashboard" : prefix === "i" ? "i-dashboard" : "a-overview";
    const Fallback = VIEWS[fallbackId];
    return Fallback ? <Fallback /> : null;
  }
  return (
    <main className={clsx("flex-1 min-w-0", classroom ? "" : "px-4 sm:px-6 py-5 space-y-5")} role="main">
      <Active key={view} />
    </main>
  );
}

export function ViewHeader() {
  const { view, user } = useAppStore();
  const item = findNav(view);
  if (!item || !user) return null;
  return null; // views render their own headers — kept for future breadcrumbs
}
