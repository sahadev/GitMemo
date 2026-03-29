import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { MessageSquare, Trash2, ChevronLeft } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { relativeTime } from "../utils/time";
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

function parseMessages(body: string): ChatMessage[] {
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

  return msgs;
}

export default function ConversationsPage({ sidebarFocused, onFocusSidebar }: { sidebarFocused?: boolean; onFocusSidebar?: () => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const panel = useResizablePanel("conversations", 300);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [metaCache, setMetaCache] = useState<Map<string, ConversationMeta>>(new Map());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawBody, setRawBody] = useState("");
  const [currentMeta, setCurrentMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  const openFile = async (path: string) => {
    try {
      const raw = await invoke<string>("read_file", { filePath: path });
      const { meta, body } = parseFrontmatter(raw);
      setSelectedFile(path);
      setCurrentMeta(meta);
      setRawBody(body);
      setMessages(parseMessages(body));
      // Scroll selected item into view
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) {
      console.error(e);
    }
  };

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
        setCurrentMeta(null);
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
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (selectedFile) {
          setSelectedFile(null); setMessages([]); setCurrentMeta(null);
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
  }, [navigatePrev, navigateNext, selectedFile, files, sidebarFocused]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr.replace(" ", "T"));
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left panel — conversation list */}
      <div style={{
        width: panel.width, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
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
            <p style={{ padding: 20, fontSize: 13, color: "var(--text-secondary)" }}>{t("conversations.loading")}</p>
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
                      {relativeTime(meta?.date || f.modified, t)}
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

      {/* Drag handle */}
      <div onMouseDown={panel.onMouseDown} style={panel.handleStyle}>
        <div style={panel.handleHoverStyle} />
      </div>

      {/* Right panel — chat viewer */}
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
                onClick={() => { setSelectedFile(null); setMessages([]); setCurrentMeta(null); }}
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
              <button
                onClick={handleDelete}
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
              {messages.length > 0 ? messages.map((msg, i) => (
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
                        {msg.timestamp}
                      </span>
                    )}
                  </div>
                  <MarkdownView content={msg.content} />
                </div>
              )) : (
                <MarkdownView content={rawBody} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
