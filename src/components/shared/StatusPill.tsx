"use client";

import { clsx } from "clsx";

type Tone = "green" | "orange" | "red" | "blue" | "grey" | "navy";

export function StatusPill({
  tone = "grey",
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx("sk-pill", `sk-pill-${tone}`, className)}>
      {dot && (
        <span
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{
            background: "currentColor",
            boxShadow: "inset 0 -1px 1px rgba(0,0,0,.25), 0 0 3px currentColor",
          }}
        />
      )}
      {children}
    </span>
  );
}

export function pillFor(map: Record<string, { label: string; cls: Tone }>, key: string) {
  return map[key] ?? { label: key, cls: "grey" as Tone };
}
