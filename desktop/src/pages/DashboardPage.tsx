import {useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent} from "react";
import {invoke} from "@tauri-apps/api/core";
import {readText} from "@tauri-apps/plugin-clipboard-manager";
import {useI18n} from "../hooks/useI18n";
import {useSync} from "../hooks/useSync";
import {useAppStore} from "../hooks/useAppStore";
import {useToast} from "../hooks/useToast";
import {relativeTime} from "../utils/time";
import {Loading} from "../components/Loading";
import {useRelativeTimeTick} from "../hooks/useRelativeTimeTick";
import {useFileWatcher} from "../hooks/useFileWatcher";
import {usePlatformFlags} from "../hooks/usePlatform";
import {AppIcon} from "../components/base/AppIcon";
import {Button} from "../components/base/Button";
import {GitBranch, RefreshCw, Circle, Search, X, PanelLeft} from "lucide-react";
import {canOpenDashboardRecentItem, canSaveDashboardQuickNote, DASHBOARD_QUICK_NOTE_SAVE_SHORTCUT, formatDashboardText, formatDashboardSizeKb, formatDashboardCount, getDashboardDisplayedRepoSizeKb, getDashboardCategoryRoute, getDashboardDisplayedFileCount, getDashboardSyncStatus, getDashboardContentCategory, getDashboardVisibleRecentItems, isDashboardEditorConfigured, shouldSaveDashboardQuickNoteFromKeyboard, type AppStats, type RecentItem} from "../components/domain/dashboard/dashboardLogic";

import type { Page } from "../App";
import {formatTitleWithShortcut} from "../utils/shortcuts";
import {type NoteResult} from "../types/notes";


const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";
let dashboardStatsRequest: Promise<AppStats> | null = null;
const DASHBOARD_ACTIVITY_KEY = "gitmemo-dashboard-activity";

let dashboardRecentRequest: Promise<RecentItem[]> | null = null;



interface DashboardCache {
  stats: AppStats | null;
  recent: RecentItem[];
}

