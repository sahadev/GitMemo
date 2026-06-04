import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";

interface SearchResultCardProps {
  icon: LucideIcon;
  iconTone: AppIconTone;
  title: ReactNode;
  time: ReactNode;
  snippet?: ReactNode;
  onClick: () => void;
}

export function SearchResultCard({
  icon,
  iconTone,
  title,
  time,
  snippet,
  onClick,
}: SearchResultCardProps) {
  return (
    <button type="button" className="gm-search-result-card" onClick={onClick}>
      <div className="gm-search-result-head">
        <AppIcon icon={icon} size="xs" tone={iconTone} />
        <span className="gm-search-result-title">{title}</span>
        <span className="gm-search-result-time">{time}</span>
      </div>
      {snippet ? <p className="gm-search-result-snippet">{snippet}</p> : null}
    </button>
  );
}
