import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
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
import { AppIcon } from "../components/base/AppIcon";
import { useAppStore, type ClipboardStatus } from "../hooks/useAppStore";
import { useFileDetailState } from "../hooks/useFileDetailState";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { FILE_PAGE_SIZE, type FileEntry, type FilePage } from "../types/files";
import { type NoteResult } from "../types/notes";
import { useAutoLoadMore } from "../hooks/useAutoLoadMore";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useTimedCopy } from "../hooks/useTimedCopy";
import {
  ClipboardClipActionButton,
  ClipboardClipButton,
  ClipboardClipItem,
  ClipboardClipMetaRow,
  ClipboardClipMetaSpacer,
  ClipboardClipMetaText,
  ClipboardClipPreviewWrap,
  ClipboardClipText,
  ClipboardDetailPane,
  ClipboardEmptyDetail,
  ClipboardEmptyState,
  ClipboardFilterBar,
  ClipboardFilterButton,
  ClipboardFooterTotal,
  ClipboardListBody,
  ClipboardListLoading,
  ClipboardListPane,
  ClipboardPageFrame,
  ClipboardSelectionAction,
  ClipboardSelectionBar,
  ClipboardSelectionCount,
  ClipboardSelectionToggle,
  ClipboardStatusBadge,
  ClipboardToolbarButton,
} from "../components/domain/clipboard/ClipboardComponents";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { ClipImageThumb } from "../components/domain/files/ClipImageThumb";
import { writeTextWithClipboardWatchPaused } from "../utils/clipboard";
import { replaceMarkdownBody, stripMarkdownFrontmatter } from "../utils/markdown";
import type { Page } from "../App";

interface ClipboardEvent {
  saved: boolean;
  path: string;
  preview: string;
  timestamp: string;
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

function normalizeClipImageLinks(content: string, clipPath: string) {
  const clipDir = clipPath.includes("/") ? clipPath.slice(0, clipPath.lastIndexOf("/")) : "";
  return content.replace(/(!\[[^\]]*]\()([^)\s]+)(\))/g, (match, prefix, src, suffix) => {
    if (!clipDir || src.startsWith("http") || src.startsWith("data:") || src.startsWith("/") || /^(clips|imports|notes|conversations|plans|claude-config)\//.test(src)) {
      return match;
    }
    return `${prefix}${clipDir}/${src}${suffix}`;
  });
}

