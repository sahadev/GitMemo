import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Clipboard, Play, Square, Save, Copy, Check, ChevronLeft, Trash2 } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { Loading } from "../components/Loading";
import { CopyPathButton } from "../components/CopyPathButton";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { ClipboardPrivacyDialog, useClipboardPrivacy } from "../components/ClipboardPrivacyDialog";

interface ClipboardStatus {
  watching: boolean;
  clips_count: number;
  clips_dir: string;
}

interface ClipboardEvent {
  saved: boolean;
  path: string;
  preview: string;
  timestamp: string;
}

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
  preview_image?: string | null;
}

interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

function ClipImageThumb({ relPath, selected, wide }: { relPath: string; selected: boolean; wide?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
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
      <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 4, background: "var(--bg-hover)" }} />
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{
        width: w,
        height: h,
        objectFit: "cover",
        borderRadius: 4,
        flexShrink: 0,
        border: `1px solid ${selected ? "rgba(255,255,255,0.35)" : "var(--border)"}`,
      }}
    />
  );
}

export default function ClipboardPage({ onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { onFocusSidebar?: () => void; enterTrigger?: number } = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  useRelativeTimeTick();
  const panel = useResizablePanel("clipboard", 340);
  const [status, setStatus] = useState<ClipboardStatus | null>(null);
  const [savedClips, setSavedClips] = useState<FileEntry[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const privacy = useClipboardPrivacy();

  // State-driven data loading
  useEffect(() => {
    loadStatus();
    loadSavedClips();
  }, [refreshTrigger]);
  useFileWatcher(["clips"], () => setRefreshTrigger(t => t + 1));

  // Event sources that trigger refresh via state
  useEffect(() => {
    const unlisten = listen<ClipboardEvent>("clipboard-saved", () => {
      setRefreshTrigger(t => t + 1);
    });
    const onFocus = () => setRefreshTrigger(t => t + 1);
    window.addEventListener("focus", onFocus);
    return () => { unlisten.then((fn) => fn()); window.removeEventListener("focus", onFocus); };
  }, []);

  const loadStatus = async () => {
    try { setStatus(await invoke<ClipboardStatus>("get_clipboard_status")); }
    catch (e) { console.error(e); }
  };

  const loadSavedClips = async () => {
    try { setSavedClips(await invoke<FileEntry[]>("list_files", { folder: "clips" })); }
    catch (e) { console.error(e); }
    finally { setClipsLoading(false); }
  };

  const doStartWatch = async () => {
    try {
      await invoke<string>("start_clipboard_watch");
      loadStatus();
      window.dispatchEvent(new Event("clipboard-status-changed"));
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const toggleWatch = async () => {
    try {
      if (status?.watching) {
        await invoke<string>("stop_clipboard_watch");
        loadStatus();
        window.dispatchEvent(new Event("clipboard-status-changed"));
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
      loadStatus();
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
      setSelectedFile(path);
      setFileContent(body);
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  };

  const navPrev = useCallback(() => {
    if (!selectedFile || savedClips.length === 0) return;
    const idx = savedClips.findIndex((f) => f.path === selectedFile);
    if (idx > 0) openFile(savedClips[idx - 1].path);
  }, [selectedFile, savedClips]);

  const navNext = useCallback(() => {
    if (!selectedFile || savedClips.length === 0) return;
    const idx = savedClips.findIndex((f) => f.path === selectedFile);
    if (idx < savedClips.length - 1) openFile(savedClips[idx + 1].path);
  }, [selectedFile, savedClips]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navPrev, navNext]);

  const copyContent = async (content: string) => {
    try {
      const wasWatching = status?.watching;
      if (wasWatching) await invoke<string>("stop_clipboard_watch");
      await writeText(content);
      if (wasWatching) {
        await new Promise((r) => setTimeout(r, 200));
        await invoke<string>("start_clipboard_watch");
      }
      setCopiedId("detail");
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      showToast(`Copy failed: ${e}`);
    }
  };

  const confirmDeleteClip = async (path: string) => {
    const ok = await ask(t("clipboard.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!ok) return;
    try {
      await invoke<NoteResult>("delete_clip", { filePath: path });
      showToast(t("clipboard.clipDeleted"));
      if (selectedFile === path) {
        setSelectedFile(null);
        setFileContent("");
      }
      loadSavedClips();
      loadStatus();
    } catch (e) {
      showToast(String(e));
    }
  };

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

  return (
    <div style={{ display: "flex", height: "100%" }}>
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

      {/* Left Panel — clip list */}
      {showList && (
      <div style={{
        width: isMobile ? "100%" : panel.width, borderRight: isMobile ? "none" : "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clipboard size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t("clipboard.title")}</span>
            {status && (
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 500,
                background: status.watching ? "var(--bg-success)" : "var(--bg-hover)",
                color: status.watching ? "var(--green)" : "var(--text-secondary)",
              }}>
                {status.watching ? t("clipboard.watching") : t("clipboard.stopped")}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={saveNow} title={t("clipboard.saveCurrentClipboard")} style={{
              display: "flex", alignItems: "center", padding: 6,
              borderRadius: 4, cursor: "pointer",
              background: "none", border: "none", color: "var(--text-secondary)",
            }}>
              <Save size={14} />
            </button>
            <button onClick={toggleWatch} title={status?.watching ? t("common.stop") : t("common.start")} style={{
              display: "flex", alignItems: "center", padding: 6,
              borderRadius: 4, cursor: "pointer",
              background: "none", border: "none",
              color: status?.watching ? "var(--red)" : "var(--green)",
            }}>
              {status?.watching ? <Square size={14} /> : <Play size={14} />}
            </button>
          </div>
        </div>

        {/* Clip list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {clipsLoading ? (
            <Loading compact text={t("clipboard.loading")} />
          ) : savedClips.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
              <Clipboard size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("clipboard.noClips")}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{t("clipboard.autoCapture")}</p>
            </div>
          ) : (
            savedClips.map((file) => {
              const selected = selectedFile === file.path;
              return (
                <div
                  key={file.path}
                  style={{
                    display: "flex", alignItems: "stretch",
                    borderBottom: "1px solid var(--border)",
                    background: selected ? "var(--accent)" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <button
                    ref={(el) => { if (el) itemRefs.current.set(file.path, el); else itemRefs.current.delete(file.path); }}
                    type="button"
                    onClick={() => openFile(file.path)}
                    style={{
                      flex: 1, minWidth: 0, textAlign: "left",
                      padding: "12px 16px", cursor: "pointer",
                      border: "none",
                      background: "transparent",
                      color: selected ? "#fff" : "var(--text)",
                    }}
                  >
                    {file.preview_image ? (
                      <div style={{ minWidth: 0 }}>
                        <ClipImageThumb relPath={file.preview_image} selected={selected} wide />
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                            {relativeTime(file.modified, t)}
                          </span>
                          <span style={{ fontSize: 10, color: selected ? "rgba(255,255,255,0.5)" : "var(--text-secondary)", opacity: 0.7 }}>
                            {file.name}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 13, marginBottom: 6, whiteSpace: "pre-wrap",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          overflow: "hidden", lineHeight: 1.4, wordBreak: "break-all",
                        }}>
                          {file.preview || file.name}
                        </p>
                        <span style={{ fontSize: 11, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                          {relativeTime(file.modified, t)}
                        </span>
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    title={t("clipboard.deleteClip")}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void confirmDeleteClip(file.path);
                    }}
                    style={{
                      flexShrink: 0, padding: "12px 14px", cursor: "pointer",
                      border: "none", background: "transparent",
                      color: selected ? "rgba(255,255,255,0.85)" : "var(--text-secondary)",
                      alignSelf: "stretch",
                      display: "flex", alignItems: "center",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom stats */}
        <div style={{
          padding: "10px 16px", borderTop: "1px solid var(--border)",
          fontSize: 11, color: "var(--text-secondary)", textAlign: "center",
        }}>
          {t("clipboard.clipsTotal", String(status?.clips_count ?? 0))}
        </div>
      </div>
      )}

      {/* Drag handle */}
      {!isMobile && (
      <div onMouseDown={panel.onMouseDown} style={panel.handleStyle}>
        <div style={panel.handleHoverStyle} />
      </div>
      )}

      {/* Right Panel — full content */}
      {showDetail && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Clipboard size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("clipboard.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0,
            }}>
              <button
                onClick={() => { setSelectedFile(null); setFileContent(""); }}
                style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedFile}
              </span>
              {selectedFile ? <CopyPathButton relPath={selectedFile} /> : null}
              <button
                type="button"
                title={t("clipboard.deleteClip")}
                onClick={() => { if (selectedFile) void confirmDeleteClip(selectedFile); }}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                  borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: "var(--bg)", border: "1px solid var(--border)",
                  color: "var(--red)",
                }}
              >
                <Trash2 size={12} />
              </button>
              <button
                type="button"
                onClick={() => copyContent(fileContent)}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "5px 12px",
                  borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: copiedId === "detail" ? "var(--bg-success)" : "var(--bg)",
                  border: "1px solid var(--border)",
                  color: copiedId === "detail" ? "var(--green)" : "var(--text-secondary)",
                }}
              >
                {copiedId === "detail" ? <><Check size={12} /> {t("clipboard.copied")}</> : <><Copy size={12} /> {t("clipboard.copy")}</>}
              </button>
            </div>

            {/* Full content */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "20px 24px",
              userSelect: "text",
            }}>
              <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
