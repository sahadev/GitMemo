import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";

export type Page = "dashboard" | "notes" | "clipboard" | "search";
export type Theme = "dark" | "light";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [focusTrigger, setFocusTrigger] = useState(0);
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

  useEffect(() => {
    const unlistenSearch = listen("global-shortcut-search", () => navigateAndFocus("search"));
    const unlistenClip = listen("tray-toggle-clipboard", () => setCurrentPage("clipboard"));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "1": e.preventDefault(); setCurrentPage("dashboard"); break;
          case "2": e.preventDefault(); setCurrentPage("notes"); break;
          case "3": e.preventDefault(); setCurrentPage("clipboard"); break;
          case "4": e.preventDefault(); setCurrentPage("search"); break;
          case "n": e.preventDefault(); navigateAndFocus("notes"); break;
          case "k": e.preventDefault(); navigateAndFocus("search"); break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenSearch.then((fn) => fn());
      unlistenClip.then((fn) => fn());
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [navigateAndFocus]);

  return (
    <div className="flex h-screen w-screen">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        theme={theme}
        onToggleTheme={toggleTheme}
        syncing={syncing}
        syncMsg={syncMsg}
        onSync={triggerSync}
      />
      <main className="flex-1 overflow-hidden">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "notes" && <NotesPage focusTrigger={focusTrigger} onSync={triggerSync} />}
        {currentPage === "clipboard" && <ClipboardPage />}
        {currentPage === "search" && <SearchPage focusTrigger={focusTrigger} />}
      </main>
      <DropZone />
    </div>
  );
}

export default App;
