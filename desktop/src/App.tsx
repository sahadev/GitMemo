import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import { notify } from "./utils/notify";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import VaultPage from "./pages/VaultPage";
import FavoritesPage from "./pages/FavoritesPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import AiRecordsPage from "./pages/AiRecordsPage";
import ClaudeConfigPage from "./pages/ClaudeConfigPage";
import EditorHomePage from "./pages/EditorHomePage";
import ExternalFilesPage from "./pages/ExternalFilesPage";
import ImportsPage from "./pages/ImportsPage";
import { SetupWizard } from "./components/SetupWizard";
import { shouldShowMobileTabBar } from "./components/domain/app/appChromeLogic";
import { useSync } from "./hooks/useSync";
import { usePlatformFlags } from "./hooks/usePlatform";
import { useAppStore } from "./hooks/useAppStore";
import { useI18n } from "./hooks/useI18n";
import { shortcutMatches, withDefaultShortcuts } from "./utils/shortcuts";
import { applyMobileExtraTopSafeArea, loadMobileExtraTopSafeArea } from "./utils/mobileLayout";
import {
  consumeNotificationNavigateTarget,
  subscribeNotificationNavigate,
  type NotificationNavigateTarget,
} from "./utils/notificationNavigation";
import {
  getAppPageOrder,
  getNextMobilePageStack,
  isMobileBackSwipeGesture,
  resolveExternalSyncRoute,
  resolveMobileBackNavigation,
  resolveQuickPasteOpenPage,
  shouldInstallMobileHistoryGuard,
  shouldPushMobilePageStack,
  shouldResetUnsupportedMobilePage,
  shouldStartMobileBackGesture,
  shouldTriggerSearchEntryOnNavigate,
  shouldUseMobileBackFeatures,
} from "./utils/appNavigationLogic";

declare global {
  interface Window {
    __gitmemoMobileBack?: () => boolean;
  }
}

export type Page = "dashboard" | "search" | "ai-records" | "notes" | "clipboard" | "vault" | "favorites" | "imports" | "claude-config" | "editor-home" | "external-files" | "settings";
export type { Theme } from "./hooks/useAppStore";

type EditorRoot = "claude" | "cursor" | "anonymous";

interface ExternalOpenTarget {
  kind: string;
  page: string | null;
  root: EditorRoot | null;
  rel_path: string | null;
  file_path: string;
}

interface EditorOpenTarget {
  root: EditorRoot;
  relPath: string;
}

interface ExternalFileOpenTarget {
  filePath: string;
  requestId: number;
}

type MobileBackHandler = () => boolean;

interface ImportedFileResult {
  original_name: string;
  dest_path: string;
  category: string;
  size: number;
}

interface ImportResult {
  success: boolean;
  imported: ImportedFileResult[];
  errors: string[];
}

