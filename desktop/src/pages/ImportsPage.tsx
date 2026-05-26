import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Download, ChevronLeft, Trash2, RefreshCw, Pencil, Save, Eye } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";
import { FILE_PAGE_SIZE, type FileEntry, type FilePage } from "../types/files";
import { useAutoLoadMore } from "../hooks/useAutoLoadMore";
import { shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";

interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

function ImportImagePreview({ relPath }: { relPath: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const imageSaveProps = useLongPressImageSave({
    src,
    filePath: relPath,
    fileName: relPath.split("/").pop() ?? null,
  });
  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_file_base64", { filePath: relPath })
      .then((b64) => {
        if (cancelled) return;
        const ext = relPath.split(".").pop()?.toLowerCase() || "png";
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        setSrc(`data:${mime};base64,${b64}`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [relPath]);
  if (!src) return <div style={{ width: 48, height: 36, flexShrink: 0, borderRadius: 4, background: "var(--bg-hover)" }} />;
  return (
    <img
      src={src}
      alt=""
      {...imageSaveProps}
      style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0, border: "1px solid var(--border)", ...imageSaveProps.style }}
    />
  );
}

export default function ImportsPage({
  onFocusSidebar: _onFocusSidebar,
  enterTrigger: _enterTrigger,
  active,
  registerMobileBackHandler,
}: {
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  active?: boolean;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
} = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const loadInFlight = useRef<Promise<void> | null>(null);
  const filesLengthRef = useRef(0);
  const pendingKeyboardNextIndexRef = useRef<number | null>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
  const watchedFolders = useMemo(() => ["imports"], []);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setEditContent(content);
      setEditing(false);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) { console.error(e); }
  }, [isMobile]);

  const loadFiles = useCallback((reset = true) => {
    if (loadInFlight.current) return loadInFlight.current;

    const task = (async () => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const page = await invoke<FilePage>("list_files_page", {
          folder: "imports",
          offset: reset ? 0 : filesLengthRef.current,
          limit: FILE_PAGE_SIZE,
        });
        setFiles((prev) => reset ? page.entries : [...prev, ...page.entries]);
        setHasMore(page.has_more);
      } catch (e) {
        console.error(e);
      } finally {
        if (reset) setLoading(false);
        else setLoadingMore(false);
        loadInFlight.current = null;
      }
    })();

    loadInFlight.current = task;
    return task;
  }, []);
  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore: () => loadFiles(false),
  });

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

  useEffect(() => {
    if (active !== false) void loadFiles();
  }, [active, loadFiles]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("imports/")) return;
    void loadFiles().then(() => openFile(pendingOpenPath, true));
    consumePendingOpenPath();
  }, [pendingOpenPath, consumePendingOpenPath, loadFiles, openFile]);

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [selectedFile, loadFiles, openFile]);

  useFileWatcher(watchedFolders, loadFiles);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("imports.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      setSelectedFile(null);
      setFileContent("");
      setEditContent("");
      setEditing(false);
      showToast(t("imports.deleted"));
      void loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  }, [selectedFile, t, showToast, loadFiles]);

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await invoke<NoteResult>("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      showToast(t("externalFiles.saved"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [selectedFile, editContent, showToast, t]);

  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setEditContent("");
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (selectedFile && shortcutMatches(e, shortcuts.delete_selected)) {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navPrev, navNext, selectedFile, handleDelete, shortcuts.delete_selected]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

  return (
    <div style={{ display: "flex", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="imports"
        defaultWidth={300}
        left={showList && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
            <div style={{
              display: "flex", alignItems: "center", padding: "14px 16px",
              borderBottom: "1px solid var(--border)", gap: 8,
            }}>
              <Download size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{t("imports.title")}</span>
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

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {loading ? (
                <Loading compact text={t("common.loading")} />
              ) : files.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
                  <Download size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {t("imports.empty")}
                  </p>
                </div>
              ) : (
                <>
                {files.map((file) => {
                  const selected = selectedFile === file.path;
                  const hasImage = !!file.preview_image;
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
                        display: "flex", alignItems: "center", gap: 10,
                      }}
                    >
                      {hasImage && <ImportImagePreview relPath={file.preview_image!} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                        </p>
                        {!hasImage && file.preview && (
                          <p style={{ fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                            {file.preview}
                          </p>
                        )}
                        <p style={{ fontSize: 10, marginTop: 4, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                          {relativeTime(file.modified, t)}
                        </p>
                      </div>
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
                    onClick={closeDetail}
                    style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {!editing ? (
                    <button
                      onClick={() => setEditing(true)}
                      style={{
                        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)",
                        cursor: "pointer", color: "var(--text)",
                      }}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        style={{
                          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)",
                          cursor: "pointer", color: "var(--text)",
                        }}
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: 6, border: "1px solid var(--accent)", background: "var(--accent)",
                          cursor: saving ? "default" : "pointer", color: "#fff",
                          opacity: saving ? 0.6 : 1,
                        }}
                        title="Save"
                      >
                        <Save size={14} />
                      </button>
                    </>
                  )}
                  <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedFile}
                  </span>
                  <button onClick={handleDelete} style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--red)" }}>
                    <Trash2 size={13} />
                  </button>
                  {!editing ? (
                    <FileMoreActionsMenu
                      relPath={selectedFile}
                      exportContent={fileContent}
                      exportTitle={selectedFile.split("/").pop()}
                    />
                  ) : null}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
                  {editing ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                          e.preventDefault();
                          void handleSave();
                        }
                      }}
                      style={{
                        width: "100%", height: "100%", resize: "none", padding: 0,
                        background: "transparent", border: "none", color: "var(--text)",
                        fontSize: 13, fontFamily: "ui-monospace, monospace", lineHeight: 1.7,
                        outline: "none", minHeight: 420,
                      }}
                    />
                  ) : (
                    <MarkdownView content={fileContent} filePath={selectedFile} />
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <Download size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                    {t("imports.selectOrDrop")}
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
