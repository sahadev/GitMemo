import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LayoutDashboard,
  MessageSquare,
  StickyNote,
  Clipboard,
  Search,
  Settings,
  RefreshCw,
  Lightbulb,
  Brain,
} from "lucide-react";
import type { Page } from "../App";
import { useI18n } from "../hooks/useI18n";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  focused: boolean;
  syncing: boolean;
  syncMsg: string;
  syncFailed: boolean;
  onSync: () => void;
}

interface AppMeta {
  version: string;
  release_time: string;
}

const navItems: { id: Page; icon: typeof LayoutDashboard; labelKey: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { id: "search", icon: Search, labelKey: "nav.search" },
  { id: "conversations", icon: MessageSquare, labelKey: "nav.conversations" },
  { id: "notes", icon: StickyNote, labelKey: "nav.notes" },
  { id: "clipboard", icon: Clipboard, labelKey: "nav.clipboard" },
  { id: "plans", icon: Lightbulb, labelKey: "nav.plans" },
  { id: "claude-config", icon: Brain, labelKey: "nav.claudeConfig" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export default function Sidebar({ currentPage, onNavigate, focused, syncing, syncMsg, syncFailed, onSync }: SidebarProps) {
  const { t } = useI18n();
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null);

  useEffect(() => {
    invoke<AppMeta>("get_app_meta").then(setAppMeta).catch(() => {});
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 200,
        borderRight: "1px solid var(--border)",
        height: "100%",
        background: "var(--bg-card)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="GitMemo" style={{ width: 22, height: 22, borderRadius: 4 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>GitMemo</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
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
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                fontSize: 13,
                background: active ? "var(--bg-hover)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
                border: "none",
                borderLeft: active && focused ? "3px solid var(--accent)" : "3px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <Icon size={16} />
              {t(item.labelKey)}
            </button>
          );
        })}
      </nav>

      {/* Sync button + version */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "8px 0",
            borderRadius: 6,
            fontSize: 12,
            background: syncing
              ? "linear-gradient(90deg, var(--bg-hover) 0%, var(--accent) 50%, var(--bg-hover) 100%)"
              : syncMsg
              ? syncFailed ? "#2d0f0f" : "#0f2d0f"
              : "var(--bg)",
            backgroundSize: syncing ? "200% 100%" : undefined,
            animation: syncing ? "shimmer 1.5s linear infinite" : undefined,
            color: syncing ? "#fff" : syncMsg ? (syncFailed ? "var(--red)" : "var(--green)") : "var(--text-secondary)",
            border: `1px solid ${syncing ? "transparent" : syncMsg ? (syncFailed ? "#5a2020" : "#205a20") : "var(--border)"}`,
            cursor: syncing ? "default" : "pointer",
            transition: "all 0.3s",
          }}
        >
          <RefreshCw size={13} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
          {syncing ? t("sidebar.syncing") : syncMsg ? syncMsg : t("sidebar.syncToGit")}
        </button>
        <p style={{ fontSize: 10, textAlign: "center", marginTop: 8, color: "var(--text-secondary)", opacity: 0.6 }}>
          GitMemo Desktop v{appMeta?.version ?? "—"}
        </p>
        <p style={{ fontSize: 9, textAlign: "center", marginTop: 4, color: "var(--text-secondary)", opacity: 0.5 }}>
          {appMeta?.release_time || t("settings.releaseTimeUnknown")}
        </p>
      </div>
    </div>
  );
}
