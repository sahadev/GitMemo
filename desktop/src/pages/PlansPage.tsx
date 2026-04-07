import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Lightbulb, ChevronLeft, Trash2 } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
}

export default function PlansPage({ onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { onFocusSidebar?: () => void; enterTrigger?: number } = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  useRelativeTimeTick();
  const panel = useResizablePanel("plans", 300);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => { loadFiles(); }, []);

  const loadFiles = async () => {
    setLoading(true);
    try {
      setFiles(await invoke<FileEntry[]>("list_files", { folder: "plans" }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useFileWatcher(["plans"], loadFiles);

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  };

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

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("plans.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      const current = selectedFile;
      const deleteSource = await ask(t("plans.deleteSourceConfirm"), {
        title: t("plans.deleteSource"),
        kind: "warning",
      });
      await invoke("delete_plan", { filePath: current, deleteSource });
      const remaining = files.filter((f) => f.path !== current);
      setFiles(remaining);
      setSelectedFile(null);
      setFileContent("");
      showToast(t("plans.deleted"));
      if (remaining.length > 0) {
        const next = remaining[0];
        void openFile(next.path);
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFile, files, t, showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navPrev, navNext, handleDelete]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left Panel */}
      {showList && (
      <div style={{
        width: isMobile ? "100%" : panel.width, borderRight: isMobile ? "none" : "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}>
          <Lightbulb size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{t("nav.plans")}</span>
          <span style={{
            fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-hover)",
            padding: "2px 8px", borderRadius: 10,
          }}>
            {files.length}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <Loading compact text="Loading..." />
          ) : files.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <Lightbulb size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>No plans yet</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                Plans from Claude Code will appear here after sync
              </p>
            </div>
          ) : (
            files.map((f) => {
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
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name.replace(/\.md$/, "")}
                  </p>
                  <p style={{ fontSize: 11, marginTop: 4, color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}>
                    {relativeTime(f.modified, t)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* Drag handle */}
      {!isMobile && (
      <div onMouseDown={panel.onMouseDown} style={panel.handleStyle}>
        <div style={panel.handleHoverStyle} />
      </div>
      )}

      {/* Right Panel */}
      {showDetail && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Lightbulb size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Select a plan to view</p>
            </div>
          </div>
        ) : (
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
              {selectedFile ? <CopyPathButton relPath={selectedFile} /> : null}
              <button
                onClick={() => void handleDelete()}
                style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--red)" }}
                title={t("plans.delete")}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", userSelect: "text" }}>
              <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
