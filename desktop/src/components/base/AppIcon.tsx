import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./classNames";

export type AppIconSize =
  | "dot"
  | "2xs"
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "result"
  | "empty"
  | "empty-lg"
  | "hero";

export type AppIconTone =
  | "current"
  | "muted"
  | "secondary"
  | "empty"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "pink"
  | "blue"
  | "green"
  | "yellow"
  | "gray"
  | "teal";

interface AppIconProps {
  icon: LucideIcon;
  size?: AppIconSize;
  tone?: AppIconTone;
  spin?: boolean;
  className?: string;
  fill?: string;
  title?: string;
  style?: CSSProperties;
}

export function AppIcon({
  icon: Icon,
  size = "sm",
  tone = "current",
  spin = false,
  className,
  fill,
  title,
  style,
}: AppIconProps) {
  const filled = !!fill && fill !== "none";

  return (
    <Icon
      aria-hidden={title ? undefined : true}
      className={cx(
        "gm-icon",
        `gm-icon-size-${size}`,
        tone !== "current" && `gm-icon-tone-${tone}`,
        spin && "gm-icon-spin",
        className,
      )}
      data-filled={filled ? "true" : "false"}
      fill={fill ?? "none"}
      role={title ? "img" : undefined}
      style={style}
    >
      {title ? <title>{title}</title> : null}
    </Icon>
  );
}
