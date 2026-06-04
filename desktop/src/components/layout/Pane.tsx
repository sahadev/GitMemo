import type { ReactNode } from "react";
import { cx } from "../base/classNames";

interface PaneProps {
  children: ReactNode;
  className?: string;
}

interface ScrollPaneProps extends PaneProps {
  mobileBottomPadding?: boolean;
  selectable?: boolean;
}

export function ListPane({ children, className }: PaneProps) {
  return <div className={cx("gm-list-pane-surface", className)}>{children}</div>;
}

export function ListPaneBody({ children, mobileBottomPadding = false, className }: ScrollPaneProps) {
  return (
    <div className={cx("gm-list-pane-body", mobileBottomPadding && "gm-list-pane-body-mobile-pad", className)}>
      {children}
    </div>
  );
}

export function DetailPane({ children, className }: PaneProps) {
  return <div className={cx("gm-detail-pane", className)}>{children}</div>;
}

export function DetailScroll({ children, mobileBottomPadding = false, selectable = false, className }: ScrollPaneProps) {
  return (
    <div className={cx("gm-detail-scroll", mobileBottomPadding && "gm-detail-scroll-mobile-pad", selectable && "gm-selectable", className)}>
      {children}
    </div>
  );
}
