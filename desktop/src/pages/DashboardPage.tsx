import { useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { useAppStore } from "../hooks/useAppStore";
import { useToast } from "../hooks/useToast";
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
  DashboardQuickNotePanel,
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
  canSaveDashboardQuickNote,
  formatDashboardText,
  getCliStatusBadgeTone,
  getCliStatusText,
  getDashboardCategoryRoute,
  getDashboardContentCategory,
  getDashboardDisplayedFileCount,
  getDashboardDisplayedRepoSizeKb,
  getDashboardMobileSyncState,
  getDashboardQuickNoteToggleText,
  getDashboardSyncStatus,
  getDashboardVisibleRecentItems,
  hasDashboardConversations,
  hasGitRemote,
  isDashboardQuickNoteExpandedPreference,
  isDashboardEditorConfigured,
  shouldShowCliCapabilityCard,
  shouldShowDashboardEmptyGuide,
  type AppStats,
  type DashboardCategoryRoute,
  type DashboardContentCategory,
  type RecentItem,
} from "../components/domain/dashboard/dashboardLogic";

import type { Page } from "../App";
import { commitBrowseUrl } from "../utils/gitRemoteWeb";
import { type NoteResult } from "../types/notes";

const categoryVisuals: Record<DashboardContentCategory, { icon: typeof MessageSquare; tone: AppIconTone }> = {
  conversation: { icon: MessageSquare, tone: "olympic-blue" },
  manual: { icon: BookOpen, tone: "olympic-yellow" },
  scratch: { icon: FileText, tone: "olympic-black" },
  clip: { icon: Clipboard, tone: "olympic-green" },
  plan: { icon: Lightbulb, tone: "olympic-red" },
};

const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";
const CLI_CARD_DISMISSED_KEY = "gitmemo-dashboard-cli-card-dismissed";
const QUICK_NOTE_EXPANDED_KEY = "gitmemo-dashboard-quick-note-expanded";
let dashboardStatsRequest: Promise<AppStats> | null = null;
let dashboardRecentRequest: Promise<RecentItem[]> | null = null;

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

function loadQuickNoteExpanded() {
  try {
    return isDashboardQuickNoteExpandedPreference(localStorage.getItem(QUICK_NOTE_EXPANDED_KEY));
  } catch {
    return false;
  }
}

function loadDashboardStatsOnce() {
  if (!dashboardStatsRequest) {
    dashboardStatsRequest = invoke<AppStats>("get_stats").finally(() => {
      dashboardStatsRequest = null;
    });
  }
  return dashboardStatsRequest;
}

function loadDashboardRecentOnce() {
  if (!dashboardRecentRequest) {
    dashboardRecentRequest = invoke<RecentItem[]>("get_recent_activity").finally(() => {
      dashboardRecentRequest = null;
    });
  }
  return dashboardRecentRequest;
}

