import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { useAppStore } from "../hooks/useAppStore";
import { relativeTime, formatAbsoluteTime } from "../utils/time";
import { Loading } from "../components/Loading";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { AppIcon, type AppIconTone } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { Button } from "../components/base/Button";
import {
  DashboardActivityRow,
  DashboardQuickInfoRow,
  DashboardStatCard,
} from "../components/domain/dashboard/DashboardComponents";
import {
  MessageSquare, BookOpen, FileText, Clipboard,
  HardDrive, GitBranch, GitCommit, RefreshCw, Zap, FolderOpen, Terminal, Lightbulb,
  Activity, Circle, Search, Settings as SettingsIcon, Copy, X,
} from "lucide-react";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import { CLI_INSTALL_COMMAND } from "../utils/cliInstall";
import {
  canOpenDashboardRecentItem,
  formatDashboardText,
  getCliStatusBadgeTone,
  getCliStatusText,
  getDashboardCategoryRoute,
  getDashboardContentCategory,
  getDashboardDisplayedFileCount,
  getDashboardDisplayedRepoSizeKb,
  getDashboardMobileSyncState,
  getDashboardSyncStatus,
  getDashboardVisibleRecentItems,
  hasDashboardConversations,
  hasGitRemote,
  isDashboardEditorConfigured,
  shouldShowCliCapabilityCard,
  shouldShowDashboardEmptyGuide,
  shouldShowDashboardReviewItem,
  type AppStats,
  type DashboardCategoryRoute,
  type DashboardContentCategory,
  type RecentItem,
} from "../components/domain/dashboard/dashboardLogic";
import { getDashboardStartupMessageKey } from "../utils/startupLogic";

import type { Page } from "../App";
import { commitBrowseUrl } from "../utils/gitRemoteWeb";

const categoryVisuals: Record<DashboardContentCategory, { icon: typeof MessageSquare; tone: AppIconTone }> = {
  conversation: { icon: MessageSquare, tone: "accent" },
  manual: { icon: BookOpen, tone: "warning" },
  scratch: { icon: FileText, tone: "purple" },
  clip: { icon: Clipboard, tone: "pink" },
  plan: { icon: Lightbulb, tone: "warning" },
};

const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";
const CLI_CARD_DISMISSED_KEY = "gitmemo-dashboard-cli-card-dismissed";

