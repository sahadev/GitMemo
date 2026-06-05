import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Lightbulb, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";
import { type FileEntry, type FilePage } from "../types/files";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";

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
  const { pendingOpenPath, consumePendingOpenPath } = useAppStore();
  const isMobile = usePlatform() === "mobile";
  useRelativeTimeTick();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const detailOpenedFromCrossPageRef = useRef(false);
  const syncedOnEnterRef = useRef(false);

  const loadPlansPage = useCallback((offset: number, limit: number) => {
    return invoke<FilePage>("list_files_page", { folder: "plans", offset, limit });
  }, []);
  const {
    files,
    setFiles,
    loading,
    setLoading,
    loadingMore,
    hasMore,
    totalFiles,
    loadFiles,
    loadMore,
    sentinelRef,
    registerItemRef,
    scrollItemIntoView,
  } = usePagedFileList<FileEntry>({ loadPage: loadPlansPage });

  useEffect(() => {
    if (!active) return;
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
  }, [active, loadFiles, setLoading, showToast]);

  const watchedFolders = useMemo(() => ["plans"], []);
  const handleWatchedFilesChanged = useCallback(() => {
    if (active) void loadFiles();
  }, [active, loadFiles]);
  useFileWatcher(watchedFolders, handleWatchedFilesChanged);
  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    } catch (e) { console.error(e); }
  }, [isMobile, scrollItemIntoView]);

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("plans/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const { navPrev, navNext } = useFileListNavigation({
    files,
    selectedPath: selectedFile,
    openFile,
    hasMore,
    loadingMore,
    loadMore,
  });

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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    isMobile,
    navPrev,
    navNext,
  ]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
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
        {hasMore ? `${files.length} / ${totalFiles}` : files.length}
      </Badge>
    </>
  );

  return (
    <FileWorkspace
        panelKey="plans"
        left={showList && (
      <ListPane>
        {renderListHeader ? renderListHeader(listHeaderActions) : (
          <PaneHeader icon={Lightbulb} title={t("nav.plans")} actions={listHeaderActions} />
        )}

        <ListPaneBody mobileBottomPadding={isMobile}>
          {loading ? (
            <Loading compact text={t("common.loading")} />
          ) : files.length === 0 ? (
            <EmptyState icon={Lightbulb} title={t("plans.empty")} description={t("plans.emptyDesc")} />
          ) : (
            <>
            {files.map((f) => {
              const selected = selectedFile === f.path;
              return (
                <FileListItem
                  key={f.path}
                  ref={(el) => registerItemRef(f.path, el)}
                  onClick={() => openFile(f.path)}
                  active={selected}
                  mobile={isMobile}
                  title={f.name.replace(/\.md$/, "")}
                  subtitle={relativeTime(f.modified, t)}
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
          <EmptyState icon={Lightbulb} iconSize="empty-lg" title={t("plans.selectToView")} full />
        ) : (
          <>
            <FileDetailToolbar
              title={isMobile ? selectedFile.split("/").pop()?.replace(/\.md$/, "") : selectedFile}
              titleText={selectedFile}
              active={active}
              onBack={closeDetail}
              onRefresh={() => {
                void loadFiles();
                if (selectedFile) void openFile(selectedFile);
              }}
              metadata={selectedFile ? (
                <FavoriteButton
                  relPath={selectedFile}
                  active={active}
                  title={selectedFile.split("/").pop()?.replace(/\.md$/, "") ?? selectedFile}
                  sourceType="plan"
                />
              ) : null}
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("plans.delete"),
                  icon: <AppIcon icon={Trash2} size="xs" />,
                  onClick: () => void handleDelete(),
                  tone: "danger",
                  hidden: isMobile,
                },
              ]}
              more={selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  active={active}
                  exportContent={fileContent}
                  exportTitle={selectedFile.split("/").pop()}
                />
              ) : null}
            />
            <DetailScroll mobileBottomPadding={isMobile} selectable>
              <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
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
