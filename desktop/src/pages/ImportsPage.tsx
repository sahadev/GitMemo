import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Download, ChevronLeft, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";

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

function ImportImagePreview({ relPath }: { relPath: string }) {
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
  if (!src) return <div style={{ width: 48, height: 36, flexShrink: 0, borderRadius: 4, background: "var(--bg-hover)" }} />;
  return <img src={src} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0, border: "1px solid var(--border)" }} />;
}

export default function ImportsPage({ onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger, active }: { onFocusSidebar?: () => void; enterTrigger?: number; active?: boolean } = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const navPrev = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx > 0) openFile(files[idx - 1].path);
  }, [selectedFile, files]);

  const navNext = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx < files.length - 1) openFile(files[idx + 1].path);
  }, [selectedFile, files]);

  useEffect(() => { loadFiles(); }, []);

  useEffect(() => {
    if (active) loadFiles();
  }, [active]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("imports/")) return;
    void openFile(pendingOpenPath);
    consumePendingOpenPath();
  }, [pendingOpenPath, consumePendingOpenPath]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const result = await invoke<FileEntry[]>("list_files", { folder: "imports" });
      setFiles(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [selectedFile]);

  useFileWatcher(["imports"], loadFiles);

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setTimeout(() => {
        itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("imports.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      setSelectedFile(null);
      setFileContent("");
      showToast(t("imports.deleted"));
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (selectedFile && (e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navPrev, navNext, selectedFile, handleDelete]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

  return (
    <div style={{ display: "flex", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="imports"
        defaultWidth={300}
        left={showList && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{
              display: "flex", alignItems: "center", padding: "14px 16px",
              borderBottom: "1px solid var(--border)", gap: 8,
            }}>
              <Download size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{t("imports.title")}</span>
              <button
                type="button"
                onClick={handleRefresh}
                title={t("common.refresh")}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 4,
                  color: "var(--text-secondary)", display: "flex", alignItems: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <Loading compact text={t("common.loading")} />
              ) : files.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
                  <Download size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {t("imports.empty")}
                  </p>
                </div>
              ) : (
                files.map((file) => {
                  const selected = selectedFile === file.path;
                  const hasImage = !!file.preview_image;
                  return (
                    <button
                      key={file.path}
                      ref={(el) => { if (el) itemRefs.current.set(file.path, el); else itemRefs.current.delete(file.path); }}
                      onClick={() => openFile(file.path)}
                      style={{
                        width: "100%", textAlign: "left", padding: "12px 16px",
                        cursor: "pointer", transition: "background 0.15s",
                        background: selected ? "var(--accent)" : "transparent",
                        border: "none", color: selected ? "#fff" : "var(--text)",
                        borderBottom: "1px solid var(--border)",
                        display: "flex", alignItems: "center", gap: 10,
                      }}
                    >
                      {hasImage && <ImportImagePreview relPath={file.preview_image!} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                        </p>
                        {!hasImage && file.preview && (
                          <p style={{ fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                            {file.preview}
                          </p>
                        )}
                        <p style={{ fontSize: 10, marginTop: 4, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                          {relativeTime(file.modified, t)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        right={showDetail && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {selectedFile ? (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 20px", borderBottom: "1px solid var(--border)",
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
                  <CopyPathButton relPath={selectedFile} />
                  <button onClick={handleDelete} style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--red)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
                  <MarkdownView content={fileContent} filePath={selectedFile} />
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <Download size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                    {t("imports.selectOrDrop")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
