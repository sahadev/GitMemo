import type { ButtonHTMLAttributes, ReactNode } from "react";
import { usePlatform } from "../hooks/usePlatform";

type DetailIconButtonTone = "default" | "accent" | "success" | "danger";

interface DetailIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  tone?: DetailIconButtonTone;
}

export function DetailIconButton({
  children,
  className,
  disabled,
  tone = "default",
  type = "button",
  ...props
}: DetailIconButtonProps) {
  const isMobile = usePlatform() === "mobile";

  return (
    <button
      type={type}
      disabled={disabled}
      className={["gm-detail-icon-button", className].filter(Boolean).join(" ")}
      data-mobile={isMobile ? "true" : "false"}
      data-tone={tone}
      {...props}
    >
      {children}
    </button>
  );
}