function areClipEntriesEquivalent(a: FileEntry[], b: FileEntry[]) {
  if (a.length !== b.length) return false;
  return a.every((clip, index) => {
    const other = b[index];
    return (
      clip.path === other.path &&
      clip.modified === other.modified &&
      clip.size === other.size &&
      clip.preview === other.preview &&
      clip.preview_image === other.preview_image
    );
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
    collapsedPanels,
    setPanelCollapsed,
  } = useAppStore();
  const [savedClips, setSavedClips] = useState<FileEntry[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clipTotal, setClipTotal] = useState<number | null>(null);
  const [clipFilter, setClipFilter] = useState<ClipFilter>("all");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedClipPaths, setSelectedClipPaths] = useState<string[]>([]);
  const [creatingNote, setCreatingNote] = useState(false);
  const { copied: copiedId, markCopied: markCopiedId } = useTimedCopy<string>();
  const [deletingSelected, setDeletingSelected] = useState(false);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const resetEditorRef = useRef<(() => void) | null>(null);
  const multiSelectModeRef = useRef(false);
  const detailOpenedFromCrossPageRef = useRef(false);
  const {
    selectedFile,
    rawFileContent,
    fileContent,
    setRawFileContent,
    setFileContent,
    openFile,
    clearDetail,
  } = useFileDetailState({
    canOpen: (_path, { force }) => !multiSelectModeRef.current || force,
    deriveContent: (content) => stripMarkdownFrontmatter(content),
    onOpened: ({ path, fromCrossPage }) => {
      resetEditorRef.current?.();
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      window.setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    },
    onClosed: () => {
      resetEditorRef.current?.();
      detailOpenedFromCrossPageRef.current = false;
    },
  });
  const {
    editing,
    editContent,
    splitPreview,
    setEditContent,
    startEdit,
    cancelEdit,
    completeEdit,
    resetEditor,
    toggleSplitPreview,
  } = useFileEditorState({
    sourceContent: fileContent,
    mobile: isMobile,
    focusRef: editRef,
    focusDelayMs: 50,
    clearContentOnCancel: true,
    clearContentOnComplete: true,
  });
  resetEditorRef.current = resetEditor;
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const savedClipsRef = useRef<FileEntry[]>([]);
  const savedClipsLengthRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const deletedClipPathsRef = useRef<Set<string>>(new Set());
  const suppressClipWatcherUntilRef = useRef(0);
  const wasActiveRef = useRef(active);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const privacy = useClipboardPrivacy();

  useEffect(() => {
    multiSelectModeRef.current = multiSelectMode;
  }, [multiSelectMode]);

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
        setSavedClips((prev) => areClipEntriesEquivalent(prev, visibleEntries) ? prev : visibleEntries);
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

  const suppressClipWatcherRefresh = useCallback((durationMs = 1500) => {
    suppressClipWatcherUntilRef.current = Math.max(
      suppressClipWatcherUntilRef.current,
      Date.now() + durationMs,
    );
  }, []);

  const shouldIgnoreClipWatcherRefresh = useCallback(() => {
    return Date.now() < suppressClipWatcherUntilRef.current;
  }, []);

  useFileWatcher(CLIP_WATCH_FOLDERS, refreshSavedClipsInPlace, {
    active,
    shouldIgnore: shouldIgnoreClipWatcherRefresh,
  });

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (active && !wasActiveRef.current) refreshSavedClipsInPlace();
    wasActiveRef.current = active;
  }, [active, refreshSavedClipsInPlace]);

  // Event sources that trigger refresh should not push the list back to page one.
  useEffect(() => {
    if (!active) return;
    const handleClipboardSaved = () => {
      suppressClipWatcherRefresh();
      refreshSavedClipsInPlace();
    };
    const unlisten = listen<ClipboardEvent>("clipboard-saved", handleClipboardSaved);
    window.addEventListener("focus", refreshSavedClipsInPlace);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("focus", refreshSavedClipsInPlace);
    };
  }, [active, refreshSavedClipsInPlace, suppressClipWatcherRefresh]);

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
      suppressClipWatcherRefresh();
      await invoke<ClipboardEvent>("save_clipboard_now", { content: text });
      showToast(t("clipboard.saved"));
      loadSavedClips();
      refreshClipboardStatus();
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const openAdjacentClipAfterDeletion = useCallback((deletedPaths: string[], deletedSelectedPath: string | null) => {
    if (!deletedSelectedPath || !deletedPaths.includes(deletedSelectedPath)) return;

    const deleted = new Set(deletedPaths);
    const clipsBeforeDelete = savedClipsRef.current;
    const deletedIndex = clipsBeforeDelete.findIndex((clip) => clip.path === deletedSelectedPath);
    const remainingClips = clipsBeforeDelete.filter((clip) => !deleted.has(clip.path));

    if (remainingClips.length === 0) {
      clearDetail();
      return;
    }

    const nextIndex = deletedIndex === -1 ? 0 : Math.min(deletedIndex, remainingClips.length - 1);
    const nextClip = remainingClips[nextIndex];
    if (nextClip) void openFile(nextClip.path, false, true);
    else clearDetail();
  }, [clearDetail, openFile]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("clips/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const { navPrev, navNext, resetPendingNavigation } = useFileListNavigation({
    files: savedClips,
    selectedPath: selectedFile,
    openFile,
    hasMore,
    loadingMore,
    loadMore,
  });

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
      await writeTextWithClipboardWatchPaused(content, status?.watching);
      markCopiedId(copiedKey);
    } catch (e) {
      showToast(`Copy failed: ${e}`);
    }
  }, [markCopiedId, showToast, status?.watching]);

  const copyClipContent = useCallback(async (path: string) => {
    const content = await invoke<string>("read_file", { filePath: path });
    await copyContent(stripMarkdownFrontmatter(content), path);
  }, [copyContent]);

  const toggleMultiSelectMode = useCallback(() => {
    setMultiSelectMode((enabled) => {
      if (enabled) setSelectedClipPaths([]);
      else {
        clearDetail();
      }
      return !enabled;
    });
  }, [clearDetail]);

  const toggleClipSelection = useCallback((path: string) => {
    setSelectedClipPaths((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      return [...prev, path];
    });
  }, []);

  const changeClipFilter = useCallback((nextFilter: ClipFilter) => {
    if (nextFilter === clipFilter) return;
    setClipFilter(nextFilter);
    clearDetail();
    setMultiSelectMode(false);
    setSelectedClipPaths([]);
    resetPendingNavigation();
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [clearDetail, clipFilter, resetPendingNavigation]);

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
    suppressClipWatcherRefresh(2500);
    try {
      await invoke<NoteResult>("delete_clips", { filePaths: paths });
      showToast(t("clipboard.selectedDeleted", paths.length));
      paths.forEach((path) => deletedClipPathsRef.current.add(path));
      const deletedSelectedPath = selectedFile && paths.includes(selectedFile) ? selectedFile : null;
      setSavedClips((prev) => prev.filter((clip) => !paths.includes(clip.path)));
      setClipTotal((prev) => prev === null ? prev : Math.max(0, prev - paths.length));
      openAdjacentClipAfterDeletion(paths, deletedSelectedPath);
      setMultiSelectMode(false);
      setSelectedClipPaths([]);
      void refreshClipboardStatus();
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setDeletingSelected(false);
    }
  }, [creatingNote, deletingSelected, openAdjacentClipAfterDeletion, refreshClipboardStatus, selectedClipPaths, selectedFile, showToast, suppressClipWatcherRefresh, t]);

  const confirmDeleteClip = async (path: string) => {
    const ok = await ask(t("clipboard.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!ok) return;
    suppressClipWatcherRefresh(2500);
    try {
      await invoke<NoteResult>("delete_clip", { filePath: path });
      showToast(t("clipboard.clipDeleted"));
      deletedClipPathsRef.current.add(path);
      setSavedClips((prev) => prev.filter((clip) => clip.path !== path));
      setClipTotal((prev) => prev === null ? prev : Math.max(0, prev - 1));
      setSelectedClipPaths((prev) => prev.filter((p) => p !== path));
      openAdjacentClipAfterDeletion([path], selectedFile === path ? path : null);
      void refreshClipboardStatus();
    } catch (e) {
      showToast(String(e));
    }
  };

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const selectedFileName = selectedFile?.split("/").pop() ?? "";
  const closeDetail = useCallback(() => {
    clearDetail();
  }, [clearDetail]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    try {
      const nextContent = replaceMarkdownBody(rawFileContent, editContent);
      suppressClipWatcherRefresh();
      await invoke<NoteResult>("update_note", { filePath: selectedFile, content: nextContent });
      setRawFileContent(nextContent);
      setFileContent(editContent);
      completeEdit();
      showToast(t("clipboard.saved"));
      refreshSavedClipsInPlace();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [completeEdit, editContent, rawFileContent, refreshSavedClipsInPlace, selectedFile, showToast, t]);

  const handleMultiSelectBack = useCallback(() => {
    if (!multiSelectMode) return false;
    setMultiSelectMode(false);
    setSelectedClipPaths([]);
    return true;
  }, [multiSelectMode]);
  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    openedFromCrossPageRef: detailOpenedFromCrossPageRef,
    editing,
    cancelEdit,
    beforeDetailBack: handleMultiSelectBack,
  });

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
  const selectionActionsDisabled = selectedClipPaths.length === 0 || creatingNote || deletingSelected;
  const clipboardPanelCollapsed = collapsedPanels.clipboard ?? false;

  return (
    <ClipboardPageFrame>
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
        collapsed={clipboardPanelCollapsed}
        onCollapsedChange={(collapsed) => setPanelCollapsed("clipboard", collapsed)}
        left={showList && (
          <ClipboardListPane>
            <PaneHeader
              icon={Clipboard}
              title={t("clipboard.title")}
              afterTitle={!isMobile && status ? (
                <ClipboardStatusBadge watching={status.watching}>
                  {status.watching ? t("clipboard.watching") : t("clipboard.stopped")}
                </ClipboardStatusBadge>
              ) : null}
              actions={(
                <>
                  <ClipboardToolbarButton
                    mobile={isMobile}
                    icon={multiSelectMode ? X : ListChecks}
                    active={multiSelectMode}
                    onClick={toggleMultiSelectMode}
                    title={multiSelectMode ? t("common.cancel") : t("clipboard.selectMode")}
                  />
                  <ClipboardToolbarButton
                    mobile={isMobile}
                    icon={RefreshCw}
                    onClick={() => {
                      setRefreshTrigger((t) => t + 1);
                      void refreshClipboardStatus();
                      if (selectedFile) void openFile(selectedFile);
                    }}
                    title={t("common.refresh")}
                  />
                  {!isMobile && (
                    <>
                      <ClipboardToolbarButton
                        mobile={isMobile}
                        icon={Save}
                        onClick={saveNow}
                        title={t("clipboard.saveCurrentClipboard")}
                      />
                      <ClipboardToolbarButton
                        mobile={isMobile}
                        icon={status?.watching ? Square : Play}
                        tone={status?.watching ? "danger" : "success"}
                        onClick={toggleWatch}
                        title={status?.watching ? t("common.stop") : t("common.start")}
                      />
                    </>
                  )}
                </>
              )}
            />

            <ClipboardFilterBar mobile={isMobile} label={t("clipboard.filterLabel")}>
              {clipFilterOptions.map(({ id, label, Icon }) => (
                <ClipboardFilterButton
                  key={id}
                  icon={Icon}
                  label={label}
                  active={clipFilter === id}
                  mobile={isMobile}
                  onClick={() => changeClipFilter(id)}
                  title={label}
                />
              ))}
            </ClipboardFilterBar>

            <ClipboardListBody refNode={listScrollRef} mobile={isMobile} selecting={multiSelectMode}>
              {clipsLoading ? (
                <ClipboardListLoading>
                  <Loading compact text={t("clipboard.loading")} />
                </ClipboardListLoading>
              ) : savedClips.length === 0 ? (
                <ClipboardEmptyState
                  icon={Clipboard}
                  title={emptyClipsMessage}
                  description={!isMobile && clipFilter === "all" ? t("clipboard.autoCapture") : undefined}
                />
              ) : (
                <>
                  {savedClips.map((file) => {
                    const selected = selectedFile === file.path;
                    const selectionOrder = selectedClipPaths.indexOf(file.path);
                    const clipSelected = selectionOrder >= 0;
                    const active = multiSelectMode ? clipSelected : selected;
                    const copied = copiedId === file.path;
                    return (
                      <ClipboardClipItem
                        key={file.path}
                        active={active}
                        selecting={multiSelectMode}
                        onClick={() => {
                          if (multiSelectMode) toggleClipSelection(file.path);
                        }}
                      >
                        {multiSelectMode && (
                          <ClipboardSelectionToggle
                            selected={clipSelected}
                            order={selectionOrder}
                            mobile={isMobile}
                            aria-label={clipSelected ? t("common.cancel") : t("clipboard.selectMode")}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleClipSelection(file.path);
                            }}
                          />
                        )}
                        <ClipboardClipButton
                          mobile={isMobile}
                          refNode={(el) => { if (el) itemRefs.current.set(file.path, el); else itemRefs.current.delete(file.path); }}
                          onClick={() => {
                            if (!multiSelectMode) void openFile(file.path);
                          }}
                          onContextMenu={(e) => {
                            if (!isMobile || multiSelectMode) return;
                            e.preventDefault();
                            clearDetail();
                            setMultiSelectMode(true);
                            toggleClipSelection(file.path);
                          }}
                          onDoubleClick={(e) => {
                            if (multiSelectMode) return;
                            e.preventDefault();
                            void copyClipContent(file.path);
                          }}
                        >
                          <ClipboardClipPreviewWrap>
                            {file.preview_image ? (
                              <ClipImageThumb relPath={file.preview_image} selected={active} wide />
                            ) : (
                              <ClipboardClipText>{file.preview || file.name}</ClipboardClipText>
                            )}
                          </ClipboardClipPreviewWrap>
                        </ClipboardClipButton>
                        <ClipboardClipMetaRow mobile={isMobile}>
                          <ClipboardClipMetaText>{relativeTime(file.modified, t)}</ClipboardClipMetaText>
                          {file.preview_image ? <ClipboardClipMetaText muted>{file.name}</ClipboardClipMetaText> : null}
                          <ClipboardClipMetaSpacer />
                          <ClipboardClipActionButton
                            mobile={isMobile}
                            icon={copied ? Check : Copy}
                            tone={copied ? "success" : "default"}
                            hidden={multiSelectMode}
                            title={t("clipboard.copy")}
                            aria-hidden={multiSelectMode}
                            tabIndex={multiSelectMode ? -1 : undefined}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (multiSelectMode) return;
                              void copyClipContent(file.path);
                            }}
                          />
                          <ClipboardClipActionButton
                            mobile={isMobile}
                            icon={Trash2}
                            tone={active ? "danger" : "default"}
                            hidden={multiSelectMode}
                            title={t("clipboard.deleteClip")}
                            aria-hidden={multiSelectMode}
                            tabIndex={multiSelectMode ? -1 : undefined}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (multiSelectMode) return;
                              void confirmDeleteClip(file.path);
                            }}
                          />
                        </ClipboardClipMetaRow>
                      </ClipboardClipItem>
                    );
                  })}
                  {hasMore && (
                    <div ref={sentinelRef}>
                      <LoadMoreRow
                        loading={loadingMore}
                        loadingLabel={t("common.loading")}
                        label={t("common.loadMore")}
                        onClick={() => void loadMore()}
                      />
                    </div>
                  )}
                </>
              )}
            </ClipboardListBody>

            {multiSelectMode ? (
              <ClipboardSelectionBar mobile={isMobile}>
                <ClipboardSelectionCount>
                  {t("clipboard.selectedCount", selectedClipPaths.length)}
                </ClipboardSelectionCount>
                <ClipboardSelectionAction
                  mobile={isMobile}
                  icon={Trash2}
                  tone="danger"
                  hideLabelOnMobile
                  disabled={selectionActionsDisabled}
                  onClick={() => void confirmDeleteSelectedClips()}
                  title={t("clipboard.deleteSelected")}
                  aria-label={t("clipboard.deleteSelected")}
                >
                  {deletingSelected ? t("clipboard.deletingSelected") : t("clipboard.deleteSelected")}
                </ClipboardSelectionAction>
                <ClipboardSelectionAction
                  mobile={isMobile}
                  icon={FilePlus2}
                  disabled={selectionActionsDisabled}
                  onClick={() => void createNoteFromSelectedClips()}
                >
                  {creatingNote ? t("clipboard.creatingNote") : t("clipboard.saveSelectedToNote")}
                </ClipboardSelectionAction>
              </ClipboardSelectionBar>
            ) : (
              !isMobile && <ClipboardFooterTotal>{t("clipboard.clipsTotal", String(displayedClipTotal))}</ClipboardFooterTotal>
            )}
          </ClipboardListPane>
        )}
        right={showDetail && (
          <ClipboardDetailPane>
            {!selectedFile ? (
              <ClipboardEmptyDetail icon={Clipboard}>{t("clipboard.selectToView")}</ClipboardEmptyDetail>
            ) : (
              <>
                <FileDetailToolbar
                  title={isMobile ? selectedFileName : selectedFile}
                  titleText={selectedFile}
                  active={active}
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
                  splitPreview={splitPreview}
                  onToggleSplitPreview={toggleSplitPreview}
                  metadata={selectedFile ? (
                    <FavoriteButton
                      relPath={selectedFile}
                      active={active}
                      title={selectedFileName}
                      sourceType="clip"
                    />
                  ) : null}
                  actionsAfterEdit={[
                    {
                      key: "delete",
                      title: t("clipboard.deleteClip"),
                      icon: <AppIcon icon={Trash2} size={isMobile ? "sm" : "xs"} />,
                      onClick: () => { if (selectedFile) void confirmDeleteClip(selectedFile); },
                      tone: "danger",
                      hidden: editing,
                    },
                    {
                      key: "copy",
                      title: t("clipboard.copy"),
                      icon: copiedId === "detail"
                        ? <AppIcon icon={Check} size={isMobile ? "sm" : "xs"} />
                        : <AppIcon icon={Copy} size={isMobile ? "sm" : "xs"} />,
                      onClick: () => copyContent(fileContent),
                      tone: copiedId === "detail" ? "success" : "default",
                      hidden: editing,
                    },
                  ]}
                  more={!editing && selectedFile ? (
                    <FileMoreActionsMenu
                      relPath={selectedFile}
                      active={active}
                      exportContent={fileContent}
                      exportTitle={selectedFileName}
                    />
                  ) : null}
                />

                <FileEditorSurface
                  ref={editRef}
                  editing={editing}
                  value={editContent}
                  onChange={setEditContent}
                  onSave={handleSaveEdit}
                  onCancel={cancelEdit}
                  filePath={selectedFile ?? undefined}
                  mobile={isMobile}
                  splitPreview={splitPreview}
                  supportsSplitPreview
                  mobileBottomPadding={isMobile}
                >
                    <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
                </FileEditorSurface>
              </>
            )}
          </ClipboardDetailPane>
        )}
      />
    </ClipboardPageFrame>
  );
}
