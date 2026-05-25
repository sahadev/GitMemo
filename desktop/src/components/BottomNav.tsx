import {
  LayoutDashboard,
  StickyNote,
  Settings,
  Clipboard,
  MessageSquare,
  Download,
} from "lucide-react";
import type { Page } from "../App";
import { useI18n } from "../hooks/useI18n";

const mobileNavItems: { id: Page; icon: typeof LayoutDashboard; labelKey: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { id: "ai-records", icon: MessageSquare, labelKey: "nav.aiRecords" },
  { id: "notes", icon: StickyNote, labelKey: "nav.notes" },
  { id: "clipboard", icon: Clipboard, labelKey: "nav.clipboard" },
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
    <nav style={{
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      borderTop: "1px solid var(--border)",
      background: "var(--bg-card)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      flexShrink: 0,
      width: "100%",
      boxSizing: "border-box",
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
              padding: "9px 2px 7px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              minHeight: 48,
              justifyContent: "center",
            }}
          >
            <Icon size={18} />
            <span style={{ fontSize: 9, fontWeight: active ? 600 : 400, lineHeight: 1.1 }}>
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
