import {useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent} from "react";
import {invoke} from "@tauri-apps/api/core";
import {useI18n} from "../hooks/useI18n";
import {useSync} from "../hooks/useSync";
import {useAppStore} from "../hooks/useAppStore";
import {useToast} from "../hooks/useToast";
import {relativeTime, formatAbsoluteTime} from "../utils/time";
import {Loading} from "../components/Loading";
import {useRelativeTimeTick} from "../hooks/useRelativeTimeTick";
import {useFileWatcher} from "../hooks/useFileWatcher";
import {usePlatformFlags} from "../hooks/usePlatform";
import {AppIcon} from "../components/base/AppIcon";
import {Button} from "../components/base/Button";
import {GitBranch, RefreshCw, Circle, Search} from "lucide-react";
import {canOpenDashboardRecentItem, canSaveDashboardQuickNote, DASHBOARD_QUICK_NOTE_SAVE_SHORTCUT, formatDashboardText, formatDashboardSizeKb, formatDashboardCount, getDashboardDisplayedRepoSizeKb, getDashboardCategoryRoute, getDashboardDisplayedFileCount, getDashboardSyncStatus, getDashboardVisibleRecentItems, isDashboardEditorConfigured, shouldSaveDashboardQuickNoteFromKeyboard, shouldInsertDashboardQuickNoteTemplate, shouldInsertDashboardQuickNoteTab, shouldShowDashboardEmptyGuide, type AppStats, type RecentItem} from "../components/domain/dashboard/dashboardLogic";

import type { Page } from "../App";
import {formatTitleWithShortcut} from "../utils/shortcuts";
import {type NoteResult} from "../types/notes";


