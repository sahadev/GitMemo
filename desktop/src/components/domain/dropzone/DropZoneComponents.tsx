import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Code2, Download, File, FileText, FolderOpen, Image, X } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { cx } from "../../base/classNames";

interface ChildrenProps {
  children?: ReactNode;
  className?: string;
}

function categoryMeta(category: string): { icon: LucideIcon; tone: AppIconTone } {
  switch (category) {
    case "Markdown":
      return { icon: FileText, tone: "accent" };
    case "Image":
      return { icon: Image, tone: "success" };
    case "Code":
      return { icon: Code2, tone: "warning" };
    case "Document":
      return { icon: File, tone: "purple" };
    default:
      return { icon: File, tone: "secondary" };
  }
}

export function DropOverlay({ children, ...props }: ChildrenProps & HTMLAttributes<HTMLDivElement>) {
  return <div className="gm-drop-overlay" {...props}>{children}</div>;
}

export function DropCard({ children, ...props }: ChildrenProps & HTMLAttributes<HTMLDivElement>) {
  return <div className="gm-drop-card" {...props}>{children}</div>;
}

export function DropHead({ children }: ChildrenProps) {
  return <div className="gm-drop-head">{children}</div>;
}

export function DropBody({ children }: ChildrenProps) {
  return <div className="gm-drop-body">{children}</div>;
}

export function DropHeadRow({ children }: ChildrenProps) {
  return <div className="gm-drop-head-row">{children}</div>;
}

export function DropHeadCopy({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <div className="gm-drop-head-copy">
      <div className="gm-drop-title">{title}</div>
      <div className="gm-drop-description">{description}</div>
    </div>
  );
}

export function DropHeroIcon() {
  return (
    <div className="gm-drop-hero-icon">
      <AppIcon icon={Download} size="xl" />
    </div>
  );
}

export function DropIconButton({
  icon,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon }) {
  return (
    <button type={type} className={cx("gm-icon-button", className)} {...props}>
      <AppIcon icon={icon} size="md" />
    </button>
  );
}

export function DropSummary({ title, subtitle }: { title: ReactNode; subtitle: ReactNode }) {
  return (
    <div className="gm-drop-summary">
      <div className="gm-drop-summary-title">{title}</div>
      <div className="gm-drop-summary-subtitle">{subtitle}</div>
    </div>
  );
}

export function DropActionsGrid({ dual, children }: ChildrenProps & { dual: boolean }) {
  return <div className="gm-drop-actions-grid" data-dual={dual ? "true" : "false"}>{children}</div>;
}

interface DropActionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon: LucideIcon;
  label: ReactNode;
  description: ReactNode;
  tone: "accent" | "success";
}

export function DropAction({
  icon,
  label,
  description,
  tone,
  className,
  type = "button",
  ...props
}: DropActionProps) {
  return (
    <button type={type} className={cx("gm-drop-action", className)} {...props}>
      <div className="gm-drop-action-head" data-tone={tone}>
        <AppIcon icon={icon} size="md" />
        <span className="gm-drop-action-title">{label}</span>
      </div>
      <div className="gm-drop-action-description">{description}</div>
    </button>
  );
}

export function DropHint({ children, size = false }: ChildrenProps & { size?: boolean }) {
  return <div className={cx("gm-drop-hint", size && "gm-drop-size-hint")}>{children}</div>;
}

export function DropEmptyChoice({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <div className="gm-drop-empty-choice">
      <div className="gm-card-title gm-drop-empty-title">{title}</div>
      <div className="gm-drop-description">{description}</div>
    </div>
  );
}

export function DropProgressToast({ children }: ChildrenProps) {
  return (
    <div className="gm-floating-toast gm-toast-fixed gm-toast-progress">
      <div className="gm-spinner-sm" />
      <span className="gm-card-title">{children}</span>
    </div>
  );
}

export function DropResultToast({ children }: ChildrenProps) {
  return <div className="gm-floating-toast gm-toast-fixed gm-toast-result">{children}</div>;
}

export function DropToastHead({
  error,
  title,
  onClose,
}: {
  error: boolean;
  title: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="gm-toast-head">
      <AppIcon icon={error ? X : Check} size="sm" tone={error ? "danger" : "success"} />
      <span className="gm-toast-title">{title}</span>
      <DropIconButton icon={X} onClick={onClose} className="gm-toast-close-button" />
    </div>
  );
}

export function DropToastBody({ children }: ChildrenProps) {
  return <div className="gm-toast-body-scroll">{children}</div>;
}

export function DropCategoryIcon({ category }: { category: string }) {
  const meta = categoryMeta(category);
  return <AppIcon icon={meta.icon} size="xs" tone={meta.tone} className="gm-toast-row-icon" />;
}

export function DropToastRow({
  last,
  category,
  name,
  path,
  size,
}: {
  last: boolean;
  category: string;
  name: ReactNode;
  path: ReactNode;
  size: ReactNode;
}) {
  return (
    <div className="gm-toast-row" data-last={last ? "true" : "false"}>
      <DropCategoryIcon category={category} />
      <div className="gm-toast-row-main">
        <p className="gm-toast-row-title">{name}</p>
        <p className="gm-toast-row-path">→ {path}</p>
      </div>
      <span className="gm-toast-row-size">{size}</span>
    </div>
  );
}

export function DropToastErrorRow({ children }: ChildrenProps) {
  return (
    <div className="gm-toast-error-row">
      <AppIcon icon={X} size="2xs" />
      <span>{children}</span>
    </div>
  );
}

export const dropOpenIcon = FolderOpen;
export const dropImportIcon = Download;
export const dropCloseIcon = X;