function App() {
  const { isMobile, isDesktop } = usePlatformFlags();
  const { t } = useI18n();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(() => new Set<Page>(["dashboard"]));
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [searchEntryTrigger, setSearchEntryTrigger] = useState(0);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [enterContentTrigger, setEnterContentTrigger] = useState(0);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [editorOpenTarget, setEditorOpenTarget] = useState<EditorOpenTarget | null>(null);
  const [externalFileOpenTarget, setExternalFileOpenTarget] = useState<ExternalFileOpenTarget | null>(null);
  const [deferredSystemFilePath, setDeferredSystemFilePath] = useState<string | null>(null);
  const sync = useSync();
  const { gitStatus } = sync;
  const {
    theme,
    toggleTheme,
    setPendingOpenPath,
    setAiRecordsTab,
    settings,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    mobileEditorActive,
  } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  const pageOrder = getAppPageOrder(isDesktop);
  const mobilePageStackRef = useRef<Page[]>([]);
  const mobileBackHandlersRef = useRef<Partial<Record<Page, MobileBackHandler>>>({});
  const mobileHistoryGuardActiveRef = useRef(false);
  const performMobileBackRef = useRef<() => boolean>(() => false);
  const routeNotificationTargetRef = useRef<(target: NotificationNavigateTarget) => void>(() => {});
  const initializedRef = useRef<boolean | null>(initialized);
  const routeExternalFileRef = useRef<(filePath: string) => Promise<boolean>>(async () => false);
  const externalFileOpenRequestIdRef = useRef(0);
  const mobileTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    applyMobileExtraTopSafeArea({ isMobile, enabled: loadMobileExtraTopSafeArea() });
  }, [isMobile]);

  useEffect(() => {
    initializedRef.current = initialized;
  }, [initialized]);

  // Lazy-mount: track visited pages so they stay mounted once opened
  useEffect(() => {
    setVisitedPages(prev => {
      if (prev.has(currentPage)) return prev;
      return new Set([...prev, currentPage]);
    });
  }, [currentPage]);

  useEffect(() => {
    if (shouldResetUnsupportedMobilePage(isMobile, currentPage)) {
      setCurrentPage("dashboard");
      mobilePageStackRef.current = [];
    }
  }, [currentPage, isMobile]);

  const ensureMobileHistoryGuard = useCallback(() => {
    if (!shouldInstallMobileHistoryGuard(isMobile, initialized, mobileHistoryGuardActiveRef.current)) return;
    window.history.pushState({ gitmemoMobileGuard: true }, "");
    mobileHistoryGuardActiveRef.current = true;
  }, [initialized, isMobile]);

  const navigatePage = useCallback((page: Page, stack = true) => {
    if (shouldTriggerSearchEntryOnNavigate(isMobile, page)) {
      setSearchEntryTrigger((n) => n + 1);
    }
    if (page === currentPage) return;
    if (shouldPushMobilePageStack(isMobile, stack, page, currentPage)) {
      mobilePageStackRef.current = getNextMobilePageStack(mobilePageStackRef.current, currentPage);
      ensureMobileHistoryGuard();
    }
    setCurrentPage(page);
    setSidebarFocused(false);
  }, [currentPage, ensureMobileHistoryGuard, isMobile]);

  const registerMobileBackHandler = useCallback((page: Page, handler: MobileBackHandler | null) => {
    if (handler) mobileBackHandlersRef.current[page] = handler;
    else delete mobileBackHandlersRef.current[page];
  }, []);

  const performMobileBack = useCallback(() => {
    const pageHandler = mobileBackHandlersRef.current[currentPage];
    if (pageHandler?.()) return true;

    const backNavigation = resolveMobileBackNavigation(currentPage, mobilePageStackRef.current);
    if (!backNavigation.handled || !backNavigation.page) return false;
    mobilePageStackRef.current = backNavigation.stack;
    setCurrentPage(backNavigation.page);
    setSidebarFocused(false);
    return true;
  }, [currentPage]);

  useEffect(() => {
    performMobileBackRef.current = performMobileBack;
  }, [performMobileBack]);

  useEffect(() => {
    if (!isMobile) return;
    window.__gitmemoMobileBack = () => performMobileBackRef.current();
    return () => {
      delete window.__gitmemoMobileBack;
    };
  }, [isMobile]);

  useEffect(() => {
    if (!shouldUseMobileBackFeatures(isMobile, initialized)) return;
    window.history.replaceState({ gitmemoMobileRoot: true }, "");
    window.history.pushState({ gitmemoMobileGuard: true }, "");
    mobileHistoryGuardActiveRef.current = true;

    const handlePopState = () => {
      mobileHistoryGuardActiveRef.current = false;
      if (performMobileBackRef.current()) {
        window.history.pushState({ gitmemoMobileGuard: true }, "");
        mobileHistoryGuardActiveRef.current = true;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialized, isMobile]);

  useEffect(() => {
    if (!shouldUseMobileBackFeatures(isMobile, initialized)) return;

    let cancelled = false;
    let listener: { unregister: () => Promise<void> } | null = null;

    void onBackButtonPress(() => {
      if (performMobileBackRef.current()) {
        ensureMobileHistoryGuard();
        return;
      }
      void exit(0);
    }).then((registered) => {
      if (cancelled) void registered.unregister();
      else listener = registered;
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (listener) void listener.unregister();
    };
  }, [ensureMobileHistoryGuard, initialized, isMobile]);

  const handleMobileTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!shouldStartMobileBackGesture(isMobile, initialized, e.touches.length)) return;
    const touch = e.touches[0];
    mobileTouchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, [initialized, isMobile]);

  const handleMobileTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const start = mobileTouchStartRef.current;
    mobileTouchStartRef.current = null;
    if (!shouldStartMobileBackGesture(isMobile, initialized, e.changedTouches.length) || !start) return;

    const touch = e.changedTouches[0];
    const end = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    if (!isMobileBackSwipeGesture(start, end)) return;

    if (performMobileBack()) ensureMobileHistoryGuard();
  }, [ensureMobileHistoryGuard, initialized, isMobile, performMobileBack]);

  const navigateAndFocus = useCallback((page: Page) => {
    setCurrentPage(page);
    setFocusTrigger((n) => n + 1);
  }, []);

  const routeNotificationTarget = useCallback((target: NotificationNavigateTarget) => {
    if (target.aiRecordsTab) setAiRecordsTab(target.aiRecordsTab);
    if (target.openPath) {
      setPendingOpenPath(target.openPath);
      setOpenFilePath(target.openPath);
    }
    setEditorOpenTarget(null);
    setExternalFileOpenTarget(null);
    if (target.focus) navigateAndFocus(target.page);
    else navigatePage(target.page);
  }, [navigateAndFocus, navigatePage, setAiRecordsTab, setPendingOpenPath]);

  useEffect(() => {
    routeNotificationTargetRef.current = routeNotificationTarget;
  }, [routeNotificationTarget]);

  useEffect(() => {
    const handleTarget = (target: NotificationNavigateTarget) => {
      routeNotificationTargetRef.current(target);
    };
    const pendingTarget = consumeNotificationNavigateTarget();
    if (pendingTarget) handleTarget(pendingTarget);
    return subscribeNotificationNavigate(handleTarget);
  }, []);

  const routeExternalFile = useCallback(async (filePath: string) => {
    if (!isDesktop) return false;

    try {
      const target = await invoke<ExternalOpenTarget>("classify_external_open_target", { filePath });
      const syncRoute = resolveExternalSyncRoute(target.page);
      if (target.kind === "sync" && syncRoute && target.rel_path) {
        if (syncRoute.aiRecordsTab) setAiRecordsTab(syncRoute.aiRecordsTab);
        setEditorOpenTarget(null);
        setExternalFileOpenTarget(null);
        setPendingOpenPath(target.rel_path);
        setOpenFilePath(target.rel_path);
        setCurrentPage(syncRoute.page);
        return true;
      }
      if (target.kind === "editor" && target.root && target.rel_path) {
        setOpenFilePath(null);
        setExternalFileOpenTarget(null);
        setEditorOpenTarget({ root: target.root, relPath: target.rel_path });
        setCurrentPage("editor-home");
        return true;
      }
      if (target.kind === "external-file") {
        setOpenFilePath(null);
        setEditorOpenTarget(null);
        setPendingOpenPath(null);
        externalFileOpenRequestIdRef.current += 1;
        setExternalFileOpenTarget({
          filePath: target.file_path,
          requestId: externalFileOpenRequestIdRef.current,
        });
        setCurrentPage("external-files");
        return true;
      }
      await notify("GitMemo", `Unsupported file: ${target.file_path}`);
    } catch (e) {
      await notify("GitMemo", `Open failed: ${String(e)}`);
    }
    return false;
  }, [isDesktop, setAiRecordsTab, setPendingOpenPath]);

  useEffect(() => {
    routeExternalFileRef.current = routeExternalFile;
  }, [routeExternalFile]);

  // Derive initialization state from global gitStatus
  useEffect(() => {
    if (gitStatus) {
      setInitialized(gitStatus.initialized);
    }
  }, [gitStatus]);

  useEffect(() => {
    if (initialized !== true || !deferredSystemFilePath) return;
    const path = deferredSystemFilePath;
    setDeferredSystemFilePath(null);
    void routeExternalFile(path);
  }, [initialized, deferredSystemFilePath, routeExternalFile]);

  const focusSidebar = useCallback(() => setSidebarFocused(true), []);

  useEffect(() => {
    if (!isDesktop) return;

    let cancelled = false;
    const handleOpenFile = ({ payload }: { payload: string | { filePath?: string } }) => {
      const filePath = typeof payload === "string" ? payload : payload?.filePath;
      if (!filePath) return;
      if (initializedRef.current === false) {
        setDeferredSystemFilePath(filePath);
        return;
      }
      void routeExternalFileRef.current(filePath);
    };

    const unlistenSystemOpen = listen<string>("system-open-file", handleOpenFile);
    const unlistenQuickPasteOpenFile = listen<{ filePath?: string }>(
      "quick-paste-open-file",
      handleOpenFile,
    );

    unlistenSystemOpen
      .then(async () => {
        if (cancelled) return;
        const pending = await invoke<string[]>("app_ready").catch(() => []);
        if (cancelled) return;
        for (const filePath of pending) {
          handleOpenFile({ payload: filePath });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlistenSystemOpen.then((fn) => fn());
      unlistenQuickPasteOpenFile.then((fn) => fn());
    };
  }, [isDesktop]);

  // Intercept link clicks to open in external browser
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        e.preventDefault();
        void openUrl(href);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    // Desktop-only event listeners
    if (!isDesktop) return;

    const handleOpenPage = ({ payload }: { payload: { page?: string } }) => {
      const page = resolveQuickPasteOpenPage(payload?.page);
      if (!page) return;
      navigateAndFocus(page);
    };

    const unlistenSearch = listen("global-shortcut-search", () => navigateAndFocus("search"));
    const unlistenClip = listen("tray-toggle-clipboard", () => setCurrentPage("clipboard"));
    const unlistenQuickPasteOpenPage = listen<{ page?: string }>("quick-paste-open-page", handleOpenPage);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (sidebarFocused && e.key === "ArrowRight") {
        e.preventDefault();
        setSidebarFocused(false);
        setEnterContentTrigger((n) => n + 1);
        return;
      }

      if (shortcutMatches(e, shortcuts.quick_note)) {
        e.preventDefault();
        navigateAndFocus("notes");
        setSidebarFocused(false);
        return;
      }

      if (shortcutMatches(e, shortcuts.app_search)) {
        e.preventDefault();
        navigateAndFocus("search");
        setSidebarFocused(false);
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "1": e.preventDefault(); setCurrentPage("dashboard"); setSidebarFocused(false); break;
          case "2": e.preventDefault(); navigateAndFocus("search"); setSidebarFocused(false); break;
          case "3": e.preventDefault(); setCurrentPage("ai-records"); setSidebarFocused(false); break;
          case "4": e.preventDefault(); setCurrentPage("notes"); setSidebarFocused(false); break;
          case "5": e.preventDefault(); setCurrentPage("clipboard"); setSidebarFocused(false); break;
          case "6": e.preventDefault(); setCurrentPage("favorites"); setSidebarFocused(false); break;
          case "7": e.preventDefault(); setCurrentPage("claude-config"); setSidebarFocused(false); break;
          case "8": e.preventDefault(); setCurrentPage("external-files"); setSidebarFocused(false); break;
          case "9": e.preventDefault(); setCurrentPage("settings"); setSidebarFocused(false); break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenSearch.then((fn) => fn());
      unlistenClip.then((fn) => fn());
      unlistenQuickPasteOpenPage.then((fn) => fn());
    };
  }, [isDesktop, navigateAndFocus, sidebarFocused, shortcuts]);

  const handleExternalFileTargetConsumed = useCallback(() => {
    setExternalFileOpenTarget(null);
  }, []);

  const handleExternalImportResult = useCallback((result: ImportResult) => {
    const first = result.imported[0];
    if (!first) return;

    setEditorOpenTarget(null);
    setExternalFileOpenTarget(null);
    setOpenFilePath(null);
    setPendingOpenPath(first.dest_path);
    setCurrentPage("imports");
  }, [setPendingOpenPath]);

  const handleSetupComplete = useCallback((needsRemoteSync?: boolean) => {
    setInitialized(true);
    setCurrentPage("dashboard");
    mobilePageStackRef.current = [];
    if (needsRemoteSync) {
      void invoke("sync_remote_init").catch(() => {});
    }
  }, []);

  const handleOpenDroppedFiles = useCallback(async (paths: string[]) => {
    if (paths.length !== 1) {
      await notify("GitMemo", t("dropzone.openSingleOnly"));
      return false;
    }
    return routeExternalFile(paths[0]);
  }, [routeExternalFile, t]);

  const handleDropImportNavigate = useCallback((result: ImportResult) => {
    const first = result.imported[0];
    if (first) {
      setPendingOpenPath(first.dest_path);
    }
    setCurrentPage("imports");
  }, [setPendingOpenPath]);

  const dropZone = useMemo(
    () => (isDesktop ? <DropZone onOpenDroppedFiles={handleOpenDroppedFiles} onNavigateAfterImport={handleDropImportNavigate} /> : null),
    [isDesktop, handleOpenDroppedFiles, handleDropImportNavigate],
  );
  const showMobileTabBar = shouldShowMobileTabBar({ isMobile, mobileEditorChromeActive: mobileEditorActive });

  const pageContent = initialized === false && currentPage !== "settings" ? (
    <SetupWizard onComplete={handleSetupComplete} />
  ) : (
    <>
      {visitedPages.has("dashboard") && <div className="gm-app-page-mount" data-active={currentPage === "dashboard" ? "true" : "false"}><DashboardPage onNavigate={navigatePage} active={currentPage === "dashboard"} /></div>}
      {visitedPages.has("ai-records") && <div className="gm-app-page-mount" data-active={currentPage === "ai-records" ? "true" : "false"}><AiRecordsPage active={currentPage === "ai-records"} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} registerMobileBackHandler={(handler) => registerMobileBackHandler("ai-records", handler)} /></div>}
      {visitedPages.has("notes") && <div className="gm-app-page-mount" data-active={currentPage === "notes" ? "true" : "false"}><NotesPage active={currentPage === "notes"} focusTrigger={focusTrigger} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} registerMobileBackHandler={(handler) => registerMobileBackHandler("notes", handler)} /></div>}
      {visitedPages.has("clipboard") && <div className="gm-app-page-mount" data-active={currentPage === "clipboard" ? "true" : "false"}><ClipboardPage active={currentPage === "clipboard"} onNavigate={navigatePage} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} registerMobileBackHandler={(handler) => registerMobileBackHandler("clipboard", handler)} /></div>}
      {isDesktop && visitedPages.has("vault") && <div className="gm-app-page-mount" data-active={currentPage === "vault" ? "true" : "false"}><VaultPage active={currentPage === "vault"} /></div>}
      {visitedPages.has("favorites") && <div className="gm-app-page-mount" data-active={currentPage === "favorites" ? "true" : "false"}><FavoritesPage active={currentPage === "favorites"} registerMobileBackHandler={(handler) => registerMobileBackHandler("favorites", handler)} /></div>}
      {isDesktop && visitedPages.has("claude-config") && <div className="gm-app-page-mount" data-active={currentPage === "claude-config" ? "true" : "false"}><ClaudeConfigPage active={currentPage === "claude-config"} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} /></div>}
      {visitedPages.has("imports") && <div className="gm-app-page-mount" data-active={currentPage === "imports" ? "true" : "false"}><ImportsPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} active={currentPage === "imports"} registerMobileBackHandler={(handler) => registerMobileBackHandler("imports", handler)} /></div>}
      {isDesktop && visitedPages.has("editor-home") && <div className="gm-app-page-mount" data-active={currentPage === "editor-home" ? "true" : "false"}><EditorHomePage active={currentPage === "editor-home"} openTarget={editorOpenTarget} onOpenTargetConsumed={() => setEditorOpenTarget(null)} /></div>}
      {isDesktop && visitedPages.has("external-files") && <div className="gm-app-page-mount" data-active={currentPage === "external-files" ? "true" : "false"}><ExternalFilesPage active={currentPage === "external-files"} openTarget={externalFileOpenTarget} onOpenTargetConsumed={handleExternalFileTargetConsumed} onImportResult={handleExternalImportResult} /></div>}
      {visitedPages.has("search") && <div className="gm-app-page-mount" data-active={currentPage === "search" ? "true" : "false"}><SearchPage active={currentPage === "search"} focusTrigger={focusTrigger} entryTrigger={searchEntryTrigger} openFilePath={openFilePath} onFileOpened={() => setOpenFilePath(null)} registerMobileBackHandler={(handler) => registerMobileBackHandler("search", handler)} /></div>}
      {visitedPages.has("settings") && <div className="gm-app-page-mount" data-active={currentPage === "settings" ? "true" : "false"}><SettingsPage onNavigate={navigatePage} active={currentPage === "settings"} /></div>}
    </>
  );

  return (
    <div
      className="gm-app-shell"
      data-mobile={isMobile ? "true" : "false"}
      data-mobile-editor-chrome={mobileEditorActive ? "true" : "false"}
      onTouchStart={handleMobileTouchStart}
      onTouchEnd={handleMobileTouchEnd}
    >
      {isDesktop && initialized !== false && (
        <div className="gm-app-sidebar-shell" data-collapsed={sidebarCollapsed ? "true" : "false"}>
          {!sidebarCollapsed && (
            <Sidebar
              currentPage={currentPage}
              onNavigate={(p) => { setCurrentPage(p); setSidebarFocused(false); }}
              focused={sidebarFocused}
              syncing={sync.isSyncing}
              syncMsg={sync.message}
              syncFailed={sync.isFailed}
              onSync={sync.triggerSync}
            />
          )}
          <button
            type="button"
            className="gm-layout-boundary-toggle gm-sidebar-boundary-toggle"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? "展开导航" : "收起导航"}
            aria-label={sidebarCollapsed ? "展开导航" : "收起导航"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
      )}
      <main
        className="gm-app-main"
        onClick={() => setSidebarFocused(false)}
      >
        {pageContent}
      </main>
      {showMobileTabBar && initialized !== false && (
        <BottomNav currentPage={currentPage} onNavigate={navigatePage} />
      )}
      {dropZone}
    </div>
  );
}

export default App;
