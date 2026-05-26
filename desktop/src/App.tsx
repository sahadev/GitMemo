import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import AiRecordsPage from "./pages/AiRecordsPage";
import ClaudeConfigPage from "./pages/ClaudeConfigPage";
import EditorHomePage from "./pages/EditorHomePage";
import ExternalFilesPage from "./pages/ExternalFilesPage";
import ImportsPage from "./pages/ImportsPage";
import { SetupWizard } from "./components/SetupWizard";
import { useSync } from "./hooks/useSync";
import { usePlatformFlags } from "./hooks/usePlatform";
import { useAppStore } from "./hooks/useAppStore";
import { useI18n } from "./hooks/useI18n";
import { shortcutMatches, withDefaultShortcuts } from "./utils/shortcuts";

declare global {
  interface Window {
    __gitmemoMobileBack?: () => boolean;
  }
}

export type Page = "dashboard" | "search" | "ai-records" | "notes" | "clipboard" | "imports" | "claude-config" | "editor-home" | "external-files" | "settings";
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

const desktopPageOrder: Page[] = ["dashboard", "search", "ai-records", "notes", "clipboard", "claude-config", "external-files", "settings"];
const mobilePageOrder: Page[] = ["dashboard", "search", "ai-records", "notes", "clipboard", "imports", "settings"];

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
  const { theme, toggleTheme, setPendingOpenPath, setAiRecordsTab, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  const pageOrder = isDesktop ? desktopPageOrder : mobilePageOrder;
  const mobilePageStackRef = useRef<Page[]>([]);
  const mobileBackHandlersRef = useRef<Partial<Record<Page, MobileBackHandler>>>({});
  const mobileHistoryGuardActiveRef = useRef(false);
  const performMobileBackRef = useRef<() => boolean>(() => false);
  const mobileTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    void invoke("app_ready").catch(() => {});
  }, []);

  // Lazy-mount: track visited pages so they stay mounted once opened
  useEffect(() => {
    setVisitedPages(prev => {
      if (prev.has(currentPage)) return prev;
      return new Set([...prev, currentPage]);
    });
  }, [currentPage]);

  useEffect(() => {
    if (isMobile && !mobilePageOrder.includes(currentPage)) {
      setCurrentPage("dashboard");
      mobilePageStackRef.current = [];
    }
  }, [currentPage, isMobile]);

  const ensureMobileHistoryGuard = useCallback(() => {
    if (!isMobile || initialized === false || mobileHistoryGuardActiveRef.current) return;
    window.history.pushState({ gitmemoMobileGuard: true }, "");
    mobileHistoryGuardActiveRef.current = true;
  }, [initialized, isMobile]);

  const navigatePage = useCallback((page: Page, stack = true) => {
    if (isMobile && page === "search") {
      setSearchEntryTrigger((n) => n + 1);
    }
    if (page === currentPage) return;
    if (isMobile && stack) {
      const nextStack = [...mobilePageStackRef.current, currentPage].slice(-30);
      mobilePageStackRef.current = nextStack;
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

    const previous = mobilePageStackRef.current[mobilePageStackRef.current.length - 1];
    if (previous) {
      const nextStack = mobilePageStackRef.current.slice(0, -1);
      mobilePageStackRef.current = nextStack;
      setCurrentPage(previous);
      setSidebarFocused(false);
      return true;
    }

    if (currentPage !== "dashboard") {
      setCurrentPage("dashboard");
      setSidebarFocused(false);
      return true;
    }

    return false;
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
    if (!isMobile || initialized === false) return;
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
    if (!isMobile || initialized === false) return;

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
    if (!isMobile || initialized === false || e.touches.length !== 1) return;
    const touch = e.touches[0];
    mobileTouchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, [initialized, isMobile]);

  const handleMobileTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const start = mobileTouchStartRef.current;
    mobileTouchStartRef.current = null;
    if (!isMobile || initialized === false || !start || e.changedTouches.length !== 1) return;
    if (start.x > 36) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    if (deltaX < 72 || Math.abs(deltaY) > 60 || elapsed > 800) return;

    if (performMobileBack()) ensureMobileHistoryGuard();
  }, [ensureMobileHistoryGuard, initialized, isMobile, performMobileBack]);

  const navigateAndFocus = useCallback((page: Page) => {
    setCurrentPage(page);
    setFocusTrigger((n) => n + 1);
  }, []);

  const routeExternalFile = useCallback(async (filePath: string) => {
    if (!isDesktop) return false;

    try {
      const target = await invoke<ExternalOpenTarget>("classify_external_open_target", { filePath });
      if (target.kind === "sync" && target.page && target.rel_path) {
        const page = target.page === "conversations" || target.page === "plans" ? "ai-records" : target.page as Page;
        if (target.page === "conversations") setAiRecordsTab("conversations");
        if (target.page === "plans") setAiRecordsTab("plans");
        setEditorOpenTarget(null);
        setExternalFileOpenTarget(null);
        setPendingOpenPath(target.rel_path);
        setOpenFilePath(target.rel_path);
        setCurrentPage(page);
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
        setExternalFileOpenTarget({ filePath: target.file_path, requestId: Date.now() });
        setCurrentPage("external-files");
        return true;
      }
      await notify("GitMemo", `Unsupported file: ${target.file_path}`);
    } catch (e) {
      await notify("GitMemo", `Open failed: ${String(e)}`);
    }
    return false;
  }, [isDesktop, setAiRecordsTab, setPendingOpenPath]);

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
      if (!payload?.page) return;
      const page = payload.page === "settings" ? "settings" : payload.page === "clipboard" ? "clipboard" : payload.page === "search" ? "search" : null;
      if (!page) return;
      navigateAndFocus(page);
    };

    const handleOpenFile = ({ payload }: { payload: string | { filePath?: string } }) => {
      const filePath = typeof payload === "string" ? payload : payload?.filePath;
      if (!filePath) return;
      if (initialized === false) {
        setDeferredSystemFilePath(filePath);
        return;
      }
      void routeExternalFile(filePath);
    };

    const unlistenSearch = listen("global-shortcut-search", () => navigateAndFocus("search"));
    const unlistenClip = listen("tray-toggle-clipboard", () => setCurrentPage("clipboard"));
    const unlistenSystemOpen = listen<string>("system-open-file", handleOpenFile);
    const unlistenQuickPasteOpenFile = listen<{ filePath?: string }>("quick-paste-open-file", handleOpenFile);
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
          case "6": e.preventDefault(); setCurrentPage("claude-config"); setSidebarFocused(false); break;
          case "7": e.preventDefault(); setCurrentPage("external-files"); setSidebarFocused(false); break;
          case "8": e.preventDefault(); setCurrentPage("settings"); setSidebarFocused(false); break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenSearch.then((fn) => fn());
      unlistenClip.then((fn) => fn());
      unlistenSystemOpen.then((fn) => fn());
      unlistenQuickPasteOpenFile.then((fn) => fn());
      unlistenQuickPasteOpenPage.then((fn) => fn());
    };
  }, [navigateAndFocus, sidebarFocused, initialized, routeExternalFile, shortcuts]);

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

  const pageContent = initialized === false && currentPage !== "settings" ? (
    <SetupWizard onComplete={handleSetupComplete} />
  ) : (
    <>
      {visitedPages.has("dashboard") && <div style={{ display: currentPage === "dashboard" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><DashboardPage onNavigate={navigatePage} active={currentPage === "dashboard"} /></div>}
      {visitedPages.has("ai-records") && <div style={{ display: currentPage === "ai-records" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><AiRecordsPage active={currentPage === "ai-records"} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} registerMobileBackHandler={(handler) => registerMobileBackHandler("ai-records", handler)} /></div>}
      {visitedPages.has("notes") && <div style={{ display: currentPage === "notes" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><NotesPage active={currentPage === "notes"} focusTrigger={focusTrigger} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} registerMobileBackHandler={(handler) => registerMobileBackHandler("notes", handler)} /></div>}
      {visitedPages.has("clipboard") && <div style={{ display: currentPage === "clipboard" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><ClipboardPage active={currentPage === "clipboard"} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} registerMobileBackHandler={(handler) => registerMobileBackHandler("clipboard", handler)} /></div>}
      {isDesktop && visitedPages.has("claude-config") && <div style={{ display: currentPage === "claude-config" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><ClaudeConfigPage active={currentPage === "claude-config"} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} /></div>}
      {visitedPages.has("imports") && <div style={{ display: currentPage === "imports" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><ImportsPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} active={currentPage === "imports"} registerMobileBackHandler={(handler) => registerMobileBackHandler("imports", handler)} /></div>}
      {isDesktop && visitedPages.has("editor-home") && <div style={{ display: currentPage === "editor-home" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><EditorHomePage openTarget={editorOpenTarget} onOpenTargetConsumed={() => setEditorOpenTarget(null)} /></div>}
      {isDesktop && visitedPages.has("external-files") && <div style={{ display: currentPage === "external-files" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><ExternalFilesPage openTarget={externalFileOpenTarget} onOpenTargetConsumed={handleExternalFileTargetConsumed} onImportResult={handleExternalImportResult} /></div>}
      {visitedPages.has("search") && <div style={{ display: currentPage === "search" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><SearchPage focusTrigger={focusTrigger} entryTrigger={searchEntryTrigger} openFilePath={openFilePath} onFileOpened={() => setOpenFilePath(null)} registerMobileBackHandler={(handler) => registerMobileBackHandler("search", handler)} /></div>}
      {visitedPages.has("settings") && <div style={{ display: currentPage === "settings" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}><SettingsPage onNavigate={navigatePage} /></div>}
    </>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      height: isMobile ? "100dvh" : "100vh",
      width: "100vw",
      overflow: "hidden",
    }}
      onTouchStart={handleMobileTouchStart}
      onTouchEnd={handleMobileTouchEnd}
    >
      {isDesktop && initialized !== false && (
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
      <main
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          minWidth: 0,
          minHeight: 0,
          boxSizing: "border-box",
        }}
        onClick={() => setSidebarFocused(false)}
      >
        {pageContent}
      </main>
      {isMobile && initialized !== false && (
        <BottomNav currentPage={currentPage} onNavigate={navigatePage} />
      )}
      {dropZone}
    </div>
  );
}

export default App;
