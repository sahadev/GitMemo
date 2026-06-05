import type { ButtonHTMLAttributes, ReactNode } from "react";
import { RefreshCw, type LucideIcon } from "lucide-react";
import { AppIcon, type AppIconSize, type AppIconTone } from "./AppIcon";
import { cx } from "./classNames";
import { useTimedIconSpin } from "./useTimedIconSpin";

type ButtonVariant = "primary" | "secondary" | "ghost" | "toolbar" | "icon" | "menu";
type ButtonTone = "default" | "accent" | "success" | "warning" | "danger" | "muted";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  icon?: LucideIcon;
  iconSize?: AppIconSize;
  iconTone?: AppIconTone;
  iconSpin?: boolean;
  iconFill?: string;
  children?: ReactNode;
  block?: boolean;
  mobile?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "gm-button-primary",
  secondary: "gm-button-secondary",
  ghost: "gm-button-ghost",
  toolbar: "gm-toolbar-button",
  icon: "gm-icon-button",
  menu: "gm-menu-item",
};

export function Button({
  variant = "secondary",
  tone = "default",
  icon,
  iconSize = "xs",
  iconTone = "current",
  iconSpin = false,
  iconFill,
  children,
  className,
  onClick,
  block = false,
  mobile = false,
  type = "button",
  ...props
}: ButtonProps) {
  const timedSpin = useTimedIconSpin<HTMLButtonElement>(onClick, icon === RefreshCw);

  return (
    <button
      type={type}
      onClick={timedSpin.handleClick}
      className={cx(
        variantClass[variant],
        tone !== "default" && `gm-control-tone-${tone}`,
        block && "gm-control-block",
        mobile && "gm-control-mobile",
        className,
      )}
      {...props}
    >
      {icon ? (
        <AppIcon
          icon={icon}
          size={iconSize}
          tone={iconTone}
          spin={iconSpin || timedSpin.spinning}
          fill={iconFill}
        />
      ) : null}
      {children}
    </button>
  );
}
