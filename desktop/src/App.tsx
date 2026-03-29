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
import { useSync } from "./hooks/useSync";

export type Page = "dashboard" | "conversations" | "notes" | "clipboard" | "search" | "settings";
export type Theme = "dark" | "light";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [sidebarFocused, setSidebarFocused] = useState(false);
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "1": e.preventDefault(); setCurrentPage("dashboard"); setSidebarFocused(false); break;
          case "2": e.preventDefault(); navigateAndFocus("search"); setSidebarFocused(false); break;
          case "3": e.preventDefault(); setCurrentPage("conversations"); setSidebarFocused(false); break;
          case "4": e.preventDefault(); setCurrentPage("notes"); setSidebarFocused(false); break;
          case "5": e.preventDefault(); setCurrentPage("clipboard"); setSidebarFocused(false); break;
          case "6": e.preventDefault(); setCurrentPage("settings"); setSidebarFocused(false); break;
          case "n": e.preventDefault(); navigateAndFocus("notes"); setSidebarFocused(false); break;
          case "k": e.preventDefault(); navigateAndFocus("search"); setSidebarFocused(false); break;
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenSearch.then((fn) => fn());
      unlistenClip.then((fn) => fn());
    };
  }, [navigateAndFocus, sidebarFocused]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={(p) => { setCurrentPage(p); setSidebarFocused(false); }}
        focused={sidebarFocused}
        syncing={sync.isSyncing}
        syncMsg={sync.message}
        onSync={sync.triggerSync}
      />
      <main style={{ flex: 1, overflow: "hidden" }}>
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "conversations" && <ConversationsPage sidebarFocused={sidebarFocused} onFocusSidebar={() => setSidebarFocused(true)} />}
        {currentPage === "notes" && <NotesPage focusTrigger={focusTrigger} />}
        {currentPage === "clipboard" && <ClipboardPage />}
        {currentPage === "search" && <SearchPage focusTrigger={focusTrigger} />}
        {currentPage === "settings" && <SettingsPage theme={theme} onToggleTheme={toggleTheme} />}
      </main>
      <DropZone />
    </div>
  );
}

export default App;
