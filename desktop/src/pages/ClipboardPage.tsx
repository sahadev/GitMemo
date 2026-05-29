import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Clipboard, Play, Square, Save, Copy, Check, Trash2, RefreshCw, ListChecks, X, FilePlus2 } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { Loading } from "../components/Loading";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { ClipboardPrivacyDialog, useClipboardPrivacy } from "../components/ClipboardPrivacyDialog";
import { useAppStore, type ClipboardStatus } from "../hooks/useAppStore";
import { FILE_PAGE_SIZE, type FileEntry, type FilePage } from "../types/files";
import { useAutoLoadMore } from "../hooks/useAutoLoadMore";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";
import { MOBILE_BOTTOM_CONTENT_PADDING, MOBILE_BOTTOM_SELECTION_PADDING, MOBILE_FIXED_BAR_BOTTOM } from "../utils/mobileLayout";
import { replaceMarkdownBody, stripMarkdownFrontmatter } from "../utils/markdown";

interface ClipboardEvent {
  saved: boolean;
  path: string;
  preview: string;
  timestamp: string;
}

interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

const CLIP_WATCH_FOLDERS = ["clips"];
const CLIP_REFRESH_PAGE_SIZE = 100;
const CLIP_REFRESH_MAX_PRESERVED_ITEMS = 1000;

interface ScrollAnchor {
  path: string | null;
  offsetTop: number;
  scrollTop: number;
}

function ClipImageThumb({ relPath, selected, wide }: { relPath: string; selected: boolean; wide?: boolean }) {
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
  const w = wide ? "100%" : 56;
  const h = wide ? 80 : 40;
  if (!src) {
    return (
      <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 4, background: "var(--bg-hover)" }} />
    );
  }
  return (
    <img
      src={src}
      alt=""
      {...imageSaveProps}
      style={{
        width: w,
        height: h,
        objectFit: "cover",
        borderRadius: 4,
        flexShrink: 0,
        border: `1px solid ${selected ? "rgba(255,255,255,0.35)" : "var(--border)"}`,
        ...imageSaveProps.style,
      }}
    />
  );
}

function normalizeClipImageLinks(content: string, clipPath: string) {
  const clipDir = clipPath.includes("/") ? clipPath.slice(0, clipPath.lastIndexOf("/")) : "";
  return content.replace(/(!\[[^\]]*]\()([^)\s]+)(\))/g, (match, prefix, src, suffix) => {
    if (!clipDir || src.startsWith("http") || src.startsWith("data:") || src.startsWith("/") || /^(clips|imports|notes|conversations|plans|claude-config)\//.test(src)) {
      return match;
    }
    return `${prefix}${clipDir}/${src}${suffix}`;
  });
}

