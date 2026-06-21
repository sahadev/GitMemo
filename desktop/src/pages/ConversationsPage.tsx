import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { MessageSquare, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { shouldActivateMobileEditorChrome } from "../components/domain/app/appChromeLogic";
import { ConversationMessageCard } from "../components/domain/conversations/ConversationMessageCard";
import {
  getConversationListCountLabel,
  getConversationMetaFromEntry,
  getConversationPaneState,
  getNextConversationAfterDelete,
  parseConversationFrontmatter,
  parseConversationMarkdown,
  shouldOpenFirstConversationFromKeyboard,
  type ChatMessage,
  type ConversationMeta,
} from "../components/domain/conversations/conversationsLogic";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import {
  getMarkdownTitleFromPath,
  getRemainingFilesAfterDelete,
  isPendingPathForFolder,
} from "../components/domain/files/fileWorkspaceLogic";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { DetailPane, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { formatDateOnly, relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { type FileEntry, type FilePage } from "../types/files";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useListKeyboardNavigation } from "../hooks/useListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useMobileEditorChrome } from "../hooks/useMobileEditorChrome";

export default function ConversationsPage({
  active = true,
  onFocusSidebar,
  enterTrigger,
  renderListHeader,
  registerMobileBackHandler,
}: {
  active?: boolean;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  renderListHeader?: (actions: ReactNode) => ReactNode;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [metaCache, setMetaCache] = useState<Map<string, ConversationMeta>>(new Map());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [introContent, setIntroContent] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [rawBody, setRawBody] = useState("");
  const [currentMeta, setCurrentMeta] = useState<ConversationMeta | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
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
    sourceContent: rawContent,
    mobile: isMobile,
    focusRef: editRef,
    clearContentOnCancel: true,
    clearContentOnComplete: true,
  });
  useMobileEditorChrome({ active: shouldActivateMobileEditorChrome({ pageActive: active, editing }), id: "conversations" });
  const detailOpenedFromCrossPageRef = useRef(false);

  const loadConversationsPage = useCallback((offset: number, limit: number) => {
    return invoke<FilePage>("list_files_page", { folder: "conversations", offset, limit });
  }, []);
  const handleConversationPageLoaded = useCallback((page: FilePage, reset: boolean) => {
    setMetaCache((prev) => {
      const cache = reset ? new Map<string, ConversationMeta>() : new Map(prev);
      page.entries.forEach((file) => cache.set(file.path, getConversationMetaFromEntry(file)));
      return cache;
    });
  }, []);
  const {
    files,
    setFiles,
    loading,
    loadingMore,
    hasMore,
    totalFiles,
    loadFiles,
    loadMore,
    sentinelRef,
    registerItemRef,
    scrollItemIntoView,
  } = usePagedFileList<FileEntry>({
    loadPage: loadConversationsPage,
    onPageLoaded: handleConversationPageLoaded,
  });

  useEffect(() => {
    if (!active) return;
    void loadFiles();
  }, [active, loadFiles]);
  const watchedFolders = useMemo(() => ["conversations"], []);
  const handleWatchedFilesChanged = useCallback(() => {
    if (active) void loadFiles();
  }, [active, loadFiles]);
  useFileWatcher(watchedFolders, handleWatchedFilesChanged, { active });

  const applyConversationRaw = useCallback((path: string, raw: string) => {
    const parsed = parseConversationMarkdown(raw);
    setSelectedFile(path);
    setCurrentMeta(parsed.meta);
    setRawContent(raw);
    setRawBody(parsed.body);
    setIntroContent(parsed.intro);
    setMessages(parsed.messages);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setMessages([]);
    setCurrentMeta(null);
    setRawBody("");
    setRawContent("");
    resetEditor();
    setIntroContent("");
    detailOpenedFromCrossPageRef.current = false;
  }, [resetEditor]);

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const raw = await invoke<string>("read_file", { filePath: path });
      applyConversationRaw(path, raw);
      resetEditor();
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    } catch (e) {
      console.error(e);
    }
  }, [applyConversationRaw, isMobile, resetEditor, scrollItemIntoView]);

  useEffect(() => {
    if (!isPendingPathForFolder(pendingOpenPath, "conversations/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await invoke("update_note", { filePath: selectedFile, content: editContent });
      applyConversationRaw(selectedFile, editContent);
      setMetaCache((prev) => {
        const next = new Map(prev);
        next.set(selectedFile, parseConversationFrontmatter(editContent).meta);
        return next;
      });
      completeEdit();
      showToast(t("conversations.saved"));
      void loadFiles();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFile, editContent, applyConversationRaw, completeEdit, loadFiles, showToast, t]);

  const handleDelete = async () => {
    if (isMobile) return;
    if (!selectedFile) return;
    const confirmed = await ask(t("conversations.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      const current = selectedFile;
      await invoke("delete_note", { filePath: selectedFile });
      const remaining = getRemainingFilesAfterDelete(files, current);
      const next = getNextConversationAfterDelete(files, current);
      setFiles(remaining);
      if (next) {
        void openFile(next.path);
      } else {
        closeDetail();
      }
      showToast(t("conversations.deleted"));
      void loadFiles();
    } catch (e) {
      showToast(`Error: ${e}`);
    }
  };

  const { navPrev, navNext } = useFileListNavigation({
    files,
    selectedPath: selectedFile,
    openFile,
    hasMore,
    loadingMore,
    loadMore,
  });

  useListKeyboardNavigation({
    active,
    disabled: isMobile,
    navPrev,
    navNext,
  });

  useEffect(() => {
    if (!active || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (selectedFile) {
          closeDetail();
        } else {
          onFocusSidebar?.();
        }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (shouldOpenFirstConversationFromKeyboard(selectedFile, files)) {
          openFile(files[0].path);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    isMobile,
    selectedFile,
    files,
    openFile,
    onFocusSidebar,
    closeDetail,
  ]);

  const { showList, showDetail } = getConversationPaneState(isMobile, selectedFile);

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    openedFromCrossPageRef: detailOpenedFromCrossPageRef,
  });

  const listHeaderActions = (
    <>
      <Button
        variant="toolbar"
        onClick={() => loadFiles()}
        title={t("common.refresh")}
        icon={RefreshCw}
      />
      <Badge>
        {getConversationListCountLabel({ selectedFile, files, hasMore, totalFiles })}
      </Badge>
    </>
  );

  return (
    <FileWorkspace
        panelKey="conversations"
        left={showList && (
      <ListPane>
        {renderListHeader ? renderListHeader(listHeaderActions) : (
          <PaneHeader icon={MessageSquare} title={t("conversations.title")} actions={listHeaderActions} />
        )}

        {/* List */}
        <ListPaneBody mobileBottomPadding={isMobile}>
          {loading ? (
            <Loading compact text={t("conversations.loading")} />
          ) : files.length === 0 ? (
            <EmptyState icon={MessageSquare} title={t("conversations.empty")} />
          ) : (
            <>
            {files.map((f) => {
              const meta = metaCache.get(f.path);
              const selected = selectedFile === f.path;
              return (
                <FileListItem
                  key={f.path}
                  ref={(el) => registerItemRef(f.path, el)}
                  onClick={() => openFile(f.path)}
                  active={selected}
                  mobile={isMobile}
                  title={meta?.title || getMarkdownTitleFromPath(f.name)}
                  subtitle={relativeTime(f.modified, t)}
                  meta={(
                    <>
                      {meta?.model ? <Badge tone="accent">{meta.model}</Badge> : null}
                      {meta?.messages ? <span className="gm-file-list-meta">{meta.messages} {t("conversations.msgs")}</span> : null}
                    </>
                  )}
                />
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
        </ListPaneBody>
      </ListPane>
      )}

        right={showDetail && (
      <DetailPane>
        {!selectedFile ? (
          <EmptyState icon={MessageSquare} iconSize="hero" title={t("conversations.selectToView")} full />
        ) : (
          <>
            <FileDetailToolbar
              title={currentMeta?.title || selectedFile}
              titleText={selectedFile}
              active={active}
              onBack={closeDetail}
              onRefresh={() => {
                void loadFiles();
                if (selectedFile) void openFile(selectedFile);
              }}
              onTitleClick={() => {
                const text = currentMeta?.title || selectedFile || "";
                navigator.clipboard.writeText(text);
                showToast(t("conversations.copied"));
              }}
              titleClickLabel={t("conversations.clickToCopy")}
              titleEmphasis
              metadata={(
                <>
                  {currentMeta?.model && (
                    <Badge tone="accent">{currentMeta.model}</Badge>
                  )}
                  {currentMeta?.messages && (
                    <span className="gm-file-list-meta">{currentMeta.messages} {t("conversations.msgs")}</span>
                  )}
                  {selectedFile ? (
                    <FavoriteButton
                      relPath={selectedFile}
                      active={active}
                      title={currentMeta?.title || selectedFile}
                      sourceType="conversation"
                    />
                  ) : null}
                </>
              )}
              editing={editing}
              onEdit={!isMobile ? startEdit : undefined}
              onSave={!isMobile ? () => void handleSaveEdit() : undefined}
              onCancel={!isMobile ? cancelEdit : undefined}
              editTitle={t("conversations.edit")}
              saveTitle={t("conversations.save")}
              saveTone="accent"
              splitPreview={splitPreview}
              onToggleSplitPreview={!isMobile ? toggleSplitPreview : undefined}
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("conversations.deleteConversation"),
                  icon: <AppIcon icon={Trash2} size="xs" />,
                  onClick: () => void handleDelete(),
                  tone: "danger",
                  hidden: isMobile || editing,
                },
              ]}
              more={selectedFile && !editing ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  active={active}
                  canExportPdf={false}
                />
              ) : null}
            />

            {/* Messages */}
            <FileEditorSurface
              ref={editRef}
              editing={editing}
              value={editContent}
              onChange={setEditContent}
              onSave={handleSaveEdit}
              onCancel={cancelEdit}
              filePath={selectedFile ?? undefined}
              mobile={isMobile}
              boxed
              splitPreview={splitPreview}
              supportsSplitPreview
              mobileBottomPadding={isMobile}
              selectable
            >
              {messages.length > 0 ? (
                <>
                  {introContent ? (
                    <div className="gm-section-block">
                      <MarkdownView content={introContent} filePath={selectedFile ?? undefined} />
                    </div>
                  ) : null}
                  {messages.map((msg, i) => (
                    <ConversationMessageCard
                      key={i}
                      role={msg.role}
                      roleLabel={msg.role === "user" ? t("conversations.user") : t("conversations.assistant")}
                      timestamp={msg.timestamp ? `${currentMeta?.date ? `${formatDateOnly(currentMeta.date)} ` : ""}${msg.timestamp}` : undefined}
                    >
                      <MarkdownView content={msg.content} />
                    </ConversationMessageCard>
                  ))}
                </>
              ) : (
                <MarkdownView content={rawBody} />
              )}
            </FileEditorSurface>
          </>
        )}
      </DetailPane>
      )}
      showList={showList}
      showDetail={showDetail}
    />
  );
}
