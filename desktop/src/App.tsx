import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import ConversationsPage from "./pages/ConversationsPage";

export type Page = "dashboard" | "conversations" | "notes" | "clipboard" | "search" | "settings";
export type Theme = "dark" | "light";

const pageOrder: Page[] = ["dashboard", "search", "conversations", "notes", "clipboard", "settings"];

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const syncTimer = useRef<number | null>(null);
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

  // Shared sync function — min 1s spinner
  const triggerSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg("");
    const start = Date.now();
    try {
      const result = await invoke<string>("sync_to_git");
      const elapsed = Date.now() - start;
      const remaining = Math.max(1000 - elapsed, 0);
      syncTimer.current = window.setTimeout(() => {
        setSyncing(false);
        setSyncMsg(result);
        setTimeout(() => setSyncMsg(""), 3000);
      }, remaining);
    } catch (e) {
      const elapsed = Date.now() - start;
      const remaining = Math.max(1000 - elapsed, 0);
      syncTimer.current = window.setTimeout(() => {
        setSyncing(false);
        setSyncMsg(`Error: ${e}`);
        setTimeout(() => setSyncMsg(""), 3000);
      }, remaining);
    }
  }, [syncing]);

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
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [navigateAndFocus, sidebarFocused]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={(p) => { setCurrentPage(p); setSidebarFocused(false); }}
        focused={sidebarFocused}
        syncing={syncing}
        syncMsg={syncMsg}
        onSync={triggerSync}
      />
      <main style={{ flex: 1, overflow: "hidden" }}>
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "conversations" && <ConversationsPage sidebarFocused={sidebarFocused} onFocusSidebar={() => setSidebarFocused(true)} />}
        {currentPage === "notes" && <NotesPage focusTrigger={focusTrigger} onSync={triggerSync} />}
        {currentPage === "clipboard" && <ClipboardPage />}
        {currentPage === "search" && <SearchPage focusTrigger={focusTrigger} />}
        {currentPage === "settings" && <SettingsPage theme={theme} onToggleTheme={toggleTheme} />}
      </main>
      <DropZone />
    </div>
  );
}

export default App;
