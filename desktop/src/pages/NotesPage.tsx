import { useState, useEffect, useRef, useCallback, useMemo, type ClipboardEvent, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Plus, FileText, BookOpen, Send, ChevronLeft, Pencil, Save, Trash2, X, RefreshCw } from "lucide-react";
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
import { formatShortcut, shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";

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
  { id: "manual", labelKey: "notes.manual", icon: BookOpen, folder: "notes/manual" },
];

export default function NotesPage({
  focusTrigger,
  onFocusSidebar: _onFocusSidebar,
  enterTrigger: _enterTrigger,
  registerMobileBackHandler,
}: {
  focusTrigger?: number;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { notesTab: activeTab, setNotesTab, pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
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
  const pendingKeyboardNextIndexRef = useRef<number | null>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
  /** True while IME composition is active (more reliable than keydown.isComposing alone in some WebViews). */
  const imeComposingRef = useRef(false);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

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

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setEditing(false);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) { console.error(e); }
  }, [isMobile]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("notes/")) return;
    if (pendingOpenPath.startsWith("notes/manual/")) setNotesTab("manual");
    else setNotesTab("scratch");
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, setNotesTab, openFile, consumePendingOpenPath]);

  // Keyboard nav for file list
  const navPrev = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx > 0) void openFile(files[idx - 1].path);
  }, [selectedFile, files, openFile]);

  const navNext = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx < 0) return;
    if (idx < files.length - 1) {
      void openFile(files[idx + 1].path);
      return;
    }
    if (hasMore && !loadingMore) {
      pendingKeyboardNextIndexRef.current = idx + 1;
      void loadMore();
    }
  }, [selectedFile, files, hasMore, loadingMore, loadMore, openFile]);

  useEffect(() => {
    const pendingIndex = pendingKeyboardNextIndexRef.current;
    if (pendingIndex === null) return;
    if (files.length > pendingIndex) {
      pendingKeyboardNextIndexRef.current = null;
      void openFile(files[pendingIndex].path);
      return;
    }
    if (!hasMore && !loadingMore) {
      pendingKeyboardNextIndexRef.current = null;
    }
  }, [files, hasMore, loadingMore, openFile]);

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    if (activeTab === "manual" && !manualTitle.trim()) return;
    setSaving(true);
    try {
      let result: NoteResult;
      if (activeTab === "manual") {
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
    if (isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.edit_selected)) {
        e.preventDefault();
        startEdit();
      }
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.delete_selected)) {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, navPrev, navNext, editing, selectedFile, handleDelete, fileContent, shortcuts.edit_selected, shortcuts.delete_selected]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const mobileBottomPadding = MOBILE_BOTTOM_CONTENT_PADDING;
  const selectedFileName = selectedFile?.split("/").pop() ?? "";
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setEditing(false);
    detailOpenedFromCrossPageRef.current = false;
  }, []);

  useEffect(() => {
    if (!isMobile || !registerMobileBackHandler) return;
    registerMobileBackHandler(() => {
      if (selectedFile) {
        if (detailOpenedFromCrossPageRef.current) {
          closeDetail();
          return false;
        }
        closeDetail();
        return true;
      }
      return false;
    });
    return () => registerMobileBackHandler(null);
  }, [closeDetail, isMobile, registerMobileBackHandler, selectedFile]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="notes"
        defaultWidth={300}
        left={showList && (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        width: "100%", flex: 1, minWidth: 0,
        minHeight: 0, overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{
          display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)",
          padding: isMobile ? "0 10px" : "0 8px",
          flexShrink: 0,
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
                  gap: 5, padding: isMobile ? "13px 4px" : "12px 4px", fontSize: isMobile ? 12 : 11, cursor: "pointer",
                  borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: "none", border: "none",
                  borderBottomStyle: "solid", borderBottomWidth: 2,
                  borderBottomColor: active ? "var(--accent)" : "transparent",
                }}
              >
                <Icon size={isMobile ? 15 : 12} />
                {t(tab.labelKey)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0, borderRadius: 6,
              color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center",
              width: isMobile ? 40 : 28, height: isMobile ? 40 : 28,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Quick note input */}
        <div style={{ padding: isMobile ? "12px 14px" : 14, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {activeTab === "manual" && (
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={t("notes.placeholderTitle")}
              style={{
                width: "100%", padding: isMobile ? "11px 12px" : "8px 12px", borderRadius: 6, fontSize: isMobile ? 14 : 13,
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
                if (isMobile) return;
                if (e.key !== "Enter" || e.shiftKey) return;
                const ev = e.nativeEvent;
                if (imeComposingRef.current || ev.isComposing) return;
                if ("keyCode" in ev && (ev as KeyboardEvent).keyCode === 229) return;
                e.preventDefault();
                void handleCreateNote();
              }}
              placeholder={activeTab === "manual" ? t("notes.placeholderManual") : t("notes.placeholderScratch")}
              rows={isMobile ? 4 : 3}
              style={{
                width: "100%", padding: isMobile ? "12px 46px 12px 12px" : "10px 12px", borderRadius: 6, fontSize: isMobile ? 14 : 13,
                resize: "vertical", background: "var(--bg)", color: "var(--text)",
                border: "1px solid var(--border)", fontFamily: "inherit", minHeight: isMobile ? 96 : 60,
              }}
            />
            <button
              onClick={handleCreateNote}
              disabled={!newNote.trim() || saving || (activeTab === "manual" && !manualTitle.trim())}
              style={{
                position: "absolute", bottom: isMobile ? 10 : 8, right: isMobile ? 8 : 8, padding: 0,
                width: isMobile ? 34 : 22, height: isMobile ? 34 : 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6, background: isMobile ? "var(--bg-card)" : "none", border: isMobile ? "1px solid var(--border)" : "none", cursor: "pointer",
                color: saving ? "var(--green)" : newNote.trim() ? "var(--accent)" : "var(--text-secondary)",
                opacity: newNote.trim() ? 1 : 0.4,
                animation: saving ? "spin 1s linear infinite" : undefined,
              }}
            >
              <Send size={isMobile ? 16 : 14} />
            </button>
          </div>
          {(!isMobile || saving) && (
            <p style={{ fontSize: 10, marginTop: 6, color: saving ? "var(--green)" : "var(--text-secondary)" }}>
              {saving ? t("notes.saving") : t("notes.enterToSave")}
            </p>
          )}
        </div>

        {/* File list */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: isMobile ? mobileBottomPadding : 0 }}>
          {loading ? (
            <Loading compact text={t("notes.loading")} />
          ) : files.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
              <FileText size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                {t("notes.noNotes", t(`notes.${activeTab}`))}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {activeTab === "scratch"
                  ? t("notes.useInputAbove")
                  : activeTab === "manual"
                  ? t("notes.docsHint")
                  : t("notes.useInputAbove")}
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
                  width: "100%", textAlign: "left", padding: isMobile ? "15px 16px" : "12px 16px",
                  cursor: "pointer", transition: "background 0.15s",
                  background: selected ? "var(--accent)" : "transparent",
                  border: "none", color: selected ? "#fff" : "var(--text)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <p style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </p>
                <p style={{ fontSize: isMobile ? 11 : 10, marginTop: 5, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
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
      <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {selectedFile ? (
          <>
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
                {isMobile ? selectedFileName : selectedFile}
              </span>
              {!isMobile && <RevealInFinderButton relPath={selectedFile} />}
              {!isMobile && selectedFile ? <CopyPathButton relPath={selectedFile} /> : null}
              {editing ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={handleSaveEdit} title={t("notes.save")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, width: isMobile ? 38 : undefined, height: isMobile ? 38 : undefined, padding: isMobile ? 0 : "4px 10px", borderRadius: 6, fontSize: 11, background: "var(--bg-success)", color: "var(--green)", border: "none", cursor: "pointer" }}>
                    <Save size={isMobile ? 16 : 12} /> {!isMobile && t("notes.save")}
                  </button>
                  <button onClick={() => setEditing(false)} title={t("common.cancel")} style={{ width: isMobile ? 38 : 22, height: isMobile ? 38 : 22, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                    <X size={isMobile ? 17 : 14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={startEdit} title={t("notes.edit")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, width: isMobile ? 38 : undefined, height: isMobile ? 38 : undefined, padding: isMobile ? 0 : "4px 10px", borderRadius: 6, fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                    <Pencil size={isMobile ? 16 : 12} /> {!isMobile && t("notes.edit")}
                  </button>
                  <button onClick={handleDelete} title={t("common.delete")} style={{ width: isMobile ? 38 : 22, height: isMobile ? 38 : 22, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 6, background: "none", border: "none", cursor: "pointer", color: "var(--red)" }}>
                    <Trash2 size={isMobile ? 16 : 13} />
                  </button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? `16px 16px ${mobileBottomPadding}` : "20px 28px" }}>
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
                    width: "100%", minHeight: "100%", resize: "none", fontSize: isMobile ? 15 : 13,
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
                {t("notes.cmdN", formatShortcut(shortcuts.quick_note))}
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
