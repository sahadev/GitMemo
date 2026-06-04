import { useEffect, useState, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
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
      <div className="gm-center-state">
        <div className="gm-center-state-panel">
          <GitBranch size="var(--gm-icon-hero)" style={{ color: "var(--gm-color-muted-icon)", margin: "0 auto var(--gm-space-8)" }} />
          <p className="gm-state-error-text">{error}</p>
          <p className="gm-state-muted-text">
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
      <div className="gm-dashboard-header">
        <h1 className="gm-page-title">{t("dashboard.title")}</h1>
        <div className="gm-dashboard-actions">
          {isMobile && (
            <button
              type="button"
              onClick={() => onNavigate?.("search")}
              title={t("nav.search")}
              className="gm-toolbar-button"
            >
              <Search size="var(--gm-icon-lg)" />
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            className="gm-toolbar-button"
          >
            <RefreshCw size="var(--gm-icon-xs)" />
          </button>
          {isDesktop && clipStatus && (
            <div className="gm-status-pill" style={{
              background: clipStatus.watching ? "var(--bg-success)" : "var(--gm-color-bg-elevated)",
              borderColor: clipStatus.watching ? "var(--gm-success-border)" : "var(--border)",
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
        <div className="gm-dashboard-card gm-dashboard-mobile-sync">
          <div className="gm-dashboard-mobile-sync-main">
            <div className="gm-dashboard-mobile-sync-head">
              <RefreshCw size={14} style={{ color: mobileSyncColor, animation: isSyncing ? "spin 1s linear infinite" : undefined }} />
              <span className="gm-muted-text">{t("dashboard.syncStatus")}</span>
            </div>
            <p className="gm-dashboard-mobile-sync-value" style={{ color: mobileSyncColor }}>
              {mobileSyncText}
            </p>
          </div>
          <button
            type="button"
            disabled={!gitStatus?.git_remote || isSyncing}
            onClick={() => void triggerSync()}
            className={gitStatus?.git_remote ? "gm-button-primary" : "gm-button-secondary"}
            style={{ cursor: !gitStatus?.git_remote || isSyncing ? "default" : "pointer", opacity: isSyncing ? 0.7 : 1, flexShrink: 0 }}
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
        <div className="gm-dashboard-card gm-dashboard-cli-card">
          <div className="gm-inline-cluster" style={{ alignItems: "flex-start", minWidth: 0 }}>
            <div className="gm-icon-box gm-icon-box-accent">
              <Terminal size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="gm-inline-cluster-wrap">
                <p className="gm-card-title">{t("dashboard.cliCardTitle")}</p>
                <span
                  className="gm-status-badge"
                  style={{
                    color: cliStatus?.installed && cliStatus.version_matches ? "var(--green)" : "var(--yellow)",
                    background: cliStatus?.installed && cliStatus.version_matches ? "var(--bg-success)" : "var(--gm-warning-soft)",
                    borderColor: cliStatus?.installed && cliStatus.version_matches ? "var(--green)" : "var(--gm-warning-border)",
                  }}
                >
                  {cliStatusText}
                </span>
              </div>
              <p className="gm-muted-text" style={{ marginTop: "var(--gm-space-3)", maxWidth: "var(--gm-size-dashboard-cli-desc-max-width)" }}>
                {t("dashboard.cliCardDesc")}
              </p>
            </div>
          </div>
          <div className="gm-dashboard-cli-copy-actions">
            <button
              type="button"
              onClick={() => void copyCliInstallCommand()}
              className="gm-button-primary"
            >
              <Copy size={14} />
              {t("dashboard.cliCardCopyInstallCommand")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("settings")}
              className="gm-icon-button"
              title={t("nav.settings")}
            >
              <SettingsIcon size={14} />
            </button>
            <button
              type="button"
              onClick={dismissCliCard}
              className="gm-icon-button"
              title={t("dashboard.cliCardDismiss")}
              aria-label={t("dashboard.cliCardDismiss")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="gm-dashboard-stat-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              onClick={() => card.page && navigateTo(card.page, card.notesTab, card.aiRecordsTab)}
              className="gm-dashboard-card gm-dashboard-stat-card"
              style={{ "--gm-item-color": card.color, cursor: card.page ? "pointer" : "default" } as CSSProperties}
            >
              <div aria-hidden="true" className="gm-dashboard-stat-rail" />
              <div className="gm-dashboard-stat-head">
                <span className="gm-dashboard-icon-box">
                  <Icon size={16} style={{ color: "var(--gm-item-color)", flexShrink: 0 }} />
                </span>
                <span className="gm-section-title">{card.label}</span>
              </div>
              <p className="gm-dashboard-stat-value">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Empty state guide */}
      {contentFileCount === 0 && displayedRecent.length === 0 && (
        <div className="gm-dashboard-empty-guide">
          <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, marginBottom: "var(--gm-space-3)" }}>{t("dashboard.emptyGuideTitle")}</p>
          <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-relaxed)" }}>
            {isMobile ? t("dashboard.emptyGuideMobileDesc") : t("dashboard.emptyGuideDesc")}
          </p>
        </div>
      )}

      {/* Git Info — only when remote is configured */}
      {gitStatus?.git_remote && (
      <div className="gm-dashboard-git-grid">
        {/* Sync Status */}
        <div className="gm-dashboard-card">
          <div className="gm-card-head">
            <RefreshCw size={14} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-section-title">{t("dashboard.syncStatus")}</span>
          </div>
          <p className="gm-dashboard-value">
            <span style={{ color: syncStatus.color }}>{syncStatus.text}</span>
          </p>
          <p className="gm-dashboard-meta">
            {formatAbsoluteTime(gitStatus?.checked_at || gitStatus?.last_commit_time || "")}
          </p>
        </div>

        {/* Last Commit */}
        <div className="gm-dashboard-card">
          <div className="gm-card-head">
            <GitCommit size={14} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-section-title">{t("dashboard.lastCommit")}</span>
          </div>
          {lastCommitBrowseUrl && gitStatus?.last_commit_id ? (
            <button
              type="button"
              title={t("dashboard.openCommitPage")}
              onClick={() => void openUrl(lastCommitBrowseUrl)}
              className="gm-dashboard-mono-link"
            >
              {gitStatus.last_commit_id}
            </button>
          ) : (
            <p className="gm-dashboard-mono-value">
              {gitStatus?.last_commit_id || "—"}
            </p>
          )}
          {gitStatus?.last_commit_time && (
            <p className="gm-dashboard-meta">
              {formatAbsoluteTime(gitStatus?.last_commit_time || "")}
            </p>
          )}
        </div>
      </div>
      )}

      {/* Recent Activity — full width */}
      <div className="gm-dashboard-card" style={{ marginBottom: "var(--gm-section-gap)" }}>
          <div className="gm-card-head">
            <Activity size={14} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-section-title">{t("dashboard.recentActivity")}</span>
          </div>
          {displayedRecent.length === 0 ? (
            <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", padding: "var(--gm-card-header-gap) 0" }}>
              {t("dashboard.noActivity")}
            </p>
          ) : (
            <div className="gm-dashboard-activity-list">
              {displayedRecent.map((item) => {
                const cfg = categoryConfig[item.category] || categoryConfig.scratch;
                const Icon = cfg.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => openRecord(item)}
                    className="gm-dashboard-activity-row"
                  >
                    <span className="gm-dashboard-activity-icon">
                      <Icon size={isMobile ? 14 : 12} style={{ color: cfg.color, flexShrink: 0 }} />
                    </span>
                    <span className="gm-dashboard-activity-title">
                      {item.name}
                    </span>
                    <span className="gm-dashboard-activity-time">
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
        <div className="gm-dashboard-card" style={{ marginBottom: "var(--gm-section-gap)", cursor: "pointer" }}
          onClick={() => openRecord(reviewItem)}
        >
          <div className="gm-card-head">
            <RefreshCw size={14} style={{ color: "var(--yellow)" }} />
            <span className="gm-section-title">{t("dashboard.todayReview")}</span>
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
              className="gm-button-ghost"
              style={{ marginLeft: "auto", minHeight: "var(--gm-control-height-xs)" }}
            >
              {t("dashboard.shuffle")}
            </button>
          </div>
          <p className="gm-card-title" style={{ marginBottom: "var(--gm-space-2)" }}>{reviewItem.name}</p>
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
      <div className="gm-dashboard-quick-info">
        <div className="gm-card-head">
          <Zap size={14} style={{ color: "var(--text-secondary)" }} />
          <span className="gm-section-title">{t("dashboard.quickInfo")}</span>
        </div>
        <div className="gm-dashboard-quick-grid">
          <div className="gm-dashboard-quick-row">
            <FolderOpen size={12} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-dashboard-quick-text">
              {gitStatus?.sync_dir}
            </span>
          </div>
          <div className="gm-dashboard-quick-row">
            <GitBranch size={12} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-dashboard-quick-text" title={gitStatus?.git_remote}>
              {gitStatus?.git_remote || t("dashboard.noRemote")}
            </span>
          </div>
          {isDesktop && (
            <div className="gm-dashboard-quick-row">
              <Terminal size={12} style={{ color: "var(--text-secondary)" }} />
              <span className="gm-dashboard-quick-text">
                CLI: gitmemo --help
              </span>
            </div>
          )}
          <div className="gm-dashboard-quick-row">
            <MessageSquare size={12} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-dashboard-quick-text">
              {t("dashboard.totalFiles", String(displayedFileCount))}
            </span>
          </div>
          <div className="gm-dashboard-quick-row">
            <HardDrive size={12} style={{ color: "var(--text-secondary)" }} />
            <span className="gm-dashboard-quick-text">
              {formatSize(displayedRepoSizeKb)}
            </span>
          </div>
        </div>
      </div>
      {isMobile && <div aria-hidden="true" style={{ height: MOBILE_DASHBOARD_BOTTOM_PADDING, flexShrink: 0 }} />}
    </div>
  );
}
