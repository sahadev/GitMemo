import type { ReactNode } from "react";
import { cx } from "./classNames";

interface MonoBlockProps {
  children: ReactNode;
  className?: string;
}

export function MonoBlock({ children, className }: MonoBlockProps) {
  return <pre className={cx("gm-mono-text", "gm-mono-block", className)}>{children}</pre>;
}
