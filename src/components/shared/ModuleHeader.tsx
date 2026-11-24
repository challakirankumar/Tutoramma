"use client";

import { clsx } from "clsx";
import { useAppStore } from "@/stores/app-store";

/**
 * Module Header standard (Tutor Amma spec §17).
 * Breadcrumb · gradient icon tile (colour by module group) · title + status
 * pills · subtitle · right-aligned actions (one primary + up to two
 * secondary) · pill tab strip with counts · optional context chips.
 */
export type ModuleGroup = "learning" | "live" | "safety" | "money" | "scheduling" | "core";

const GROUP_GRADIENT: Record<ModuleGroup, string> = {
  learning: "linear-gradient(135deg,#8B6BF2 0%,#6D4AE0 100%)",
  live: "linear-gradient(135deg,#34C38F 0%,#1F9D6B 100%)",
  safety: "linear-gradient(135deg,#F26B5B 0%,#D64545 100%)",
  money: "linear-gradient(135deg,#FF9A4D 0%,#F26B1D 100%)",
  scheduling: "linear-gradient(135deg,#2BB3B1 0%,#13827F 100%)",
  core: "linear-gradient(135deg,#33549E 0%,#142366 100%)",
};

export type HeaderPill = { label: string; tone?: "ai" | "verified" | "live" | "new" | "alert" | "info" | "warn" };

const PILL_CLASS: Record<NonNullable<HeaderPill["tone"]>, string> = {
  ai: "bg-[#EFEAFD] text-[#6D4AE0] border-[#DCD2FB]",
  verified: "bg-[#E6F6EE] text-[#1F7A55] border-[#C6EBD8]",
  live: "bg-[#E6F6EE] text-[#1F7A55] border-[#C6EBD8]",
  new: "bg-[#FFF1E6] text-[#D9580E] border-[#FBD9C0]",
  alert: "bg-[#FDECEC] text-[#C03342] border-[#F6CFCF]",
  info: "bg-[#EAF0FB] text-[#22357F] border-[#D3DEF5]",
  warn: "bg-[#FFF6E5] text-[#A86A12] border-[#F5DFB3]",
};

export interface HeaderTab {
  id: string;
  label: string;
  count?: number;
}

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  parent: "Parent",
  tutor: "Tutor",
  institute: "Institute",
  admin: "Super admin",
  safety: "Safety desk",
  verifier: "Verification",
};

export function ModuleHeader({
  group = "core",
  icon: Icon,
  trail = [],
  title,
  subtitle,
  pills = [],
  actions,
  tabs,
  activeTab,
  onTab,
  chips,
}: {
  group?: ModuleGroup;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** breadcrumb segments after "Tutor Amma › Role" */
  trail?: string[];
  title: string;
  subtitle?: React.ReactNode;
  pills?: HeaderPill[];
  actions?: React.ReactNode;
  tabs?: HeaderTab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  chips?: React.ReactNode;
}) {
  const { user, setView } = useAppStore();
  const role = user?.role ?? "";
  const home = { student: "s-dashboard", parent: "p-dashboard", tutor: "t-dashboard", institute: "i-dashboard", admin: "a-overview", safety: "a-safety", verifier: "a-verification" }[role];

  return (
    <header className="space-y-3 pb-1">
      <nav aria-label="Breadcrumb" className="text-[11.5px] text-muted-foreground flex items-center flex-wrap gap-1">
        <button className="hover:text-[#142366] hover:underline" onClick={() => home && setView(home)}>
          Tutor Amma
        </button>
        <span aria-hidden>›</span>
        <button className="hover:text-[#142366] hover:underline" onClick={() => home && setView(home)}>
          {ROLE_LABEL[role] ?? "Workspace"}
        </button>
        {trail.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span aria-hidden>›</span>
            <span>{t}</span>
          </span>
        ))}
        <span aria-hidden>›</span>
        <span className="font-bold text-[#142366]" aria-current="page">
          {title.split(" · ")[0]}
        </span>
      </nav>

      <div className="flex items-start gap-3.5 flex-wrap">
        <div
          className="shrink-0 w-[46px] h-[46px] rounded-[14px] flex items-center justify-center text-white"
          style={{ background: GROUP_GRADIENT[group], boxShadow: "0 6px 16px rgba(20,35,102,.18), inset 0 1px 0 rgba(255,255,255,.25)" }}
          aria-hidden
        >
          <Icon className="w-[22px] h-[22px]" strokeWidth={2.1} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[21px] font-extrabold tracking-tight text-[#142366] leading-tight">{title}</h1>
            {pills.map((p) => (
              <span key={p.label} className={clsx("inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10.5px] font-bold border", PILL_CLASS[p.tone ?? "info"])}>
                {p.tone === "live" && <span className="w-1.5 h-1.5 rounded-full bg-[#1F9D6B] animate-pulse" />}
                {p.label}
              </span>
            ))}
          </div>
          {subtitle && <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto sk-scroll pb-0.5" role="tablist">
          {tabs.map((t) => {
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => onTab?.(t.id)}
                className={clsx(
                  "shrink-0 px-4 py-1.5 rounded-full text-[12.5px] font-bold border transition-colors",
                  active ? "bg-[#142366] text-white border-[#142366] shadow-[0_3px_10px_rgba(20,35,102,.25)]" : "bg-white text-[#2A3557] border-[#D8E0ED] hover:border-[#B9C6E4]"
                )}
              >
                {t.label}
                {typeof t.count === "number" && (
                  <span className={clsx("ml-1.5 text-[10.5px] px-1.5 rounded-full", active ? "bg-white/20" : "bg-[#EEF2FA] text-[#57627F]")}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {chips && <div className="flex gap-1.5 flex-wrap">{chips}</div>}
    </header>
  );
}

/** Primary (navy) and promotional (orange) header buttons per the design system. */
export function HeaderButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "orange" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const cls = {
    primary: "bg-[#142366] text-white border-[#142366] hover:bg-[#1B2F79]",
    orange: "bg-[#F26B1D] text-white border-[#F26B1D] hover:bg-[#E05F12]",
    danger: "bg-[#D64545] text-white border-[#D64545] hover:bg-[#C03342]",
    secondary: "bg-white text-[#142366] border-[#D8E0ED] hover:border-[#B9C6E4]",
  }[variant];
  return (
    <button disabled={disabled} onClick={onClick} className={clsx("inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-bold border transition-colors disabled:opacity-50", cls)}>
      {children}
    </button>
  );
}

/** KPI tile with the orange left accent used across the edition-8 screens. */
export function AccentKpi({ label, value, sub, tone = "orange" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "orange" | "navy" | "green" | "red" | "purple" }) {
  const color = { orange: "#F26B1D", navy: "#142366", green: "#1F9D6B", red: "#D64545", purple: "#6D4AE0" }[tone];
  return (
    <div className="sk-card p-4 pl-5 relative overflow-hidden">
      <span className="absolute left-0 top-3 bottom-3 w-[4px] rounded-r-full" style={{ background: color }} />
      <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</div>
      <div className="text-[26px] font-extrabold tabular leading-tight mt-1 text-[#142366]">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
