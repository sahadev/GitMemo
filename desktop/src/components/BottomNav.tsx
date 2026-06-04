import {
  LayoutDashboard,
  StickyNote,
  Settings,
  Clipboard,
  MessageSquare,
  Download,
  Star,
} from "lucide-react";
import type { Page } from "../App";
import { useI18n } from "../hooks/useI18n";
import { AppIcon } from "./base/AppIcon";

const mobileNavItems: { id: Page; icon: typeof LayoutDashboard; labelKey: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { id: "ai-records", icon: MessageSquare, labelKey: "nav.aiRecords" },
  { id: "notes", icon: StickyNote, labelKey: "nav.notes" },
  { id: "clipboard", icon: Clipboard, labelKey: "nav.clipboard" },
  { id: "favorites", icon: Star, labelKey: "nav.favorites" },
  { id: "imports", icon: Download, labelKey: "nav.imports" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

interface BottomNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  const { t } = useI18n();

  return (
    <nav className="gm-bottom-nav">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const active = currentPage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="gm-bottom-nav-item"
            data-active={active ? "true" : "false"}
          >
            <AppIcon icon={Icon} size="md" />
            <span className="gm-bottom-nav-label">{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