const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";
let dashboardStatsRequest: Promise<AppStats> | null = null;
let dashboardRecentRequest: Promise<RecentItem[]> | null = null;



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
  const { isSyncing, isSuccess, isFailed, gitStatus, refreshGitStatus } = useSync();
  const {
    clipboardStatus: clipStatus,
    claudeEnabled,
    cursorEnabled,
    integrationStatusChecked,
    setNotesTab,
    setAiRecordsTab,
    setPendingOpenPath,
  } = useAppStore();
  useRelativeTimeTick();

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
  const [quickNoteDraft, setQuickNoteDraft] = useState("");
  const [quickNotePath, setQuickNotePath] = useState<string | null>(null);
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const dashboardCacheRef = useRef<DashboardCache>({
    stats: cached?.stats ?? null,
    recent: cached?.recent ?? [],
  });
  const quickNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const quickNoteImeComposingRef = useRef(false);

  // Derived state
  const quickNotePlaceholder = t("dashboard.quickNotePlaceholder");
  const quickNoteSaveLabel = formatTitleWithShortcut(
    t("dashboard.quickNoteSave"),
    DASHBOARD_QUICK_NOTE_SAVE_SHORTCUT,
  );
  const watchedFolders = useMemo(() => ["conversations", "notes", "clips", "plans"], []);
  const displayedRepoSizeKb = stats ? getDashboardDisplayedRepoSizeKb(stats) : undefined;
  const editorConfigured = isDashboardEditorConfigured(isDesktop, integrationStatusChecked, claudeEnabled, cursorEnabled);

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



  const openQuickNote = useCallback(() => {
    if (!quickNotePath || quickNoteSaving) return;
    setNotesTab("scratch");
    setPendingOpenPath(quickNotePath);
    onNavigate?.("notes");
  }, [onNavigate, quickNotePath, quickNoteSaving, setNotesTab, setPendingOpenPath]);

  const handleQuickNoteKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ev = e.nativeEvent;
    const isComposing = quickNoteImeComposingRef.current || ev.isComposing || ev.keyCode === 229;
    const hasModifierKey = e.shiftKey || e.altKey || e.metaKey || e.ctrlKey;

    if (shouldInsertDashboardQuickNoteTemplate(e.key, quickNoteDraft, hasModifierKey, isComposing)) {
      e.preventDefault();
      setQuickNoteDraft(quickNotePlaceholder);
      window.requestAnimationFrame(() => {
        const textarea = quickNoteTextareaRef.current;
        textarea?.setSelectionRange(quickNotePlaceholder.length, quickNotePlaceholder.length);
      });
      return;
    }

    if (shouldInsertDashboardQuickNoteTab(e.key, hasModifierKey, isComposing)) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      textarea.setRangeText("\t", selectionStart, selectionEnd, "end");
      setQuickNoteDraft(textarea.value);
      return;
    }

    if (!shouldSaveDashboardQuickNoteFromKeyboard({
      key: e.key,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      repeat: e.repeat,
      isComposing,
    })) return;
    e.preventDefault();
    void saveQuickNote();
  }, [quickNoteDraft, quickNotePlaceholder, saveQuickNote]);

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
  const displayedRecent = getDashboardVisibleRecentItems(isDesktop, recent);
  const showEmptyGuide = stats ? shouldShowDashboardEmptyGuide(stats, displayedRecent) : false;
  const isDashboardOverviewLoading = statsLoading && !stats;
  const isRecentActivityLoading = recentLoading && displayedRecent.length === 0;


  const syncStatus = getDashboardSyncStatus(gitStatus);
  const syncStatusText = formatDashboardText(syncStatus.text, t);
  const quickNoteSaveDisabled = !canSaveDashboardQuickNote(quickNoteDraft, quickNoteSaving);

  const gaugeCards = [
    {
      id: "total",
      label: t("dashboard.gaugeTotal"),
      value: displayedFileCount,
      level: 5,
      detail: stats ? formatDashboardSizeKb(displayedRepoSizeKb) : undefined,
    },
    {
      id: "conversation",
      label: t("dashboard.conversations"),
      value: stats?.conversations,
      level: Math.min(5, Math.ceil((stats?.conversations ?? 0) / 40)),
      detail: undefined,
    },
    {
      id: "clip",
      label: t("dashboard.clips"),
      value: stats?.clips,
      level: Math.min(5, Math.ceil((stats?.clips ?? 0) / 10)),
      detail: undefined,
    },
    {
      id: "unpushed",
      label: t("dashboard.gaugeUnpushed"),
      value: gitStatus?.unpushed ?? 0,
      level: (gitStatus?.unpushed ?? 0) > 0 ? 1 : 0,
      detail: gitStatus?.last_commit_time ? formatAbsoluteTime(gitStatus.last_commit_time) : undefined,
    },
  ];

  const categoryLabel = (category: string) => {
    switch (category) {
      case "conversation": return t("dashboard.typeConversation");
      case "manual": return t("dashboard.typeNote");
      case "scratch": return t("dashboard.typeScratch");
      case "clip": return t("dashboard.typeClip");
      case "plan": return t("dashboard.typePlan");
      default: return category;
    }
  };

  const resumeItem = displayedRecent[0];
  const pendingItems = [
    gitStatus && gitStatus.unpushed > 0
      ? { label: t("dashboard.unpushed"), meta: String(gitStatus.unpushed) }
      : null,
    clipStatus && !clipStatus.watching
      ? { label: t("dashboard.clipboardInactive"), meta: t("nav.clipboard") }
      : null,
    !editorConfigured ? { label: t("dashboard.pendingNoEditor"), meta: t("nav.settings") } : null,
    gitStatus?.last_commit_id
      ? { label: t("dashboard.lastCommit"), meta: gitStatus.last_commit_id }
      : null,
  ].filter(Boolean).slice(0, 3) as { label: string; meta: string }[];

  return (
    <div className="gm-inst-dashboard" data-mobile={isMobile ? "true" : "false"} data-active={active ? "true" : "false"}>
      {/* 1 · 身份栏 */}
      <header className="gm-inst-identity">
        <span className="gm-inst-identity-mark">{t("dashboard.title")}</span>
        <span className="gm-inst-identity-path">{gitStatus?.sync_dir || t("dashboard.noRemote")}</span>
        <span className="gm-inst-identity-status" data-tone={syncStatus.tone}>
          <AppIcon icon={Circle} size="dot" fill="currentColor" tone={syncStatus.tone === "success" ? "success" : "secondary"} />
          {syncStatusText}
        </span>
        <span className="gm-inst-identity-spacer" />
        <span className="gm-inst-identity-count">
          {stats ? t("dashboard.totalFiles", formatDashboardCount(displayedFileCount)) : t("common.loading")}
        </span>
        {isMobile ? (
          <Button
            variant="toolbar"
            onClick={() => onNavigate?.("search")}
            title={t("nav.search")}
            icon={Search}
            iconSize="lg"
          />
        ) : null}
        <Button
          variant="toolbar"
          onClick={handleRefresh}
          title={t("common.refresh")}
          icon={RefreshCw}
          iconSpin={isSyncing}
        />
      </header>

      <div className="gm-inst-body">
        {/* 3 · 最近条目 */}
        <section className="gm-inst-list" aria-label={t("dashboard.recentActivity")}>
          <div className="gm-inst-list-head">
            <span>{t("dashboard.recentActivity")}</span>
            <span className="gm-inst-list-count">{formatDashboardCount(displayedFileCount)}</span>
          </div>
          <div className="gm-inst-list-rows">
            {isRecentActivityLoading ? (
              <Loading compact text={t("dashboard.startupLoadingActivity")} />
            ) : displayedRecent.length === 0 ? (
              <p className="gm-inst-list-empty">{t("dashboard.noActivity")}</p>
            ) : (
              displayedRecent.slice(0, 12).map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="gm-inst-list-row"
                  data-on={resumeItem?.path === item.path ? "true" : "false"}
                  onClick={() => openRecord(item)}
                  title={item.path}
                >
                  <span className="gm-inst-list-title">{item.name}</span>
                  <span className="gm-inst-list-time" data-col="time">{relativeTime(item.modified, t)}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <div className="gm-inst-main">
          {/* 4a · 横幅 */}
          <div className="gm-inst-banner" data-empty={showEmptyGuide ? "true" : "false"}>
            <p className="gm-inst-banner-title">
              {showEmptyGuide
                ? t("dashboard.emptyGuideTitle")
                : resumeItem
                  ? t("dashboard.resumeLatest", resumeItem.name)
                  : t("dashboard.noActivity")}
            </p>
            <p className="gm-inst-banner-meta">
              {showEmptyGuide
                ? (isMobile ? t("dashboard.emptyGuideMobileDesc") : t("dashboard.emptyGuideDesc"))
                : formatAbsoluteTime(resumeItem?.modified || gitStatus?.last_commit_time || "")}
            </p>
          </div>

          {/* 4b · 仪表带 */}
          <div className="gm-inst-gauges">
            {gaugeCards.map((card) => (
              <div className="gm-inst-gauge" key={card.id} data-level={String(card.level)}>
                <span className="gm-inst-gauge-label">{card.label}</span>
                <span className="gm-inst-gauge-value">
                  {isDashboardOverviewLoading || card.value === undefined
                    ? <Loading compact text={t("common.loading")} />
                    : formatDashboardCount(card.value)}
                </span>
                <span className="gm-inst-gauge-bar" aria-hidden="true" />
                <span className="gm-inst-gauge-detail">{card.detail ?? "—"}</span>
              </div>
            ))}
          </div>

          {/* 4c · 表格 */}
          <div className="gm-inst-table" role="table" aria-label={t("dashboard.recentActivity")}>
            <div className="gm-inst-table-head" role="row">
              <span role="columnheader" data-col="time">{t("dashboard.tableTime")}</span>
              <span role="columnheader" data-col="type">{t("dashboard.gaugeType")}</span>
              <span role="columnheader" data-col="title">{t("dashboard.tableTitle")}</span>
              <span role="columnheader" data-col="source">{t("dashboard.tableSource")}</span>
              <span role="columnheader" data-col="state">{t("dashboard.gaugeState")}</span>
            </div>
            {displayedRecent.slice(0, 7).map((item) => (
              <button
                key={item.path}
                type="button"
                role="row"
                className="gm-inst-table-row"
                onClick={() => openRecord(item)}
              >
                <span role="cell" data-col="time" className="gm-inst-table-time">{relativeTime(item.modified, t)}</span>
                <span role="cell" data-col="type" className="gm-inst-tag" data-kind={item.category}>
                  {categoryLabel(item.category)}
                </span>
                <span role="cell" data-col="title" className="gm-inst-table-title" title={item.name}>{item.name}</span>
                <span role="cell" data-col="source" className="gm-inst-table-source" title={item.path}>
                  {item.path.split("/")[0]}
                </span>
                <span role="cell" data-col="state" className="gm-inst-table-state" data-state="synced">
                  {t("dashboard.synced")}
                </span>
              </button>
            ))}
          </div>

          {/* 5 · 命令输入 + 待处理 */}
          <div className="gm-inst-lower">
            <section className="gm-inst-command">
              <div className="gm-inst-command-head">
                <span>{t("dashboard.quickNoteTitle")}</span>
                {quickNotePath ? (
                  <button type="button" className="gm-inst-command-open" onClick={openQuickNote}>
                    {t("dashboard.quickNoteOpen")}
                  </button>
                ) : null}
              </div>
              <div className="gm-inst-command-field">
                <span className="gm-inst-command-sigil" aria-hidden="true">&gt;</span>
                <textarea
                  ref={quickNoteTextareaRef}
                  className="gm-inst-command-input"
                  value={quickNoteDraft}
                  placeholder={quickNotePlaceholder}
                  aria-label={t("dashboard.quickNoteTitle")}
                  onChange={(event) => setQuickNoteDraft(event.target.value)}
                  onKeyDown={handleQuickNoteKeyDown}
                  onCompositionStart={() => { quickNoteImeComposingRef.current = true; }}
                  onCompositionEnd={() => { quickNoteImeComposingRef.current = false; }}
                  rows={2}
                />
                <span className="gm-inst-command-caret" aria-hidden="true" />
              </div>
              <div className="gm-inst-command-keys">
                <span>{quickNoteSaveLabel}</span>
                <button
                  type="button"
                  className="gm-inst-command-save"
                  disabled={quickNoteSaveDisabled}
                  onClick={() => void saveQuickNote()}
                >
                  {quickNoteSaving ? t("dashboard.quickNoteSaving") : t("dashboard.quickNoteSave")}
                </button>
                <button type="button" className="gm-inst-command-new" onClick={startNewQuickNote}>
                  {t("dashboard.quickNoteNew")}
                </button>
              </div>
            </section>

            <section className="gm-inst-todo">
              <div className="gm-inst-todo-head">
                <span>{t("dashboard.pendingTitle")}</span>
                <span className="gm-inst-todo-count">{formatDashboardCount(pendingItems.length)}</span>
              </div>
              <ul className="gm-inst-todo-rows">
                {pendingItems.map((item) => (
                  <li key={item.label} className="gm-inst-todo-row">
                    <span className="gm-inst-todo-label">{item.label}</span>
                    <span className="gm-inst-todo-meta">{item.meta}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