export default function DashboardPage({ onNavigate, active = false }: { onNavigate?: (page: Page) => void; active?: boolean }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { isMobile, isDesktop } = usePlatformFlags();
  const { isSyncing, isSuccess, isFailed, message: syncMessage, gitStatus, refreshGitStatus, triggerSync } = useSync();
  const {
    clipboardStatus: clipStatus,
    claudeEnabled,
    cursorEnabled,
    integrationStatusChecked,
    cliStatus,
    cliStatusChecked,
    setNotesTab,
    setAiRecordsTab,
    setPendingOpenPath,
  } = useAppStore();
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
  const [statsLoading, setStatsLoading] = useState(!cached?.stats);
  const [recentLoading, setRecentLoading] = useState(!cached?.recent);
  const [error, setError] = useState("");
  const [cliCardDismissed, setCliCardDismissed] = useState(loadCliCardDismissed);
  const [quickNoteDraft, setQuickNoteDraft] = useState("");
  const [quickNotePath, setQuickNotePath] = useState<string | null>(null);
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const [quickNoteExpanded, setQuickNoteExpanded] = useState(loadQuickNoteExpanded);
  const dashboardCacheRef = useRef<DashboardCache>({
    stats: cached?.stats ?? null,
    recent: cached?.recent ?? [],
  });
  const quickNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const quickNoteImeComposingRef = useRef(false);

  // Derived state
  const editorConfigured = isDashboardEditorConfigured(isDesktop, integrationStatusChecked, claudeEnabled, cursorEnabled);
  const showCliCapabilityCard = shouldShowCliCapabilityCard(isDesktop, cliCardDismissed, cliStatusChecked, cliStatus);
  const cliStatusText = formatDashboardText(getCliStatusText(cliStatus), t);
  const cliStatusBadgeTone = getCliStatusBadgeTone(cliStatus);
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

  const loadStats = useCallback(async () => {
    if (!dashboardCacheRef.current.stats) setStatsLoading(true);
    try {
      const s = await loadDashboardStatsOnce();
      setStats(s);
      dashboardCacheRef.current = { ...dashboardCacheRef.current, stats: s };
      saveCache(dashboardCacheRef.current);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    if (dashboardCacheRef.current.recent.length === 0) setRecentLoading(true);
    try {
      const r = await loadDashboardRecentOnce();
      setRecent(r);
      dashboardCacheRef.current = { ...dashboardCacheRef.current, recent: r };
      saveCache(dashboardCacheRef.current);
    } catch {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const loadData = useCallback(() => {
    void loadStats();
    void loadRecent();
  }, [loadRecent, loadStats]);

  const saveQuickNote = useCallback(async () => {
    if (!canSaveDashboardQuickNote(quickNoteDraft, quickNoteSaving)) {
      if (!quickNoteDraft.trim()) showToast(t("dashboard.quickNoteContentRequired"), true);
      return;
    }

    setQuickNoteSaving(true);
    try {
      const result = await invoke<NoteResult>("save_dashboard_quick_note", {
        content: quickNoteDraft,
        filePath: quickNotePath,
      });
      setQuickNotePath(result.path);
      showToast(t("dashboard.quickNoteSaved", result.path));
      loadData();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setQuickNoteSaving(false);
    }
  }, [loadData, quickNoteDraft, quickNotePath, quickNoteSaving, showToast, t]);

  const startNewQuickNote = useCallback(() => {
    if (quickNoteSaving) return;
    setQuickNoteDraft("");
    setQuickNotePath(null);
    window.requestAnimationFrame(() => quickNoteTextareaRef.current?.focus());
  }, [quickNoteSaving]);

  const toggleQuickNoteExpanded = useCallback(() => {
    setQuickNoteExpanded((current) => {
      const next = !current;
      try { localStorage.setItem(QUICK_NOTE_EXPANDED_KEY, String(next)); } catch {}
      if (next) window.requestAnimationFrame(() => quickNoteTextareaRef.current?.focus());
      return next;
    });
  }, []);

  const openQuickNote = useCallback(() => {
    if (!quickNotePath || quickNoteSaving) return;
    setNotesTab("scratch");
    setPendingOpenPath(quickNotePath);
    onNavigate?.("notes");
  }, [onNavigate, quickNotePath, quickNoteSaving, setNotesTab, setPendingOpenPath]);

  const handleQuickNoteKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || (!e.metaKey && !e.ctrlKey)) return;
    const ev = e.nativeEvent;
    if (quickNoteImeComposingRef.current || ev.isComposing || ev.keyCode === 229) return;
    e.preventDefault();
    void saveQuickNote();
  }, [saveQuickNote]);

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

  const displayedFileCount = stats ? getDashboardDisplayedFileCount(stats) : 0;
  const displayedRepoSizeKb = stats ? getDashboardDisplayedRepoSizeKb(stats) : 0;
  const displayedRecent = getDashboardVisibleRecentItems(isDesktop, recent);
  const showEmptyGuide = stats ? shouldShowDashboardEmptyGuide(stats, displayedRecent) : false;
  const isDashboardOverviewLoading = statsLoading && !stats;
  const isRecentActivityLoading = recentLoading && displayedRecent.length === 0;
  const isGitStatusLoading = !gitStatus;

  const statCards = [
    { category: "conversation" as const, label: t("dashboard.conversations"), value: stats?.conversations },
    { category: "manual" as const, label: t("dashboard.manuals"), value: stats?.manuals },
    { category: "scratch" as const, label: t("dashboard.scratchNotes"), value: stats?.scratch_notes },
    { category: "clip" as const, label: t("dashboard.clips"), value: stats?.clips },
    { category: "plan" as const, label: t("dashboard.plans"), value: stats?.plans },
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
  const quickNoteToggleText = formatDashboardText(getDashboardQuickNoteToggleText(quickNoteExpanded), t);
  const quickNoteSaveDisabled = !canSaveDashboardQuickNote(quickNoteDraft, quickNoteSaving);

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
          hasConversations={stats ? hasDashboardConversations(stats) : false}
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
              value={card.value ?? <Loading compact text={t("common.loading")} />}
              tone={card.tone}
              loading={isDashboardOverviewLoading}
              onClick={card.value === undefined ? undefined : () => navigateTo(card)}
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
      <div className="gm-dashboard-git-grid">
        {/* Sync Status */}
        <div className="gm-dashboard-card">
          <div className="gm-card-head">
            <AppIcon icon={RefreshCw} size="xs" tone="secondary" />
            <span className="gm-section-title">{t("dashboard.syncStatus")}</span>
          </div>
          {isGitStatusLoading ? (
            <Loading compact text={t("dashboard.startupReadingRepository")} />
          ) : hasGitRemote(gitStatus) ? (
            <>
              <p className="gm-dashboard-value">
                <span className="gm-dashboard-value-status" data-tone={syncStatus.tone}>{syncStatusText}</span>
              </p>
              <p className="gm-dashboard-meta">
                {formatAbsoluteTime(gitStatus?.checked_at || gitStatus?.last_commit_time || "")}
              </p>
            </>
          ) : (
            <p className="gm-dashboard-card-empty">{t("dashboard.noRemote")}</p>
          )}
        </div>

        {/* Last Commit */}
        <div className="gm-dashboard-card">
          <div className="gm-card-head">
            <AppIcon icon={GitCommit} size="xs" tone="secondary" />
            <span className="gm-section-title">{t("dashboard.lastCommit")}</span>
          </div>
          {isGitStatusLoading ? (
            <Loading compact text={t("dashboard.startupReadingRepository")} />
          ) : lastCommitBrowseUrl && gitStatus?.last_commit_id ? (
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
          {gitStatus?.last_commit_time ? (
            <p className="gm-dashboard-meta">
              {formatAbsoluteTime(gitStatus?.last_commit_time || "")}
            </p>
          ) : null}
        </div>
      </div>

      {/* Dashboard quick-note extension point: after git cards, before recent activity. */}
      <DashboardQuickNotePanel
        title={t("dashboard.quickNoteTitle")}
        placeholder={t("dashboard.quickNotePlaceholder")}
        expanded={quickNoteExpanded}
        toggleLabel={quickNoteToggleText}
        saveLabel={t("dashboard.quickNoteSave")}
        savingLabel={t("dashboard.quickNoteSaving")}
        newLabel={t("dashboard.quickNoteNew")}
        openLabel={t("dashboard.quickNoteOpen")}
        value={quickNoteDraft}
        textareaRef={quickNoteTextareaRef}
        saving={quickNoteSaving}
        saveDisabled={quickNoteSaveDisabled}
        canOpen={Boolean(quickNotePath)}
        mobile={isMobile}
        onChange={setQuickNoteDraft}
        onToggle={toggleQuickNoteExpanded}
        onSave={() => void saveQuickNote()}
        onNew={startNewQuickNote}
        onOpen={openQuickNote}
        onKeyDown={handleQuickNoteKeyDown}
        onCompositionStart={() => { quickNoteImeComposingRef.current = true; }}
        onCompositionEnd={() => { quickNoteImeComposingRef.current = false; }}
      />

      {/* Recent Activity — full width */}
      <div className="gm-dashboard-card gm-dashboard-card-section">
          <div className="gm-card-head">
            <AppIcon icon={Activity} size="xs" tone="secondary" />
            <span className="gm-section-title">{t("dashboard.recentActivity")}</span>
          </div>
          {isRecentActivityLoading ? (
            <Loading compact text={t("dashboard.startupLoadingActivity")} />
          ) : displayedRecent.length === 0 ? (
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
            {stats ? t("dashboard.totalFiles", String(displayedFileCount)) : t("common.loading")}
          </DashboardQuickInfoRow>
          <DashboardQuickInfoRow icon={HardDrive}>{stats ? formatSize(displayedRepoSizeKb) : t("common.loading")}</DashboardQuickInfoRow>
        </div>
      </div>
      {isMobile && <div aria-hidden="true" className="gm-dashboard-mobile-spacer" />}
    </div>
  );
}
