import type { ButtonHTMLAttributes, ReactNode } from "react";
import { usePlatform } from "../hooks/usePlatform";

type DetailIconButtonTone = "default" | "accent" | "success" | "danger";

interface DetailIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  tone?: DetailIconButtonTone;
}

const toneColor: Record<DetailIconButtonTone, string> = {
  default: "var(--text-secondary)",
  accent: "var(--accent)",
  success: "var(--green)",
  danger: "var(--red)",
};

export function DetailIconButton({
  children,
  disabled,
  style,
  tone = "default",
  type = "button",
  ...props
}: DetailIconButtonProps) {
  const isMobile = usePlatform() === "mobile";
  const size = isMobile ? 38 : 32;

  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        alignItems: "center",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--gm-radius-md)",
        color: toneColor[tone],
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        flexShrink: 0,
        height: size,
        justifyContent: "center",
        minWidth: size,
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        width: size,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
