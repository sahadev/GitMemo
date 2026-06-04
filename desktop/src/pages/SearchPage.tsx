import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Search, MessageSquare, StickyNote, Clipboard, FileText, Settings, FolderInput, Trash2, Copy, Check } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { AppIcon, type AppIconTone } from "../components/base/AppIcon";
import { CodeTextarea } from "../components/base/CodeTextarea";
import { EmptyState } from "../components/base/EmptyState";
import { SearchInput } from "../components/domain/search/SearchInput";
import { SearchResultCard } from "../components/domain/search/SearchResultCard";
import { DetailScroll } from "../components/layout/Pane";
import { PageFrame } from "../components/layout/PageFrame";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { relativeTime } from "../utils/time";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { formatShortcut, withDefaultShortcuts } from "../utils/shortcuts";
import { writeTextWithClipboardWatchPaused } from "../utils/clipboard";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const imeComposingRef = useRef(false);
  const { copied: copiedClip, markCopied: markCopiedClip, clearCopied: clearCopiedClip } = useTimedCopy<boolean>();

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
      clearCopiedClip();
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
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setRawFileContent("");
    setFileContent("");
    setEditing(false);
    setEditContent("");
    clearCopiedClip();
  }, [clearCopiedClip]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent("");
  }, []);

  const copySelectedClip = useCallback(async () => {
    if (!selectedFile?.startsWith("clips/")) return;
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
          metadata={selectedFile ? (
            <FavoriteButton
              relPath={selectedFile}
              title={selectedFile.split("/").pop()}
              sourceType={sourceTypeFromPath(selectedFile)}
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
              exportContent={fileContent}
              exportTitle={selectedFile.split("/").pop()}
            />
          ) : null}
        />
      <DetailScroll mobileBottomPadding={isMobile} selectable>
          {editing ? (
            <CodeTextarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  void handleSaveEdit();
                }
              }}
              mobile={isMobile}
            />
          ) : (
            <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
          )}
        </DetailScroll>
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
