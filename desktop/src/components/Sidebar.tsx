import { Settings, RefreshCw } from "lucide-react";
import {
  LayoutDashboard,
  MessageSquare,
  StickyNote,
  Clipboard,
  KeyRound,
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
import { AppIcon } from "./base/AppIcon";

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
  { id: "vault", icon: KeyRound, labelKey: "nav.vault" },
  { id: "favorites", icon: Star, labelKey: "nav.favorites" },
  { id: "imports", icon: Download, labelKey: "nav.imports" },
  { id: "claude-config", icon: Brain, labelKey: "nav.claudeConfig" },
  { id: "external-files", icon: FileSymlink, labelKey: "nav.externalFiles" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export default function Sidebar({ currentPage, onNavigate, focused, syncing, syncMsg, syncFailed, onSync }: SidebarProps) {
  const { t } = useI18n();
  const { appMeta, updateStatus, checkForUpdates, requestUpdateDetailsOpen } = useAppStore();
  const logoSaveProps = useLongPressImageSave({ src: "/logo.png", fileName: "gitmemo-logo.png" });
  const syncStatus = syncing ? "syncing" : syncMsg ? (syncFailed ? "danger" : "success") : "idle";
  const desktopUpdateAvailable = updateStatus === "available";

  const openVersionDetails = () => {
    if (desktopUpdateAvailable) {
      requestUpdateDetailsOpen();
    } else {
      void checkForUpdates();
    }
    onNavigate("settings");
  };

  return (
    <div className="gm-sidebar">
      {/* Logo */}
      <div className="gm-sidebar-brand">
        <div className="gm-sidebar-brand-main">
          <img src="/logo.png" alt="GitMemo" {...logoSaveProps} className="gm-sidebar-logo" style={logoSaveProps.style} />
          <div className="gm-sidebar-brand-copy">
            <span className="gm-sidebar-brand-title">GitMemo</span>
            <span className="gm-sidebar-brand-subtitle">Local-First Knowledge Base</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="gm-sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="gm-sidebar-nav-item"
              data-active={active ? "true" : "false"}
              data-focused={active && focused ? "true" : "false"}
            >
              <AppIcon icon={Icon} size="sm" className="gm-sidebar-nav-icon" />
              <span className="gm-sidebar-nav-label">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {/* Sync button + version */}
      <div className="gm-sidebar-footer">
        <button
          onClick={onSync}
          disabled={syncing}
          className="gm-sidebar-sync-button"
          data-status={syncStatus}
        >
          <AppIcon icon={RefreshCw} size="xs" spin={syncing} />
          {syncing ? t("sidebar.syncing") : syncMsg ? syncMsg : t("sidebar.syncToGit")}
        </button>
        <button
          className="gm-sidebar-version"
          type="button"
          onClick={openVersionDetails}
          title={desktopUpdateAvailable ? t("settings.updateAvailable", "") : t("settings.checkUpdate")}
        >
          <span>GitMemo Desktop v{appMeta?.version ?? "—"}</span>
          {desktopUpdateAvailable && <span className="gm-version-update-dot" aria-label={t("settings.updateAvailableDot")} />}
        </button>
        <p className="gm-sidebar-release-time">
          {appMeta?.release_time || t("settings.releaseTimeUnknown")}
        </p>
      </div>
    </div>
  );
}
