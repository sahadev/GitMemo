import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, MessageSquare, StickyNote, ChevronLeft } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { useI18n } from "../hooks/useI18n";

interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

export default function SearchPage({ focusTrigger, openFilePath, onFileOpened }: { focusTrigger?: number; openFilePath?: string | null; onFileOpened?: () => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTrigger && inputRef.current) inputRef.current.focus();
  }, [focusTrigger]);

  useEffect(() => {
    if (openFilePath) {
      openFile(openFilePath);
      onFileOpened?.();
    }
  }, [openFilePath]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await invoke<SearchResultItem[]>("search_all", { query: query.trim(), typeFilter: null, limit: 30 });
      setResults(res);
    } catch (e) { console.error(e); setResults([]); }
    finally { setLoading(false); }
  };

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
    } catch (e) { console.error(e); }
  };

  if (selectedFile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <button
            onClick={() => { setSelectedFile(null); setFileContent(""); }}
            style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedFile}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
          <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search Bar */}
      <div style={{ padding: "20px 28px 16px" }}>
        <div style={{ position: "relative" }}>
          <Search
            size={16}
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Search conversations, notes, clips... (Cmd+K)"
            style={{
              width: "100%", paddingLeft: 42, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
              borderRadius: 10, fontSize: 14, fontFamily: "inherit",
              background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)",
            }}
          />
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 28px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", padding: "20px 0" }}>Searching...</p>
        ) : !searched ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <Search size={44} style={{ color: "var(--border)", marginBottom: 16 }} />
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Full-text search across all your data</p>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>Cmd+Shift+G to search from anywhere</p>
          </div>
        ) : results.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", paddingTop: 16 }}>No results for "{query}"</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>{results.length} results</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => openFile(r.file_path)}
                  style={{
                    width: "100%", textAlign: "left", padding: "14px 18px", borderRadius: 10, cursor: "pointer",
                    background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-card)"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {r.source_type === "conversation" ? (
                      <MessageSquare size={14} style={{ color: "var(--accent)" }} />
                    ) : (
                      <StickyNote size={14} style={{ color: "var(--green)" }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{r.title}</span>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", flexShrink: 0 }}>{r.date}</span>
                  </div>
                  {r.snippet && (
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 4 }}>
                      {r.snippet}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
