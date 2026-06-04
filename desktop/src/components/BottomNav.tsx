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
    <nav className="gm-app-surface" style={{
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      borderTop: "1px solid var(--border)",
      background: "color-mix(in srgb, var(--bg-card) 92%, var(--bg) 8%)",
      padding: "6px 6px calc(6px + env(safe-area-inset-bottom, 0px))",
      flexShrink: 0,
      width: "100%",
      boxSizing: "border-box",
      boxShadow: "var(--gm-shadow-bottom)",
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
              gap: 3,
              padding: "var(--gm-space-4) var(--gm-space-1) var(--gm-space-3)",
              background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
              border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 36%, var(--border))" : "transparent"}`,
              borderRadius: "var(--gm-radius-md)",
              cursor: "pointer",
              color: active ? "var(--text)" : "var(--text-secondary)",
              minHeight: 50,
              justifyContent: "center",
              minWidth: 0,
            }}
          >
            <Icon size={18} style={{ color: active ? "var(--accent)" : "currentColor", flexShrink: 0 }} />
            <span style={{ fontSize: "var(--gm-font-xs)", fontWeight: active ? 700 : 500, lineHeight: 1.1, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
