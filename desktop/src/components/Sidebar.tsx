import { Settings, RefreshCw } from "lucide-react";
import {
  LayoutDashboard,
  MessageSquare,
  StickyNote,
  Clipboard,
  Search,
  Star,
  Brain,
  FileSymlink,
  Download,
} from "lucide-react";
import type { Page } from "../App";
import { useI18n } from "../hooks/useI18n";
import { useAppStore } from "../hooks/useAppStore";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  focused: boolean;
  syncing: boolean;
  syncMsg: string;
  syncFailed: boolean;
  onSync: () => void;
}

const navItems: { id: Page; icon: typeof LayoutDashboard; labelKey: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { id: "search", icon: Search, labelKey: "nav.search" },
  { id: "ai-records", icon: MessageSquare, labelKey: "nav.aiRecords" },
  { id: "notes", icon: StickyNote, labelKey: "nav.notes" },
  { id: "clipboard", icon: Clipboard, labelKey: "nav.clipboard" },
  { id: "favorites", icon: Star, labelKey: "nav.favorites" },
  { id: "imports", icon: Download, labelKey: "nav.imports" },
  { id: "claude-config", icon: Brain, labelKey: "nav.claudeConfig" },
  { id: "external-files", icon: FileSymlink, labelKey: "nav.externalFiles" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export default function Sidebar({ currentPage, onNavigate, focused, syncing, syncMsg, syncFailed, onSync }: SidebarProps) {
  const { t } = useI18n();
  const { appMeta } = useAppStore();
  const logoSaveProps = useLongPressImageSave({ src: "/logo.png", fileName: "gitmemo-logo.png" });

  return (
    <div
      className="gm-app-surface"
      style={{
        display: "flex",
        flexDirection: "column",
        width: 216,
        borderRight: "1px solid var(--border)",
        height: "100%",
        background: "color-mix(in srgb, var(--bg-card) 90%, var(--bg) 10%)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 62,
          padding: "var(--gm-space-6) var(--gm-space-8)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)", minWidth: 0 }}>
          <img src="/logo.png" alt="GitMemo" {...logoSaveProps} style={{ width: "var(--gm-icon-result)", height: "var(--gm-icon-result)", borderRadius: "var(--gm-radius-md)", ...logoSaveProps.style }} />
          <div style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: "var(--gm-font-md)", lineHeight: "var(--gm-leading-tight)" }}>GitMemo</span>
            <span style={{ display: "block", color: "var(--text-secondary)", fontSize: "var(--gm-font-2xs)", marginTop: "var(--gm-space-1)" }}>local Git memory</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "var(--gm-nav-stack-gap)", flex: 1, padding: "var(--gm-space-5) var(--gm-space-5) var(--gm-space-4)", overflowY: "auto" }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--gm-nav-item-gap)",
                width: "100%",
                minHeight: "var(--gm-control-height-lg)",
                padding: "var(--gm-nav-item-pad-y) var(--gm-nav-item-pad-x)",
                fontSize: "var(--gm-font-sm)",
                background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                color: active ? "var(--text)" : "var(--text-secondary)",
                fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 44%, var(--border))" : "transparent"}`,
                borderLeft: active && focused ? "3px solid var(--accent)" : "3px solid transparent",
                borderRadius: "var(--gm-radius-md)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <Icon size={16} style={{ color: active ? "var(--accent)" : "currentColor", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {/* Sync button + version */}
      <div style={{ padding: "var(--gm-card-header-gap)", borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--gm-icon-text-gap)",
            width: "100%",
            minHeight: "var(--gm-control-height-lg)",
            padding: "var(--gm-control-pad-y-lg) var(--gm-control-pad-x)",
            borderRadius: "var(--gm-radius-md)",
            fontSize: "var(--gm-font-xs)",
            background: syncing
              ? "linear-gradient(90deg, var(--bg-hover) 0%, var(--accent) 50%, var(--bg-hover) 100%)"
              : syncMsg
              ? syncFailed ? "var(--bg-danger)" : "var(--bg-success)"
              : "var(--bg)",
            backgroundSize: syncing ? "200% 100%" : undefined,
            animation: syncing ? "shimmer 1.5s linear infinite" : undefined,
            color: syncing ? "var(--gm-color-on-accent)" : syncMsg ? (syncFailed ? "var(--red)" : "var(--green)") : "var(--text-secondary)",
            border: `1px solid ${syncing ? "transparent" : syncMsg ? (syncFailed ? "var(--red)" : "var(--green)") : "var(--border)"}`,
            cursor: syncing ? "default" : "pointer",
            transition: "all 0.3s",
            fontWeight: 700,
          }}
        >
          <RefreshCw size={14} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
          {syncing ? t("sidebar.syncing") : syncMsg ? syncMsg : t("sidebar.syncToGit")}
        </button>
        <p style={{ fontSize: "var(--gm-font-2xs)", textAlign: "center", marginTop: "var(--gm-space-4)", color: "var(--text-secondary)", opacity: 0.6 }}>
          GitMemo Desktop v{appMeta?.version ?? "—"}
        </p>
        <p style={{ fontSize: "var(--gm-font-2xs)", textAlign: "center", marginTop: "var(--gm-space-2)", color: "var(--text-secondary)", opacity: 0.5 }}>
          {appMeta?.release_time || t("settings.releaseTimeUnknown")}
        </p>
      </div>
    </div>
  );
}
