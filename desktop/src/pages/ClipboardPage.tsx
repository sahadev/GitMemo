import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Clipboard, Play, Square, Save, Copy, Check, Trash2, RefreshCw, ListChecks, X, FilePlus2, FileText, Image as ImageIcon, Layers } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { Loading } from "../components/Loading";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FavoriteButton } from "../components/FavoriteButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { PaneHeader } from "../components/AppHeaders";
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
import type { Page } from "../App";

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

type ClipFilter = "all" | "text" | "image";

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
      <div style={{ width: w, height: h, flexShrink: 0, borderRadius: "var(--gm-radius-sm)", background: "var(--bg-hover)" }} />
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
        borderRadius: "var(--gm-radius-sm)",
        flexShrink: 0,
        border: `1px solid ${selected ? "var(--gm-selection-border)" : "var(--border)"}`,
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
  onNavigate,
  registerMobileBackHandler,
}: {
  active?: boolean;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  onNavigate?: (page: Page) => void;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
} = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  const {
    clipboardStatus: status,
    refreshClipboardStatus,
    pendingOpenPath,
    consumePendingOpenPath,
    setNotesTab,
    setPendingOpenPath,
  } = useAppStore();
  const [savedClips, setSavedClips] = useState<FileEntry[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clipTotal, setClipTotal] = useState<number | null>(null);
  const [clipFilter, setClipFilter] = useState<ClipFilter>("all");
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
            clipKind: clipFilter,
          });
          total = page.total;
          entries.push(...page.entries);
          if (!page.has_more || page.entries.length === 0) break;
        }

        const visibleEntries = entries.filter((entry) => !deletedClipPathsRef.current.has(entry.path));
        setSavedClips(visibleEntries);
        setClipTotal(total);
        setHasMore(entries.length < total);
        if (preserveScroll) restoreScrollAnchor(anchor);
      } else {
        const page = await invoke<FilePage>("list_files_page", {
          folder: "clips",
          offset: savedClipsLengthRef.current,
          limit: FILE_PAGE_SIZE,
          clipKind: clipFilter,
        });
        setClipTotal(page.total);
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
  }, [captureScrollAnchor, clipFilter, restoreScrollAnchor]);

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

  const changeClipFilter = useCallback((nextFilter: ClipFilter) => {
    if (nextFilter === clipFilter) return;
    setClipFilter(nextFilter);
    setSelectedFile(null);
    setRawFileContent("");
    setFileContent("");
    setEditing(false);
    setEditContent("");
    setMultiSelectMode(false);
    setSelectedClipPaths([]);
    pendingKeyboardNextIndexRef.current = null;
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [clipFilter]);

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
      setNotesTab("scratch");
      setPendingOpenPath(result.path);
      onNavigate?.("notes");
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setCreatingNote(false);
    }
  }, [creatingNote, deletingSelected, onNavigate, selectedClipPaths, setNotesTab, setPendingOpenPath, showToast, t]);

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
      setClipTotal((prev) => prev === null ? prev : Math.max(0, prev - paths.length));
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
      setClipTotal((prev) => prev === null ? prev : Math.max(0, prev - 1));
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

  const clipFilterOptions = [
    { id: "all" as ClipFilter, label: t("clipboard.filterAll"), Icon: Layers },
    { id: "text" as ClipFilter, label: t("clipboard.filterText"), Icon: FileText },
    { id: "image" as ClipFilter, label: t("clipboard.filterImage"), Icon: ImageIcon },
  ];
  const emptyClipsMessage = clipFilter === "image"
    ? t("clipboard.noImageClips")
    : clipFilter === "text"
      ? t("clipboard.noTextClips")
      : t("clipboard.noClips");
  const displayedClipTotal = clipTotal ?? status?.clips_count ?? 0;

  return (
    <div className="gm-page" style={{ display: "flex", width: "100%", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
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
        background: "var(--gm-color-bg-surface)",
        width: "100%", flex: 1, minWidth: 0,
        height: "100%", minHeight: 0, overflow: "hidden", position: "relative",
      }}>
        <PaneHeader
          icon={Clipboard}
          title={t("clipboard.title")}
          afterTitle={!isMobile && status ? (
            <span style={{
              padding: "var(--gm-space-1) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-pill)", fontSize: "var(--gm-font-2xs)", fontWeight: 500,
              background: status.watching ? "var(--bg-success)" : "var(--bg-hover)",
              color: status.watching ? "var(--green)" : "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}>
              {status.watching ? t("clipboard.watching") : t("clipboard.stopped")}
            </span>
          ) : null}
          actions={(
            <>
            <button className="gm-toolbar-button" onClick={toggleMultiSelectMode} title={multiSelectMode ? t("common.cancel") : t("clipboard.selectMode")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              width: isMobile ? "var(--gm-control-height-lg)" : "var(--gm-control-height-sm)",
              height: isMobile ? "var(--gm-control-height-lg)" : "var(--gm-control-height-sm)",
              borderRadius: "var(--gm-radius-md)", cursor: "pointer",
              color: multiSelectMode ? "var(--accent)" : "var(--text-secondary)",
            }}>
              {multiSelectMode ? <X size={isMobile ? "var(--gm-icon-sm)" : "var(--gm-icon-xs)"} /> : <ListChecks size={isMobile ? "var(--gm-icon-sm)" : "var(--gm-icon-xs)"} />}
            </button>
            <button className="gm-toolbar-button" onClick={() => { setRefreshTrigger((t) => t + 1); void refreshClipboardStatus(); if (selectedFile) void openFile(selectedFile); }} title={t("common.refresh")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              width: isMobile ? "var(--gm-control-height-lg)" : "var(--gm-control-height-sm)",
              height: isMobile ? "var(--gm-control-height-lg)" : "var(--gm-control-height-sm)",
              borderRadius: "var(--gm-radius-md)", cursor: "pointer",
            }}>
              <RefreshCw size={isMobile ? "var(--gm-icon-sm)" : "var(--gm-icon-xs)"} />
            </button>
            {!isMobile && (
              <>
                <button className="gm-toolbar-button" onClick={saveNow} title={t("clipboard.saveCurrentClipboard")} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  width: "var(--gm-control-height-sm)", height: "var(--gm-control-height-sm)",
                  borderRadius: "var(--gm-radius-md)", cursor: "pointer",
                }}>
                  <Save size="var(--gm-icon-xs)" />
                </button>
                <button className="gm-toolbar-button" onClick={toggleWatch} title={status?.watching ? t("common.stop") : t("common.start")} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  width: "var(--gm-control-height-sm)", height: "var(--gm-control-height-sm)",
                  borderRadius: "var(--gm-radius-md)", cursor: "pointer",
                  color: status?.watching ? "var(--red)" : "var(--green)",
                }}>
                  {status?.watching ? <Square size="var(--gm-icon-xs)" /> : <Play size="var(--gm-icon-xs)" />}
                </button>
              </>
            )}
            </>
          )}
        />

        <div style={{
          display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
          padding: isMobile ? "var(--gm-icon-text-gap) var(--gm-card-header-gap)" : "var(--gm-icon-text-gap) var(--gm-list-header-pad-x)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-card)",
        }}>
          <div role="tablist" aria-label={t("clipboard.filterLabel")} style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            width: "100%",
            padding: "var(--gm-space-1)",
            borderRadius: "var(--gm-radius-lg)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
          }}>
            {clipFilterOptions.map(({ id, label, Icon }) => {
              const activeFilter = clipFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter}
                  onClick={() => changeClipFilter(id)}
                  title={label}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--gm-control-gap)",
                    minWidth: 0,
                    height: isMobile ? 32 : 26,
                    padding: isMobile ? "0 8px" : "0 6px",
                    borderRadius: "var(--gm-radius-md)",
                    border: "none",
                    background: activeFilter ? "var(--bg)" : "transparent",
                    color: activeFilter ? "var(--accent)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "var(--gm-font-xs)",
                    fontWeight: activeFilter ? 700 : 500,
                    boxShadow: activeFilter ? "var(--gm-shadow-control)" : "none",
                  }}
                >
                  <Icon size={isMobile ? 14 : 12} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
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
            <div className="gm-empty-state" style={{ padding: "var(--gm-icon-hero) var(--gm-section-gap-lg)" }}>
              <Clipboard size={36} style={{ color: "var(--gm-empty-icon-color)", marginBottom: "var(--gm-card-header-gap)" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{emptyClipsMessage}</p>
              {!isMobile && clipFilter === "all" && <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-3)" }}>{t("clipboard.autoCapture")}</p>}
            </div>
          ) : (
            <>
            {savedClips.map((file) => {
              const selected = selectedFile === file.path;
              const selectionOrder = selectedClipPaths.indexOf(file.path);
              const clipSelected = selectionOrder >= 0;
              const active = multiSelectMode ? clipSelected : selected;
              const metaColor = "var(--text-secondary)";
              const actionColor = copiedId === file.path
                ? "var(--green)"
                : "var(--text-secondary)";
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
                    background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                    color: "var(--text)",
                    borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
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
                          width: isMobile ? 26 : 22, height: isMobile ? 26 : 22, borderRadius: "var(--gm-radius-pill)",
                          border: `1px solid ${clipSelected ? "var(--accent)" : "var(--border)"}`,
                          background: clipSelected ? "color-mix(in srgb, var(--accent) 12%, var(--bg-card))" : "var(--bg)",
                          color: clipSelected ? "var(--accent)" : "var(--text-secondary)",
                          fontSize: "var(--gm-font-xs)", fontWeight: 700,
                          boxShadow: active ? "none" : "var(--gm-shadow-control-strong)",
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
                      padding: isMobile
                        ? "var(--gm-card-pad-mobile) var(--gm-list-row-pad-x) var(--gm-icon-text-gap)"
                        : "var(--gm-list-row-pad-y) var(--gm-list-row-pad-x) var(--gm-space-3)",
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
                          fontSize: "var(--gm-font-sm)", whiteSpace: "pre-wrap",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          overflow: "hidden", lineHeight: "var(--gm-leading-normal)", wordBreak: "break-all",
                        }}>
                          {file.preview || file.name}
                        </p>
                      </div>
                    )}
                  </button>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "var(--gm-control-gap)",
                    minHeight: actionSize,
                    padding: isMobile
                      ? "0 var(--gm-card-pad-mobile) var(--gm-nav-item-gap) var(--gm-list-row-pad-x)"
                      : "0 var(--gm-list-row-pad-x) var(--gm-icon-text-gap)",
                  }}>
                    <span style={{ fontSize: "var(--gm-font-xs)", color: metaColor }}>
                      {relativeTime(file.modified, t)}
                    </span>
                    {file.preview_image ? (
                      <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                      {copiedId === file.path ? <Check size={isMobile ? 16 : 14} /> : <Copy size={isMobile ? 16 : 14} />}
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
                        color: active ? "var(--red)" : "var(--text-secondary)",
                        opacity: multiSelectMode ? 0 : 1,
                        pointerEvents: multiSelectMode ? "none" : "auto",
                      }}
                    >
                      <Trash2 size={isMobile ? 16 : 14} />
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
                  width: "100%", padding: "var(--gm-list-row-pad-y) var(--gm-list-row-pad-x)", border: "none",
                  borderBottom: "1px solid var(--border)", background: "transparent",
                  color: "var(--accent)", cursor: loadingMore ? "default" : "pointer",
                  fontSize: "var(--gm-font-xs)", fontWeight: 600,
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
            display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)",
            padding: isMobile
              ? "var(--gm-nav-item-gap) var(--gm-card-header-gap)"
              : "var(--gm-nav-item-gap) var(--gm-card-header-gap)",
            borderTop: "1px solid var(--border)",
            background: "var(--bg)",
            position: isMobile ? "fixed" : "absolute",
            left: 0,
            right: 0,
            bottom: isMobile ? MOBILE_FIXED_BAR_BOTTOM : 0,
            zIndex: 29,
            boxShadow: isMobile ? "var(--gm-shadow-bottom)" : "var(--gm-shadow-bottom-soft)",
          }}>
            <span style={{
              flex: 1, minWidth: 0, fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)",
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
                display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--gm-space-2)",
                minWidth: isMobile ? 38 : undefined,
                minHeight: isMobile ? 38 : undefined,
                padding: isMobile ? "var(--gm-icon-text-gap) var(--gm-nav-item-gap)" : "var(--gm-control-pad-y) var(--gm-nav-item-gap)",
                borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)",
                cursor: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "default" : "pointer",
                background: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--bg-hover)" : "var(--gm-danger-soft)",
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
                display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--gm-space-2)",
                minHeight: isMobile ? 38 : undefined,
                padding: isMobile ? "var(--gm-icon-text-gap) var(--gm-card-header-gap)" : "var(--gm-control-pad-y) var(--gm-nav-item-gap)",
                borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)",
                cursor: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "default" : "pointer",
                background: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--bg-hover)" : "var(--accent)",
                border: "1px solid var(--border)",
                color: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? "var(--text-secondary)" : "var(--gm-color-on-accent)",
                opacity: selectedClipPaths.length === 0 || creatingNote || deletingSelected ? 0.7 : 1,
              }}
            >
              <FilePlus2 size={12} /> {creatingNote ? t("clipboard.creatingNote") : t("clipboard.saveSelectedToNote")}
            </button>
          </div>
        ) : (
          !isMobile && <div style={{
            padding: "var(--gm-nav-item-gap) var(--gm-list-header-pad-x)", borderTop: "1px solid var(--border)",
            fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", textAlign: "center",
          }}>
            {t("clipboard.clipsTotal", String(displayedClipTotal))}
          </div>
        )}
      </div>
      )}

        right={showDetail && (
      <div style={{ flex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Clipboard size={40} style={{ color: "var(--gm-empty-icon-color)", margin: "0 auto var(--gm-card-header-gap)" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("clipboard.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            <FileDetailToolbar
              title={isMobile ? selectedFileName : selectedFile}
              titleText={selectedFile}
              onBack={closeDetail}
              onRefresh={() => {
                setRefreshTrigger((t) => t + 1);
                void refreshClipboardStatus();
                if (selectedFile) void openFile(selectedFile);
              }}
              editing={editing}
              onEdit={startEdit}
              onSave={() => void handleSaveEdit()}
              onCancel={cancelEdit}
              editTitle={t("notes.edit")}
              saveTitle={t("notes.save")}
              metadata={selectedFile ? (
                <FavoriteButton
                  relPath={selectedFile}
                  title={selectedFileName}
                  sourceType="clip"
                />
              ) : null}
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
              flex: 1,
              overflowY: "auto",
              padding: isMobile
                ? `var(--gm-detail-pad-mobile-y) var(--gm-detail-pad-mobile-x) ${mobileBottomPadding}`
                : "var(--gm-detail-pad-y) var(--gm-detail-pad-x)",
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
                  className="gm-code-editor"
                  style={{
                    width: "100%", minHeight: "100%", resize: "none", fontSize: isMobile ? "var(--gm-font-md)" : "var(--gm-font-sm)",
                    padding: 0,
                    border: "none", outline: "none",
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
