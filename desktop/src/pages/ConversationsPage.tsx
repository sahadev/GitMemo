import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { MessageSquare, Trash2, ChevronLeft, Pencil, Save, X } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { formatDateOnly, relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
}

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

export default function ConversationsPage({ onFocusSidebar, enterTrigger, sidebarFocused }: { onFocusSidebar?: () => void; enterTrigger?: number; sidebarFocused?: boolean }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const panel = useResizablePanel("conversations", 300);
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

  useEffect(() => { loadFiles(); }, []);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const list = await invoke<FileEntry[]>("list_files", { folder: "conversations" });
      setFiles(list);
      // Enrich metadata
      const cache = new Map<string, ConversationMeta>();
      await Promise.all(
        list.map(async (f) => {
          try {
            const raw = await invoke<string>("read_file", { filePath: f.path });
            const { meta } = parseFrontmatter(raw);
            cache.set(f.path, meta);
          } catch { /* skip */ }
        })
      );
      setMetaCache(cache);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useFileWatcher(["conversations"], loadFiles);

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

  const openFile = useCallback(async (path: string) => {
    try {
      const raw = await invoke<string>("read_file", { filePath: path });
      applyConversationRaw(path, raw);
      setEditing(false);
      setEditContent("");
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) {
      console.error(e);
    }
  }, [applyConversationRaw]);

  const startEdit = useCallback(() => {
    if (!selectedFile) return;
    setEditing(true);
    setEditContent(rawContent);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }, [selectedFile, rawContent]);

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
    if (idx < files.length - 1) openFile(files[idx + 1].path);
  }, [selectedFile, files]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (sidebarFocused) return; // App handles up/down when sidebar focused
      if (e.key === "ArrowUp") { e.preventDefault(); navigatePrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navigateNext(); }
      if (!editing && selectedFile && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
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
  }, [navigatePrev, navigateNext, selectedFile, files, sidebarFocused, editing, startEdit, onFocusSidebar]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left panel — conversation list */}
      {showList && (
      <div style={{
        width: isMobile ? "100%" : panel.width, borderRight: isMobile ? "none" : "1px solid var(--border)", display: "flex", flexDirection: "column",
        flexShrink: 0, background: "var(--bg)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}>
          <MessageSquare size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{t("conversations.title")}</span>
          <span style={{
            fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-hover)",
            padding: "2px 8px", borderRadius: 10,
          }}>
            {selectedFile ? `${files.findIndex((f) => f.path === selectedFile) + 1} / ` : ""}{files.length}
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <Loading compact text={t("conversations.loading")} />
          ) : files.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <MessageSquare size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("conversations.empty")}</p>
            </div>
          ) : (
            files.map((f) => {
              const meta = metaCache.get(f.path);
              const selected = selectedFile === f.path;
              return (
                <button
                  key={f.path}
                  ref={(el) => { if (el) itemRefs.current.set(f.path, el); else itemRefs.current.delete(f.path); }}
                  onClick={() => openFile(f.path)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 16px", cursor: "pointer",
                    background: selected ? "var(--accent)" : "transparent",
                    border: "none", borderBottom: "1px solid var(--border)",
                    color: selected ? "#fff" : "var(--text)", transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meta?.title || f.name.replace(/\.md$/, "")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                      {relativeTime(f.modified, t)}
                    </span>
                    {meta?.model && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 3,
                        background: selected ? "rgba(255,255,255,0.2)" : "var(--bg-hover)",
                        color: selected ? "#fff" : "var(--accent)",
                      }}>
                        {meta.model}
                      </span>
                    )}
                    {meta?.messages && (
                      <span style={{ fontSize: 10, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                        {meta.messages} {t("conversations.msgs")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* Drag handle — desktop only */}
      {!isMobile && (
      <div onMouseDown={panel.onMouseDown} style={panel.handleStyle}>
        <div style={panel.handleHoverStyle} />
      </div>
      )}

      {/* Right panel — chat viewer */}
      {showDetail && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <MessageSquare size={48} style={{ color: "var(--border)", margin: "0 auto 16px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("conversations.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0,
            }}>
              <button
                onClick={() => { setSelectedFile(null); setMessages([]); setCurrentMeta(null); setRawBody(""); setRawContent(""); setEditing(false); }}
                style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <ChevronLeft size={16} />
              </button>
              <span
                onClick={() => {
                  const text = currentMeta?.title || selectedFile || "";
                  navigator.clipboard.writeText(text);
                  showToast(t("conversations.copied"));
                }}
                style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                title={t("conversations.clickToCopy")}
              >
                {currentMeta?.title || selectedFile}
              </span>
              {currentMeta?.model && (
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4,
                  background: "var(--bg-hover)", color: "var(--accent)",
                }}>
                  {currentMeta.model}
                </span>
              )}
              {currentMeta?.messages && (
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {currentMeta.messages} {t("conversations.msgs")}
                </span>
              )}
              {selectedFile && !editing ? <CopyPathButton relPath={selectedFile} /> : null}
              {editing ? (
                <>
                  <button
                    onClick={() => { setEditing(false); setEditContent(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                      borderRadius: 6, fontSize: 12, cursor: "pointer",
                      background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                    }}
                    title={t("common.cancel")}
                  >
                    <X size={12} />
                  </button>
                  <button
                    onClick={() => void handleSaveEdit()}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                      borderRadius: 6, fontSize: 12, cursor: "pointer",
                      background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)",
                    }}
                    title={t("conversations.save")}
                  >
                    <Save size={12} />
                    {t("conversations.save")}
                  </button>
                </>
              ) : (
                <button
                  onClick={startEdit}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                    borderRadius: 6, fontSize: 12, cursor: "pointer",
                    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                  }}
                  title={t("conversations.edit")}
                >
                  <Pencil size={12} />
                  {t("conversations.edit")}
                </button>
              )}
              <button
                onClick={() => void handleDelete()}
                style={{
                  padding: 6, borderRadius: 4, background: "none", border: "none",
                  cursor: "pointer", color: "var(--text-secondary)",
                }}
                title={t("conversations.deleteConversation")}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", userSelect: "text" }}>
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
                    padding: 16,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 13,
                    lineHeight: 1.6,
                    outline: "none",
                  }}
                />
              ) : messages.length > 0 ? (
                <>
                  {introContent ? (
                    <div style={{ marginBottom: 20 }}>
                      <MarkdownView content={introContent} filePath={selectedFile ?? undefined} />
                    </div>
                  ) : null}
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: 20,
                        padding: "14px 16px",
                        borderRadius: 8,
                        borderLeft: `3px solid ${msg.role === "user" ? "var(--accent)" : "var(--green)"}`,
                        background: msg.role === "user" ? "var(--bg-hover)" : "transparent",
                      }}
                    >
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        marginBottom: 10, fontSize: 11, fontWeight: 600,
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
    </div>
  );
}
