import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { cx } from "../../base/classNames";
import { useTimedIconSpin } from "../../base/useTimedIconSpin";

type SetupTone = "default" | "accent" | "success" | "warning" | "danger" | "muted" | "dashed";
type SetupButtonVariant = "primary" | "secondary" | "ghost";

interface ChildrenProps {
  children?: ReactNode;
  className?: string;
}

export function SetupWizardFrame({
  mobile,
  done = false,
  sidebar,
  children,
}: {
  mobile: boolean;
  done?: boolean;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="gm-setup-frame">
      <div className="gm-setup-card" data-mobile={mobile ? "true" : "false"} data-done={done ? "true" : "false"}>
        {sidebar}
        <section className="gm-setup-main">{children}</section>
      </div>
    </div>
  );
}

export function SetupSidebar({ mobile, children }: ChildrenProps & { mobile: boolean }) {
  return <aside className="gm-setup-sidebar" data-mobile={mobile ? "true" : "false"}>{children}</aside>;
}

export function SetupSidebarStack({ children }: ChildrenProps) {
  return <div className="gm-setup-sidebar-stack">{children}</div>;
}

export function SetupBrand({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <div className="gm-setup-brand-block">
      <div className="gm-setup-brand-row">
        <div className="gm-setup-logo-box">GM</div>
        <div className="gm-setup-brand-copy">
          <div className="gm-setup-kicker">GitMemo Setup</div>
          <h2 className="gm-setup-sidebar-title">{title}</h2>
        </div>
      </div>
      <p className="gm-setup-sidebar-description">{description}</p>
    </div>
  );
}

export function SetupValueGrid({ children }: ChildrenProps) {
  return <div className="gm-setup-value-grid">{children}</div>;
}

export function SetupValueRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="gm-setup-value-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SetupStepList({ mobile, children }: ChildrenProps & { mobile: boolean }) {
  return <div className="gm-setup-step-list" data-mobile={mobile ? "true" : "false"}>{children}</div>;
}

export function SetupStepItem({
  index,
  label,
  active,
  complete,
  mobile,
}: {
  index: number;
  label: ReactNode;
  active: boolean;
  complete: boolean;
  mobile: boolean;
}) {
  return (
    <div className="gm-setup-step-item" data-active={active ? "true" : "false"} data-mobile={mobile ? "true" : "false"}>
      <div className="gm-setup-step-index" data-active={active || complete ? "true" : "false"}>
        {complete ? <AppIcon icon={Check} size="xs" /> : index + 1}
      </div>
      <div className="gm-setup-step-label">{label}</div>
    </div>
  );
}

export function SetupTip({ title, children }: ChildrenProps & { title: ReactNode }) {
  return (
    <div className="gm-setup-tip">
      <div className="gm-setup-tip-title">{title}</div>
      {children}
    </div>
  );
}

export function SetupPanel({ mobile, children }: ChildrenProps & { mobile: boolean }) {
  return (
    <div className="gm-setup-panel" data-mobile={mobile ? "true" : "false"}>
      <div className="gm-setup-panel-inner">{children}</div>
    </div>
  );
}

export function SetupHeroIcon({ icon, tone = "accent" }: { icon: LucideIcon; tone?: AppIconTone }) {
  return (
    <div className="gm-setup-hero-icon">
      <AppIcon icon={icon} size="empty" tone={tone} />
    </div>
  );
}

export function SetupStack({ children, gap = "md", className }: ChildrenProps & { gap?: "sm" | "md" | "lg" }) {
  return <div className={cx("gm-setup-stack", className)} data-gap={gap}>{children}</div>;
}

interface SetupButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SetupButtonVariant;
  layout?: "block" | "nav-back" | "nav-primary" | "auto";
  icon?: LucideIcon;
  iconPosition?: "start" | "end";
  iconSpin?: boolean;
  children: ReactNode;
}

export function SetupButton({
  variant = "primary",
  layout = "block",
  icon,
  iconPosition = "start",
  iconSpin = false,
  children,
  className,
  onClick,
  type = "button",
  ...props
}: SetupButtonProps) {
  const timedSpin = useTimedIconSpin<HTMLButtonElement>(onClick, icon === RefreshCw);

  return (
    <button
      type={type}
      onClick={timedSpin.handleClick}
      className={cx("gm-setup-button", className)}
      data-variant={variant}
      data-layout={layout}
      data-icon-position={iconPosition}
      {...props}
    >
      {icon && iconPosition === "start" ? <AppIcon icon={icon} size="sm" spin={iconSpin || timedSpin.spinning} /> : null}
      {children}
      {icon && iconPosition === "end" ? <AppIcon icon={icon} size="sm" spin={iconSpin || timedSpin.spinning} /> : null}
    </button>
  );
}

export function SetupButtonRow({ children }: ChildrenProps) {
  return <div className="gm-setup-button-row">{children}</div>;
}

interface SetupOptionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  compact?: boolean;
  children: ReactNode;
}

