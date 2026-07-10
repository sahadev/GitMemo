import type {
  CompositionEvent,
  KeyboardEvent,
  ReactNode,
  Ref,
} from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronUp, FilePlus2, FolderOpen, LoaderCircle, Save } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { Button } from "../../base/Button";
import { cx } from "../../base/classNames";

interface StatCardProps {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  tone: AppIconTone;
  loading?: boolean;
  onClick?: () => void;
}

export function DashboardStatCard({ icon, label, value, tone, loading = false, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      className="gm-dashboard-card gm-dashboard-stat-card"
      data-clickable={onClick ? "true" : "false"}
      data-loading={loading ? "true" : "false"}
      data-tone={tone}
      onClick={onClick}
    >
      <span aria-hidden="true" className="gm-dashboard-stat-rail" />
      <div className="gm-dashboard-stat-head">
        <AppIcon icon={icon} size="sm" tone={tone} className="gm-dashboard-stat-icon" />
        <span className="gm-section-title">{label}</span>
      </div>
      <p className="gm-dashboard-stat-value">{value}</p>
    </button>
  );
}

interface ActivityRowProps {
  icon: LucideIcon;
  tone: AppIconTone;
  title: ReactNode;
  time: ReactNode;
  onClick: () => void;
  mobile?: boolean;
}

export function DashboardActivityRow({ icon, tone, title, time, onClick, mobile = false }: ActivityRowProps) {
  return (
    <button type="button" onClick={onClick} className="gm-dashboard-activity-row">
      <AppIcon icon={icon} size={mobile ? "xs" : "2xs"} tone={tone} className="gm-dashboard-activity-icon" />
      <span className="gm-dashboard-activity-title">{title}</span>
      <span className="gm-dashboard-activity-time">{time}</span>
    </button>
  );
}

interface QuickInfoRowProps {
  icon: LucideIcon;
  children: ReactNode;
  title?: string;
}

export function DashboardQuickInfoRow({ icon, children, title }: QuickInfoRowProps) {
  return (
    <div className="gm-dashboard-quick-row">
      <AppIcon icon={icon} size="2xs" tone="secondary" />
      <span className="gm-dashboard-quick-text" title={title}>{children}</span>
    </div>
  );
}

interface DashboardCardProps {
  icon: LucideIcon;
  title: ReactNode;
  children: ReactNode;
  tone?: AppIconTone;
  className?: string;
  onClick?: () => void;
}

export function DashboardCard({ icon, title, children, tone = "secondary", className, onClick }: DashboardCardProps) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      className={cx("gm-dashboard-card", onClick && "gm-dashboard-card-button", className)}
      onClick={onClick}
    >
      <div className="gm-card-head">
        <AppIcon icon={icon} size="xs" tone={tone} />
        <span className="gm-section-title">{title}</span>
      </div>
      {children}
    </Component>
  );
}

interface DashboardQuickNotePanelProps {
  panelRef?: Ref<HTMLElement>;
  title: ReactNode;
  placeholder: string;
  expanded: boolean;
  toggleLabel: string;
  saveLabel: string;
  savingLabel: string;
  newLabel: string;
  openLabel: string;
  value: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
  saving: boolean;
  saveDisabled: boolean;
  canOpen: boolean;
  mobile?: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  onSave: () => void;
  onNew: () => void;
  onOpen: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart?: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onCompositionEnd?: (event: CompositionEvent<HTMLTextAreaElement>) => void;
}

export function DashboardQuickNotePanel({
  panelRef,
  title,
  placeholder,
  expanded,
  toggleLabel,
  saveLabel,
  savingLabel,
  newLabel,
  openLabel,
  value,
  textareaRef,
  saving,
  saveDisabled,
  canOpen,
  mobile = false,
  onChange,
  onToggle,
  onSave,
  onNew,
  onOpen,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: DashboardQuickNotePanelProps) {
  const bodyId = "dashboard-quick-note-body";

  return (
    <section
      ref={panelRef}
      className="gm-dashboard-card gm-dashboard-quick-note"
      data-expanded={expanded ? "true" : "false"}
      data-mobile={mobile ? "true" : "false"}
    >
      <button
        type="button"
        className="gm-dashboard-quick-note-toggle"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <div className="gm-dashboard-quick-note-title">
          <AppIcon icon={FilePlus2} size="xs" tone="accent" className="gm-dashboard-quick-note-title-icon" />
          <span className="gm-section-title">{title}</span>
          <span className="gm-dashboard-quick-note-hand" aria-hidden="true">☜</span>
        </div>
        <span className="gm-dashboard-quick-note-chevron" aria-label={toggleLabel} title={toggleLabel}>
          <AppIcon icon={expanded ? ChevronUp : ChevronDown} size="xs" tone="secondary" />
        </span>
      </button>
      {expanded ? (
        <div id={bodyId} className="gm-dashboard-quick-note-body">
          <div className="gm-dashboard-quick-note-input-wrap">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              placeholder={placeholder}
              className="gm-dashboard-quick-note-textarea"
              aria-label={typeof title === "string" ? title : undefined}
              rows={mobile ? 7 : 9}
              spellCheck
            />
            <div className="gm-dashboard-quick-note-actions">
              <Button
                variant="icon"
                tone="accent"
                onClick={onSave}
                disabled={saveDisabled}
                icon={saving ? LoaderCircle : Save}
                iconSpin={saving}
                mobile={mobile}
                title={saving ? savingLabel : saveLabel}
                aria-label={saving ? savingLabel : saveLabel}
              />
              <Button
                variant="icon"
                onClick={onNew}
                disabled={saving}
                icon={FilePlus2}
                mobile={mobile}
                title={newLabel}
                aria-label={newLabel}
              />
              {canOpen ? (
                <Button
                  variant="icon"
                  onClick={onOpen}
                  disabled={saving}
                  icon={FolderOpen}
                  mobile={mobile}
                  title={openLabel}
                  aria-label={openLabel}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
