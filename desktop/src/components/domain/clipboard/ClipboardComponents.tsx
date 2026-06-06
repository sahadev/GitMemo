import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
  Ref,
} from "react";
import { RefreshCw, type LucideIcon } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { cx } from "../../base/classNames";
import { useTimedIconSpin } from "../../base/useTimedIconSpin";

interface ChildrenProps {
  children?: ReactNode;
  className?: string;
}

type ClipboardTone = "default" | "accent" | "success" | "danger" | "muted";

export function ClipboardPageFrame({ children }: ChildrenProps) {
  return <div className="gm-page gm-clipboard-page">{children}</div>;
}

export function ClipboardListPane({ children }: ChildrenProps) {
  return <div className="gm-clipboard-list-pane">{children}</div>;
}

export function ClipboardStatusBadge({ watching, children }: ChildrenProps & { watching: boolean }) {
  return <span className="gm-clipboard-status-badge" data-watching={watching ? "true" : "false"}>{children}</span>;
}

interface ClipboardToolbarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  mobile: boolean;
  tone?: ClipboardTone;
  active?: boolean;
}

export function ClipboardToolbarButton({
  icon,
  mobile,
  tone = "default",
  active = false,
  className,
  onClick,
  type = "button",
  ...props
}: ClipboardToolbarButtonProps) {
  const timedSpin = useTimedIconSpin<HTMLButtonElement>(onClick, icon === RefreshCw);
  const iconTone: AppIconTone = active
    ? "accent"
    : tone === "success"
      ? "success"
      : tone === "danger"
        ? "danger"
        : "current";

  return (
    <button
      type={type}
      onClick={timedSpin.handleClick}
      className={cx("gm-toolbar-button", "gm-clipboard-toolbar-button", className)}
      data-mobile={mobile ? "true" : "false"}
      data-tone={tone}
      data-active={active ? "true" : "false"}
      {...props}
    >
      <AppIcon icon={icon} size={mobile ? "sm" : "xs"} tone={iconTone} spin={timedSpin.spinning} />
    </button>
  );
}

export function ClipboardFilterBar({ mobile, label, children }: ChildrenProps & { mobile: boolean; label: string }) {
  return (
    <div className="gm-clipboard-filter-bar" data-mobile={mobile ? "true" : "false"}>
      <div className="gm-clipboard-filter-tabs" role="tablist" aria-label={label}>{children}</div>
    </div>
  );
}

interface ClipboardFilterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: ReactNode;
  active: boolean;
  mobile: boolean;
}

export function ClipboardFilterButton({
  icon,
  label,
  active,
  mobile,
  className,
  type = "button",
  ...props
}: ClipboardFilterButtonProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      className={cx("gm-clipboard-filter-button", className)}
      data-active={active ? "true" : "false"}
      data-mobile={mobile ? "true" : "false"}
      {...props}
    >
      <AppIcon icon={icon} size={mobile ? "xs" : "2xs"} />
      <span>{label}</span>
    </button>
  );
}

export function ClipboardListBody({
  mobile,
  selecting,
  children,
  refNode,
}: ChildrenProps & {
  mobile: boolean;
  selecting: boolean;
  refNode?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={refNode}
      className="gm-clipboard-list-body"
      data-mobile={mobile ? "true" : "false"}
      data-selecting={selecting ? "true" : "false"}
    >
      {children}
    </div>
  );
}

export function ClipboardListLoading({ children }: ChildrenProps) {
  return <div className="gm-clipboard-list-loading">{children}</div>;
}

export function ClipboardEmptyState({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="gm-empty-state gm-clipboard-empty-state">
      <AppIcon icon={icon} size="empty" tone="empty" className="gm-empty-state-icon" />
      <p className="gm-empty-state-title">{title}</p>
      {description ? <p className="gm-empty-state-description">{description}</p> : null}
    </div>
  );
}

export function ClipboardClipItem({
  active,
  selecting,
  interactive = false,
  children,
  className,
  refNode,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...props
}: ChildrenProps & HTMLAttributes<HTMLDivElement> & {
  active: boolean;
  selecting: boolean;
  interactive?: boolean;
  refNode?: Ref<HTMLDivElement>;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !interactive) return;
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    event.currentTarget.click();
  };

  return (
    <div
      ref={refNode}
      className={cx("gm-clipboard-clip-item", className)}
      data-active={active ? "true" : "false"}
      data-interactive={interactive ? "true" : "false"}
      data-selecting={selecting ? "true" : "false"}
      role={interactive ? "button" : role}
      tabIndex={interactive ? 0 : tabIndex}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </div>
  );
}

