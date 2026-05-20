import { useState, useEffect, useRef, useCallback, type ClipboardEvent, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Plus, FileText, Calendar, BookOpen, Send, ChevronLeft, Pencil, Save, Trash2, X, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { RevealInFinderButton } from "../components/RevealInFinderButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore, type NotesTab } from "../hooks/useAppStore";
import { FILE_PAGE_SIZE, type FileEntry, type FilePage } from "../types/files";
import { useAutoLoadMore } from "../hooks/useAutoLoadMore";

interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

interface SavedAttachment {
  path: string;
  markdown: string;
  message: string;
}

const tabs: { id: NotesTab; labelKey: string; icon: typeof FileText; folder: string }[] = [
  { id: "scratch", labelKey: "notes.scratch", icon: FileText, folder: "notes/scratch" },
  { id: "daily", labelKey: "notes.daily", icon: Calendar, folder: "notes/daily" },
  { id: "manual", labelKey: "notes.manual", icon: BookOpen, folder: "notes/manual" },
];

export default function NotesPage({ focusTrigger, onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { focusTrigger?: number; onFocusSidebar?: () => void; enterTrigger?: number }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { notesTab: activeTab, setNotesTab, pendingOpenPath, consumePendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [newNote, setNewNote] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const filesLengthRef = useRef(0);
  /** True while IME composition is active (more reliable than keydown.isComposing alone in some WebViews). */
  const imeComposingRef = useRef(false);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  // Keyboard nav for file list
  const navPrev = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx > 0) openFile(files[idx - 1].path);
  }, [selectedFile, files]);

  const navNext = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx < files.length - 1) openFile(files[idx + 1].path);
  }, [selectedFile, files]);

  const appendAttachmentMarkdown = useCallback(
    (setter: Dispatch<SetStateAction<string>>, markdown: string) => {
      setter((prev) => {
        if (!prev.trim()) return markdown;
        const needsBreak = !prev.endsWith("\n");
        return `${prev}${needsBreak ? "\n" : ""}\n${markdown}`;
      });
    },
    [],
  );

  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, []);

  const saveAttachment = useCallback(async (file: File) => {
    const base64 = arrayBufferToBase64(await file.arrayBuffer());
    return invoke<SavedAttachment>("save_pasted_attachment", {
      base64Data: base64,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name || null,
    });
  }, [arrayBufferToBase64]);

  const handlePasteAttachments = useCallback(async (
    e: ClipboardEvent<HTMLTextAreaElement>,
    setter: Dispatch<SetStateAction<string>>,
  ) => {
    // Try clipboardData.items first (standard), then fall back to clipboardData.files
    // (Tauri WKWebView on macOS may only expose pasted images via .files)
    let pastedFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (pastedFiles.length === 0 && e.clipboardData.files.length > 0) {
      pastedFiles = Array.from(e.clipboardData.files);
    }

    if (pastedFiles.length === 0) return;

    e.preventDefault();
    try {
      for (const file of pastedFiles) {
        const saved = await saveAttachment(file);
        appendAttachmentMarkdown(setter, saved.markdown);
        showToast(saved.message);
      }
    } catch (err) {
      showToast(`Error: ${err}`, true);
    }
  }, [appendAttachmentMarkdown, saveAttachment, showToast]);

  useEffect(() => {
    loadFiles();
    setSelectedFile(null);
    setFileContent("");
    setEditing(false);
  }, [activeTab]);

  useEffect(() => {
    if (focusTrigger && textareaRef.current) textareaRef.current.focus();
  }, [focusTrigger]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("notes/")) return;
    if (pendingOpenPath.startsWith("notes/daily/")) setNotesTab("daily");
    else if (pendingOpenPath.startsWith("notes/manual/")) setNotesTab("manual");
    else setNotesTab("scratch");
    void openFile(pendingOpenPath);
    consumePendingOpenPath();
  }, [pendingOpenPath, setNotesTab, consumePendingOpenPath]);

  const loadFiles = async (reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const folder = tabs.find((tb) => tb.id === activeTab)!.folder;
      const page = await invoke<FilePage>("list_files_page", {
        folder,
        offset: reset ? 0 : filesLengthRef.current,
        limit: FILE_PAGE_SIZE,
      });
      setFiles((prev) => reset ? page.entries : [...prev, ...page.entries]);
      setHasMore(page.has_more);
    } catch (e) { console.error(e); }
    finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };
  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [selectedFile, activeTab, files]);
  useFileWatcher(["notes"], loadFiles);
  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore: () => loadFiles(false),
  });

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setEditing(false);
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) { console.error(e); }
  };

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    if (activeTab === "manual" && !manualTitle.trim()) return;
    setSaving(true);
    try {
      let result: NoteResult;
      if (activeTab === "daily") {
        result = await invoke<NoteResult>("append_daily", { content: newNote });
      } else if (activeTab === "manual") {
        result = await invoke<NoteResult>("create_manual", { title: manualTitle, content: newNote, append: false });
      } else {
        result = await invoke<NoteResult>("create_note", { content: newNote });
      }
      showToast(result.message);
      setNewNote("");
      setManualTitle("");
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    try {
      const result = await invoke<NoteResult>("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      setEditing(false);
      showToast(result.message);
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("notes.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      setSelectedFile(null);
      setFileContent("");
      setEditing(false);
      showToast(t("notes.noteDeleted"));
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  };

  const startEdit = () => {
    setEditContent(fileContent);
    setEditing(true);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (!editing && selectedFile && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        startEdit();
      }
      if (!editing && selectedFile && (e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navPrev, navNext, editing, selectedFile, handleDelete, fileContent]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

  return (
    <div style={{ display: "flex", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="notes"
        defaultWidth={300}
        left={showList && (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        minHeight: 0, overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{
          display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)",
          padding: "0 8px",
        }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setNotesTab(tab.id)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, padding: "12px 4px", fontSize: 11, cursor: "pointer",
                  borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: "none", border: "none",
                  borderBottomStyle: "solid", borderBottomWidth: 2,
                  borderBottomColor: active ? "var(--accent)" : "transparent",
                }}
              >
                <Icon size={12} />
                {t(tab.labelKey)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 4,
              color: "var(--text-secondary)", display: "flex", alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Quick note input */}
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
          {activeTab === "manual" && (
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={t("notes.placeholderTitle")}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
                marginBottom: 8, background: "var(--bg)", color: "var(--text)",
                border: "1px solid var(--border)", fontFamily: "inherit",
              }}
            />
          )}
          <div style={{ position: "relative" }}>
            <textarea
              ref={textareaRef}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onPaste={(e) => void handlePasteAttachments(e, setNewNote)}
              onCompositionStart={() => { imeComposingRef.current = true; }}
              onCompositionEnd={() => { imeComposingRef.current = false; }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                const ev = e.nativeEvent;
                if (imeComposingRef.current || ev.isComposing) return;
                if ("keyCode" in ev && (ev as KeyboardEvent).keyCode === 229) return;
                e.preventDefault();
                void handleCreateNote();
              }}
              placeholder={activeTab === "daily" ? t("notes.placeholderDaily") : activeTab === "manual" ? t("notes.placeholderManual") : t("notes.placeholderScratch")}
              rows={3}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 6, fontSize: 13,
                resize: "vertical", background: "var(--bg)", color: "var(--text)",
                border: "1px solid var(--border)", fontFamily: "inherit", minHeight: 60,
              }}
            />
            <button
              onClick={handleCreateNote}
              disabled={!newNote.trim() || saving || (activeTab === "manual" && !manualTitle.trim())}
              style={{
                position: "absolute", bottom: 8, right: 8, padding: 4,
                borderRadius: 4, background: "none", border: "none", cursor: "pointer",
                color: saving ? "var(--green)" : newNote.trim() ? "var(--accent)" : "var(--text-secondary)",
                opacity: newNote.trim() ? 1 : 0.4,
                animation: saving ? "spin 1s linear infinite" : undefined,
              }}
            >
              <Send size={14} />
            </button>
          </div>
          <p style={{ fontSize: 10, marginTop: 6, color: saving ? "var(--green)" : "var(--text-secondary)" }}>
            {saving ? t("notes.saving") : t("notes.enterToSave")}
          </p>
        </div>

        {/* File list */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {loading ? (
            <Loading compact text={t("notes.loading")} />
          ) : files.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
              <FileText size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                {t("notes.noNotes", t(`notes.${activeTab}`))}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {activeTab === "scratch" || activeTab === "daily"
                  ? t("notes.useInputAbove")
                  : activeTab === "manual"
                  ? t("notes.docsHint")
                  : "Saved automatically from AI chats"}
              </p>
            </div>
          ) : (
            <>
            {files.map((file) => {
              const isDateName = /^\d{4}-\d{2}-\d{2}/.test(file.name);
              const title = isDateName && file.preview ? file.preview : file.name;
              const selected = selectedFile === file.path;
              return (
              <button
                key={file.path}
                ref={(el) => { if (el) itemRefs.current.set(file.path, el); else itemRefs.current.delete(file.path); }}
                onClick={() => openFile(file.path)}
                style={{
                  width: "100%", textAlign: "left", padding: "12px 16px",
                  cursor: "pointer", transition: "background 0.15s",
                  background: selected ? "var(--accent)" : "transparent",
                  border: "none", color: selected ? "#fff" : "var(--text)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </p>
                <p style={{ fontSize: 10, marginTop: 4, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                  {relativeTime(file.modified, t)}
                </p>
              </button>
              );
            })}
            {hasMore && (
              <div ref={sentinelRef}>
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                style={{
                  width: "100%", padding: "12px 16px", border: "none",
                  borderBottom: "1px solid var(--border)", background: "transparent",
                  color: "var(--accent)", cursor: loadingMore ? "default" : "pointer",
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {loadingMore ? t("common.loading") : t("common.loadMore")}
              </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>
      )}

        right={showDetail && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
        {selectedFile ? (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 20px", borderBottom: "1px solid var(--border)",
            }}>
              <button
                onClick={() => { setSelectedFile(null); setFileContent(""); setEditing(false); }}
                style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedFile}
              </span>
              <RevealInFinderButton relPath={selectedFile} />
              {selectedFile ? <CopyPathButton relPath={selectedFile} /> : null}
              {editing ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={handleSaveEdit} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 11, background: "var(--bg-success)", color: "var(--green)", border: "none", cursor: "pointer" }}>
                    <Save size={12} /> {t("notes.save")}
                  </button>
                  <button onClick={() => setEditing(false)} style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={startEdit} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                    <Pencil size={12} /> {t("notes.edit")}
                  </button>
                  <button onClick={handleDelete} style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--red)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
              {editing ? (
                <textarea
                  ref={editRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onPaste={(e) => void handlePasteAttachments(e, setEditContent)}
                  onKeyDown={(e) => {
                    if (e.key === "s" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  style={{
                    width: "100%", height: "100%", resize: "none", fontSize: 13,
                    lineHeight: 1.7, padding: 0, background: "transparent", color: "var(--text)",
                    border: "none", outline: "none",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                />
              ) : (
                <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <div style={{ textAlign: "center" }}>
              <Plus size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                {t("notes.selectOrCreate")}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                {t("notes.cmdN")}
              </p>
            </div>
          </div>
        )}
      </div>
      )}
      />
    </div>
  );
}