function getCategoryVisual(category: string) {
  return categoryVisuals[getDashboardContentCategory(category)];
}

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
  const { isMobile, isDesktop } = usePlatformFlags();
  const { isSyncing, isSuccess, isFailed, message: syncMessage, gitStatus, refreshGitStatus, triggerSync } = useSync();
  const { clipboardStatus: clipStatus, claudeEnabled, cursorEnabled, cliStatus, setNotesTab, setAiRecordsTab, setPendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const navigateTo = useCallback(({ page, notesTab, aiRecordsTab }: DashboardCategoryRoute) => {
    if (page === "notes" && notesTab) setNotesTab(notesTab);
    if (page === "ai-records" && aiRecordsTab) setAiRecordsTab(aiRecordsTab);
    onNavigate?.(page);
  }, [onNavigate, setAiRecordsTab, setNotesTab]);

  const openRecord = useCallback((item: RecentItem) => {
    if (!canOpenDashboardRecentItem(isDesktop, item)) return;
    const route = getDashboardCategoryRoute(item.category);
    if (route.page === "notes" && route.notesTab) setNotesTab(route.notesTab);
    if (route.page === "ai-records" && route.aiRecordsTab) setAiRecordsTab(route.aiRecordsTab);
    setPendingOpenPath(item.path);
    onNavigate?.(route.page);
  }, [isDesktop, onNavigate, setAiRecordsTab, setNotesTab, setPendingOpenPath]);


  const cached = loadCache();
  const [stats, setStats] = useState<AppStats | null>(cached?.stats ?? null);
  const [recent, setRecent] = useState<RecentItem[]>(cached?.recent ?? []);
  const [error, setError] = useState("");
  const [reviewItem, setReviewItem] = useState<RecentItem | null>(null);
  const [reviewPreview, setReviewPreview] = useState("");
  const [cliCardDismissed, setCliCardDismissed] = useState(loadCliCardDismissed);

  // Derived state
  const editorConfigured = isDashboardEditorConfigured(isDesktop, claudeEnabled, cursorEnabled);
  const showCliCapabilityCard = shouldShowCliCapabilityCard(isDesktop, cliCardDismissed, cliStatus);
  const cliStatusText = formatDashboardText(getCliStatusText(cliStatus), t);
  const cliStatusBadgeTone = getCliStatusBadgeTone(cliStatus);
  const startupMessageKey = getDashboardStartupMessageKey({
    hasGitStatus: Boolean(gitStatus),
    hasStats: Boolean(stats),
  });
  const watchedFolders = useMemo(() => ["conversations", "notes", "clips", "plans"], []);
  const lastCommitBrowseUrl = useMemo(
    () => commitBrowseUrl(gitStatus?.git_remote, gitStatus?.last_commit_id),
    [gitStatus?.git_remote, gitStatus?.last_commit_id],
  );
  const { copyText: copyDashboardText } = useTimedCopy<boolean>({
    successMessage: t("dashboard.cliCardCommandCopied"),
    errorPrefix: "Error",
  });
  const copyCliInstallCommand = useCallback(() => {
    return copyDashboardText(CLI_INSTALL_COMMAND, true);
  }, [copyDashboardText]);
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
    if (active && (isSuccess || isFailed)) {
      loadData();
    }
  }, [active, isSuccess, isFailed, loadData]);
  useFileWatcher(watchedFolders, loadData, { active });

  const handleRefresh = useCallback(() => {
    loadData();
    void refreshGitStatus();
  }, [loadData, refreshGitStatus]);

  if (error) {
    return (
      <div className="gm-center-state">
        <div className="gm-center-state-panel">
          <AppIcon icon={GitBranch} size="hero" tone="muted" className="gm-empty-state-icon" />
          <p className="gm-state-error-text">{error}</p>
          <p className="gm-state-muted-text">
            {t("dashboard.initHint")}
          </p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <Loading text={t(startupMessageKey ?? "dashboard.loading")} />;
  }

  const displayedFileCount = getDashboardDisplayedFileCount(stats);
  const displayedRepoSizeKb = getDashboardDisplayedRepoSizeKb(stats);
  const displayedRecent = getDashboardVisibleRecentItems(isDesktop, recent);
  const showReviewItem = shouldShowDashboardReviewItem(isDesktop, reviewItem);
  const showEmptyGuide = shouldShowDashboardEmptyGuide(stats, displayedRecent);

  const statCards = [
    { category: "conversation" as const, label: t("dashboard.conversations"), value: stats.conversations },
    { category: "manual" as const, label: t("dashboard.manuals"), value: stats.manuals },
    { category: "scratch" as const, label: t("dashboard.scratchNotes"), value: stats.scratch_notes },
    { category: "clip" as const, label: t("dashboard.clips"), value: stats.clips },
    { category: "plan" as const, label: t("dashboard.plans"), value: stats.plans },
  ].map((card) => ({
    ...card,
    ...categoryVisuals[card.category],
    ...getDashboardCategoryRoute(card.category),
  }));

  const syncStatus = getDashboardSyncStatus(gitStatus);
  const syncStatusText = formatDashboardText(syncStatus.text, t);
  const mobileSyncState = getDashboardMobileSyncState({
    isSyncing,
    syncMessage,
    isFailed,
    gitStatus,
    syncStatus,
  });
  const mobileSyncText = formatDashboardText(mobileSyncState.text, t);
  const mobileSyncActionText = formatDashboardText(mobileSyncState.actionText, t);

  return (
    <div className="gm-page gm-page-scroll gm-dashboard-page" data-mobile={isMobile ? "true" : "false"}>
      <div className="gm-dashboard-header">
        <h1 className="gm-page-title">{t("dashboard.title")}</h1>
        <div className="gm-dashboard-actions">
          {isMobile && (
            <Button
              variant="toolbar"
              onClick={() => onNavigate?.("search")}
              title={t("nav.search")}
              icon={Search}
              iconSize="lg"
            />
          )}
          <Button
            variant="toolbar"
            onClick={handleRefresh}
            title={t("common.refresh")}
            icon={RefreshCw}
          />
          {isDesktop && clipStatus && (
            <div
              className="gm-status-pill"
              data-clickable="true"
              data-tone={clipStatus.watching ? "success" : "muted"}
              onClick={() => onNavigate?.("clipboard")}
            >
              <AppIcon
                icon={Circle}
                size="dot"
                fill="currentColor"
                tone={clipStatus.watching ? "success" : "secondary"}
              />
              <span className="gm-status-pill-text">
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
              <AppIcon icon={RefreshCw} size="xs" tone={mobileSyncState.tone} spin={isSyncing} />
              <span className="gm-muted-text">{t("dashboard.syncStatus")}</span>
            </div>
            <p className="gm-dashboard-mobile-sync-value" data-tone={mobileSyncState.tone}>
              {mobileSyncText}
            </p>
          </div>
          <Button
            variant={mobileSyncState.actionVariant}
            disabled={mobileSyncState.actionDisabled}
            onClick={() => void triggerSync()}
            icon={RefreshCw}
            iconSpin={isSyncing}
          >
            {mobileSyncActionText}
          </Button>
        </div>
      )}

      {/* Onboarding Checklist */}
      {isDesktop && (
        <OnboardingChecklist
          onNavigate={(page) => onNavigate?.(page)}
          hasConversations={hasDashboardConversations(stats)}
          clipboardActive={clipStatus?.watching ?? false}
          editorConfigured={editorConfigured}
        />
      )}

      {showCliCapabilityCard && (
        <div className="gm-dashboard-card gm-dashboard-cli-card">
          <div className="gm-inline-cluster gm-inline-cluster-start">
            <AppIcon icon={Terminal} size="md" tone="accent" />
            <div className="gm-min-0">
              <div className="gm-inline-cluster-wrap">
                <p className="gm-card-title">{t("dashboard.cliCardTitle")}</p>
                <Badge tone={cliStatusBadgeTone}>
                  {cliStatusText}
                </Badge>
              </div>
              <p className="gm-muted-text gm-dashboard-cli-desc">
                {t("dashboard.cliCardDesc")}
              </p>
            </div>
          </div>
          <div className="gm-dashboard-cli-copy-actions">
            <Button
              variant="primary"
              onClick={() => void copyCliInstallCommand()}
              icon={Copy}
            >
              {t("dashboard.cliCardCopyInstallCommand")}
            </Button>
            <Button
              variant="icon"
              onClick={() => onNavigate?.("settings")}
              title={t("nav.settings")}
              icon={SettingsIcon}
            />
            <Button
              variant="icon"
              onClick={dismissCliCard}
              title={t("dashboard.cliCardDismiss")}
              aria-label={t("dashboard.cliCardDismiss")}
              icon={X}
            />
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="gm-dashboard-stat-grid">
        {statCards.map((card) => (
            <DashboardStatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              tone={card.tone}
              onClick={() => navigateTo(card)}
            />
        ))}
      </div>

      {/* Empty state guide */}
      {showEmptyGuide && (
        <div className="gm-dashboard-empty-guide">
          <p className="gm-dashboard-empty-title">{t("dashboard.emptyGuideTitle")}</p>
          <p className="gm-dashboard-empty-copy">
            {isMobile ? t("dashboard.emptyGuideMobileDesc") : t("dashboard.emptyGuideDesc")}
          </p>
        </div>
      )}

      {/* Git Info — only when remote is configured */}
      {hasGitRemote(gitStatus) && (
      <div className="gm-dashboard-git-grid">
        {/* Sync Status */}
        <div className="gm-dashboard-card">
          <div className="gm-card-head">
            <AppIcon icon={RefreshCw} size="xs" tone="secondary" />
            <span className="gm-section-title">{t("dashboard.syncStatus")}</span>
          </div>
          <p className="gm-dashboard-value">
            <span className="gm-dashboard-value-status" data-tone={syncStatus.tone}>{syncStatusText}</span>
          </p>
          <p className="gm-dashboard-meta">
            {formatAbsoluteTime(gitStatus?.checked_at || gitStatus?.last_commit_time || "")}
          </p>
        </div>

        {/* Last Commit */}
        <div className="gm-dashboard-card">
          <div className="gm-card-head">
            <AppIcon icon={GitCommit} size="xs" tone="secondary" />
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
      <div className="gm-dashboard-card gm-dashboard-card-section">
          <div className="gm-card-head">
            <AppIcon icon={Activity} size="xs" tone="secondary" />
            <span className="gm-section-title">{t("dashboard.recentActivity")}</span>
          </div>
          {displayedRecent.length === 0 ? (
            <p className="gm-dashboard-card-empty">
              {t("dashboard.noActivity")}
            </p>
          ) : (
            <div className="gm-dashboard-activity-list">
              {displayedRecent.map((item) => {
                const cfg = getCategoryVisual(item.category);
                return (
                  <DashboardActivityRow
                    key={item.path}
                    onClick={() => openRecord(item)}
                    icon={cfg.icon}
                    tone={cfg.tone}
                    title={item.name}
                    time={relativeTime(item.modified, t)}
                    mobile={isMobile}
                  />
                );
              })}
            </div>
          )}
      </div>

      {/* Today's Review */}
      {showReviewItem && reviewItem && (
        <div className="gm-dashboard-card gm-dashboard-card-section gm-dashboard-card-button"
          onClick={() => openRecord(reviewItem)}
        >
          <div className="gm-card-head">
            <AppIcon icon={RefreshCw} size="xs" tone="warning" />
            <span className="gm-section-title">{t("dashboard.todayReview")}</span>
            <Button
              variant="ghost"
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
              className="gm-dashboard-card-shuffle"
            >
              {t("dashboard.shuffle")}
            </Button>
          </div>
          <p className="gm-card-title gm-dashboard-review-title">{reviewItem.name}</p>
          {reviewPreview && (
            <p className="gm-dashboard-review-preview">
              {reviewPreview}
            </p>
          )}
          <p className="gm-dashboard-review-time">
            {relativeTime(reviewItem.modified, t)}
          </p>
        </div>
      )}

      {/* Quick Info */}
      <div className="gm-dashboard-quick-info">
        <div className="gm-card-head">
          <AppIcon icon={Zap} size="xs" tone="secondary" />
          <span className="gm-section-title">{t("dashboard.quickInfo")}</span>
        </div>
        <div className="gm-dashboard-quick-grid">
          <DashboardQuickInfoRow icon={FolderOpen}>{gitStatus?.sync_dir}</DashboardQuickInfoRow>
          <DashboardQuickInfoRow icon={GitBranch} title={gitStatus?.git_remote}>
            {gitStatus?.git_remote || t("dashboard.noRemote")}
          </DashboardQuickInfoRow>
          {isDesktop && (
            <DashboardQuickInfoRow icon={Terminal}>CLI: gitmemo --help</DashboardQuickInfoRow>
          )}
          <DashboardQuickInfoRow icon={MessageSquare}>
            {t("dashboard.totalFiles", String(displayedFileCount))}
          </DashboardQuickInfoRow>
          <DashboardQuickInfoRow icon={HardDrive}>{formatSize(displayedRepoSizeKb)}</DashboardQuickInfoRow>
        </div>
      </div>
      {isMobile && <div aria-hidden="true" className="gm-dashboard-mobile-spacer" />}
    </div>
  );
}
