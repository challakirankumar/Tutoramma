"use client";

import { clsx } from "clsx";
import { initials } from "@/lib/format";

export function AvatarTile({
  name,
  color = "#315BE5",
  size = 40,
  radius,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={clsx("sk-avatar shrink-0", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.max(10, size * 0.3),
        fontSize: Math.max(11, size * 0.36),
        background: `linear-gradient(180deg, ${color}dd, ${color})`,
      }}
      aria-label={name}
      role="img"
    >
      {initials(name)}
    </span>
  );
}
