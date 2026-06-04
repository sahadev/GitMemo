import type { ReactNode } from "react";
import { cx } from "./classNames";

export type BadgeTone = "muted" | "accent" | "success" | "warning" | "danger";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}

export function Badge({ children, tone = "muted", className, title }: BadgeProps) {
  return (
    <span className={cx("gm-badge", `gm-badge-tone-${tone}`, className)} title={title}>
      {children}
    </span>
  );
}