function loadCache(): DashboardCache | null {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DashboardCache> | null;
    if (!parsed || typeof parsed !== "object") return null;
    // 缓存可能来自旧版本或被别的代码改过：形状不对就当没有缓存，
    // 否则会把非数组塞进 state，首屏直接 crash 到 ErrorBoundary。
    const stats = parsed.stats && typeof parsed.stats === "object" ? parsed.stats : null;
    const recent = Array.isArray(parsed.recent) ? parsed.recent : null;
    if (!stats && !recent) return null;
    return { stats, recent: recent ?? [] };
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
  const [recentError, setRecentError] = useState<string | null>(null);
  // 「最近动态」可以关掉：仪表盘只留读数与快记。选择记在本机，下次打开保持。
  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(DASHBOARD_ACTIVITY_KEY) !== "closed";
    } catch {
      return true;
    }
  });
  const setActivityVisible = useCallback((next: boolean) => {
    setActivityOpen(next);
    try {
      window.localStorage.setItem(DASHBOARD_ACTIVITY_KEY, next ? "open" : "closed");
    } catch {
      // 存不了就只在本次会话生效
    }
  }, []);
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
    if (!Array.isArray(dashboardCacheRef.current.recent) || dashboardCacheRef.current.recent.length === 0) setRecentLoading(true);
    try {
      const r = await loadDashboardRecentOnce();
      const list = Array.isArray(r) ? r : [];
      setRecent(list);
      setRecentError(null);
      dashboardCacheRef.current = { ...dashboardCacheRef.current, recent: list };
      saveCache(dashboardCacheRef.current);
    } catch (e) {
      // 列表数据失败不交给页面级错误边界：结构还能用，就地给一条可重试的提示。
      setRecent([]);
      setRecentError(e instanceof Error ? e.message : String(e));
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

  const quickNoteTemplate = t("dashboard.quickNoteTemplateContent");
  const insertFromClipboard = useCallback(async () => {
    try {
      const text = await readText();
      if (!text) {
        showToast(t("dashboard.clipboardEmpty"), true);
        return;
      }
      setQuickNoteDraft((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${text}` : text));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [setQuickNoteDraft, showToast, t]);

  const insertQuickNoteTemplate = useCallback(() => {
    // 模板必须是「不同于占位符」的真实内容：以前插的是占位符原文，插完画面毫无变化，
    // 看起来像按钮没反应。
    setQuickNoteDraft(quickNoteTemplate);
    window.requestAnimationFrame(() => {
      const textarea = quickNoteTextareaRef.current;
      textarea?.setSelectionRange(quickNoteTemplate.length, quickNoteTemplate.length);
      textarea?.focus();
    });
  }, [quickNoteTemplate]);

  const handleQuickNoteKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ev = e.nativeEvent;
    const isComposing = quickNoteImeComposingRef.current || ev.isComposing || ev.keyCode === 229;
    const hasModifierKey = e.shiftKey || e.altKey || e.metaKey || e.ctrlKey;

    // Tab 不再用来插入制表符或整块模板：命令框在页面里是要能用 Tab 走开的，
    // 之前 Tab 被吃掉，键盘用户会被困在这个输入框里。模板改成显式按钮。
    if (e.key === "Escape" && !hasModifierKey && !isComposing) {
      e.preventDefault();
      if (quickNoteDraft !== "") {
        setQuickNoteDraft("");
      } else {
        e.currentTarget.blur();
      }
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
  const displayedRecent = getDashboardVisibleRecentItems(isDesktop, Array.isArray(recent) ? recent : []);
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
      detail: stats?.conversation_sources
        ? t("dashboard.gaugeToolSources", String(stats.conversation_sources))
        : undefined,
    },
    {
      // 笔记 = 手写笔记 + 便签。只算 manuals 会漏掉便签，看起来像「笔记数不对」。
      id: "notes",
      label: t("nav.notes"),
      value: stats ? (stats.manuals ?? 0) + (stats.scratch_notes ?? 0) : undefined,
      level: Math.min(5, Math.ceil((((stats?.manuals ?? 0) + (stats?.scratch_notes ?? 0))) / 40)),
      detail: stats ? t("dashboard.gaugeDocsOnly", String(stats.manuals ?? 0)) : undefined,
    },
    {
      id: "clip",
      label: t("dashboard.clips"),
      value: stats?.clips,
      level: Math.min(5, Math.ceil((stats?.clips ?? 0) / 10)),
      detail: stats ? t("dashboard.gaugeClipImages", String(stats.clip_images ?? 0)) : undefined,
    },
    {
      id: "plans",
      label: t("dashboard.plans"),
      value: stats?.plans,
      level: Math.min(5, Math.ceil((stats?.plans ?? 0) / 2)),
      detail: stats?.last_activity_ts
        ? t("dashboard.gaugeLastActivity", String(Math.max(1, Math.round((Date.now() - stats.last_activity_ts) / 60000))))
        : t("dashboard.gaugeNoActivity"),
    },
  ];


  const categoryKind = (category: string) => getDashboardContentCategory(category);
  const categoryLabel = (category: string) => {
    switch (getDashboardContentCategory(category)) {
      case "conversation": return t("dashboard.typeConversation");
      case "manual": return t("dashboard.typeNote");
      case "scratch": return t("dashboard.typeScratch");
      case "clip": return t("dashboard.typeClip");
      case "plan": return t("dashboard.typePlan");
      default: return category;
    }
  };

  return (
    <div className="gm-inst-dashboard" data-mobile={isMobile ? "true" : "false"} data-active={active ? "true" : "false"}>
      {/* 1 · 身份栏 */}
      <header className="gm-inst-identity">
        <span className="gm-inst-identity-mark">{t("dashboard.title")}</span>
        <span className="gm-inst-identity-path">
          {gitStatus?.sync_dir || t("dashboard.noRemote")}
          {gitStatus?.git_branch ? ` · ${gitStatus.git_branch}` : ""}
        </span>
        <span className="gm-inst-identity-status" data-tone={syncStatus.tone}>
          <AppIcon icon={Circle} size="dot" fill="currentColor" tone={syncStatus.tone === "success" ? "success" : "secondary"} />
          {syncStatusText}
          {gitStatus?.last_commit_time
            ? ` · ${t("dashboard.lastSyncedAgo", relativeTime(gitStatus.last_commit_time, t))}`
            : ""}
        </span>
        <span className="gm-inst-identity-spacer" />
        {!activityOpen ? (
          <Button
            variant="toolbar"
            onClick={() => setActivityVisible(true)}
            title={t("dashboard.activityShow")}
            icon={PanelLeft}
          />
        ) : null}
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

      <div className="gm-inst-body" data-activity={activityOpen ? "open" : "closed"}>

        <div className="gm-inst-main">
          {/* 4a · 仪表带 */}
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
                <button
                  type="button"
                  className="gm-inst-command-template"
                  onClick={insertQuickNoteTemplate}
                  disabled={quickNoteDraft !== ""}
                >
                  {t("dashboard.quickNoteInsertTemplate")}
                </button>
                <button type="button" className="gm-inst-command-new" onClick={() => void insertFromClipboard()}>
                  {t("dashboard.quickNoteFromClipboard")}
                </button>
                <button type="button" className="gm-inst-command-new" onClick={startNewQuickNote}>
                  {t("dashboard.quickNoteNew")}
                </button>
              </div>
            </section>

            {/* 5 · 最近条目（放在快记之后，大小屏一致） */}
          {activityOpen ? (
          <section className="gm-inst-list" aria-label={t("dashboard.recentActivity")}>
            <div className="gm-inst-list-head">
              <span>{t("dashboard.recentActivity")}</span>
              <span className="gm-inst-list-count">{formatDashboardCount(displayedRecent.length)}</span>
              <button
                type="button"
                className="gm-inst-list-close"
                onClick={() => setActivityVisible(false)}
                title={t("dashboard.activityHide")}
              >
                <AppIcon icon={X} size="2xs" />
              </button>
            </div>
            <div className="gm-inst-list-rows">
              {isRecentActivityLoading ? (
                <div className="gm-inst-list-skeleton" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="gm-inst-list-row" data-skeleton="true">
                      <span className="gm-inst-list-title" />
                      <span className="gm-inst-list-time" data-col="time" />
                    </div>
                  ))}
                </div>
              ) : displayedRecent.length === 0 ? (
                recentError ? (
                  <div className="gm-inst-list-error" role="alert">
                    <span className="gm-inst-list-error-text">{t("dashboard.listLoadFailed", recentError)}</span>
                    <button type="button" className="gm-toolbar-button" onClick={() => void loadRecent()}>
                      {t("common.retry")}
                    </button>
                  </div>
                ) : (
                  <p className="gm-inst-list-empty">{t("dashboard.noActivity")}</p>
                )
              ) : (
                displayedRecent.slice(0, 12).map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className="gm-inst-list-row"
                    onClick={() => openRecord(item)}
                    title={item.path}
                  >
                    <span className="gm-inst-list-time" data-col="time">{relativeTime(item.modified, t)}</span>
                    <span className="gm-inst-list-type" data-kind={categoryKind(item.category)}>
                      {categoryLabel(item.category)}
                    </span>
                    <span className="gm-inst-list-title">{item.name}</span>
                    <span className="gm-inst-list-source">{item.source}</span>
                    <span className="gm-inst-list-state" data-state={item.state}>
                      {item.state === "new"
                        ? t("dashboard.tableStateNew")
                        : item.state === "draft"
                          ? t("dashboard.tableStateDraft")
                          : t("dashboard.tableStateSynced")}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
