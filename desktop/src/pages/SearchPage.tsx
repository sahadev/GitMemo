import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Trash2, Copy, Check } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { AppIcon } from "../components/base/AppIcon";
import { shouldActivateMobileEditorChrome } from "../components/domain/app/appChromeLogic";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { SearchInput } from "../components/domain/search/SearchInput";
import { SearchResults } from "../components/domain/search/SearchResults";
import {
  canDeleteSearchSource,
  canEditSearchSource,
  canOpenSearchPath,
  filterSearchResultsForPlatform,
  getAdjacentSearchResultPath,
  getRetainedSearchResultPath,
  getSearchDeletedToastKey,
  getSearchDeleteConfirmKey,
  getSearchLayoutMode,
  getSearchResultLimit,
  getSearchSourceTypeFromPath,
  isClipSearchSource,
  isPlanSearchSource,
  shouldCopySelectedSearchClip,
  shouldWriteSearchEditAsMarkdownBody,
  type SearchResultItem,
} from "../components/domain/search/searchLogic";
import { PageFrame } from "../components/layout/PageFrame";
import { DetailPane, ListPane } from "../components/layout/Pane";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useFileDetailState } from "../hooks/useFileDetailState";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { useMobileEditorChrome } from "../hooks/useMobileEditorChrome";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { useListKeyboardNavigation } from "../hooks/useListNavigation";
import { formatShortcut, isShortcutEditableTarget, withDefaultShortcuts } from "../utils/shortcuts";
import { writeTextWithClipboardWatchPaused } from "../utils/clipboard";
import { replaceMarkdownBody, stripMarkdownFrontmatter } from "../utils/markdown";

const SEARCH_STATE_KEY = "gitmemo-search-state";
const SEARCH_REVIEW_MIN_SINGLE_ROW_DETAIL_WIDTH = 360;

