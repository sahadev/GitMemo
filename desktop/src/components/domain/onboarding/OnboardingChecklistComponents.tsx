import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronRight, PartyPopper, X } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";

interface ChildrenProps {
  children?: ReactNode;
}

export function OnboardingCard({ done, children }: ChildrenProps & { done: boolean }) {
  return <div className="gm-onboarding-card" data-done={done ? "true" : "false"}>{children}</div>;
}

export function OnboardingHeader({ done, children }: ChildrenProps & { done: boolean }) {
  return <div className="gm-onboarding-header" data-done={done ? "true" : "false"}>{children}</div>;
}

export function OnboardingTitleRow({
  done,
  title,
  count,
}: {
  done: boolean;
  title: ReactNode;
  count?: ReactNode;
}) {
  return (
    <div className="gm-onboarding-title-row">
      {done ? <AppIcon icon={PartyPopper} size="md" tone="success" /> : null}
      <h3 className="gm-onboarding-title">{title}</h3>
      {!done && count ? <span className="gm-onboarding-count">{count}</span> : null}
    </div>
  );
}

export function OnboardingDismissButton({
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type={type} className="gm-onboarding-dismiss" {...props}>
      <AppIcon icon={X} size="2xs" />
      {children}
    </button>
  );
}

export function OnboardingProgress({ value }: { value: number }) {
  return <progress className="gm-onboarding-progress" value={value} max={100} />;
}

export function OnboardingList({ children }: ChildrenProps) {
  return <div className="gm-onboarding-list">{children}</div>;
}

export function OnboardingItemRow({ done, children }: ChildrenProps & { done: boolean }) {
  return <div className="gm-onboarding-item" data-done={done ? "true" : "false"}>{children}</div>;
}

export function OnboardingCheck({ done }: { done: boolean }) {
  return (
    <div className="gm-onboarding-check" data-done={done ? "true" : "false"}>
      {done ? <AppIcon icon={Check} size="2xs" tone="success" /> : null}
    </div>
  );
}

export function OnboardingItemIcon({ icon, tone }: { icon: LucideIcon; tone: AppIconTone }) {
  return <AppIcon icon={icon} size="sm" tone={tone} className="gm-onboarding-item-icon" />;
}

export function OnboardingItemCopy({
  done,
  title,
  description,
}: {
  done: boolean;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className="gm-onboarding-item-copy">
      <div className="gm-onboarding-item-title" data-done={done ? "true" : "false"}>{title}</div>
      <div className="gm-onboarding-item-description">{description}</div>
    </div>
  );
}

export function OnboardingActionButton({
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type={type} className="gm-onboarding-action" {...props}>
      {children}
      <AppIcon icon={ChevronRight} size="2xs" />
    </button>
  );
}
