import type { ButtonHTMLAttributes, ImgHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { Button } from "../../base/Button";
import { cx } from "../../base/classNames";
import { useTimedIconSpin } from "../../base/useTimedIconSpin";

type SettingsTone = "default" | "muted" | "accent" | "success" | "warning" | "danger";
type SettingsWidth = "sm" | "md" | "lg" | "full";

interface ChildrenProps {
  children?: ReactNode;
  className?: string;
}

interface SettingsPageShellProps extends ChildrenProps {
  mobile?: boolean;
}

export function SettingsPageShell({ children, className, mobile = false }: SettingsPageShellProps) {
  return (
    <div className={cx("gm-page", "gm-page-scroll", "gm-settings-page", className)} data-mobile={mobile ? "true" : "false"}>
      {children}
    </div>
  );
}

interface SettingsPageHeaderProps {
  title: ReactNode;
  refreshIcon: LucideIcon;
  refreshTitle: string;
  onRefresh: () => void;
}

export function SettingsPageHeader({ title, refreshIcon, refreshTitle, onRefresh }: SettingsPageHeaderProps) {
  return (
    <header className="gm-settings-page-header">
      <h1 className="gm-page-title">{title}</h1>
      <Button
        type="button"
        variant="toolbar"
        icon={refreshIcon}
        iconSize="xs"
        onClick={onRefresh}
        title={refreshTitle}
      />
    </header>
  );
}

interface SettingsCardProps extends ChildrenProps {
  topSpacing?: boolean;
}

export function SettingsCard({ children, className, topSpacing = false }: SettingsCardProps) {
  return (
    <section className={cx("gm-settings-card", topSpacing && "gm-settings-card-spaced", className)}>
      {children}
    </section>
  );
}

interface SettingsCardHeaderProps extends ChildrenProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function SettingsCardHeader({ title, description, actions, children, className }: SettingsCardHeaderProps) {
  return (
    <div className={cx("gm-settings-card-header", className)}>
      <div className="gm-settings-card-header-copy">
        <p className="gm-settings-card-title">{title}</p>
        {description ? <p className="gm-settings-card-description">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="gm-settings-card-header-actions">{actions}</div> : null}
    </div>
  );
}

export function SettingsStack({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-stack", className)}>{children}</div>;
}

export function SettingsSubStack({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-substack", className)}>{children}</div>;
}

export function SettingsDivider() {
  return <div className="gm-settings-divider" />;
}

interface SettingsRowProps {
  icon: LucideIcon;
  iconTone?: AppIconTone;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  statusTone?: SettingsTone;
  children?: ReactNode;
  className?: string;
}

export function SettingsRow({
  icon,
  iconTone = "secondary",
  title,
  description,
  status,
  statusTone = "default",
  children,
  className,
}: SettingsRowProps) {
  return (
    <div className={cx("gm-settings-row", className)}>
      <div className="gm-settings-row-main">
        <AppIcon icon={icon} tone={iconTone} />
        <div className="gm-settings-row-copy">
          <p className="gm-settings-row-title">{title}</p>
          {description ? <p className="gm-settings-row-description">{description}</p> : null}
          {status ? (
            <p className="gm-settings-row-status" data-tone={statusTone}>
              {status}
            </p>
          ) : null}
        </div>
      </div>
      {children ? <div className="gm-settings-row-control">{children}</div> : null}
    </div>
  );
}

interface SettingsPlainRowProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SettingsPlainRow({ title, description, children, className }: SettingsPlainRowProps) {
  return (
    <div className={cx("gm-settings-plain-row", className)}>
      <div className="gm-settings-plain-row-copy">
        <p className="gm-settings-plain-row-title">{title}</p>
        {description ? <p className="gm-settings-plain-row-description">{description}</p> : null}
      </div>
      {children ? <div className="gm-settings-plain-row-control">{children}</div> : null}
    </div>
  );
}

interface SettingsControlGroupProps extends ChildrenProps {
  align?: "start" | "end" | "stretch";
  wrap?: boolean;
  stackOnMobile?: boolean;
}

export function SettingsControlGroup({
  children,
  className,
  align = "end",
  wrap = false,
  stackOnMobile = false,
}: SettingsControlGroupProps) {
  return (
    <div
      className={cx("gm-settings-control-group", className)}
      data-align={align}
      data-wrap={wrap ? "true" : "false"}
      data-stack-mobile={stackOnMobile ? "true" : "false"}
    >
      {children}
    </div>
  );
}

export function SettingsFieldGroup({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-field-group", className)}>{children}</div>;
}

export function SettingsIndentedFieldGroup({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-indented-field-group", className)}>{children}</div>;
}

export function SettingsRowInset({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-row-inset", className)}>{children}</div>;
}

export function SettingsSegmentedGroup({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-segmented-group", className)}>{children}</div>;
}

interface SettingsSegmentedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function SettingsSegmentedButton({
  active = false,
  className,
  children,
  type = "button",
  ...props
}: SettingsSegmentedButtonProps) {
  return (
    <button
      type={type}
      className={cx("gm-settings-segmented-button", className)}
      data-active={active ? "true" : "false"}
      {...props}
    >
      {children}
    </button>
  );
}

interface SettingsActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "icon" | "toolbar";
  tone?: "default" | "accent" | "success" | "warning" | "danger" | "muted";
  icon?: LucideIcon;
  iconTone?: AppIconTone;
  iconSpin?: boolean;
  compact?: boolean;
  block?: boolean;
  children?: ReactNode;
}

export function SettingsActionButton({
  variant = "secondary",
  tone = "default",
  icon,
  iconTone = "current",
  iconSpin = false,
  compact = true,
  block = false,
  className,
  children,
  ...props
}: SettingsActionButtonProps) {
  return (
    <Button
      variant={variant}
      tone={tone}
      icon={icon}
      iconTone={iconTone}
      iconSpin={iconSpin}
      block={block}
      className={cx("gm-settings-action-button", compact && "gm-settings-action-button-compact", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

interface SettingsIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  iconTone?: AppIconTone;
  spin?: boolean;
}

export function SettingsIconButton({
  icon,
  iconTone = "secondary",
  spin = false,
  className,
  onClick,
  type = "button",
  ...props
}: SettingsIconButtonProps) {
  const timedSpin = useTimedIconSpin<HTMLButtonElement>(onClick, icon === RefreshCw);

  return (
    <button type={type} onClick={timedSpin.handleClick} className={cx("gm-settings-icon-button", className)} {...props}>
      <AppIcon icon={icon} size="2xs" tone={iconTone} spin={spin || timedSpin.spinning} />
    </button>
  );
}

interface SettingsInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  width?: "branch" | "proxy" | "remote" | "full";
}

export function SettingsInput({ mono = false, width = "full", className, ...props }: SettingsInputProps) {
  return (
    <input
      className={cx("gm-settings-input", mono && "gm-settings-input-mono", className)}
      data-width={width}
      {...props}
    />
  );
}

interface SettingsCopyValueProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  displayValue: ReactNode;
  copied?: boolean;
  title?: string;
  max?: SettingsWidth;
}

export function SettingsCopyValue({
  displayValue,
  copied = false,
  title,
  max = "md",
  className,
  type = "button",
  ...props
}: SettingsCopyValueProps) {
  return (
    <button
      type={type}
      title={title}
      className={cx("gm-settings-copy-value", className)}
      data-max={max}
      data-copied={copied ? "true" : "false"}
      {...props}
    >
      <AppIcon icon={copied ? Check : Copy} size="2xs" tone={copied ? "success" : "current"} />
      <span className="gm-settings-copy-value-text">{displayValue}</span>
    </button>
  );
}

export function SettingsMonoPlaceholder({ children }: ChildrenProps) {
  return <span className="gm-settings-mono-placeholder">{children}</span>;
}

interface SettingsMonoValueProps extends ChildrenProps {
  max?: SettingsWidth;
}

export function SettingsMonoValue({ children, max = "md", className }: SettingsMonoValueProps) {
  return (
    <span className={cx("gm-settings-mono-value", className)} data-max={max}>
      {children}
    </span>
  );
}

interface SettingsStatusProps {
  children: ReactNode;
  tone?: SettingsTone;
  className?: string;
}

export function SettingsStatus({ children, tone = "default", className }: SettingsStatusProps) {
  return (
    <span className={cx("gm-settings-status", className)} data-tone={tone}>
      {children}
    </span>
  );
}

interface SettingsInfoPanelProps extends ChildrenProps {
  tone?: SettingsTone;
}

export function SettingsInfoPanel({ children, tone = "default", className }: SettingsInfoPanelProps) {
  return (
    <div className={cx("gm-settings-info-panel", className)} data-tone={tone}>
      {children}
    </div>
  );
}

export function SettingsPanelText({ children, className }: ChildrenProps) {
  return <p className={cx("gm-settings-panel-text", className)}>{children}</p>;
}

export function SettingsPanelActions({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-panel-actions", className)}>{children}</div>;
}

interface SettingsDotProps {
  ok?: boolean;
}

export function SettingsDot({ ok = false }: SettingsDotProps) {
  return <span className="gm-settings-dot" data-ok={ok ? "true" : "false"} />;
}

interface SettingsDiagnosticStepProps {
  name: ReactNode;
  message: ReactNode;
  ok: boolean;
}

export function SettingsDiagnosticStep({ name, message, ok }: SettingsDiagnosticStepProps) {
  return (
    <div className="gm-settings-diagnostic-step">
      <SettingsDot ok={ok} />
      <div className="gm-settings-diagnostic-copy">
        <p className="gm-settings-diagnostic-name">{name}</p>
        <p className="gm-settings-diagnostic-message">{message}</p>
      </div>
    </div>
  );
}

interface SettingsRangeControlProps extends InputHTMLAttributes<HTMLInputElement> {
  valueLabel: ReactNode;
}

export function SettingsRangeControl({ valueLabel, className, ...props }: SettingsRangeControlProps) {
  return (
    <div className={cx("gm-settings-range-control", className)}>
      <input className="gm-settings-range" type="range" {...props} />
      <span className="gm-settings-range-value">{valueLabel}</span>
    </div>
  );
}

export function SettingsAbout({ children, className }: ChildrenProps) {
  return <section className={cx("gm-settings-about", className)}>{children}</section>;
}

export function SettingsLogoImage(props: Omit<ImgHTMLAttributes<HTMLImageElement>, "className">) {
  return <img className="gm-settings-logo" {...props} />;
}

export function SettingsAboutTitle({ children }: ChildrenProps) {
  return <p className="gm-settings-about-title">{children}</p>;
}

export function SettingsAboutMeta({ children }: ChildrenProps) {
  return <p className="gm-settings-about-meta">{children}</p>;
}

export function SettingsUpdateStatus({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-update-status", className)}>{children}</div>;
}

interface SettingsUpdateProgressProps {
  label: ReactNode;
  value: number;
}

export function SettingsUpdateProgress({ label, value }: SettingsUpdateProgressProps) {
  return (
    <div className="gm-settings-update-progress">
      <span>{label}</span>
      <progress className="gm-settings-update-progress-track" value={value} max={100} />
      <span>{value}%</span>
    </div>
  );
}

export function SettingsFooterLinks({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-footer-links", className)}>{children}</div>;
}

export function SettingsFooterDivider() {
  return <span className="gm-settings-footer-divider">·</span>;
}

interface SettingsFooterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  tone?: "accent" | "muted";
  children: ReactNode;
}

export function SettingsFooterButton({
  icon,
  tone = "muted",
  children,
  className,
  type = "button",
  ...props
}: SettingsFooterButtonProps) {
  return (
    <button
      type={type}
      className={cx("gm-settings-footer-button", className)}
      data-tone={tone}
      {...props}
    >
      {icon ? <AppIcon icon={icon} size="2xs" /> : null}
      {children}
    </button>
  );
}

export function SettingsMobileSpacer() {
  return <div className="gm-settings-mobile-spacer" aria-hidden="true" />;
}

interface SettingsModalProps extends ChildrenProps {
  onBackdropClick: () => void;
  width?: "md" | "lg";
}

export function SettingsModal({ children, onBackdropClick, width = "md", className }: SettingsModalProps) {
  return (
    <div
      className="gm-settings-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdropClick();
      }}
    >
      <div className={cx("gm-settings-modal", className)} data-width={width}>
        {children}
      </div>
    </div>
  );
}

interface SettingsModalHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}

export function SettingsModalHeader({ icon, title, onClose, children }: SettingsModalHeaderProps) {
  return (
    <header className="gm-settings-modal-header">
      <div className="gm-settings-modal-title">
        <AppIcon icon={icon} tone="accent" />
        <span>{title}</span>
      </div>
      <div className="gm-settings-modal-actions">
        {children}
        <SettingsIconButton icon={X} onClick={onClose} />
      </div>
    </header>
  );
}

export function SettingsModalBody({ children, className }: ChildrenProps) {
  return <div className={cx("gm-settings-modal-body", className)}>{children}</div>;
}

export function SettingsEmptyModalText({ children }: ChildrenProps) {
  return <p className="gm-settings-empty-modal-text">{children}</p>;
}

export function SettingsProgress({ value }: { value: number }) {
  return (
    <progress className="gm-settings-progress" value={value} max={100}>
      {value}%
    </progress>
  );
}

interface SettingsLogEntryProps {
  filename: ReactNode;
  content: ReactNode;
}

export function SettingsLogEntry({ filename, content }: SettingsLogEntryProps) {
  return (
    <div className="gm-settings-log-entry">
      <div className="gm-settings-log-filename">{filename}</div>
      <pre className="gm-settings-log-content">{content}</pre>
    </div>
  );
}

interface SettingsChangelogReleaseProps {
  version: ReactNode;
  date: ReactNode;
  latest?: boolean;
  changes: ReactNode[];
}

export function SettingsChangelogRelease({ version, date, latest = false, changes }: SettingsChangelogReleaseProps) {
  return (
    <article className="gm-settings-changelog-release" data-latest={latest ? "true" : "false"}>
      <header className="gm-settings-changelog-release-head">
        <span className="gm-settings-changelog-version">{version}</span>
        <span className="gm-settings-changelog-date">{date}</span>
      </header>
      <ul className="gm-settings-changelog-list">
        {changes.map((change, index) => (
          <li key={index}>{change}</li>
        ))}
      </ul>
    </article>
  );
}
