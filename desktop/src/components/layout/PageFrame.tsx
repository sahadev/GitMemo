import type { ReactNode } from "react";
import { cx } from "../base/classNames";

interface PageFrameProps {
  children: ReactNode;
  scroll?: boolean;
  column?: boolean;
  className?: string;
}

export function PageFrame({ children, scroll = false, column = false, className }: PageFrameProps) {
  return (
    <div className={cx("gm-page", "gm-page-frame", scroll && "gm-page-scroll", column && "gm-page-frame-column", className)}>
      {children}
    </div>
  );
}