export default function ClipboardPage({
  active = true,
  onFocusSidebar: _onFocusSidebar,
  enterTrigger: _enterTrigger,
  registerMobileBackHandler,
}: {
  active?: boolean;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
} = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  const { clipboardStatus: status, refreshClipboardStatus, pendingOpenPath, consumePendingOpenPath } = useAppStore();
  const [savedClips, setSavedClips] = useState<FileEntry[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rawFileContent, setRawFileContent] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedClipPaths, setSelectedClipPaths] = useState<string[]>([]);
  const [creatingNote, setCreatingNote] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const savedClipsRef = useRef<FileEntry[]>([]);
  const savedClipsLengthRef = useRef(0);
  const pendingKeyboardNextIndexRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const detailOpenedFromCrossPageRef = useRef(false);
  const deletedClipPathsRef = useRef<Set<string>>(new Set());
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const privacy = useClipboardPrivacy();

  useEffect(() => {
    savedClipsRef.current = savedClips;
    savedClipsLengthRef.current = savedClips.length;
  }, [savedClips]);

  const captureScrollAnchor = useCallback((): ScrollAnchor | null => {
    const container = listScrollRef.current;
    if (!container) return null;
    const containerTop = container.getBoundingClientRect().top;

    for (const file of savedClipsRef.current) {
      const item = itemRefs.current.get(file.path);
      if (!item) continue;
      const rect = item.getBoundingClientRect();
      if (rect.bottom > containerTop + 1) {
        return {
          path: file.path,
          offsetTop: rect.top - containerTop,
          scrollTop: container.scrollTop,
        };
      }
    }

    return { path: null, offsetTop: 0, scrollTop: container.scrollTop };
  }, []);

  const restoreScrollAnchor = useCallback((anchor: ScrollAnchor | null) => {
    if (!anchor) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = listScrollRef.current;
        if (!container) return;
        if (!anchor.path) {
          container.scrollTop = anchor.scrollTop;
          return;
        }
        const item = itemRefs.current.get(anchor.path);
        if (!item) {
          container.scrollTop = anchor.scrollTop;
          return;
        }
        const containerTop = container.getBoundingClientRect().top;
        const itemTop = item.getBoundingClientRect().top;
        container.scrollTop += itemTop - containerTop - anchor.offsetTop;
      });
    });
  }, []);

  const loadSavedClips = useCallback(async ({
    reset = true,
    preserveScroll = false,
  }: { reset?: boolean; preserveScroll?: boolean } = {}) => {
    const anchor = preserveScroll ? captureScrollAnchor() : null;
    const showBlockingLoading = reset && (!preserveScroll || savedClipsLengthRef.current === 0);
    if (showBlockingLoading) setClipsLoading(true);
    else if (!reset) setLoadingMore(true);
    try {
      if (reset) {
        const initialTargetCount = Math.max(
          FILE_PAGE_SIZE,
          preserveScroll ? savedClipsLengthRef.current + FILE_PAGE_SIZE : FILE_PAGE_SIZE,
        );
        const entries: FileEntry[] = [];
        let total = 0;

        while (entries.length < initialTargetCount || (preserveScroll && anchor?.path && !entries.some((entry) => entry.path === anchor.path))) {
          if (entries.length >= CLIP_REFRESH_MAX_PRESERVED_ITEMS) break;
          const page = await invoke<FilePage>("list_files_page", {
            folder: "clips",
            offset: entries.length,
            limit: Math.min(
              CLIP_REFRESH_PAGE_SIZE,
              Math.max(FILE_PAGE_SIZE, initialTargetCount - entries.length),
            ),
          });
          total = page.total;
          entries.push(...page.entries);
          if (!page.has_more || page.entries.length === 0) break;
        }

        const visibleEntries = entries.filter((entry) => !deletedClipPathsRef.current.has(entry.path));
        setSavedClips(visibleEntries);
        setHasMore(entries.length < total);
        if (preserveScroll) restoreScrollAnchor(anchor);
      } else {
        const page = await invoke<FilePage>("list_files_page", {
          folder: "clips",
          offset: savedClipsLengthRef.current,
          limit: FILE_PAGE_SIZE,
        });
        setSavedClips((prev) => {
          const seen = new Set(prev.map((clip) => clip.path));
          return [
            ...prev,
            ...page.entries.filter((clip) => !seen.has(clip.path) && !deletedClipPathsRef.current.has(clip.path)),
          ];
        });
        setHasMore(page.has_more);
      }
    }
    catch (e) { console.error(e); }
    finally {
      if (showBlockingLoading) setClipsLoading(false);
      else setLoadingMore(false);
    }
  }, [captureScrollAnchor, restoreScrollAnchor]);

  useEffect(() => {
    void loadSavedClips();
  }, [refreshTrigger, loadSavedClips]);

  const runRefreshSavedClipsInPlace = useCallback(() => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    void loadSavedClips({ preserveScroll: true }).finally(() => {
      refreshInFlightRef.current = false;
      if (!refreshQueuedRef.current) return;

      refreshQueuedRef.current = false;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        runRefreshSavedClipsInPlace();
      }, 150);
    });
  }, [loadSavedClips]);

  const refreshSavedClipsInPlace = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      runRefreshSavedClipsInPlace();
    }, 250);
  }, [runRefreshSavedClipsInPlace]);

  useFileWatcher(CLIP_WATCH_FOLDERS, refreshSavedClipsInPlace);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Event sources that trigger refresh should not push the list back to page one.
  useEffect(() => {
    const unlisten = listen<ClipboardEvent>("clipboard-saved", refreshSavedClipsInPlace);
    window.addEventListener("focus", refreshSavedClipsInPlace);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("focus", refreshSavedClipsInPlace);
    };
  }, [refreshSavedClipsInPlace]);

  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading: clipsLoading,
    loadingMore,
    onLoadMore: () => loadSavedClips({ reset: false }),
  });

  const doStartWatch = async () => {
    try {
      await invoke<string>("start_clipboard_watch");
      refreshClipboardStatus();
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const toggleWatch = async () => {
    try {
      if (status?.watching) {
        await invoke<string>("stop_clipboard_watch");
        refreshClipboardStatus();
      } else {
        // Show privacy dialog on first enable
        if (!privacy.isConfirmed) {
          setShowPrivacyDialog(true);
          return;
        }
        await doStartWatch();
      }
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const saveNow = async () => {
    try {
      const text = await readText();
      if (!text || text.trim().length < 20) {
        showToast(t("clipboard.tooShort"));
        return;
      }
      const result = await invoke<ClipboardEvent>("save_clipboard_now", { content: text });
      showToast(t("clipboard.saved"));
      loadSavedClips();
      refreshClipboardStatus();
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      if (multiSelectMode) return;
      const content = await invoke<string>("read_file", { filePath: path });
      const body = stripMarkdownFrontmatter(content);
      setSelectedFile(path);
      setRawFileContent(content);
      setFileContent(body);
      setEditing(false);
      setEditContent("");
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  }, [isMobile, multiSelectMode]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("clips/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const navPrev = useCallback(() => {
    if (!selectedFile || savedClips.length === 0) return;
    const idx = savedClips.findIndex((f) => f.path === selectedFile);
    if (idx > 0) openFile(savedClips[idx - 1].path);
  }, [selectedFile, savedClips]);

  const navNext = useCallback(() => {
    if (!selectedFile || savedClips.length === 0) return;
    const idx = savedClips.findIndex((f) => f.path === selectedFile);
    if (idx < 0) return;
    if (idx < savedClips.length - 1) {
      void openFile(savedClips[idx + 1].path);
      return;
    }
    if (hasMore && !loadingMore) {
      pendingKeyboardNextIndexRef.current = idx + 1;
      void loadMore();
    }
  }, [selectedFile, savedClips, hasMore, loadingMore, loadMore, openFile]);

  useEffect(() => {
    const pendingIndex = pendingKeyboardNextIndexRef.current;
    if (pendingIndex === null) return;
    if (savedClips.length > pendingIndex) {
      pendingKeyboardNextIndexRef.current = null;
      void openFile(savedClips[pendingIndex].path);
      return;
    }
    if (!hasMore && !loadingMore) {
      pendingKeyboardNextIndexRef.current = null;
    }
  }, [savedClips, hasMore, loadingMore, openFile]);

  useEffect(() => {
    if (!active || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape" && multiSelectMode) {
        e.preventDefault();
        setMultiSelectMode(false);
        setSelectedClipPaths([]);
        return;
      }
      if (multiSelectMode) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, isMobile, multiSelectMode, navPrev, navNext]);

  const copyContent = useCallback(async (content: string, copiedKey = "detail") => {
    try {
      const wasWatching = status?.watching;
      if (wasWatching) await invoke<string>("stop_clipboard_watch");
      await writeText(content);
      if (wasWatching) {
        await new Promise((r) => setTimeout(r, 200));
        await invoke<string>("start_clipboard_watch");
      }
      setCopiedId(copiedKey);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      showToast(`Copy failed: ${e}`);
    }
  }, [showToast, status?.watching]);

  const copyClipContent = useCallback(async (path: string) => {
    const content = await invoke<string>("read_file", { filePath: path });
    await copyContent(stripMarkdownFrontmatter(content), path);
  }, [copyContent]);

  const toggleMultiSelectMode = useCallback(() => {
    setMultiSelectMode((enabled) => {
      if (enabled) setSelectedClipPaths([]);
      else {
        setSelectedFile(null);
        setRawFileContent("");
        setFileContent("");
        setEditing(false);
        setEditContent("");
      }
      return !enabled;
    });
  }, []);

  const toggleClipSelection = useCallback((path: string) => {
    setSelectedClipPaths((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      return [...prev, path];
    });
  }, []);

  const createNoteFromSelectedClips = useCallback(async () => {
    if (selectedClipPaths.length === 0 || creatingNote || deletingSelected) return;
    setCreatingNote(true);
    try {
      const blocks: string[] = [];
      for (const path of selectedClipPaths) {
        const content = await invoke<string>("read_file", { filePath: path });
        const body = normalizeClipImageLinks(stripMarkdownFrontmatter(content), path);
        if (body.trim()) blocks.push(body.trim());
      }
      if (blocks.length === 0) {
        showToast(t("clipboard.noSelectedContent"), true);
        return;
      }
      const result = await invoke<NoteResult>("create_note", { content: blocks.join("\n\n") });
      showToast(result.message);
      setMultiSelectMode(false);
      setSelectedClipPaths([]);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setCreatingNote(false);
    }
  }, [creatingNote, deletingSelected, selectedClipPaths, showToast, t]);

  const confirmDeleteSelectedClips = useCallback(async () => {
    if (selectedClipPaths.length === 0 || creatingNote || deletingSelected) return;
    const paths = [...selectedClipPaths];
    const ok = await ask(t("clipboard.deleteSelectedConfirm", paths.length), { title: t("common.confirm"), kind: "warning" });
    if (!ok) return;
    setDeletingSelected(true);
    try {
      await invoke<NoteResult>("delete_clips", { filePaths: paths });
      showToast(t("clipboard.selectedDeleted", paths.length));
      paths.forEach((path) => deletedClipPathsRef.current.add(path));
      setSavedClips((prev) => prev.filter((clip) => !paths.includes(clip.path)));
      if (selectedFile && paths.includes(selectedFile)) {
        setSelectedFile(null);
        setRawFileContent("");
        setFileContent("");
        setEditing(false);
        setEditContent("");
      }
      setMultiSelectMode(false);
      setSelectedClipPaths([]);
      refreshSavedClipsInPlace();
      void refreshClipboardStatus();
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setDeletingSelected(false);
    }
  }, [creatingNote, deletingSelected, refreshClipboardStatus, refreshSavedClipsInPlace, selectedClipPaths, selectedFile, showToast, t]);

  const confirmDeleteClip = async (path: string) => {
    const ok = await ask(t("clipboard.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!ok) return;
    try {
      await invoke<NoteResult>("delete_clip", { filePath: path });
      showToast(t("clipboard.clipDeleted"));
      deletedClipPathsRef.current.add(path);
      setSavedClips((prev) => prev.filter((clip) => clip.path !== path));
      setSelectedClipPaths((prev) => prev.filter((p) => p !== path));
      if (selectedFile === path) {
        setSelectedFile(null);
        setRawFileContent("");
        setFileContent("");
        setEditing(false);
        setEditContent("");
      }
      refreshSavedClipsInPlace();
      void refreshClipboardStatus();
    } catch (e) {
      showToast(String(e));
    }
  };

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const mobileBottomPadding = MOBILE_BOTTOM_CONTENT_PADDING;
  const mobileSelectionBottomPadding = MOBILE_BOTTOM_SELECTION_PADDING;
  const selectedFileName = selectedFile?.split("/").pop() ?? "";
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setRawFileContent("");
    setFileContent("");
    setEditing(false);
    setEditContent("");
    detailOpenedFromCrossPageRef.current = false;
  }, []);

  const startEdit = useCallback(() => {
    if (!selectedFile) return;
    setEditContent(fileContent);
    setEditing(true);
    window.setTimeout(() => editRef.current?.focus(), 50);
  }, [fileContent, selectedFile]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    try {
      const nextContent = replaceMarkdownBody(rawFileContent, editContent);
      await invoke<NoteResult>("update_note", { filePath: selectedFile, content: nextContent });
      setRawFileContent(nextContent);
      setFileContent(editContent);
      setEditing(false);
      setEditContent("");
      showToast(t("clipboard.saved"));
      refreshSavedClipsInPlace();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [editContent, rawFileContent, refreshSavedClipsInPlace, selectedFile, showToast, t]);

  useEffect(() => {
    if (!isMobile || !registerMobileBackHandler) return;
    registerMobileBackHandler(() => {
      if (multiSelectMode) {
        setMultiSelectMode(false);
        setSelectedClipPaths([]);
        return true;
      }
      if (selectedFile) {
        if (editing) {
          cancelEdit();
          return true;
        }
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
  }, [cancelEdit, closeDetail, editing, isMobile, multiSelectMode, registerMobileBackHandler, selectedFile]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      {/* Privacy confirmation dialog */}
      {showPrivacyDialog && (
        <ClipboardPrivacyDialog
          onConfirm={() => {
            privacy.confirm();
            setShowPrivacyDialog(false);
            void doStartWatch();
          }}
          onCancel={() => setShowPrivacyDialog(false)}
        />
      )}

      <DesktopSplitPane
        panelKey="clipboard"
        defaultWidth={340}
        left={showList && (
      <div style={{
        display: "flex", flexDirection: "column", flexShrink: 0,
        width: "100%", flex: 1, minWidth: 0,
        height: "100%", minHeight: 0, overflow: "hidden", position: "relative",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8,
          padding: isMobile ? "9px 12px" : "12px 16px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Clipboard size={isMobile ? 18 : 16} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontSize: isMobile ? 15 : 14, fontWeight: 700, whiteSpace: "nowrap" }}>{t("clipboard.title")}</span>
            {!isMobile && status && (
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 500,
                background: status.watching ? "var(--bg-success)" : "var(--bg-hover)",
                color: status.watching ? "var(--green)" : "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}>
                {status.watching ? t("clipboard.watching") : t("clipboard.stopped")}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={toggleMultiSelectMode} title={multiSelectMode ? t("common.cancel") : t("clipboard.selectMode")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              width: isMobile ? 36 : 28, height: isMobile ? 36 : 28,
              borderRadius: 6, cursor: "pointer",
              background: multiSelectMode ? "var(--bg-hover)" : "none",
              border: "none", color: multiSelectMode ? "var(--accent)" : "var(--text-secondary)",
            }}>
              {multiSelectMode ? <X size={isMobile ? 16 : 14} /> : <ListChecks size={isMobile ? 16 : 14} />}
            </button>
            <button onClick={() => { setRefreshTrigger((t) => t + 1); void refreshClipboardStatus(); if (selectedFile) void openFile(selectedFile); }} title={t("common.refresh")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              width: isMobile ? 36 : 28, height: isMobile ? 36 : 28,
              borderRadius: 6, cursor: "pointer",
              background: "none", border: "none", color: "var(--text-secondary)",
            }}>
              <RefreshCw size={isMobile ? 16 : 14} />
            </button>
            {!isMobile && (
              <>
                <button onClick={saveNow} title={t("clipboard.saveCurrentClipboard")} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  width: 28, height: 28,
                  borderRadius: 6, cursor: "pointer",
                  background: "none", border: "none", color: "var(--text-secondary)",
                }}>
                  <Save size={14} />
                </button>
                <button onClick={toggleWatch} title={status?.watching ? t("common.stop") : t("common.start")} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  width: 28, height: 28,
                  borderRadius: 6, cursor: "pointer",
                  background: "none", border: "none",
                  color: status?.watching ? "var(--red)" : "var(--green)",
                }}>
                  {status?.watching ? <Square size={14} /> : <Play size={14} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Clip list */}
        <div ref={listScrollRef} style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingBottom: isMobile
            ? (multiSelectMode ? mobileSelectionBottomPadding : mobileBottomPadding)
            : multiSelectMode ? 58 : 0,
        }}>
          {clipsLoading ? (
            <div
              style={{
                minHeight: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loading compact text={t("clipboard.loading")} />
            </div>
          ) : savedClips.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
              <Clipboard size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("clipboard.noClips")}</p>
              {!isMobile && <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{t("clipboard.autoCapture")}</p>}
            </div>
          ) : (
            <>
            {savedClips.map((file) => {
              const selected = selectedFile === file.path;
              const selectionOrder = selectedClipPaths.indexOf(file.path);
              const clipSelected = selectionOrder >= 0;
              const active = multiSelectMode ? clipSelected : selected;
              const metaColor = active ? "rgba(255,255,255,0.7)" : "var(--text-secondary)";
              const actionColor = copiedId === file.path
                ? "#fff"
                : active ? "rgba(255,255,255,0.85)" : "var(--text-secondary)";
              const actionSize = isMobile ? 32 : 22;
              return (
                <div
                  key={file.path}
                  onClick={() => {
                    if (multiSelectMode) toggleClipSelection(file.path);
                  }}
                  style={{
                    position: "relative",
                    borderBottom: "1px solid var(--border)",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    transition: "background 0.15s",
                    cursor: multiSelectMode ? "pointer" : undefined,
                  }}
                >
                    {multiSelectMode && (
                      <button
                        type="button"
                        aria-label={clipSelected ? t("common.cancel") : t("clipboard.selectMode")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleClipSelection(file.path);
                        }}
                        style={{
                          position: "absolute",
                          right: isMobile ? 16 : 18,
                          top: "50%",
                          transform: "translateY(-50%)",
                          zIndex: 2,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: isMobile ? 44 : 32, height: isMobile ? 44 : 32, cursor: "pointer",
                          border: "none", background: "transparent", color: "inherit", padding: 0,
                        }}
                      >
                        <span style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: isMobile ? 26 : 22, height: isMobile ? 26 : 22, borderRadius: 999,
                          border: `1px solid ${clipSelected ? "rgba(255,255,255,0.75)" : "var(--border)"}`,
                          background: clipSelected ? "rgba(255,255,255,0.18)" : "var(--bg)",
                          color: clipSelected ? "#fff" : "var(--text-secondary)",
                          fontSize: 11, fontWeight: 700,
                          boxShadow: active ? "none" : "0 1px 4px rgba(0,0,0,0.08)",
                        }}>
                          {clipSelected ? selectionOrder + 1 : ""}
                        </span>
                      </button>
                    )}
                  <button
                    type="button"
                    ref={(el) => { if (el) itemRefs.current.set(file.path, el); else itemRefs.current.delete(file.path); }}
                    onClick={() => {
                      if (!multiSelectMode) void openFile(file.path);
                    }}
                    onContextMenu={(e) => {
                      if (!isMobile || multiSelectMode) return;
                      e.preventDefault();
                      setSelectedFile(null);
                      setFileContent("");
                      setMultiSelectMode(true);
                      toggleClipSelection(file.path);
                    }}
                    onDoubleClick={(e) => {
                      if (multiSelectMode) return;
                      e.preventDefault();
                      void copyClipContent(file.path);
                    }}
                    style={{
                      position: "relative",
                      display: "block", width: "100%", textAlign: "left",
                      padding: isMobile ? "14px 16px 8px" : "12px 16px 6px",
                      cursor: "pointer",
                      border: "none", background: "transparent",
                      color: "inherit",
                    }}
                  >
                    {file.preview_image ? (
                      <div style={{ minWidth: 0 }}>
                        <ClipImageThumb relPath={file.preview_image} selected={active} wide />
                      </div>
                    ) : (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: isMobile ? 14 : 13, whiteSpace: "pre-wrap",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          overflow: "hidden", lineHeight: 1.4, wordBreak: "break-all",
                        }}>
                          {file.preview || file.name}
                        </p>
                      </div>
                    )}
                  </button>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    minHeight: actionSize,
                    padding: isMobile ? "0 14px 10px 16px" : "0 16px 8px",
                  }}>
                    <span style={{ fontSize: isMobile ? 11 : 11, color: metaColor }}>
                      {relativeTime(file.modified, t)}
                    </span>
                    {file.preview_image ? (
                      <span style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.5)" : "var(--text-secondary)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {file.name}
                      </span>
                    ) : null}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      title={t("clipboard.copy")}
                      aria-hidden={multiSelectMode}
                      tabIndex={multiSelectMode ? -1 : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (multiSelectMode) return;
                        void copyClipContent(file.path);
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: actionSize, height: actionSize, cursor: multiSelectMode ? "default" : "pointer",
                        border: "none", background: "transparent", color: actionColor,
                        opacity: multiSelectMode ? 0 : 1,
                        pointerEvents: multiSelectMode ? "none" : "auto",
                      }}
                    >
                      {copiedId === file.path ? <Check size={isMobile ? 15 : 13} /> : <Copy size={isMobile ? 15 : 13} />}
                    </button>
                    <button
                      type="button"
                      title={t("clipboard.deleteClip")}
                      aria-hidden={multiSelectMode}
                      tabIndex={multiSelectMode ? -1 : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (multiSelectMode) return;
                        void confirmDeleteClip(file.path);
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: actionSize, height: actionSize, cursor: multiSelectMode ? "default" : "pointer",
                        border: "none", background: "transparent",
                        color: active ? "rgba(255,255,255,0.85)" : "var(--text-secondary)",
                        opacity: multiSelectMode ? 0 : 1,
                        pointerEvents: multiSelectMode ? "none" : "auto",
                      }}
                    >
                      <Trash2 size={isMobile ? 15 : 13} />
                    </button>
                  </div>
                </div>
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

        {multiSelectMode ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: isMobile ? "10px 12px" : "10px 12px", borderTop: "1px solid var(--border)",
            background: "var(--bg)",
            position: isMobile ? "fixed" : "absolute",
            left: 0,
            right: 0,
            bottom: isMobile ? MOBILE_FIXED_BAR_BOTTOM : 0,
            zIndex: 29,
            boxShadow: isMobile ? "0 -8px 20px rgba(0,0,0,0.18)" : "0 -6px 16px rgba(0,0,0,0.08)",
          }}>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 11, color: "var(--text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {t("clipboard.selectedCount", selectedClipPaths.length)}
            </span>
            <button
              type="button"
              disabled={selectedClipPaths.length === 0 || creatingNote || deletingSelected}
              onClick={() => void confirmDeleteSelectedClips()}
              title={t("clipboard.deleteSelected")}
              aria-label={t("clipboard.deleteSelected")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                minWidth: isMobile ? 38 : undefined,
                minHeight: isMobile ? 38 : undefined,
                padding: isMobile ? "8px 10px" : "5px 9px",
                borderRadius: 6, fontSize: 12,
                cursor: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "default" : "pointer",
                background: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--bg-hover)" : "rgba(239, 68, 68, 0.10)",
                border: "1px solid var(--border)",
                color: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--text-secondary)" : "var(--red)",
                opacity: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? 0.7 : 1,
              }}
            >
              <Trash2 size={12} /> {!isMobile && (deletingSelected ? t("clipboard.deletingSelected") : t("clipboard.deleteSelected"))}
            </button>
            <button
              type="button"
              disabled={selectedClipPaths.length === 0 || creatingNote || deletingSelected}
              onClick={() => void createNoteFromSelectedClips()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                minHeight: isMobile ? 38 : undefined,
                padding: isMobile ? "8px 12px" : "5px 10px",
                borderRadius: 6, fontSize: 12,
                cursor: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "default" : "pointer",
                background: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--bg-hover)" : "var(--accent)",
                border: "1px solid var(--border)",
                color: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--text-secondary)" : "#fff",
                opacity: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? 0.7 : 1,
              }}
            >
              <FilePlus2 size={12} /> {creatingNote ? t("clipboard.creatingNote") : t("clipboard.saveSelectedToNote")}
            </button>
          </div>
        ) : (
          !isMobile && <div style={{
            padding: "10px 16px", borderTop: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-secondary)", textAlign: "center",
          }}>
            {t("clipboard.clipsTotal", String(status?.clips_count ?? 0))}
          </div>
        )}
      </div>
      )}

        right={showDetail && (
      <div style={{ flex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Clipboard size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("clipboard.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            <FileDetailToolbar
              title={isMobile ? selectedFileName : selectedFile}
              titleText={selectedFile}
              onBack={closeDetail}
              editing={editing}
              onEdit={startEdit}
              onSave={() => void handleSaveEdit()}
              onCancel={cancelEdit}
              editTitle={t("notes.edit")}
              saveTitle={t("notes.save")}
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("clipboard.deleteClip"),
                  icon: <Trash2 size={isMobile ? 16 : 14} />,
                  onClick: () => { if (selectedFile) void confirmDeleteClip(selectedFile); },
                  tone: "danger",
                  hidden: editing,
                },
                {
                  key: "copy",
                  title: t("clipboard.copy"),
                  icon: copiedId === "detail"
                    ? <Check size={isMobile ? 16 : 14} />
                    : <Copy size={isMobile ? 16 : 14} />,
                  onClick: () => copyContent(fileContent),
                  tone: copiedId === "detail" ? "success" : "default",
                  hidden: editing,
                },
              ]}
              more={!editing && selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  exportContent={fileContent}
                  exportTitle={selectedFileName}
                />
              ) : null}
            />

            {/* Full content */}
            <div style={{
              flex: 1, overflowY: "auto", padding: isMobile ? `16px 16px ${mobileBottomPadding}` : "20px 24px",
              userSelect: "text",
            }}>
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
                    if (e.key === "Escape") cancelEdit();
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
        )}
      </div>
      )}
      />
    </div>
  );
}
