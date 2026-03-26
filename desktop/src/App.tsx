import { useState } from "react";
import Sidebar from "./components/Sidebar";
import DropZone from "./components/DropZone";
import NotesPage from "./pages/NotesPage";
import ClipboardPage from "./pages/ClipboardPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";

export type Page = "dashboard" | "notes" | "clipboard" | "search";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  return (
    <div className="flex h-screen w-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-hidden">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "notes" && <NotesPage />}
        {currentPage === "clipboard" && <ClipboardPage />}
        {currentPage === "search" && <SearchPage />}
      </main>
      {/* Global drag-drop overlay — always active regardless of page */}
      <DropZone />
    </div>
  );
}

export default App;
