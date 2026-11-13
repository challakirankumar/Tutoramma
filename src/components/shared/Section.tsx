"use client";

export function SectionTitle({
  title,
  sub,
  right,
  className = "",
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div>
        <h2 className="text-[16px] font-bold tracking-tight">{title}</h2>
        {sub && <p className="text-[12.5px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  sub,
  action,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      {Icon && (
        <div className="sk-well w-14 h-14 flex items-center justify-center rounded-2xl mb-3">
          <Icon className="w-6 h-6 text-muted-foreground" strokeWidth={1.8} />
        </div>
      )}
      <div className="font-semibold text-[14px]">{title}</div>
      {sub && <div className="text-[12.5px] text-muted-foreground mt-1 max-w-sm leading-relaxed">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingView({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3" role="status">
      <div
        className="w-9 h-9 rounded-full animate-spin"
        style={{
          background: "conic-gradient(from 0deg, #E2E8F4, #14246B)",
          mask: "radial-gradient(farthest-side, transparent 58%, #000 60%)",
          WebkitMask: "radial-gradient(farthest-side, transparent 58%, #000 60%)",
        }}
      />
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
    </div>
  );
}
