import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Search, MessageSquare, StickyNote, Clipboard, FileText, Settings, FolderInput, Trash2, Copy, Check } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { relativeTime } from "../utils/time";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { formatShortcut, withDefaultShortcuts } from "../utils/shortcuts";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";
import { replaceMarkdownBody, stripMarkdownFrontmatter } from "../utils/markdown";

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

function sourceTypeFromPath(path: string) {
  if (path.startsWith("conversations/")) return "conversation";
  if (path.startsWith("clips/")) return "clip";
  if (path.startsWith("plans/")) return "plan";
  if (path.startsWith("imports/")) return "import";
  if (path.startsWith("claude-config/") || path.startsWith("cursor-config/")) return "config";
  return path.startsWith("notes/") ? "note" : "unknown";
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
  const clipboardWatching = useAppStore((s) => s.clipboardStatus?.watching ?? false);
  const refreshClipboardStatus = useAppStore((s) => s.refreshClipboardStatus);
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rawFileContent, setRawFileContent] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [copiedClip, setCopiedClip] = useState(false);
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
      setRawFileContent(content);
      setFileContent(path.startsWith("clips/") ? stripMarkdownFrontmatter(content) : content);
      setEditing(false);
      setEditContent("");
      setCopiedClip(false);
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
      const nextContent = selectedFile.startsWith("clips/")
        ? replaceMarkdownBody(rawFileContent, editContent)
        : editContent;
      await invoke("update_note", { filePath: selectedFile, content: nextContent });
      setFileContent(editContent);
      setRawFileContent(nextContent);
      setEditing(false);
      setEditContent("");
      showToast(t("notes.save"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [rawFileContent, selectedFile, editContent, showToast, t]);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    const sourceType = sourceTypeFromPath(selectedFile);
    const confirmKey =
      sourceType === "clip" ? "clipboard.deleteConfirm" :
      sourceType === "plan" ? "plans.deleteConfirm" :
      sourceType === "conversation" ? "conversations.deleteConfirm" :
      sourceType === "import" ? "imports.deleteConfirm" :
      "notes.deleteConfirm";
    const confirmed = await ask(t(confirmKey), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      if (sourceType === "clip") {
        await invoke("delete_clip", { filePath: selectedFile });
      } else if (sourceType === "plan") {
        const deleteSource = await ask(t("plans.deleteSourceConfirm"), {
          title: t("plans.deleteSource"),
          kind: "warning",
        });
        await invoke("delete_plan", { filePath: selectedFile, deleteSource });
      } else {
        await invoke("delete_note", { filePath: selectedFile });
      }
      setResults((prev) => prev.filter((r) => r.file_path !== selectedFile));
      setSelectedFile(null);
      setRawFileContent("");
      setFileContent("");
      setEditing(false);
      setEditContent("");
      showToast(
        sourceType === "clip" ? t("clipboard.clipDeleted") :
        sourceType === "plan" ? t("plans.deleted") :
        sourceType === "conversation" ? t("conversations.deleted") :
        sourceType === "import" ? t("imports.deleted") :
        t("notes.noteDeleted")
      );
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFile, showToast, t]);

  const selectedIsClip = selectedFile?.startsWith("clips/") ?? false;
  const selectedSourceType = selectedFile ? sourceTypeFromPath(selectedFile) : "unknown";
  const selectedCanEdit = selectedFile ? (
    selectedSourceType === "note" ||
    selectedSourceType === "clip" ||
    selectedSourceType === "import" ||
    (isDesktop && selectedSourceType === "conversation")
  ) : false;
  const selectedCanDelete = selectedFile ? (
    selectedSourceType === "note" ||
    selectedSourceType === "clip" ||
    selectedSourceType === "import" ||
    (isDesktop && (selectedSourceType === "conversation" || selectedSourceType === "plan"))
  ) : false;
  const mobileBottomPadding = MOBILE_BOTTOM_CONTENT_PADDING;
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setRawFileContent("");
    setFileContent("");
    setEditing(false);
    setEditContent("");
    setCopiedClip(false);
  }, []);

  const copySelectedClip = useCallback(async () => {
    if (!selectedFile?.startsWith("clips/")) return;
    try {
      const wasWatching = clipboardWatching;
      if (wasWatching) await invoke<string>("stop_clipboard_watch");
      await writeText(stripMarkdownFrontmatter(rawFileContent || fileContent));
      if (wasWatching) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        await invoke<string>("start_clipboard_watch");
        void refreshClipboardStatus();
      }
      setCopiedClip(true);
      window.setTimeout(() => setCopiedClip(false), 1500);
    } catch (e) {
      showToast(`Copy failed: ${e}`, true);
    }
  }, [clipboardWatching, fileContent, rawFileContent, refreshClipboardStatus, selectedFile, showToast]);

  useEffect(() => {
    if (!isMobile || !entryTrigger) return;
    closeDetail();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [closeDetail, entryTrigger, isMobile]);

  useEffect(() => {
    if (!isMobile || !registerMobileBackHandler) return;
    registerMobileBackHandler(() => {
      if (selectedFile) {
        if (editing) {
          setEditing(false);
          setEditContent("");
          return true;
        }
        closeDetail();
        return true;
      }
      return false;
    });
    return () => registerMobileBackHandler(null);
  }, [closeDetail, editing, isMobile, registerMobileBackHandler, selectedFile]);

  if (selectedFile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minWidth: 0, minHeight: 0 }}>
        <FileDetailToolbar
          title={isMobile ? selectedFile.split("/").pop() : selectedFile}
          titleText={selectedFile}
          onBack={closeDetail}
          editing={editing}
          onEdit={selectedCanEdit ? startEdit : undefined}
          onSave={selectedCanEdit ? () => void handleSaveEdit() : undefined}
          onCancel={selectedCanEdit ? () => { setEditing(false); setEditContent(""); } : undefined}
          editTitle={t("notes.edit")}
          saveTitle={t("notes.save")}
          actionsAfterEdit={[
            {
              key: "delete",
              title: t("common.delete"),
              icon: <Trash2 size={isMobile ? 16 : 14} />,
              onClick: () => void handleDelete(),
              tone: "danger",
              hidden: editing || !selectedCanDelete,
            },
            {
              key: "copy",
              title: t("clipboard.copy"),
              icon: copiedClip
                ? <Check size={isMobile ? 16 : 14} />
                : <Copy size={isMobile ? 16 : 14} />,
              onClick: () => void copySelectedClip(),
              tone: copiedClip ? "success" : "default",
              hidden: editing || !selectedIsClip,
            },
          ]}
          more={!editing ? (
            <FileMoreActionsMenu
              relPath={selectedFile}
              exportContent={fileContent}
              exportTitle={selectedFile.split("/").pop()}
            />
          ) : null}
        />
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
