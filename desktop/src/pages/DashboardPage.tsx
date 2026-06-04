import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { useAppStore, type AiRecordsTab, type NotesTab } from "../hooks/useAppStore";
import { useToast } from "../hooks/useToast";
import { relativeTime, formatAbsoluteTime } from "../utils/time";
import { Loading } from "../components/Loading";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { usePlatformFlags } from "../hooks/usePlatform";
import { MOBILE_DASHBOARD_BOTTOM_PADDING } from "../utils/mobileLayout";
import {
  MessageSquare, BookOpen, FileText, Clipboard,
  HardDrive, GitBranch, GitCommit, RefreshCw, Zap, FolderOpen, Terminal, Lightbulb,
  Activity, Circle, Search, Settings as SettingsIcon, Copy, X,
} from "lucide-react";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import { CLI_INSTALL_COMMAND } from "../utils/cliInstall";

interface AppStats {
  conversations: number;
  manuals: number;
  scratch_notes: number;
  clips: number;
  plans: number;
  tracked_files?: number;
  total_size_kb: number;
  repository_size_kb?: number;
}

interface RecentItem {
  name: string;
  path: string;
  category: string;
  modified: string;
  modified_ts: number;
}

import type { Page } from "../App";
import { commitBrowseUrl } from "../utils/gitRemoteWeb";

const categoryConfig: Record<string, { icon: typeof MessageSquare; color: string; page: Page; notesTab?: NotesTab; aiRecordsTab?: AiRecordsTab }> = {
  conversation: { icon: MessageSquare, color: "var(--accent)", page: "ai-records", aiRecordsTab: "conversations" },
  manual: { icon: BookOpen, color: "var(--yellow)", page: "notes", notesTab: "manual" },
  scratch: { icon: FileText, color: "var(--purple)", page: "notes", notesTab: "scratch" },
  clip: { icon: Clipboard, color: "var(--pink)", page: "clipboard" },
  plan: { icon: Lightbulb, color: "var(--yellow)", page: "ai-records", aiRecordsTab: "plans" },
};

const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";
const CLI_CARD_DISMISSED_KEY = "gitmemo-dashboard-cli-card-dismissed";
const mobileContentCategories = new Set(["conversation", "manual", "scratch", "clip", "plan"]);