interface ClipboardSelectionToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  order: number;
  mobile: boolean;
}

export function ClipboardSelectionToggle({
  selected,
  order,
  mobile,
  className,
  type = "button",
  ...props
}: ClipboardSelectionToggleProps) {
  return (
    <button
      type={type}
      className={cx("gm-clipboard-selection-toggle", className)}
      data-mobile={mobile ? "true" : "false"}
      {...props}
    >
      <span data-selected={selected ? "true" : "false"}>{selected ? order + 1 : ""}</span>
    </button>
  );
}

export function ClipboardClipContent({
  mobile,
  children,
  refNode,
  ...props
}: ChildrenProps & HTMLAttributes<HTMLDivElement> & {
  mobile: boolean;
  refNode?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={refNode}
      className="gm-clipboard-clip-content"
      data-mobile={mobile ? "true" : "false"}
      {...props}
    >
      {children}
    </div>
  );
}

export function ClipboardClipPreviewWrap({ children }: ChildrenProps) {
  return <div className="gm-clipboard-preview-wrap">{children}</div>;
}

export function ClipboardClipText({ children }: ChildrenProps) {
  return <p className="gm-clipboard-clip-text">{children}</p>;
}

export function ClipboardClipMetaRow({ mobile, children }: ChildrenProps & { mobile: boolean }) {
  return <div className="gm-clipboard-meta-row" data-mobile={mobile ? "true" : "false"}>{children}</div>;
}

export function ClipboardClipMetaText({ children, muted = false }: ChildrenProps & { muted?: boolean }) {
  return <span className="gm-clipboard-meta-text" data-muted={muted ? "true" : "false"}>{children}</span>;
}

export function ClipboardClipMetaSpacer() {
  return <span className="gm-clipboard-meta-spacer" />;
}

interface ClipboardClipActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  mobile: boolean;
  hidden?: boolean;
  tone?: ClipboardTone;
}

export function ClipboardClipActionButton({
  icon,
  mobile,
  hidden = false,
  tone = "default",
  className,
  type = "button",
  ...props
}: ClipboardClipActionButtonProps) {
  return (
    <button
      type={type}
      className={cx("gm-clipboard-clip-action", className)}
      data-mobile={mobile ? "true" : "false"}
      data-hidden={hidden ? "true" : "false"}
      data-tone={tone}
      {...props}
    >
      <AppIcon icon={icon} size={mobile ? "sm" : "xs"} tone={tone === "default" ? "secondary" : tone} />
    </button>
  );
}

export function ClipboardSelectionBar({
  mobile,
  children,
}: ChildrenProps & { mobile: boolean }) {
  return <div className="gm-clipboard-selection-bar" data-mobile={mobile ? "true" : "false"}>{children}</div>;
}

export function ClipboardSelectionCount({ children }: ChildrenProps) {
  return <span className="gm-clipboard-selection-count">{children}</span>;
}

interface ClipboardSelectionActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  mobile: boolean;
  tone?: "primary" | "danger";
  hideLabelOnMobile?: boolean;
  children: ReactNode;
}

export function ClipboardSelectionAction({
  icon,
  mobile,
  tone = "primary",
  hideLabelOnMobile = false,
  children,
  className,
  type = "button",
  ...props
}: ClipboardSelectionActionProps) {
  return (
    <button
      type={type}
      className={cx("gm-clipboard-selection-action", className)}
      data-mobile={mobile ? "true" : "false"}
      data-tone={tone}
      data-hide-label={hideLabelOnMobile ? "true" : "false"}
      {...props}
    >
      <AppIcon icon={icon} size="2xs" />
      <span>{children}</span>
    </button>
  );
}

export function ClipboardFooterTotal({ children }: ChildrenProps) {
  return <div className="gm-clipboard-footer-total">{children}</div>;
}

export function ClipboardDetailPane({ children }: ChildrenProps) {
  return <div className="gm-detail-pane">{children}</div>;
}

export function ClipboardEmptyDetail({ icon, children }: ChildrenProps & { icon: LucideIcon }) {
  return (
    <div className="gm-empty-state gm-empty-state-full gm-clipboard-empty-detail">
      <AppIcon icon={icon} size="empty" tone="empty" className="gm-empty-state-icon" />
      <p className="gm-empty-state-title">{children}</p>
    </div>
  );
}
