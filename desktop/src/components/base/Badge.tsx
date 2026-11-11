import type { ReactNode } from "react";
import { cx } from "./classNames";

export type BadgeTone = "muted" | "accent" | "success" | "warning" | "danger";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
  /** 读屏文案：徽标只剩一个数字时，用它补全「几个未读」的语义。 */
  ariaLabel?: string;
}

export function Badge({ children, tone = "muted", className, title, ariaLabel }: BadgeProps) {
  return (
    <span
      className={cx("gm-badge", `gm-badge-tone-${tone}`, className)}
      title={title}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  );
}
