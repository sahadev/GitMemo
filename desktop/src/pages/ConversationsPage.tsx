import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { MessageSquare, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { PaneHeader } from "../components/AppHeaders";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { formatDateOnly, relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { FILE_PAGE_SIZE, type FileEntry, type FilePage } from "../types/files";
import { useAutoLoadMore } from "../hooks/useAutoLoadMore";
import { shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";

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
  const { pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [metaCache, setMetaCache] = useState<Map<string, ConversationMeta>>(new Map());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [introContent, setIntroContent] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [rawBody, setRawBody] = useState("");
  const [currentMeta, setCurrentMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const editRef = useRef<HTMLTextAreaElement>(null);
  const filesLengthRef = useRef(0);
  const pendingKeyboardNextIndexRef = useRef<number | null>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  const metaFromEntry = (f: FileEntry): ConversationMeta => ({
    title: f.title || "",
    date: "",
    model: f.model || "",
    messages: f.messages || "",
  });

  const loadFiles = async (reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await invoke<FilePage>("list_files_page", {
        folder: "conversations",
        offset: reset ? 0 : filesLengthRef.current,
        limit: FILE_PAGE_SIZE,
      });
      setFiles((prev) => reset ? page.entries : [...prev, ...page.entries]);
      setMetaCache((prev) => {
        const cache = reset ? new Map<string, ConversationMeta>() : new Map(prev);
        page.entries.forEach((f) => cache.set(f.path, metaFromEntry(f)));
        return cache;
      });
      setHasMore(page.has_more);
      setTotalFiles(page.total);
    } catch (e) {
      console.error(e);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };
  useFileWatcher(["conversations"], loadFiles);
  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore: () => loadFiles(false),
  });

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
      setEditContent("");
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) {
      console.error(e);
    }
  }, [applyConversationRaw, isMobile]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("conversations/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const startEdit = useCallback(() => {
    if (isMobile) return;
    if (!selectedFile) return;
    setEditing(true);
    setEditContent(rawContent);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }, [isMobile, selectedFile, rawContent]);

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
      }
      showToast(t("conversations.deleted"));
      loadFiles();
    } catch (e) {
      showToast(`Error: ${e}`);
    }
  };

  const navigatePrev = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx > 0) openFile(files[idx - 1].path);
  }, [selectedFile, files]);

  const navigateNext = useCallback(() => {
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
    if (!active || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navigatePrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navigateNext(); }
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.edit_selected)) {
        e.preventDefault();
        startEdit();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (selectedFile) {
          setSelectedFile(null); setMessages([]); setCurrentMeta(null); setRawBody(""); setRawContent(""); setEditing(false);
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
  }, [active, isMobile, navigatePrev, navigateNext, selectedFile, files, editing, startEdit, onFocusSidebar, shortcuts.edit_selected]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setMessages([]);
    setCurrentMeta(null);
    setRawBody("");
    setRawContent("");
    setEditing(false);
    setIntroContent("");
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

  const listHeaderActions = (
    <>
      <button
        onClick={() => loadFiles()}
        title={t("common.refresh")}
        className="gm-toolbar-button"
        style={{ padding: 0, display: "flex", alignItems: "center" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
      >
        <RefreshCw size="var(--gm-icon-xs)" />
      </button>
      <span style={{
        fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", background: "var(--bg-hover)",
        padding: "var(--gm-space-1) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-pill)", whiteSpace: "nowrap",
      }}>
        {selectedFile ? `${files.findIndex((f) => f.path === selectedFile) + 1} / ` : ""}{files.length}
        {hasMore ? ` / ${totalFiles}` : ""}
      </span>
    </>
  );

  return (
    <div className="gm-page" style={{ display: "flex", width: "100%", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="conversations"
        defaultWidth={300}
        left={showList && (
      <div style={{
        display: "flex", flexDirection: "column",
        flexShrink: 0, background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
        width: "100%", flex: 1, minWidth: 0,
        height: "100%", minHeight: 0, overflow: "hidden",
      }}>
        {renderListHeader ? renderListHeader(listHeaderActions) : (
          <PaneHeader icon={MessageSquare} title={t("conversations.title")} actions={listHeaderActions} />
        )}

        {/* List */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingBottom: isMobile ? MOBILE_BOTTOM_CONTENT_PADDING : 0,
        }}>
          {loading ? (
            <Loading compact text={t("conversations.loading")} />
          ) : files.length === 0 ? (
            <div style={{ padding: "var(--gm-space-16)", textAlign: "center" }}>
              <MessageSquare size={36} style={{ color: "var(--gm-empty-icon-color)", margin: "0 auto var(--gm-card-header-gap)" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("conversations.empty")}</p>
            </div>
          ) : (
            <>
            {files.map((f) => {
              const meta = metaCache.get(f.path);
              const selected = selectedFile === f.path;
              return (
                <button
                  key={f.path}
                  ref={(el) => { if (el) itemRefs.current.set(f.path, el); else itemRefs.current.delete(f.path); }}
                  onClick={() => openFile(f.path)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    minHeight: isMobile ? 58 : undefined,
                    padding: isMobile
                      ? "var(--gm-card-pad-mobile) var(--gm-list-row-pad-x)"
                      : "var(--gm-list-row-pad-y) var(--gm-list-row-pad-x)",
                    cursor: "pointer",
                    background: selected ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                    border: "none", borderBottom: "1px solid var(--border)",
                    borderLeft: selected ? "3px solid var(--accent)" : "3px solid transparent",
                    color: "var(--text)", transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, marginBottom: "var(--gm-space-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meta?.title || f.name.replace(/\.md$/, "")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-control-gap)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                      {relativeTime(f.modified, t)}
                    </span>
                    {meta?.model && (
                      <span style={{
                        fontSize: "var(--gm-font-xs)", padding: "var(--gm-space-1) var(--gm-space-3)", borderRadius: "var(--gm-radius-sm)",
                        background: selected ? "color-mix(in srgb, var(--accent) 12%, var(--bg-card))" : "var(--bg-hover)",
                        color: "var(--accent)",
                      }}>
                        {meta.model}
                      </span>
                    )}
                    {meta?.messages && (
                      <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                        {meta.messages} {t("conversations.msgs")}
                      </span>
                    )}
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
      </div>
      )}

        right={showDetail && (
      <div style={{ flex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {!selectedFile ? (
          <div className="gm-empty-state" style={{ flex: 1 }}>
            <div style={{ textAlign: "center" }}>
              <MessageSquare size={48} style={{ color: "var(--gm-empty-icon-color)", margin: "0 auto var(--gm-section-gap)" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("conversations.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            <FileDetailToolbar
              title={currentMeta?.title || selectedFile}
              titleText={selectedFile}
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
              titleStyle={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, color: "var(--text)" }}
              metadata={(
                <>
                  {currentMeta?.model && (
                    <span style={{
                      fontSize: "var(--gm-font-xs)", padding: "var(--gm-space-1) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-sm)",
                      background: "var(--bg-hover)", color: "var(--accent)",
                    }}>
                      {currentMeta.model}
                    </span>
                  )}
                  {currentMeta?.messages && (
                    <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                      {currentMeta.messages} {t("conversations.msgs")}
                    </span>
                  )}
                  {selectedFile ? (
                    <FavoriteButton
                      relPath={selectedFile}
                      title={currentMeta?.title || selectedFile}
                      sourceType="conversation"
                    />
                  ) : null}
                </>
              )}
              editing={editing}
              onEdit={!isMobile ? startEdit : undefined}
              onSave={!isMobile ? () => void handleSaveEdit() : undefined}
              onCancel={!isMobile ? () => { setEditing(false); setEditContent(""); } : undefined}
              editTitle={t("conversations.edit")}
              saveTitle={t("conversations.save")}
              saveTone="accent"
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("conversations.deleteConversation"),
                  icon: <Trash2 size={14} />,
                  onClick: () => void handleDelete(),
                  tone: "danger",
                  hidden: isMobile || editing,
                },
              ]}
              more={selectedFile && !editing ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  canExportPdf={false}
                />
              ) : null}
            />

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: isMobile
                ? `var(--gm-detail-pad-mobile-y) var(--gm-detail-pad-mobile-x) ${MOBILE_BOTTOM_CONTENT_PADDING}`
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
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditing(false);
                      setEditContent("");
                    }
                  }}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    minHeight: "100%",
                    resize: "none",
                    padding: "var(--gm-section-gap)",
                    borderRadius: "var(--gm-radius-md)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "var(--gm-font-sm)",
                    lineHeight: "var(--gm-leading-relaxed)",
                    outline: "none",
                  }}
                />
              ) : messages.length > 0 ? (
                <>
                  {introContent ? (
                    <div style={{ marginBottom: "var(--gm-section-gap-lg)" }}>
                      <MarkdownView content={introContent} filePath={selectedFile ?? undefined} />
                    </div>
                  ) : null}
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: "var(--gm-section-gap-lg)",
                        padding: "var(--gm-space-7) var(--gm-section-gap)",
                        borderRadius: "var(--gm-radius-md)",
                        borderLeft: `3px solid ${msg.role === "user" ? "var(--accent)" : "var(--green)"}`,
                        background: msg.role === "user" ? "var(--bg-hover)" : "transparent",
                      }}
                    >
                      <div style={{
                        display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)",
                        marginBottom: "var(--gm-nav-item-gap)", fontSize: "var(--gm-font-xs)", fontWeight: 600,
                      }}>
                        <span style={{ color: msg.role === "user" ? "var(--accent)" : "var(--green)" }}>
                          {msg.role === "user" ? t("conversations.user") : t("conversations.assistant")}
                        </span>
                        {msg.timestamp && (
                          <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
                            {currentMeta?.date ? `${formatDateOnly(currentMeta.date)} ` : ""}{msg.timestamp}
                          </span>
                        )}
                      </div>
                      <MarkdownView content={msg.content} />
                    </div>
                  ))}
                </>
              ) : (
                <MarkdownView content={rawBody} />
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
