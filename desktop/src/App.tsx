import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/Sidebar";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";

export type Page = "dashboard" | "notes" | "clipboard" | "search";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [focusTrigger, setFocusTrigger] = useState(0);

  const navigateAndFocus = useCallback((page: Page) => {
    setCurrentPage(page);
    setFocusTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    // Global shortcut search event from Rust
    const unlistenSearch = listen("global-shortcut-search", () => {
      navigateAndFocus("search");
    });

    // Tray clipboard toggle
    const unlistenClip = listen("tray-toggle-clipboard", () => {
      setCurrentPage("clipboard");
    });

    // App-level keyboard shortcuts
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
    };
  }, [navigateAndFocus]);

  return (
    <div className="flex h-screen w-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-hidden">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "notes" && <NotesPage focusTrigger={focusTrigger} />}
        {currentPage === "clipboard" && <ClipboardPage />}
        {currentPage === "search" && <SearchPage focusTrigger={focusTrigger} />}
      </main>
      <DropZone />
    </div>
  );
}

export default App;