export function SetupOptionButton({
  selected = false,
  compact = false,
  children,
  className,
  type = "button",
  ...props
}: SetupOptionButtonProps) {
  return (
    <button
      type={type}
      className={cx("gm-setup-option", className)}
      data-selected={selected ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      {...props}
    >
      {children}
    </button>
  );
}

export function SetupOptionCopy({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="gm-setup-option-copy">
      <div className="gm-setup-option-title">{title}</div>
      {description ? <div className="gm-setup-option-description">{description}</div> : null}
    </div>
  );
}

export function SetupOptionIcon({ icon, tone = "accent" }: { icon: LucideIcon; tone?: AppIconTone }) {
  return <AppIcon icon={icon} size="lg" tone={tone} className="gm-setup-option-icon" />;
}

export function SetupLanguageMark({ children }: ChildrenProps) {
  return <span className="gm-setup-language-mark">{children}</span>;
}

export function SetupCheck({ selected }: { selected: boolean }) {
  return selected ? <AppIcon icon={Check} size="sm" tone="accent" className="gm-setup-check" /> : null;
}

export function SetupCheckbox({ checked }: { checked: boolean }) {
  return (
    <div className="gm-setup-checkbox" data-checked={checked ? "true" : "false"}>
      {checked ? <AppIcon icon={Check} size="2xs" /> : null}
    </div>
  );
}

export function SetupBadge({ children, tone = "muted" }: ChildrenProps & { tone?: SetupTone }) {
  return <span className="gm-setup-badge" data-tone={tone}>{children}</span>;
}

export function SetupBadgeRow({ children }: ChildrenProps) {
  return <div className="gm-setup-badge-row">{children}</div>;
}

export function SetupSectionLabel({ children }: ChildrenProps) {
  return <p className="gm-setup-section-label">{children}</p>;
}

interface SetupPlatformButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  platform: string;
  label: ReactNode;
}

export function SetupPlatformButton({
  selected,
  platform,
  label,
  className,
  type = "button",
  ...props
}: SetupPlatformButtonProps) {
  return (
    <button
      type={type}
      className={cx("gm-setup-platform-button", className)}
      data-selected={selected ? "true" : "false"}
      data-platform={platform}
      {...props}
    >
      <span className="gm-setup-platform-dot" />
      <span>{label}</span>
      {selected ? <AppIcon icon={Check} size="2xs" tone="accent" /> : null}
    </button>
  );
}

export function SetupPlatformGrid({ children }: ChildrenProps) {
  return <div className="gm-setup-platform-grid">{children}</div>;
}

export function SetupInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="gm-setup-input" {...props} />;
}

export function SetupFieldHint({ children, tone = "muted", className }: ChildrenProps & { tone?: SetupTone }) {
  return <p className={cx("gm-setup-field-hint", className)} data-tone={tone}>{children}</p>;
}

export function SetupInfoPanel({ children, tone = "default", className }: ChildrenProps & { tone?: SetupTone }) {
  return <div className={cx("gm-setup-info-panel", className)} data-tone={tone}>{children}</div>;
}

export function SetupInfoRow({ children }: ChildrenProps) {
  return <div className="gm-setup-info-row">{children}</div>;
}

export function SetupCandidateList({ children }: ChildrenProps) {
  return <div className="gm-setup-candidate-list">{children}</div>;
}

export function SetupPublicKeyBox({ children }: ChildrenProps) {
  return <div className="gm-setup-public-key-box">{children}</div>;
}

export function SetupCodeBlock({ children }: ChildrenProps) {
  return <code className="gm-setup-code-block">{children}</code>;
}

export function SetupInlineActions({ children }: ChildrenProps) {
  return <div className="gm-setup-inline-actions">{children}</div>;
}

export function SetupCenteredBlock({ children, padded = false, className }: ChildrenProps & { padded?: boolean }) {
  return <div className={cx("gm-setup-centered-block", className)} data-padded={padded ? "true" : "false"}>{children}</div>;
}

export function SetupTitle({ children, tone = "default" }: ChildrenProps & { tone?: SetupTone }) {
  return <h2 className="gm-setup-title" data-tone={tone}>{children}</h2>;
}

export function SetupText({ children, align = "left", tone = "muted", className }: ChildrenProps & { align?: "left" | "center"; tone?: SetupTone }) {
  return <p className={cx("gm-setup-text", className)} data-align={align} data-tone={tone}>{children}</p>;
}

export function SetupRunningLayout({ children }: ChildrenProps) {
  return <div className="gm-setup-running-layout">{children}</div>;
}

export function SetupLogPanel({ title, count, children }: ChildrenProps & { title: ReactNode; count: ReactNode }) {
  return (
    <div className="gm-setup-log-panel">
      <div className="gm-setup-log-head">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  );
}

export function SetupLogBody({ children, refNode }: ChildrenProps & { refNode?: Ref<HTMLDivElement> }) {
  return <div ref={refNode} className="gm-setup-log-body">{children}</div>;
}

export function SetupLogIcon({ status }: { status: string }) {
  if (status === "ok") return <AppIcon icon={Check} size="xs" tone="success" />;
  if (status === "error") return <AppIcon icon={AlertCircle} size="xs" tone="danger" />;
  return <AppIcon icon={Loader2} size="xs" tone="accent" spin />;
}

export function SetupLogItem({ icon, message, step, error }: { icon: ReactNode; message: ReactNode; step: ReactNode; error?: boolean }) {
  return (
    <div className="gm-setup-log-item">
      {icon}
      <div className="gm-setup-log-copy">
        <p className="gm-setup-log-message" data-error={error ? "true" : "false"}>{message}</p>
        <p className="gm-setup-log-step">{step}</p>
      </div>
    </div>
  );
}

export function SetupDoneIcon({ error = false }: { error?: boolean }) {
  return (
    <div className="gm-setup-done-icon" data-error={error ? "true" : "false"}>
      <AppIcon icon={error ? AlertCircle : Check} size="empty" tone={error ? "danger" : "success"} />
    </div>
  );
}

export function SetupResultList({ children }: ChildrenProps) {
  return <div className="gm-setup-result-list">{children}</div>;
}

export function SetupResultRow({ ok, message }: { ok: boolean; message: ReactNode }) {
  return (
    <div className="gm-setup-result-row">
      <AppIcon icon={ok ? Check : AlertCircle} size="xs" tone={ok ? "success" : "danger"} />
      <span data-ok={ok ? "true" : "false"}>{message}</span>
    </div>
  );
}
