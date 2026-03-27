import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, MessageSquare, StickyNote, ChevronLeft } from "lucide-react";
import MarkdownView from "../components/MarkdownView";

interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

export default function SearchPage({ focusTrigger }: { focusTrigger?: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTrigger && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focusTrigger]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await invoke<SearchResultItem[]>("search_all", {
        query: query.trim(),
        typeFilter: null,
        limit: 30,
      });
      setResults(res);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
    } catch (e) {
      console.error(e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  if (selectedFile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => { setSelectedFile(null); setFileContent(""); }}
            className="p-1 rounded hover:bg-[var(--bg-hover)]"
          >
            <ChevronLeft size={16} style={{ color: "var(--text-secondary)" }} />
          </button>
          <span className="text-[13px] truncate" style={{ color: "var(--text-secondary)" }}>
            {selectedFile}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <MarkdownView content={fileContent} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="px-6 pt-6 pb-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-secondary)" }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversations, notes, clips... (Cmd+K)"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-[14px]"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Searching...</p>
        ) : !searched ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Search size={40} style={{ color: "var(--border)" }} className="mb-3" />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Full-text search across all your data
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Cmd+Shift+G to search from anywhere
            </p>
          </div>
        ) : results.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No results for "{query}"
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
              {results.length} results
            </p>
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => openFile(r.file_path)}
                className="w-full text-left p-3 rounded-lg border transition-colors hover:bg-[var(--bg-hover)]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {r.source_type === "conversation" ? (
                    <MessageSquare size={13} style={{ color: "var(--accent)" }} />
                  ) : (
                    <StickyNote size={13} style={{ color: "var(--green)" }} />
                  )}
                  <span className="text-[13px] font-medium">{r.title}</span>
                  <span className="text-[10px] ml-auto" style={{ color: "var(--text-secondary)" }}>
                    {r.date}
                  </span>
                </div>
                {r.snippet && (
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    {r.snippet}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
