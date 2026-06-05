import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { MessageSquare, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { MarkdownSplitEditor } from "../components/MarkdownSplitEditor";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { ConversationMessageCard } from "../components/domain/conversations/ConversationMessageCard";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { formatDateOnly, relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { type FileEntry, type FilePage } from "../types/files";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";

interface ConversationMeta {
  title: string;
  date: string;
  model: string;
  messages: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  timestamp: string;
  content: string;
}

interface ParsedConversationBody {
  intro: string;
  messages: ChatMessage[];
}

function parseFrontmatter(raw: string): { meta: ConversationMeta; body: string } {
  const meta: ConversationMeta = { title: "", date: "", model: "", messages: "" };
  // Must start with --- to have frontmatter
  if (!raw.startsWith("---")) return { meta, body: raw };

  const second = raw.indexOf("---", 3);
  if (second === -1) return { meta, body: raw };

  const fm = raw.slice(3, second);
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "title") meta.title = val.trim();
    else if (key === "date") meta.date = val.trim();
    else if (key === "model") meta.model = val.trim();
    else if (key === "messages") meta.messages = val.trim();
  }

  const body = raw.slice(second + 3).trim();
  return { meta, body };
}

function parseConversationBody(body: string): ParsedConversationBody {
  const msgs: ChatMessage[] = [];
  const pattern = /^### (User|Assistant)\s*(?:\(([^)]*)\))?\s*$/gm;
  const matches: { role: string; timestamp: string; index: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    matches.push({
      role: m[1].toLowerCase(),
      timestamp: m[2] || "",
      index: m.index,
    });
  }

  if (matches.length === 0) {
    return { intro: body.trim(), messages: [] };
  }

  for (let i = 0; i < matches.length; i++) {
    const start = body.indexOf("\n", matches[i].index) + 1;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const content = body.slice(start, end).trim();
    msgs.push({
      role: matches[i].role as "user" | "assistant",
      timestamp: matches[i].timestamp,
      content,
    });
  }

  return {
    intro: body.slice(0, matches[0].index).trim(),
    messages: msgs,
  };
}

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
  const [editing, setEditing] = useState(false);
  const [splitPreview, setSplitPreview] = useState(false);
  const [editContent, setEditContent] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const detailOpenedFromCrossPageRef = useRef(false);

  const metaFromEntry = useCallback((f: FileEntry): ConversationMeta => ({
    title: f.title || "",
    date: "",
    model: f.model || "",
    messages: f.messages || "",
  }), []);
  const loadConversationsPage = useCallback((offset: number, limit: number) => {
    return invoke<FilePage>("list_files_page", { folder: "conversations", offset, limit });
  }, []);
  const handleConversationPageLoaded = useCallback((page: FilePage, reset: boolean) => {
    setMetaCache((prev) => {
      const cache = reset ? new Map<string, ConversationMeta>() : new Map(prev);
      page.entries.forEach((f) => cache.set(f.path, metaFromEntry(f)));
      return cache;
    });
  }, [metaFromEntry]);
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
  useFileWatcher(watchedFolders, handleWatchedFilesChanged);

  const applyConversationRaw = useCallback((path: string, raw: string) => {
    const { meta, body } = parseFrontmatter(raw);
    const parsed = parseConversationBody(body);
    setSelectedFile(path);
    setCurrentMeta(meta);
    setRawContent(raw);
    setRawBody(body);
    setIntroContent(parsed.intro);
    setMessages(parsed.messages);
  }, []);

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const raw = await invoke<string>("read_file", { filePath: path });
      applyConversationRaw(path, raw);
      setEditing(false);
      setSplitPreview(false);
      setEditContent("");
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    } catch (e) {
      console.error(e);
    }
  }, [applyConversationRaw, isMobile, scrollItemIntoView]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("conversations/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const startEdit = useCallback(() => {
    if (isMobile) return;
    if (!selectedFile) return;
    setEditing(true);
    setSplitPreview(false);
    setEditContent(rawContent);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }, [isMobile, selectedFile, rawContent]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setSplitPreview(false);
    setEditContent("");
  }, []);

  const toggleSplitPreview = useCallback(() => {
    if (isMobile || !selectedFile) return;
    if (!editing) {
      setEditContent(rawContent);
      setEditing(true);
      setSplitPreview(true);
      window.setTimeout(() => editRef.current?.focus(), 0);
      return;
    }
    setSplitPreview((value) => !value);
  }, [editing, isMobile, rawContent, selectedFile]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await invoke("update_note", { filePath: selectedFile, content: editContent });
      applyConversationRaw(selectedFile, editContent);
      setMetaCache((prev) => {
        const next = new Map(prev);
        next.set(selectedFile, parseFrontmatter(editContent).meta);
        return next;
      });
      setEditing(false);
      setSplitPreview(false);
      setEditContent("");
      showToast(t("conversations.saved"));
      void loadFiles();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFile, editContent, applyConversationRaw, showToast, t]);

  const handleDelete = async () => {
    if (isMobile) return;
    if (!selectedFile) return;
    const confirmed = await ask(t("conversations.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      const idx = files.findIndex((f) => f.path === selectedFile);
      await invoke("delete_note", { filePath: selectedFile });
      const remaining = files.filter((f) => f.path !== selectedFile);
      setFiles(remaining);
      if (remaining.length > 0) {
        const nextIdx = idx < remaining.length ? idx : remaining.length - 1;
        openFile(remaining[nextIdx].path);
      } else {
        setSelectedFile(null);
        setMessages([]);
        setIntroContent("");
        setCurrentMeta(null);
        setRawBody("");
        setRawContent("");
        setEditing(false);
        setSplitPreview(false);
        }
      showToast(t("conversations.deleted"));
      loadFiles();
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

  useEffect(() => {
    if (!active || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (selectedFile) {
          setSelectedFile(null); setMessages([]); setCurrentMeta(null); setRawBody(""); setRawContent(""); setEditing(false);
          setSplitPreview(false);
          setIntroContent("");
        } else {
          onFocusSidebar?.();
        }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!selectedFile && files.length > 0) {
          openFile(files[0].path);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    isMobile,
    navPrev,
    navNext,
    selectedFile,
    files,
    onFocusSidebar,
  ]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setMessages([]);
    setCurrentMeta(null);
    setRawBody("");
    setRawContent("");
    setEditing(false);
    setSplitPreview(false);
    setIntroContent("");
    detailOpenedFromCrossPageRef.current = false;
  }, []);

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
        {selectedFile ? `${files.findIndex((f) => f.path === selectedFile) + 1} / ` : ""}{files.length}
        {hasMore ? ` / ${totalFiles}` : ""}
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
                  title={meta?.title || f.name.replace(/\.md$/, "")}
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
            <DetailScroll mobileBottomPadding={isMobile} selectable className={editing && splitPreview ? "gm-detail-scroll-split" : undefined}>
              {editing ? (
                splitPreview && !isMobile ? (
                  <MarkdownSplitEditor
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                        e.preventDefault();
                        void handleSaveEdit();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    filePath={selectedFile ?? undefined}
                  />
                ) : (
                  <textarea
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                        e.preventDefault();
                        void handleSaveEdit();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    spellCheck={false}
                    className="gm-code-editor gm-code-editor-box gm-code-textarea"
                  />
                )
              ) : messages.length > 0 ? (
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
            </DetailScroll>
          </>
        )}
      </DetailPane>
      )}
      showList={showList}
      showDetail={showDetail}
    />
  );
}
