import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AppIcon, type AppIconSize, type AppIconTone } from "./AppIcon";
import { cx } from "./classNames";

interface EmptyStateProps {
  icon?: LucideIcon;
  iconSize?: AppIconSize;
  iconTone?: AppIconTone;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  full?: boolean;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  iconSize = "empty",
  iconTone = "empty",
  title,
  description,
  children,
  full = false,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("gm-empty-state", full && "gm-empty-state-full", compact && "gm-empty-state-compact", className)}>
      {icon ? <AppIcon icon={icon} size={iconSize} tone={iconTone} className="gm-empty-state-icon" /> : null}
      {title ? <p className="gm-empty-state-title">{title}</p> : null}
      {description ? <p className="gm-empty-state-description">{description}</p> : null}
      {children}
    </div>
  );
}
