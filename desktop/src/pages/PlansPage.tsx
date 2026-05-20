import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Lightbulb, ChevronLeft, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { RevealInFinderButton } from "../components/RevealInFinderButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";
import { FILE_PAGE_SIZE, type FileEntry, type FilePage } from "../types/files";
import { useAutoLoadMore } from "../hooks/useAutoLoadMore";

export default function PlansPage({ onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { onFocusSidebar?: () => void; enterTrigger?: number } = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath } = useAppStore();
  const isMobile = usePlatform() === "mobile";
  useRelativeTimeTick();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const filesLengthRef = useRef(0);

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  const loadFiles = async (reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await invoke<FilePage>("list_files_page", {
        folder: "plans",
        offset: reset ? 0 : filesLengthRef.current,
        limit: FILE_PAGE_SIZE,
      });
      setFiles((prev) => reset ? page.entries : [...prev, ...page.entries]);
      setHasMore(page.has_more);
      setTotalFiles(page.total);
    } catch (e) { console.error(e); }
    finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };
  useFileWatcher(["plans"], loadFiles);
  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore: () => loadFiles(false),
  });

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("plans/")) return;
    void openFile(pendingOpenPath);
    consumePendingOpenPath();
  }, [pendingOpenPath, consumePendingOpenPath]);

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
      void loadFiles();
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
    <div style={{ display: "flex", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="plans"
        defaultWidth={300}
        left={showList && (
      <div style={{
        display: "flex", flexDirection: "column", flexShrink: 0,
        height: "100%", minHeight: 0, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}>
          <Lightbulb size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{t("nav.plans")}</span>
          <button
            onClick={() => loadFiles()}
            title={t("common.refresh")}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4,
              color: "var(--text-secondary)", display: "flex", alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <RefreshCw size={14} />
          </button>
          <span style={{
            fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-hover)",
            padding: "2px 8px", borderRadius: 10,
          }}>
            {hasMore ? `${files.length} / ${totalFiles}` : files.length}
          </span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
            <>
            {files.map((f) => {
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
            })}
            {hasMore && (
              <div ref={sentinelRef}>
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                style={{
                  width: "100%", padding: "12px 16px", border: "none",
                  borderBottom: "1px solid var(--border)", background: "transparent",
                  color: "var(--accent)", cursor: loadingMore ? "default" : "pointer",
                  fontSize: 12, fontWeight: 600,
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
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
              <RevealInFinderButton relPath={selectedFile} />
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
      />
    </div>
  );
}