export default function SearchPage({
  active = true,
  focusTrigger,
  entryTrigger,
  openFilePath,
  onFileOpened,
  registerMobileBackHandler,
}: {
  active?: boolean;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const resetEditorRef = useRef<(() => void) | null>(null);
  const imeComposingRef = useRef(false);
  const searchRequestRef = useRef(0);
  const selectedFileRef = useRef<string | null>(null);
  const navigationFileRef = useRef<string | null>(null);
  const { copied: copiedClip, markCopied: markCopiedClip, clearCopied: clearCopiedClip } = useTimedCopy<boolean>();
  const {
    selectedFile,
    rawFileContent,
    fileContent,
    setRawFileContent,
    setFileContent,
    openFile,
    clearDetail,
  } = useFileDetailState({
    canOpen: (path) => canOpenSearchPath(isDesktop, path),
    deriveContent: (content, path) => isClipSearchSource(getSearchSourceTypeFromPath(path)) ? stripMarkdownFrontmatter(content) : content,
    onOpened: ({ path }) => {
      navigationFileRef.current = path;
      resetEditorRef.current?.();
      clearCopiedClip();
    },
    onClosed: () => {
      navigationFileRef.current = null;
      resetEditorRef.current?.();
      clearCopiedClip();
    },
    onOpenError: (error) => {
      navigationFileRef.current = selectedFileRef.current;
      console.error(error);
    },
  });
  selectedFileRef.current = selectedFile;
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
    clearContentOnCancel: true,
    clearContentOnComplete: true,
  });
  useMobileEditorChrome({ active: shouldActivateMobileEditorChrome({ pageActive: active, editing }), id: "search" });
  resetEditorRef.current = resetEditor;

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
      const restoredResults = filterSearchResultsForPlatform(isDesktop, saved.results || []);
      const restoredSelection = getRetainedSearchResultPath(restoredResults, saved.selectedFile ?? null);
      setQuery(saved.query || "");
      setResults(restoredResults);
      setSearched(Boolean(saved.searched));
      if (isDesktop && restoredSelection) {
        void openFile(restoredSelection);
      }
    } catch {
      // Ignore invalid cached state.
    }
  }, [isDesktop]);

  useEffect(() => {
    if (focusTrigger && inputRef.current) inputRef.current.focus();
  }, [focusTrigger]);

  useEffect(() => {
    if (openFilePath && canOpenSearchPath(isDesktop, openFilePath)) {
      void openFile(openFilePath);
      onFileOpened?.();
    }
  }, [isDesktop, onFileOpened, openFile, openFilePath]);

  useEffect(() => {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({
      query,
      results,
      searched,
      selectedFile: isDesktop ? selectedFile : null,
    }));
  }, [isDesktop, query, results, searched, selectedFile]);

  const closeDetail = useCallback(() => {
    clearDetail();
    if (!isMobile) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [clearDetail, isMobile]);

  const handleSearch = async () => {
    const searchQuery = query.trim();
    if (!searchQuery) return;
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setLoading(true);
    setSearched(true);
    try {
      const res = await invoke<SearchResultItem[]>("search_all", {
        query: searchQuery,
        typeFilter: null,
        limit: getSearchResultLimit(isMobile),
      });
      if (searchRequestRef.current !== requestId) return;
      const nextResults = filterSearchResultsForPlatform(isDesktop, res);
      setResults(nextResults);
      const currentReviewPath = navigationFileRef.current ?? selectedFileRef.current;
      if (currentReviewPath && !getRetainedSearchResultPath(nextResults, currentReviewPath)) {
        closeDetail();
      }
    } catch (e) {
      if (searchRequestRef.current !== requestId) return;
      console.error(e);
      setResults([]);
      closeDetail();
    } finally {
      if (searchRequestRef.current === requestId) setLoading(false);
    }
  };

  const openSearchResult = useCallback((path: string) => {
    navigationFileRef.current = path;
    void openFile(path);
  }, [openFile]);

  const navigateSearchResults = useCallback((direction: "previous" | "next") => {
    const nextPath = getAdjacentSearchResultPath(results, navigationFileRef.current, direction);
    if (nextPath) openSearchResult(nextPath);
  }, [openSearchResult, results]);
  const navPrev = useCallback(() => navigateSearchResults("previous"), [navigateSearchResults]);
  const navNext = useCallback(() => navigateSearchResults("next"), [navigateSearchResults]);

  useListKeyboardNavigation({
    active,
    disabled: isMobile || editing || loading,
    navPrev,
    navNext,
    allowFromEditable: (event) => (
      event.target === inputRef.current
      && !imeComposingRef.current
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !event.shiftKey
    ),
  });

  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    const selectedSourceType = getSearchSourceTypeFromPath(selectedFile);
    try {
      const nextContent = shouldWriteSearchEditAsMarkdownBody(selectedSourceType)
        ? replaceMarkdownBody(rawFileContent, editContent)
        : editContent;
      await invoke("update_note", { filePath: selectedFile, content: nextContent });
      setFileContent(editContent);
      setRawFileContent(nextContent);
      completeEdit();
      showToast(t("notes.save"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [completeEdit, rawFileContent, selectedFile, editContent, showToast, t]);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    const sourceType = getSearchSourceTypeFromPath(selectedFile);
    const confirmKey = getSearchDeleteConfirmKey(sourceType);
    const confirmed = await ask(t(confirmKey), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      if (isClipSearchSource(sourceType)) {
        await invoke("delete_clip", { filePath: selectedFile });
      } else if (isPlanSearchSource(sourceType)) {
        const deleteSource = await ask(t("plans.deleteSourceConfirm"), {
          title: t("plans.deleteSource"),
          kind: "warning",
        });
        await invoke("delete_plan", { filePath: selectedFile, deleteSource });
      } else {
        await invoke("delete_note", { filePath: selectedFile });
      }
      setResults((prev) => prev.filter((r) => r.file_path !== selectedFile));
      clearDetail();
      showToast(t(getSearchDeletedToastKey(sourceType)));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [clearDetail, selectedFile, showToast, t]);

  const selectedIsClip = shouldCopySelectedSearchClip(selectedFile);
  const selectedSourceType = selectedFile ? getSearchSourceTypeFromPath(selectedFile) : "unknown";
  const selectedCanEdit = selectedFile ? canEditSearchSource(isDesktop, selectedSourceType) : false;
  const selectedCanDelete = selectedFile ? canDeleteSearchSource(isDesktop, selectedSourceType) : false;

  const copySelectedClip = useCallback(async () => {
    if (!shouldCopySelectedSearchClip(selectedFile)) return;
    try {
      await writeTextWithClipboardWatchPaused(
        stripMarkdownFrontmatter(rawFileContent || fileContent),
        clipboardWatching,
        () => void refreshClipboardStatus(),
      );
      markCopiedClip(true);
    } catch (e) {
      showToast(`Copy failed: ${e}`, true);
    }
  }, [clipboardWatching, fileContent, markCopiedClip, rawFileContent, refreshClipboardStatus, selectedFile, showToast]);

  useEffect(() => {
    if (!isMobile || !entryTrigger) return;
    closeDetail();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [closeDetail, entryTrigger, isMobile]);

  useEffect(() => {
    if (!active || isMobile || !selectedFile || editing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (isShortcutEditableTarget(event.target) && event.target !== inputRef.current) return;
      event.preventDefault();
      closeDetail();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, closeDetail, editing, isMobile, selectedFile]);

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    editing,
    cancelEdit,
  });

  const layoutMode = getSearchLayoutMode(isMobile, results, selectedFile);
  const emptyDescription = isMobile
    ? t("search.mobileEmptyHint")
    : t("search.emptyHint", formatShortcut(shortcuts.global_search));
  const searchInput = (
    <SearchInput
      value={query}
      onChange={setQuery}
      inputRef={inputRef}
      mobile={isMobile}
      placeholder={isMobile ? t("search.mobilePlaceholder") : t("search.placeholder", formatShortcut(shortcuts.app_search))}
      onCompositionStart={() => { imeComposingRef.current = true; }}
      onCompositionEnd={() => { imeComposingRef.current = false; }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        const nativeEvent = event.nativeEvent;
        if (imeComposingRef.current || nativeEvent.isComposing) return;
        if ("keyCode" in nativeEvent && (nativeEvent as KeyboardEvent).keyCode === 229) return;
        void handleSearch();
      }}
    />
  );
  const renderSearchResults = (compact: boolean) => (
    <SearchResults
      active={active}
      compact={compact}
      emptyDescription={emptyDescription}
      loading={loading}
      mobile={isMobile}
      query={query}
      results={results}
      searched={searched}
      selectedFile={selectedFile}
      onOpen={openSearchResult}
    />
  );
  const detail = selectedFile ? (
    <DetailPane>
      <FileDetailToolbar
        title={isMobile ? selectedFile.split("/").pop() : selectedFile}
        titleText={selectedFile}
        active={active}
        onBack={closeDetail}
        onRefresh={() => void openFile(selectedFile)}
        editing={editing}
        onEdit={selectedCanEdit ? startEdit : undefined}
        onSave={selectedCanEdit ? () => void handleSaveEdit() : undefined}
        onCancel={selectedCanEdit ? cancelEdit : undefined}
        editTitle={t("notes.edit")}
        saveTitle={t("notes.save")}
        density={layoutMode === "split" ? "compact" : "default"}
        splitPreview={splitPreview}
        onToggleSplitPreview={selectedCanEdit ? toggleSplitPreview : undefined}
        metadata={(
          <FavoriteButton
            relPath={selectedFile}
            active={active}
            title={selectedFile.split("/").pop()}
            sourceType={getSearchSourceTypeFromPath(selectedFile)}
          />
        )}
        actionsAfterEdit={[
          {
            key: "delete",
            title: t("common.delete"),
            icon: <AppIcon icon={Trash2} size={isMobile ? "sm" : "xs"} />,
            onClick: () => void handleDelete(),
            tone: "danger",
            hidden: editing || !selectedCanDelete,
          },
          {
            key: "copy",
            title: t("clipboard.copy"),
            icon: copiedClip
              ? <AppIcon icon={Check} size={isMobile ? "sm" : "xs"} />
              : <AppIcon icon={Copy} size={isMobile ? "sm" : "xs"} />,
            onClick: () => void copySelectedClip(),
            tone: copiedClip ? "success" : "default",
            hidden: editing || !selectedIsClip,
          },
        ]}
        more={!editing ? (
          <FileMoreActionsMenu
            relPath={selectedFile}
            active={active}
            exportContent={fileContent}
            exportTitle={selectedFile.split("/").pop()}
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
        filePath={selectedFile}
        mobile={isMobile}
        splitPreview={splitPreview}
        supportsSplitPreview={selectedCanEdit}
        mobileBottomPadding={isMobile}
        selectable
      >
        <MarkdownView content={fileContent} filePath={selectedFile} />
      </FileEditorSurface>
    </DetailPane>
  ) : null;

  if (layoutMode === "split") {
    return (
      <FileWorkspace
        panelKey="search"
        showList
        showDetail
        narrowDetailThreshold={SEARCH_REVIEW_MIN_SINGLE_ROW_DETAIL_WIDTH}
        left={(
          <ListPane className="gm-search-list-pane">
            {searchInput}
            {renderSearchResults(true)}
          </ListPane>
        )}
        right={detail}
      />
    );
  }

  if (layoutMode === "detail") {
    return <PageFrame column>{detail}</PageFrame>;
  }

  return (
    <PageFrame column>
      {searchInput}
      {renderSearchResults(false)}
    </PageFrame>
  );
}