const formatSize = (sizeKb: number) => (
  sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb.toFixed(1)} KB`
);

interface DashboardCache {
  stats: AppStats | null;
  recent: RecentItem[];
}

function loadCache(): DashboardCache | null {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch { return null; }
}

function saveCache(c: DashboardCache) {
  try { sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(c)); } catch {}
}

function loadCliCardDismissed() {
  try { return localStorage.getItem(CLI_CARD_DISMISSED_KEY) === "true"; } catch { return false; }
}

export default function DashboardPage({ onNavigate, active = false }: { onNavigate?: (page: Page) => void; active?: boolean }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { isMobile, isDesktop } = usePlatformFlags();
  const { isSyncing, isSuccess, isFailed, message: syncMessage, gitStatus, refreshGitStatus, triggerSync } = useSync();
  const { clipboardStatus: clipStatus, claudeEnabled, cursorEnabled, cliStatus, setNotesTab, setAiRecordsTab, setPendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const navigateTo = useCallback((page: Page, notesTab?: NotesTab, aiRecordsTab?: AiRecordsTab) => {
    if (page === "notes" && notesTab) setNotesTab(notesTab);
    if (page === "ai-records" && aiRecordsTab) setAiRecordsTab(aiRecordsTab);
    onNavigate?.(page);
  }, [onNavigate, setAiRecordsTab, setNotesTab]);

  const openRecord = useCallback((item: RecentItem) => {
    if (!isDesktop && !mobileContentCategories.has(item.category)) return;
    const cfg = categoryConfig[item.category] || categoryConfig.scratch;
    if (cfg.page === "notes" && cfg.notesTab) setNotesTab(cfg.notesTab);
    if (cfg.page === "ai-records" && cfg.aiRecordsTab) setAiRecordsTab(cfg.aiRecordsTab);
    setPendingOpenPath(item.path);
    onNavigate?.(cfg.page);
  }, [isDesktop, onNavigate, setAiRecordsTab, setNotesTab, setPendingOpenPath]);


  const cached = loadCache();
  const [stats, setStats] = useState<AppStats | null>(cached?.stats ?? null);
  const [recent, setRecent] = useState<RecentItem[]>(cached?.recent ?? []);
  const [error, setError] = useState("");
  const [reviewItem, setReviewItem] = useState<RecentItem | null>(null);
  const [reviewPreview, setReviewPreview] = useState("");
  const [cliCardDismissed, setCliCardDismissed] = useState(loadCliCardDismissed);

  // Derived state
  const editorConfigured = isDesktop && (claudeEnabled || cursorEnabled);
  const cliNeedsAttention = !cliStatus?.installed || (cliStatus.installed && !cliStatus.version_matches);
  const showCliCapabilityCard = isDesktop && !cliCardDismissed && cliNeedsAttention;
  const cliStatusText = !cliStatus
    ? t("dashboard.cliCardChecking")
    : cliStatus.installed
      ? cliStatus.version_matches
        ? t("dashboard.cliCardInstalled", cliStatus.version || cliStatus.recommended_version)
        : t("dashboard.cliCardUpgrade", cliStatus.version || "?", cliStatus.recommended_version)
      : t("dashboard.cliCardNotInstalled");
  const watchedFolders = useMemo(() => ["conversations", "notes", "clips", "plans"], []);
  const lastCommitBrowseUrl = useMemo(
    () => commitBrowseUrl(gitStatus?.git_remote, gitStatus?.last_commit_id),
    [gitStatus?.git_remote, gitStatus?.last_commit_id],
  );
  const copyCliInstallCommand = useCallback(async () => {
    try {
      await writeText(CLI_INSTALL_COMMAND);
      showToast(t("dashboard.cliCardCommandCopied"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [showToast, t]);
  const dismissCliCard = useCallback(() => {
    setCliCardDismissed(true);
    try { localStorage.setItem(CLI_CARD_DISMISSED_KEY, "true"); } catch {}
  }, []);

  // Load content stats only (no git status — that comes from global useSync)
  const loadData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        invoke<AppStats>("get_stats"),
        invoke<RecentItem[]>("get_recent_activity").catch(() => []),
      ]);
      setStats(s);
      setRecent(r);
      saveCache({ stats: s, recent: r });
      // Load review item
      invoke<RecentItem | null>("get_review_item").then(item => {
        setReviewItem(item);
        if (item) {
          invoke<string>("read_file", { filePath: item.path })
            .then(content => {
              const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
              setReviewPreview(body.slice(0, 200));
            })
            .catch(() => {});
        }
      }).catch(() => {});
    } catch (e) {
      setError(`${e}`);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!active) return;
    loadData();
    void refreshGitStatus();
  }, [active, loadData, refreshGitStatus]);

  // Refresh content stats when sync completes (state-driven)
  useEffect(() => {
    if (isSuccess || isFailed) {
      loadData();
    }
  }, [isSuccess, isFailed, loadData]);
  useFileWatcher(watchedFolders, loadData);

  const handleRefresh = useCallback(() => {
    loadData();
    void refreshGitStatus();
  }, [loadData, refreshGitStatus]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flex: 1, minWidth: 0, minHeight: 0 }}>
        <div style={{ textAlign: "center", padding: "0 var(--gm-space-16)" }}>
          <GitBranch size={48} style={{ color: "var(--gm-color-muted-icon)", margin: "0 auto var(--gm-space-8)" }} />
          <p style={{ fontSize: "var(--gm-font-md)", color: "var(--red)", marginBottom: "var(--gm-space-4)" }}>{error}</p>
          <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>
            {t("dashboard.initHint")}
          </p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <Loading text={t("dashboard.loading")} />;
  }

  const contentFileCount = stats.conversations + stats.manuals + stats.scratch_notes + stats.clips + stats.plans;
  const displayedFileCount = stats.tracked_files ?? contentFileCount;
  const displayedRepoSizeKb = stats.repository_size_kb ?? stats.total_size_kb;
  const displayedRecent = isDesktop
    ? recent
    : recent.filter((item) => mobileContentCategories.has(item.category));
  const showReviewItem = !!reviewItem && (isDesktop || mobileContentCategories.has(reviewItem.category));

  const statCards: { icon: typeof MessageSquare; label: string; value: number | string; color: string; page?: Page; notesTab?: NotesTab; aiRecordsTab?: AiRecordsTab }[] = [
    { icon: MessageSquare, label: t("dashboard.conversations"), value: stats.conversations, color: "var(--accent)", page: "ai-records", aiRecordsTab: "conversations" },
    { icon: BookOpen, label: t("dashboard.manuals"), value: stats.manuals, color: "var(--yellow)", page: "notes", notesTab: "manual" },
    { icon: FileText, label: t("dashboard.scratchNotes"), value: stats.scratch_notes, color: "var(--purple)", page: "notes", notesTab: "scratch" },
    { icon: Clipboard, label: t("dashboard.clips"), value: stats.clips, color: "var(--pink)", page: "clipboard" },
    { icon: Lightbulb, label: t("dashboard.plans"), value: stats.plans, color: "var(--yellow)", page: "ai-records", aiRecordsTab: "plans" },
  ];

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--gm-radius-md)",
    padding: isMobile ? "var(--gm-card-pad-mobile)" : "var(--gm-card-pad-y) var(--gm-card-pad-x)",
  };

  const syncStatus = (() => {
    if (!gitStatus) return { text: t("dashboard.loading"), color: "var(--text-secondary)" };
    if (gitStatus.behind > 0 && gitStatus.unpushed > 0) {
      return {
        text: t("dashboard.diverged", String(gitStatus.unpushed), String(gitStatus.behind)),
        color: "var(--yellow)",
      };
    }
    if (gitStatus.behind > 0) {
      return {
        text: t("dashboard.behind", String(gitStatus.behind)),
        color: "var(--red)",
      };
    }
    if (gitStatus.unpushed > 0) {
      return {
        text: `${gitStatus.unpushed} ${t("dashboard.unpushed")}`,
        color: "var(--yellow)",
      };
    }
    return {
      text: t("dashboard.synced"),
      color: "var(--green)",
    };
  })();
  const mobileSyncText = isSyncing
    ? t("sidebar.syncing")
    : syncMessage || (gitStatus?.git_remote ? syncStatus.text : t("dashboard.noRemote"));
  const mobileSyncColor = isSyncing
    ? "var(--accent)"
    : syncMessage
      ? (isFailed ? "var(--red)" : "var(--green)")
      : (gitStatus?.git_remote ? syncStatus.color : "var(--text-secondary)");

  return (
    <div className="gm-page gm-page-scroll" style={{
      padding: isMobile
        ? "var(--gm-page-pad-mobile-y) var(--gm-page-pad-mobile-x) 0"
        : "var(--gm-page-pad-y) var(--gm-page-pad-x) var(--gm-page-pad-bottom)",
      overflowY: "auto",
      height: "100%",
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "var(--gm-page-header-height)", marginBottom: "var(--gm-section-gap)" }}>
        <h1 className="gm-page-title">{t("dashboard.title")}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-toolbar-gap)" }}>
          {isMobile && (
            <button
              type="button"
              onClick={() => onNavigate?.("search")}
              title={t("nav.search")}
              className="gm-toolbar-button"
              style={{
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "var(--gm-control-height-lg)",
                minHeight: "var(--gm-control-height-lg)",
              }}
            >
              <Search size="var(--gm-icon-lg)" />
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            className="gm-toolbar-button"
            style={{ padding: 0, display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <RefreshCw size="var(--gm-icon-xs)" />
          </button>
          {isDesktop && clipStatus && (
            <div style={{
              display: "flex", alignItems: "center", gap: "var(--gm-control-gap)",
              padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-pill)",
              background: clipStatus.watching ? "var(--bg-success)" : "var(--bg-hover)",
              cursor: "pointer",
            }} onClick={() => onNavigate?.("clipboard")}>
              <Circle
                size={8}
                fill={clipStatus.watching ? "var(--green)" : "var(--text-secondary)"}
                style={{ color: clipStatus.watching ? "var(--green)" : "var(--text-secondary)" }}
              />
              <span style={{
                fontSize: "var(--gm-font-xs)", fontWeight: 500,
                color: clipStatus.watching ? "var(--green)" : "var(--text-secondary)",
              }}>
                {clipStatus.watching ? t("dashboard.clipboardActive") : t("dashboard.clipboardInactive")}
              </span>
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <div style={{
          ...cardStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--gm-card-content-gap)",
          marginBottom: "var(--gm-section-gap)",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-space-2)" }}>
              <RefreshCw size={14} style={{ color: mobileSyncColor, animation: isSyncing ? "spin 1s linear infinite" : undefined }} />
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("dashboard.syncStatus")}</span>
            </div>
            <p style={{
              fontSize: "var(--gm-font-sm)",
              fontWeight: 700,
              color: mobileSyncColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}>
              {mobileSyncText}
            </p>
          </div>
          <button
            type="button"
            disabled={!gitStatus?.git_remote || isSyncing}
            onClick={() => void triggerSync()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--gm-control-gap)",
              minHeight: "var(--gm-control-height-xl)",
              padding: "var(--gm-control-pad-y-lg) var(--gm-control-pad-x-lg)",
              borderRadius: "var(--gm-radius-md)",
              border: `1px solid ${gitStatus?.git_remote ? "var(--accent)" : "var(--border)"}`,
              background: gitStatus?.git_remote ? "var(--accent)" : "var(--bg-hover)",
              color: gitStatus?.git_remote ? "var(--gm-color-on-accent)" : "var(--text-secondary)",
              cursor: !gitStatus?.git_remote || isSyncing ? "default" : "pointer",
              opacity: isSyncing ? 0.7 : 1,
              flexShrink: 0,
              fontSize: "var(--gm-font-xs)",
              fontWeight: 600,
            }}
          >
            <RefreshCw size={14} style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined} />
            {gitStatus?.git_remote ? t("sidebar.syncToGit") : t("dashboard.noRemote")}
          </button>
        </div>
      )}

      {/* Onboarding Checklist */}
      {isDesktop && (
        <OnboardingChecklist
          onNavigate={(page) => onNavigate?.(page)}
          hasConversations={stats.conversations > 0}
          clipboardActive={clipStatus?.watching ?? false}
          editorConfigured={editorConfigured}
        />
      )}

      {showCliCapabilityCard && (
        <div style={{
          ...cardStyle,
          display: "flex",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: "var(--gm-card-content-gap)",
          marginBottom: "var(--gm-section-gap)",
          borderColor: "var(--gm-accent-border)",
          background: "var(--gm-accent-muted)",
          flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--gm-card-header-gap)", minWidth: 0 }}>
            <div style={{
              width: "var(--gm-control-height-md)",
              height: "var(--gm-control-height-md)",
              borderRadius: "var(--gm-radius-md)",
              background: "var(--gm-accent-soft)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <Terminal size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", flexWrap: "wrap" }}>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 700 }}>{t("dashboard.cliCardTitle")}</p>
                <span style={{
                  fontSize: "var(--gm-font-2xs)",
                  color: cliStatus?.installed && cliStatus.version_matches ? "var(--green)" : "var(--yellow)",
                  background: cliStatus?.installed && cliStatus.version_matches ? "var(--bg-success)" : "var(--gm-warning-soft)",
                  border: `1px solid ${cliStatus?.installed && cliStatus.version_matches ? "var(--green)" : "var(--gm-warning-border)"}`,
                  borderRadius: "var(--gm-radius-pill)",
                  padding: "var(--gm-space-1) var(--gm-space-3)",
                  fontWeight: 600,
                }}>
                  {cliStatusText}
                </span>
              </div>
              <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-normal)", marginTop: "var(--gm-space-3)", maxWidth: 620 }}>
                {t("dashboard.cliCardDesc")}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-toolbar-gap)", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => void copyCliInstallCommand()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--gm-control-gap)",
                padding: "var(--gm-control-pad-y-lg) var(--gm-control-pad-x-lg)",
                borderRadius: "var(--gm-radius-md)",
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--gm-color-on-accent)",
                cursor: "pointer",
                fontSize: "var(--gm-font-xs)",
                fontWeight: 600,
              }}
            >
              <Copy size={14} />
              {t("dashboard.cliCardCopyInstallCommand")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("settings")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "var(--gm-control-height-md)",
                height: "var(--gm-control-height-md)",
                borderRadius: "var(--gm-radius-md)",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              title={t("nav.settings")}
            >
              <SettingsIcon size={14} />
            </button>
            <button
              type="button"
              onClick={dismissCliCard}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "var(--gm-control-height-md)",
                height: "var(--gm-control-height-md)",
                borderRadius: "var(--gm-radius-md)",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              title={t("dashboard.cliCardDismiss")}
              aria-label={t("dashboard.cliCardDismiss")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: "var(--gm-section-gap)", marginBottom: "var(--gm-section-gap)" }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              onClick={() => card.page && navigateTo(card.page, card.notesTab, card.aiRecordsTab)}
              style={{
                ...cardStyle,
                cursor: card.page ? "pointer" : "default",
                transition: "background 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-card-header-gap)" }}>
                <Icon size={18} style={{ color: card.color, flexShrink: 0 }} />
                <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>{card.label}</span>
              </div>
              <p style={{ fontSize: "var(--gm-font-2xl)", fontWeight: 700, letterSpacing: 0 }}>{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Empty state guide */}
      {contentFileCount === 0 && displayedRecent.length === 0 && (
        <div style={{
          padding: "var(--gm-section-gap-lg) var(--gm-space-12)", borderRadius: "var(--gm-radius-md)", marginBottom: "var(--gm-section-gap)",
          border: "1px dashed color-mix(in srgb, var(--accent) 44%, var(--border))",
          background: "color-mix(in srgb, var(--accent) 7%, var(--bg-card))",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, marginBottom: "var(--gm-space-3)" }}>{t("dashboard.emptyGuideTitle")}</p>
          <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-relaxed)" }}>
            {isMobile ? t("dashboard.emptyGuideMobileDesc") : t("dashboard.emptyGuideDesc")}
          </p>
        </div>
      )}

      {/* Git Info — only when remote is configured */}
      {gitStatus?.git_remote && (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? "var(--gm-card-header-gap)" : "var(--gm-section-gap)", marginBottom: "var(--gm-section-gap)" }}>
        {/* Sync Status */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-card-header-gap)" }}>
            <RefreshCw size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("dashboard.syncStatus")}</span>
          </div>
          <p style={{
            fontSize: isMobile ? "var(--gm-font-sm)" : "var(--gm-font-lg)",
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            <span style={{ color: syncStatus.color }}>{syncStatus.text}</span>
          </p>
          <p style={{ fontSize: "var(--gm-font-2xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {formatAbsoluteTime(gitStatus?.checked_at || gitStatus?.last_commit_time || "")}
          </p>
        </div>

        {/* Last Commit */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-card-header-gap)" }}>
            <GitCommit size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("dashboard.lastCommit")}</span>
          </div>
          {lastCommitBrowseUrl && gitStatus?.last_commit_id ? (
            <button
              type="button"
              title={t("dashboard.openCommitPage")}
              onClick={() => void openUrl(lastCommitBrowseUrl)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: 0, margin: 0,
                fontSize: isMobile ? "var(--gm-font-sm)" : "var(--gm-font-lg)", fontWeight: 700, fontFamily: "ui-monospace, monospace",
                color: "var(--accent)", background: "none", border: "none", cursor: "pointer",
                textDecoration: "underline", textDecorationColor: "transparent",
                transition: "text-decoration-color 0.15s",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = "transparent"; }}
            >
              {gitStatus.last_commit_id}
            </button>
          ) : (
            <p style={{
              fontSize: isMobile ? "var(--gm-font-sm)" : "var(--gm-font-lg)",
              fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
              color: "var(--accent)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {gitStatus?.last_commit_id || "—"}
            </p>
          )}
          {gitStatus?.last_commit_time && (
            <p style={{ fontSize: "var(--gm-font-2xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {formatAbsoluteTime(gitStatus?.last_commit_time || "")}
            </p>
          )}
        </div>
      </div>
      )}

      {/* Recent Activity — full width */}
      <div style={{ ...cardStyle, marginBottom: "var(--gm-section-gap)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-card-header-gap)" }}>
            <Activity size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.recentActivity")}</span>
          </div>
          {displayedRecent.length === 0 ? (
            <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", padding: "var(--gm-card-header-gap) 0" }}>
              {t("dashboard.noActivity")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-nav-stack-gap)" }}>
              {displayedRecent.map((item) => {
                const cfg = categoryConfig[item.category] || categoryConfig.scratch;
                const Icon = cfg.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => openRecord(item)}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--gm-row-gap)",
                      minHeight: isMobile ? 44 : undefined,
                      padding: isMobile ? "var(--gm-row-pad-y-comfort) 0" : "var(--gm-row-pad-y) 0", borderRadius: "var(--gm-radius-md)",
                      background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left",
                      color: "var(--text)", width: "100%",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.background = "transparent"; }}
                  >
                    <Icon size={isMobile ? 14 : 12} style={{ color: cfg.color, flexShrink: 0 }} />
                    <span style={{
                      flex: 1, fontSize: isMobile ? "var(--gm-font-sm)" : "var(--gm-font-xs)", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: "var(--gm-font-2xs)", color: "var(--text-secondary)", flexShrink: 0 }}>
                      {relativeTime(item.modified, t)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </div>

      {/* Today's Review */}
      {showReviewItem && reviewItem && (
        <div style={{ ...cardStyle, marginBottom: "var(--gm-section-gap)", cursor: "pointer" }}
          onClick={() => openRecord(reviewItem)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-card-header-gap)" }}>
            <RefreshCw size={14} style={{ color: "var(--yellow)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.todayReview")}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                invoke<RecentItem | null>("get_review_item").then(item => {
                  setReviewItem(item);
                  if (item) {
                    invoke<string>("read_file", { filePath: item.path })
                      .then(content => {
                        const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
                        setReviewPreview(body.slice(0, 200));
                      })
                      .catch(() => {});
                  }
                }).catch(() => {});
              }}
              style={{
                marginLeft: "auto", padding: "var(--gm-space-1) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-sm)",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
              }}
            >
              {t("dashboard.shuffle")}
            </button>
          </div>
          <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, marginBottom: "var(--gm-space-2)" }}>{reviewItem.name}</p>
          {reviewPreview && (
            <p style={{
              fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-normal)",
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {reviewPreview}
            </p>
          )}
          <p style={{ fontSize: "var(--gm-font-2xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-3)" }}>
            {relativeTime(reviewItem.modified, t)}
          </p>
        </div>
      )}

      {/* Quick Info */}
      <div style={{
        padding: "var(--gm-card-pad-y) var(--gm-card-pad-x)", borderRadius: "var(--gm-radius-md)",
        border: "1px dashed var(--border)", background: "transparent",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-card-header-gap)" }}>
          <Zap size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.quickInfo")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "var(--gm-card-header-gap)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
            <FolderOpen size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {gitStatus?.sync_dir}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
            <GitBranch size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={gitStatus?.git_remote}>
              {gitStatus?.git_remote || t("dashboard.noRemote")}
            </span>
          </div>
          {isDesktop && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
              <Terminal size={12} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                CLI: gitmemo --help
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
            <MessageSquare size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
              {t("dashboard.totalFiles", String(displayedFileCount))}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
            <HardDrive size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
              {formatSize(displayedRepoSizeKb)}
            </span>
          </div>
        </div>
      </div>
      {isMobile && <div aria-hidden="true" style={{ height: MOBILE_DASHBOARD_BOTTOM_PADDING, flexShrink: 0 }} />}
    </div>
  );
}
