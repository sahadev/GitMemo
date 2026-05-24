import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Search, MessageSquare, StickyNote, ChevronLeft, Clipboard, FileText, Settings, FolderInput, Pencil, Save, X, Trash2 } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { RevealInFinderButton } from "../components/RevealInFinderButton";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { relativeTime } from "../utils/time";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { formatShortcut, withDefaultShortcuts } from "../utils/shortcuts";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";

interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

const SEARCH_STATE_KEY = "gitmemo-search-state";
const mobileSourceTypes = new Set(["conversation", "note", "clip", "plan", "import"]);

function isMobileContentPath(path: string) {
  return path.startsWith("conversations/")
    || path.startsWith("notes/")
    || path.startsWith("clips/")
    || path.startsWith("plans/")
    || path.startsWith("imports/");
}

export default function SearchPage({
  focusTrigger,
  entryTrigger,
  openFilePath,
  onFileOpened,
  registerMobileBackHandler,
}: {
  focusTrigger?: number;
  entryTrigger?: number;
  openFilePath?: string | null;
  onFileOpened?: () => void;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { isMobile, isDesktop } = usePlatformFlags();
  const settings = useAppStore((s) => s.settings);
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
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
      setResults((saved.results || []).filter((item) => isDesktop || mobileSourceTypes.has(item.source_type)));
      setSearched(Boolean(saved.searched));
      if (isDesktop && saved.selectedFile) {
        void openFile(saved.selectedFile);
      }
    } catch {
      // Ignore invalid cached state.
    }
  }, [isDesktop]);

  useEffect(() => {
    if (focusTrigger && inputRef.current) inputRef.current.focus();
  }, [focusTrigger]);

  useEffect(() => {
    if (openFilePath && (isDesktop || isMobileContentPath(openFilePath))) {
      openFile(openFilePath);
      onFileOpened?.();
    }
  }, [isDesktop, openFilePath, onFileOpened]);

  useEffect(() => {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({
      query,
      results,
      searched,
      selectedFile: isDesktop ? selectedFile : null,
    }));
  }, [isDesktop, query, results, searched, selectedFile]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await invoke<SearchResultItem[]>("search_all", { query: query.trim(), typeFilter: null, limit: isMobile ? 60 : 30 });
      setResults(isDesktop ? res : res.filter((item) => mobileSourceTypes.has(item.source_type)));
    } catch (e) { console.error(e); setResults([]); }
    finally { setLoading(false); }
  };

  const openFile = async (path: string) => {
    if (!isDesktop && !isMobileContentPath(path)) return;
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
      if (isMobile && !selectedFile.startsWith("notes/")) return;
      await invoke("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      setEditing(false);
      setEditContent("");
      showToast(t("notes.save"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [isMobile, selectedFile, editContent, showToast, t]);

  const handleDelete = async () => {
    if (!selectedFile) return;
    if (isMobile && !selectedFile.startsWith("notes/")) return;
    const confirmed = await ask(t("notes.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke("delete_note", { filePath: selectedFile });
      setResults((prev) => prev.filter((r) => r.file_path !== selectedFile));
      setSelectedFile(null);
      setFileContent("");
      setEditing(false);
      showToast(t("notes.noteDeleted"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const selectedIsNote = selectedFile?.startsWith("notes/") ?? false;
  const mobileBottomPadding = MOBILE_BOTTOM_CONTENT_PADDING;
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setEditing(false);
    setEditContent("");
  }, []);

  useEffect(() => {
    if (!isMobile || !entryTrigger) return;
    closeDetail();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [closeDetail, entryTrigger, isMobile]);

  useEffect(() => {
    if (!isMobile || !registerMobileBackHandler) return;
    registerMobileBackHandler(() => {
      if (selectedFile) {
        closeDetail();
        return true;
      }
      return false;
    });
    return () => registerMobileBackHandler(null);
  }, [closeDetail, isMobile, registerMobileBackHandler, selectedFile]);

  if (selectedFile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minWidth: 0, minHeight: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: isMobile ? "8px 12px" : "12px 20px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <button
            onClick={closeDetail}
            style={{
              width: isMobile ? 36 : 24, height: isMobile ? 36 : 24, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)",
              flexShrink: 0,
            }}
            title={t("common.back")}
          >
            <ChevronLeft size={isMobile ? 20 : 16} />
          </button>
          <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isMobile ? selectedFile.split("/").pop() : selectedFile}
          </span>
          {isDesktop && <RevealInFinderButton relPath={selectedFile} />}
          {isDesktop && selectedFile ? <CopyPathButton relPath={selectedFile} /> : null}
          {(isDesktop || selectedIsNote) && <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 2 : 6 }}>
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditContent(""); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    width: isMobile ? 38 : undefined, height: isMobile ? 38 : undefined,
                    padding: isMobile ? 0 : "5px 10px",
                    borderRadius: 6, fontSize: 12, cursor: "pointer",
                    background: isMobile ? "transparent" : "var(--bg)", border: isMobile ? "none" : "1px solid var(--border)", color: "var(--text-secondary)",
                  }}
                  title={t("common.cancel")}
                >
                  <X size={isMobile ? 16 : 12} />
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    width: isMobile ? 38 : undefined, height: isMobile ? 38 : undefined,
                    padding: isMobile ? 0 : "5px 10px",
                    borderRadius: 6, fontSize: 12, cursor: "pointer",
                    background: isMobile ? "var(--bg-success)" : "var(--bg)", border: isMobile ? "none" : "1px solid var(--border)", color: isMobile ? "var(--green)" : "var(--accent)",
                  }}
                  title={t("notes.save")}
                >
                  <Save size={isMobile ? 16 : 12} />
                  {!isMobile && t("notes.save")}
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  width: isMobile ? 38 : undefined, height: isMobile ? 38 : undefined,
                  padding: isMobile ? 0 : "5px 10px",
                  borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: isMobile ? "transparent" : "var(--bg)", border: isMobile ? "none" : "1px solid var(--border)", color: "var(--text-secondary)",
                }}
                title={t("notes.edit")}
              >
                <Pencil size={isMobile ? 16 : 12} />
                {!isMobile && t("notes.edit")}
              </button>
            )}
            <button
              onClick={() => void handleDelete()}
              style={{
                width: isMobile ? 38 : undefined, height: isMobile ? 38 : undefined,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: isMobile ? 0 : 6, borderRadius: 6, background: "none", border: "none",
                cursor: "pointer", color: "var(--text-secondary)",
              }}
              title={t("common.delete")}
            >
              <Trash2 size={isMobile ? 16 : 14} />
            </button>
          </div>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? `16px 16px ${mobileBottomPadding}` : "20px 28px", userSelect: "text" }}>
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
                fontSize: isMobile ? 15 : 13, fontFamily: "ui-monospace, monospace", lineHeight: 1.7,
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
      <div style={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minWidth: 0, minHeight: 0 }}>
      {/* Search Bar */}
      <div style={{ padding: isMobile ? "14px 14px 12px" : "20px 28px 16px" }}>
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
            enterKeyHint="search"
            placeholder={isMobile ? t("search.mobilePlaceholder") : t("search.placeholder", formatShortcut(shortcuts.app_search))}
            style={{
              width: "100%", paddingLeft: 42, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
              borderRadius: 6, fontSize: 14, fontFamily: "inherit",
              background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)",
            }}
          />
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? `0 14px ${mobileBottomPadding}` : "0 28px 28px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", padding: "20px 0" }}>{t("search.searching")}</p>
        ) : !searched ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <Search size={44} style={{ color: "var(--border)", marginBottom: 16 }} />
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {isMobile ? t("search.mobileEmptyTitle") : t("search.emptyTitle")}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
              {isMobile ? t("search.mobileEmptyHint") : t("search.emptyHint", formatShortcut(shortcuts.global_search))}
            </p>
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
                    width: "100%", textAlign: "left", padding: "14px 18px", borderRadius: 6, cursor: "pointer",
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
