"use client";

import { clsx } from "clsx";

const TONE_GRADIENTS: Record<string, string> = {
  navy: "linear-gradient(180deg,#33549E,#14246B)",
  royal: "linear-gradient(180deg,#5A83F0,#315BE5)",
  orange: "linear-gradient(180deg,#FFA24D,#E76E0F)",
  green: "linear-gradient(180deg,#46BD85,#1F9D68)",
  red: "linear-gradient(180deg,#E96A75,#C03342)",
};

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "navy",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: "navy" | "orange" | "green" | "royal" | "red";
  className?: string;
}) {
  return (
    <div className={clsx("sk-card p-4 flex items-center gap-3.5", className)}>
      {Icon && (
        <div
          className="sk-avatar shrink-0"
          style={{ width: 42, height: 42, borderRadius: 13, fontSize: 17, background: TONE_GRADIENTS[tone] ?? TONE_GRADIENTS.navy }}
        >
          <Icon className="w-[19px] h-[19px]" strokeWidth={2.1} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-[19px] font-bold leading-tight mt-0.5 tabular truncate">{value}</div>
        {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}
