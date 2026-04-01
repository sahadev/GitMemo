import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/Sidebar";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import PlansPage from "./pages/PlansPage";
import ClaudeConfigPage from "./pages/ClaudeConfigPage";
import { useSync } from "./hooks/useSync";

export type Page = "dashboard" | "conversations" | "notes" | "clipboard" | "search" | "plans" | "claude-config" | "settings";
export type Theme = "dark" | "light";

const pageOrder: Page[] = ["dashboard", "search", "conversations", "notes", "clipboard", "plans", "claude-config", "settings"];

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  // Incremented when user presses Right from sidebar → tells content page to select first item
  const [enterContentTrigger, setEnterContentTrigger] = useState(0);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const sync = useSync();
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("gitmemo-theme") as Theme) || "dark";
  });

  const navigateAndFocus = useCallback((page: Page) => {
    setCurrentPage(page);
    setFocusTrigger((n) => n + 1);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("gitmemo-theme", next);
      return next;
    });
  }, []);

  const focusSidebar = useCallback(() => setSidebarFocused(true), []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Intercept link clicks to open in external browser
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        e.preventDefault();
        window.open(href);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    const unlistenSearch = listen("global-shortcut-search", () => navigateAndFocus("search"));
    const unlistenClip = listen("tray-toggle-clipboard", () => setCurrentPage("clipboard"));
    const unlistenQuickPastePage = listen<{ page: Page | "sync" }>("quick-paste-open-page", ({ payload }) => {
      if (!payload) return;
      if (payload.page === "sync") {
        void sync.triggerSync();
        return;
      }
      setCurrentPage(payload.page);
      setFocusTrigger((n) => n + 1);
      setSidebarFocused(false);
    });
    const unlistenQuickPasteFile = listen<{ filePath: string }>("quick-paste-open-file", ({ payload }) => {
      if (!payload?.filePath) return;
      setCurrentPage("search");
      setOpenFilePath(payload.filePath);
      setSidebarFocused(false);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      // Sidebar focused: Up/Down switch pages, Right enters content
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

      // Cmd shortcuts
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
      unlistenQuickPastePage.then((fn) => fn());
      unlistenQuickPasteFile.then((fn) => fn());
    };
  }, [navigateAndFocus, sidebarFocused, currentPage, sync]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={(p) => { setCurrentPage(p); setSidebarFocused(true); }}
        focused={sidebarFocused}
        syncing={sync.isSyncing}
        syncMsg={sync.message}
        onSync={sync.triggerSync}
      />
      <main style={{ flex: 1, overflow: "hidden" }} onClick={() => setSidebarFocused(false)}>
        {currentPage === "dashboard" && <DashboardPage onNavigate={setCurrentPage} />}
        {currentPage === "conversations" && <ConversationsPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} sidebarFocused={sidebarFocused} />}
        {currentPage === "notes" && <NotesPage focusTrigger={focusTrigger} onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} />}
        {currentPage === "clipboard" && <ClipboardPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} />}
        {currentPage === "plans" && <PlansPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} />}
        {currentPage === "claude-config" && <ClaudeConfigPage onFocusSidebar={focusSidebar} enterTrigger={enterContentTrigger} />}
        {currentPage === "search" && <SearchPage focusTrigger={focusTrigger} openFilePath={openFilePath} onFileOpened={() => setOpenFilePath(null)} />}
        {currentPage === "settings" && <SettingsPage theme={theme} onToggleTheme={toggleTheme} />}
      </main>
      <DropZone />
    </div>
  );
}

export default App;
