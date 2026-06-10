import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Search, MessageSquare, StickyNote, Clipboard, FileText, Settings, FolderInput, Trash2, Copy, Check } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { AppIcon, type AppIconTone } from "../components/base/AppIcon";
import { EmptyState } from "../components/base/EmptyState";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { SearchInput } from "../components/domain/search/SearchInput";
import { SearchResultCard } from "../components/domain/search/SearchResultCard";
import {
  canDeleteSearchSource,
  canEditSearchSource,
  canOpenSearchPath,
  filterSearchResultsForPlatform,
  getSearchDeletedToastKey,
  getSearchDeleteConfirmKey,
  getSearchResultLimit,
  getSearchSourceTypeFromPath,
  isClipSearchSource,
  isPlanSearchSource,
  shouldCopySelectedSearchClip,
  shouldWriteSearchEditAsMarkdownBody,
  type SearchResultItem,
} from "../components/domain/search/searchLogic";
import { PageFrame } from "../components/layout/PageFrame";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { relativeTime } from "../utils/time";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useFileDetailState } from "../hooks/useFileDetailState";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { formatShortcut, withDefaultShortcuts } from "../utils/shortcuts";
import { writeTextWithClipboardWatchPaused } from "../utils/clipboard";
import { replaceMarkdownBody, stripMarkdownFrontmatter } from "../utils/markdown";

const SEARCH_STATE_KEY = "gitmemo-search-state";

function sourceVisual(sourceType: string): { icon: typeof MessageSquare; tone: AppIconTone } {
  switch (sourceType) {
    case "conversation":
      return { icon: MessageSquare, tone: "accent" };
    case "clip":
      return { icon: Clipboard, tone: "success" };
    case "plan":
      return { icon: FileText, tone: "warning" };
    case "config":
      return { icon: Settings, tone: "secondary" };
    case "import":
      return { icon: FolderInput, tone: "teal" };
    default:
      return { icon: StickyNote, tone: "success" };
  }
}

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
    onOpened: () => {
      resetEditorRef.current?.();
      clearCopiedClip();
    },
    onClosed: () => {
      resetEditorRef.current?.();
      clearCopiedClip();
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
    clearContentOnCancel: true,
    clearContentOnComplete: true,
  });
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
      setQuery(saved.query || "");
      setResults(filterSearchResultsForPlatform(isDesktop, saved.results || []));
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
    if (openFilePath && canOpenSearchPath(isDesktop, openFilePath)) {
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
      const res = await invoke<SearchResultItem[]>("search_all", {
        query: query.trim(),
        typeFilter: null,
        limit: getSearchResultLimit(isMobile),
      });
      setResults(filterSearchResultsForPlatform(isDesktop, res));
    } catch (e) { console.error(e); setResults([]); }
    finally { setLoading(false); }
  };

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
  const closeDetail = useCallback(() => {
    clearDetail();
  }, [clearDetail]);

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

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    editing,
    cancelEdit,
  });

  if (selectedFile) {
    return (
      <PageFrame column>
        <FileDetailToolbar
          title={isMobile ? selectedFile.split("/").pop() : selectedFile}
          titleText={selectedFile}
          active={active}
          onBack={closeDetail}
          onRefresh={() => {
            if (selectedFile) void openFile(selectedFile);
          }}
          editing={editing}
          onEdit={selectedCanEdit ? startEdit : undefined}
          onSave={selectedCanEdit ? () => void handleSaveEdit() : undefined}
          onCancel={selectedCanEdit ? cancelEdit : undefined}
          editTitle={t("notes.edit")}
          saveTitle={t("notes.save")}
          splitPreview={splitPreview}
          onToggleSplitPreview={selectedCanEdit ? toggleSplitPreview : undefined}
          metadata={selectedFile ? (
            <FavoriteButton
              relPath={selectedFile}
              active={active}
              title={selectedFile.split("/").pop()}
              sourceType={getSearchSourceTypeFromPath(selectedFile)}
            />
          ) : null}
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
        filePath={selectedFile ?? undefined}
        mobile={isMobile}
        splitPreview={splitPreview}
        supportsSplitPreview={selectedCanEdit}
        mobileBottomPadding={isMobile}
        selectable
      >
            <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
      </FileEditorSurface>
      </PageFrame>
    );
  }

  return (
      <PageFrame column>
      {/* Search Bar */}
      <SearchInput
        value={query}
        onChange={setQuery}
        inputRef={inputRef}
        mobile={isMobile}
        placeholder={isMobile ? t("search.mobilePlaceholder") : t("search.placeholder", formatShortcut(shortcuts.app_search))}
        onCompositionStart={() => { imeComposingRef.current = true; }}
        onCompositionEnd={() => { imeComposingRef.current = false; }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const ev = e.nativeEvent;
          if (imeComposingRef.current || ev.isComposing) return;
          if ("keyCode" in ev && (ev as KeyboardEvent).keyCode === 229) return;
          handleSearch();
        }}
      />

      {/* Results */}
      <div className="gm-page-scroll gm-search-results" data-mobile={isMobile ? "true" : "false"}>
        {loading ? (
          <p className="gm-muted-text">{t("search.searching")}</p>
        ) : !searched ? (
          <EmptyState
            icon={Search}
            iconSize="empty-lg"
            title={isMobile ? t("search.mobileEmptyTitle") : t("search.emptyTitle")}
            description={isMobile ? t("search.mobileEmptyHint") : t("search.emptyHint", formatShortcut(shortcuts.global_search))}
          />
        ) : results.length === 0 ? (
          <p className="gm-muted-text">{t("search.noResults", query)}</p>
        ) : (
          <>
            <p className="gm-search-result-count">{t("search.results", String(results.length))}</p>
            <div className="gm-search-result-stack">
              {results.map((r, i) => {
                const visual = sourceVisual(r.source_type);
                return (
                  <SearchResultCard
                    key={i}
                    icon={visual.icon}
                    iconTone={visual.tone}
                    title={r.title}
                    time={relativeTime(r.date, t)}
                    snippet={r.snippet}
                    onClick={() => openFile(r.file_path)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageFrame>
  );
}
