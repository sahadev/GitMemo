import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  iconFill?: string;
}

interface PaneHeaderProps {
  icon?: LucideIcon;
  title: ReactNode;
  afterTitle?: ReactNode;
  actions?: ReactNode;
  iconFill?: string;
}

interface PaneTabHeaderItem<T extends string> {
  id: T;
  label: ReactNode;
  icon: LucideIcon;
}

interface PaneTabHeaderProps<T extends string> {
  tabs: readonly PaneTabHeaderItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  actions?: ReactNode;
  isMobile?: boolean;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, iconFill }: PageHeaderProps) {
  return (
    <div className="gm-page-header">
      {Icon ? <Icon className="gm-page-header-icon" fill={iconFill} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="gm-page-header-title">{title}</h1>
        {subtitle ? <p className="gm-page-header-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="gm-page-header-actions">{actions}</div> : null}
    </div>
  );
}

export function PaneHeader({ icon: Icon, title, afterTitle, actions, iconFill }: PaneHeaderProps) {
  return (
    <div className="gm-pane-header">
      <div className="gm-pane-header-main">
        {Icon ? <Icon className="gm-pane-header-icon" fill={iconFill} /> : null}
        <span className="gm-pane-header-title">{title}</span>
        {afterTitle}
      </div>
      {actions ? <div className="gm-pane-header-actions">{actions}</div> : null}
    </div>
  );
}

export function PaneTabHeader<T extends string>({
  tabs,
  activeId,
  onChange,
  actions,
  isMobile = false,
}: PaneTabHeaderProps<T>) {
  return (
    <div className="gm-pane-header gm-pane-tab-header">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className="gm-pane-tab-button"
            data-active={active ? "true" : "false"}
            onClick={() => onChange(tab.id)}
            style={{
              minHeight: isMobile ? "var(--gm-control-height-lg)" : "var(--gm-control-height-sm)",
              padding: isMobile ? "var(--gm-control-pad-y-lg) var(--gm-row-pad-x)" : "var(--gm-control-pad-y) var(--gm-row-pad-x)",
            }}
          >
            <Icon
              className="gm-pane-tab-icon"
              size={isMobile ? "var(--gm-icon-sm)" : "var(--gm-icon-xs)"}
            />
            {tab.label}
          </button>
        );
      })}
      {actions ? <div className="gm-pane-header-actions">{actions}</div> : null}
    </div>
  );
}
