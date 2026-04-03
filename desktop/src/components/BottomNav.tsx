import {
  LayoutDashboard,
  Search,
  MessageSquare,
  StickyNote,
  Settings,
} from "lucide-react";
import type { Page } from "../App";
import { useI18n } from "../hooks/useI18n";

const mobileNavItems: { id: Page; icon: typeof LayoutDashboard; labelKey: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { id: "search", icon: Search, labelKey: "nav.search" },
  { id: "conversations", icon: MessageSquare, labelKey: "nav.conversations" },
  { id: "notes", icon: StickyNote, labelKey: "nav.notes" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

interface BottomNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  const { t } = useI18n();

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      borderTop: "1px solid var(--border)",
      background: "var(--bg-card)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      flexShrink: 0,
    }}>
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const active = currentPage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "10px 4px 8px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              minHeight: 48,
              justifyContent: "center",
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
