import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Search, MessageSquare, StickyNote, ChevronLeft, Clipboard, FileText, Settings, FolderInput, Pencil, Save, X, Trash2 } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { relativeTime } from "../utils/time";

interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

const SEARCH_STATE_KEY = "gitmemo-search-state";

export default function SearchPage({ focusTrigger, openFilePath, onFileOpened }: { focusTrigger?: number; openFilePath?: string | null; onFileOpened?: () => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const imeComposingRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SEARCH_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        query?: string;
        results?: SearchResultItem[];
        searched?: boolean;
        selectedFile?: string | null;
      };
      setQuery(saved.query || "");
      setResults(saved.results || []);
      setSearched(Boolean(saved.searched));
      if (saved.selectedFile) {
        void openFile(saved.selectedFile);
      }
    } catch {
      // Ignore invalid cached state.
    }
  }, []);

  useEffect(() => {
    if (focusTrigger && inputRef.current) inputRef.current.focus();
  }, [focusTrigger]);

  useEffect(() => {
    if (openFilePath) {
      openFile(openFilePath);
      onFileOpened?.();
    }
  }, [openFilePath]);

  useEffect(() => {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({
      query,
      results,
      searched,
      selectedFile,
    }));
  }, [query, results, searched, selectedFile]);

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
      setEditing(false);
      setEditContent("");
    } catch (e) { console.error(e); }
  };

  const startEdit = useCallback(() => {
    if (!selectedFile) return;
    setEditing(true);
    setEditContent(fileContent);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }, [selectedFile, fileContent]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await invoke("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      setEditing(false);
      setEditContent("");
      showToast(t("conversations.saved"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFile, editContent, showToast, t]);

  const handleDelete = async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("conversations.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke("delete_note", { filePath: selectedFile });
      setResults((prev) => prev.filter((r) => r.file_path !== selectedFile));
      setSelectedFile(null);
      setFileContent("");
      setEditing(false);
      showToast(t("conversations.deleted"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  if (selectedFile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <button
            onClick={() => { setSelectedFile(null); setFileContent(""); setEditing(false); setEditContent(""); }}
            style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedFile}
          </span>
          {selectedFile ? <CopyPathButton relPath={selectedFile} /> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditContent(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                    borderRadius: 6, fontSize: 12, cursor: "pointer",
                    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                  }}
                  title={t("common.cancel")}
                >
                  <X size={12} />
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                    borderRadius: 6, fontSize: 12, cursor: "pointer",
                    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)",
                  }}
                  title={t("conversations.save")}
                >
                  <Save size={12} />
                  {t("conversations.save")}
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                  borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                }}
                title={t("conversations.edit")}
              >
                <Pencil size={12} />
                {t("conversations.edit")}
              </button>
            )}
            <button
              onClick={() => void handleDelete()}
              style={{
                padding: 6, borderRadius: 4, background: "none", border: "none",
                cursor: "pointer", color: "var(--text-secondary)",
              }}
              title={t("common.delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", userSelect: "text" }}>
          {editing ? (
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  void handleSaveEdit();
                }
              }}
              style={{
                width: "100%", height: "100%", resize: "none", padding: 0,
                background: "transparent", border: "none", color: "var(--text)",
                fontSize: 13, fontFamily: "ui-monospace, monospace", lineHeight: 1.7,
                outline: "none",
              }}
            />
          ) : (
            <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
          )}
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
            onCompositionStart={() => { imeComposingRef.current = true; }}
            onCompositionEnd={() => { imeComposingRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const ev = e.nativeEvent;
              if (imeComposingRef.current || ev.isComposing) return;
              if ("keyCode" in ev && (ev as KeyboardEvent).keyCode === 229) return;
              handleSearch();
            }}
            placeholder={t("search.placeholder")}
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
          <p style={{ fontSize: 13, color: "var(--text-secondary)", padding: "20px 0" }}>{t("search.searching")}</p>
        ) : !searched ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <Search size={44} style={{ color: "var(--border)", marginBottom: 16 }} />
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("search.emptyTitle")}</p>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{t("search.emptyHint")}</p>
          </div>
        ) : results.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", paddingTop: 16 }}>{t("search.noResults", query)}</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>{t("search.results", String(results.length))}</p>
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
                    ) : r.source_type === "clip" ? (
                      <Clipboard size={14} style={{ color: "var(--green)" }} />
                    ) : r.source_type === "plan" ? (
                      <FileText size={14} style={{ color: "var(--yellow)" }} />
                    ) : r.source_type === "config" ? (
                      <Settings size={14} style={{ color: "var(--text-secondary)" }} />
                    ) : r.source_type === "import" ? (
                      <FolderInput size={14} style={{ color: "#14b8a6" }} />
                    ) : (
                      <StickyNote size={14} style={{ color: "var(--green)" }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{r.title}</span>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", flexShrink: 0 }}>{relativeTime(r.date, t)}</span>
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
