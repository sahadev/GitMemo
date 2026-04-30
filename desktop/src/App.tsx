import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { notify } from "./utils/notify";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import PlansPage from "./pages/PlansPage";
import ClaudeConfigPage from "./pages/ClaudeConfigPage";
import EditorHomePage from "./pages/EditorHomePage";
import { SetupWizard } from "./components/SetupWizard";
import { useSync } from "./hooks/useSync";
import { usePlatform } from "./hooks/usePlatform";
import { useAppStore } from "./hooks/useAppStore";

export type Page = "dashboard" | "conversations" | "notes" | "clipboard" | "search" | "plans" | "claude-config" | "editor-home" | "settings";
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

const pageOrder: Page[] = ["dashboard", "search", "conversations", "notes", "clipboard", "plans", "claude-config", "settings"];

function App() {
  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(() => new Set<Page>(["dashboard"]));
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [enterContentTrigger, setEnterContentTrigger] = useState(0);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [editorOpenTarget, setEditorOpenTarget] = useState<EditorOpenTarget | null>(null);
  const [deferredSystemFilePath, setDeferredSystemFilePath] = useState<string | null>(null);
  const sync = useSync();
  const { gitStatus } = sync;
  const { theme, toggleTheme, setPendingOpenPath } = useAppStore();

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

  const navigateAndFocus = useCallback((page: Page) => {
    setCurrentPage(page);
    setFocusTrigger((n) => n + 1);
  }, []);

  const routeExternalFile = useCallback(async (filePath: string) => {
    try {
      const target = await invoke<ExternalOpenTarget>("classify_external_open_target", { filePath });
      if (target.kind === "sync" && target.page && target.rel_path) {
        const page = target.page as Page;
        setEditorOpenTarget(null);
        setPendingOpenPath(target.rel_path);
        setOpenFilePath(target.rel_path);
        setCurrentPage(page);
        return;
      }
      if (target.kind === "editor" && target.root && target.rel_path) {
        setOpenFilePath(null);
        setEditorOpenTarget({ root: target.root, relPath: target.rel_path });
        setCurrentPage("editor-home");
        return;
      }
      await notify("GitMemo", `Unsupported file: ${target.file_path}`);
    } catch (e) {
      await notify("GitMemo", `Open failed: ${String(e)}`);
    }
  }, [setPendingOpenPath]);

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
    if (isMobile) return;

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
    const unlistenClipSaved = listen<{ preview: string }>("clipboard-saved", ({ payload }) => {
      void notify("GitMemo Clipboard", payload?.preview || "Clip saved");
    });
    const unlistenSystemOpen = listen<string>("system-open-file", handleOpenFile);
    const unlistenQuickPasteOpenFile = listen<{ filePath?: string }>("quick-paste-open-file", handleOpenFile);
    const unlistenQuickPasteOpenPage = listen<{ page?: string }>("quick-paste-open-page", handleOpenPage);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (sidebarFocused) {
        const idx = pageOrder.indexOf(currentPage);
        if (e.key === "ArrowUp" && idx > 0) {
          e.preventDefault();
          setCurrentPage(pageOrder[idx - 1]);
        } else if (e.key === "ArrowDown" && idx < pageOrder.length - 1) {
          e.preventDefault();
          setCurrentPage(pageOrder[idx + 1]);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSidebarFocused(false);
          setEnterContentTrigger((n) => n + 1);
        }
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "1": e.preventDefault(); setCurrentPage("dashboard"); setSidebarFocused(false); break;
          case "2": e.preventDefault(); navigateAndFocus("search"); setSidebarFocused(false); break;
          case "3": e.preventDefault(); setCurrentPage("conversations"); setSidebarFocused(false); break;
          case "4": e.preventDefault(); setCurrentPage("notes"); setSidebarFocused(false); break;
          case "5": e.preventDefault(); setCurrentPage("clipboard"); setSidebarFocused(false); break;
          case "6": e.preventDefault(); setCurrentPage("plans"); setSidebarFocused(false); break;
          case "7": e.preventDefault(); setCurrentPage("claude-config"); setSidebarFocused(false); break;
          case "8": e.preventDefault(); setCurrentPage("settings"); setSidebarFocused(false); break;
          case "n": e.preventDefault(); navigateAndFocus("notes"); setSidebarFocused(false); break;
          case "k": e.preventDefault(); navigateAndFocus("search"); setSidebarFocused(false); break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenSearch.then((fn) => fn());
      unlistenClip.then((fn) => fn());
      unlistenClipSaved.then((fn) => fn());
      unlistenSystemOpen.then((fn) => fn());
      unlistenQuickPasteOpenFile.then((fn) => fn());
      unlistenQuickPasteOpenPage.then((fn) => fn());
    };
  }, [isMobile, navigateAndFocus, sidebarFocused, currentPage, sync, initialized, routeExternalFile]);

  const handleSetupComplete = useCallback((needsRemoteSync?: boolean) => {
    localStorage.removeItem("gitmemo-onboarding-state");
    setInitialized(true);
    sync.refreshGitStatus();
    invoke("restart_file_watcher").catch(() => {});
    if (needsRemoteSync) {
      invoke("sync_remote_init").catch(() => {});
    }
  }, [sync]);

  const pageContent = initialized === false && currentPage !== "settings" ? (
    <SetupWizard onComplete={handleSetupComplete} />
  ) : (
    <>
      {visitedPages.has("dashboard") && <div style={{ display: currentPage === "dashboard" ? "contents" : "none" }}><DashboardPage onNavigate={setCurrentPage} active={currentPage === "dashboard"} /></div>}
      {visitedPages.has("conversations") && <div style={{ display: currentPage === "conversations" ? "contents" : "none" }}><ConversationsPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} sidebarFocused={sidebarFocused} /></div>}
      {visitedPages.has("notes") && <div style={{ display: currentPage === "notes" ? "contents" : "none" }}><NotesPage focusTrigger={focusTrigger} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} /></div>}
      {visitedPages.has("clipboard") && <div style={{ display: currentPage === "clipboard" ? "contents" : "none" }}><ClipboardPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} /></div>}
      {visitedPages.has("plans") && <div style={{ display: currentPage === "plans" ? "contents" : "none" }}><PlansPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} /></div>}
      {visitedPages.has("claude-config") && <div style={{ display: currentPage === "claude-config" ? "contents" : "none" }}><ClaudeConfigPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} /></div>}
      {visitedPages.has("editor-home") && <div style={{ display: currentPage === "editor-home" ? "contents" : "none" }}><EditorHomePage openTarget={editorOpenTarget} onOpenTargetConsumed={() => setEditorOpenTarget(null)} /></div>}
      {visitedPages.has("search") && <div style={{ display: currentPage === "search" ? "contents" : "none" }}><SearchPage focusTrigger={focusTrigger} openFilePath={openFilePath} onFileOpened={() => setOpenFilePath(null)} /></div>}
      {visitedPages.has("settings") && <div style={{ display: currentPage === "settings" ? "contents" : "none" }}><SettingsPage onNavigate={setCurrentPage} /></div>}
    </>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      height: "100vh",
      width: "100vw",
    }}>
      {!isMobile && initialized !== false && (
        <Sidebar
          currentPage={currentPage}
          onNavigate={(p) => { setCurrentPage(p); setSidebarFocused(true); }}
          focused={sidebarFocused}
          syncing={sync.isSyncing}
          syncMsg={sync.message}
          syncFailed={sync.isFailed}
          onSync={sync.triggerSync}
        />
      )}
      <main style={{ flex: 1, overflow: "hidden" }} onClick={() => setSidebarFocused(false)}>
        {pageContent}
      </main>
      {isMobile && (
        <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
      )}
      {!isMobile && <DropZone />}
    </div>
  );
}

export default App;
