import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { cx } from "../../base/classNames";

interface StatCardProps {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  tone: AppIconTone;
  onClick?: () => void;
}

export function DashboardStatCard({ icon, label, value, tone, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      className="gm-dashboard-card gm-dashboard-stat-card"
      data-clickable={onClick ? "true" : "false"}
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
