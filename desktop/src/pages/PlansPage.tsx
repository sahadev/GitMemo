import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Lightbulb, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
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
import { shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";

export default function PlansPage({
  active = true,
  onFocusSidebar: _onFocusSidebar,
  enterTrigger: _enterTrigger,
  renderListHeader,
  registerMobileBackHandler,
}: {
  active?: boolean;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  renderListHeader?: (actions: ReactNode) => ReactNode;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
} = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
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
  const pendingKeyboardNextIndexRef = useRef<number | null>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
  const syncedOnEnterRef = useRef(false);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  const loadFiles = useCallback(async (reset = true) => {
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncAndLoad = async () => {
      if (!syncedOnEnterRef.current) {
        syncedOnEnterRef.current = true;
        setLoading(true);
        try {
          await invoke("sync_external_plans");
        } catch (e) {
          console.error(e);
          if (!cancelled) showToast(`Error: ${e}`, true);
        }
      }
      if (!cancelled) await loadFiles();
    };
    void syncAndLoad();
    return () => { cancelled = true; };
  }, [loadFiles, showToast]);

  const watchedFolders = useMemo(() => ["plans"], []);
  const handleWatchedFilesChanged = useCallback(() => { void loadFiles(); }, [loadFiles]);
  useFileWatcher(watchedFolders, handleWatchedFilesChanged);
  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore: () => loadFiles(false),
  });

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  }, [isMobile]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("plans/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const navPrev = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx > 0) void openFile(files[idx - 1].path);
  }, [selectedFile, files, openFile]);

  const navNext = useCallback(() => {
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

  const handleDelete = useCallback(async () => {
    if (isMobile) return;
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
  }, [isMobile, selectedFile, files, t, showToast, openFile, loadFiles]);

  useEffect(() => {
    if (!active || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (shortcutMatches(e, shortcuts.delete_selected)) {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, isMobile, navPrev, navNext, handleDelete, shortcuts.delete_selected]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
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
        padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap",
      }}>
        {hasMore ? `${files.length} / ${totalFiles}` : files.length}
      </span>
    </>
  );

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="plans"
        defaultWidth={300}
        left={showList && (
      <div style={{
        display: "flex", flexDirection: "column", flexShrink: 0,
        width: "100%", flex: 1, minWidth: 0,
        height: "100%", minHeight: 0, overflow: "hidden",
      }}>
        {renderListHeader ? renderListHeader(listHeaderActions) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px 14px" : "16px 16px 12px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}>
            <Lightbulb size={18} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{t("nav.plans")}</span>
            {listHeaderActions}
          </div>
        )}

        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingBottom: isMobile ? MOBILE_BOTTOM_CONTENT_PADDING : 0,
        }}>
          {loading ? (
            <Loading compact text={t("common.loading")} />
          ) : files.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <Lightbulb size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("plans.empty")}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                {t("plans.emptyDesc")}
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
                    minHeight: isMobile ? 56 : undefined,
                    padding: isMobile ? "14px 16px" : "12px 16px", cursor: "pointer",
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
      <div style={{ flex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Lightbulb size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("plans.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            <FileDetailToolbar
              title={isMobile ? selectedFile.split("/").pop()?.replace(/\.md$/, "") : selectedFile}
              titleText={selectedFile}
              onBack={closeDetail}
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("plans.delete"),
                  icon: <Trash2 size={14} />,
                  onClick: () => void handleDelete(),
                  tone: "danger",
                  hidden: isMobile,
                },
              ]}
              more={selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  exportContent={fileContent}
                  exportTitle={selectedFile.split("/").pop()}
                />
              ) : null}
            />
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: isMobile ? `16px 16px ${MOBILE_BOTTOM_CONTENT_PADDING}` : "20px 28px",
              userSelect: "text",
            }}>
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
