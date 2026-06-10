import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Download, Trash2, RefreshCw, Eye } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import {
  getFileName,
  getFileWorkspacePaneState,
  hasFilePreviewImage,
  isPendingPathForFolder,
} from "../components/domain/files/fileWorkspaceLogic";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { DetailPane, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";
import { useFileDetailState } from "../hooks/useFileDetailState";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { type FileEntry, type FilePage } from "../types/files";
import { type NoteResult } from "../types/notes";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useListKeyboardNavigation } from "../hooks/useListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { LocalImagePreview } from "../components/domain/files/LocalImagePreview";

export default function ImportsPage({
  onFocusSidebar: _onFocusSidebar,
  enterTrigger: _enterTrigger,
  active,
  registerMobileBackHandler,
}: {
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  active?: boolean;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
} = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const detailOpenedFromCrossPageRef = useRef(false);
  const {
    selectedFile,
    fileContent,
    setFileContent,
    openFile,
    clearDetail,
  } = useFileDetailState({
    onOpened: ({ path, content, fromCrossPage }) => {
      resetEditor(content);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    },
    onClosed: () => {
      resetEditor();
      detailOpenedFromCrossPageRef.current = false;
    },
  });
  const {
    editing,
    editContent,
    splitPreview,
    setEditContent,
    startEdit,
    cancelEdit,
    resetEditor,
    toggleSplitPreview,
  } = useFileEditorState({
    sourceContent: fileContent,
    mobile: isMobile,
  });
  const [saving, setSaving] = useState(false);
  const watchedFolders = useMemo(() => ["imports"], []);

  const loadImportsPage = useCallback((offset: number, limit: number) => {
    return invoke<FilePage>("list_files_page", { folder: "imports", offset, limit });
  }, []);
  const {
    files,
    loading,
    loadingMore,
    hasMore,
    loadFiles,
    loadMore,
    sentinelRef,
    registerItemRef,
    scrollItemIntoView,
  } = usePagedFileList<FileEntry>({
    loadPage: loadImportsPage,
    preventConcurrentLoads: true,
  });

  const { navPrev, navNext } = useFileListNavigation({
    files,
    selectedPath: selectedFile,
    openFile,
    hasMore,
    loadingMore,
    loadMore,
  });

  useEffect(() => {
    if (active !== false) void loadFiles();
  }, [active, loadFiles]);

  useEffect(() => {
    if (!isPendingPathForFolder(pendingOpenPath, "imports/")) return;
    void loadFiles().then(() => openFile(pendingOpenPath, true));
    consumePendingOpenPath();
  }, [pendingOpenPath, consumePendingOpenPath, loadFiles, openFile]);

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [selectedFile, loadFiles, openFile]);

  useFileWatcher(watchedFolders, loadFiles, { active: active !== false });

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("imports.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      clearDetail();
      showToast(t("imports.deleted"));
      void loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  }, [selectedFile, t, clearDetail, showToast, loadFiles]);

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await invoke<NoteResult>("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      showToast(t("externalFiles.saved"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [selectedFile, editContent, showToast, t]);

  const closeDetail = useCallback(() => {
    clearDetail();
  }, [clearDetail]);

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    openedFromCrossPageRef: detailOpenedFromCrossPageRef,
  });

  useListKeyboardNavigation({
    active,
    navPrev,
    navNext,
  });

  const { showList, showDetail } = getFileWorkspacePaneState(isMobile, selectedFile);

  return (
    <FileWorkspace
        panelKey="imports"
        left={showList && (
          <ListPane>
            <PaneHeader
              icon={Download}
              title={t("imports.title")}
              actions={(
                <Button
                  variant="toolbar"
                  onClick={handleRefresh}
                  title={t("common.refresh")}
                  icon={RefreshCw}
                />
              )}
            />

            <ListPaneBody>
              {loading ? (
                <Loading compact text={t("common.loading")} />
              ) : files.length === 0 ? (
                <EmptyState icon={Download} title={t("imports.empty")} />
              ) : (
                <>
                {files.map((file) => {
                  const selected = selectedFile === file.path;
                  const hasImage = hasFilePreviewImage(file);
                  return (
                    <FileListItem
                      key={file.path}
                      ref={(el) => registerItemRef(file.path, el)}
                      onClick={() => openFile(file.path)}
                      active={selected}
                      icon={hasImage ? (
                        <LocalImagePreview
                          relPath={file.preview_image!}
                          className="gm-import-thumb"
                          placeholderClassName="gm-import-thumb-placeholder"
                        />
                      ) : undefined}
                      title={file.name}
                      subtitle={relativeTime(file.modified, t)}
                      preview={!hasImage ? file.preview : undefined}
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
            {selectedFile ? (
              <>
                <FileDetailToolbar
                  title={selectedFile}
                  titleText={selectedFile}
                  active={active}
                  onBack={closeDetail}
                  onRefresh={handleRefresh}
                  editing={editing}
                  onEdit={startEdit}
                  onSave={() => void handleSave()}
                  onCancel={cancelEdit}
                  editTitle={t("common.edit")}
                  saveTitle={t("common.save")}
                  cancelTitle={t("common.preview")}
                  cancelIcon={<AppIcon icon={Eye} size="xs" />}
                  splitPreview={splitPreview}
                  onToggleSplitPreview={toggleSplitPreview}
                  saveDisabled={saving}
                  saveTone="accent"
                  metadata={selectedFile ? (
                    <FavoriteButton
                      relPath={selectedFile}
                      active={active}
                      title={getFileName(selectedFile)}
                      sourceType="import"
                    />
                  ) : null}
                  actionsAfterEdit={[
                    {
                      key: "delete",
                      title: t("common.delete"),
                      icon: <AppIcon icon={Trash2} size="xs" />,
                      onClick: () => void handleDelete(),
                      tone: "danger",
                      hidden: editing,
                    },
                  ]}
                  more={!editing ? (
                    <FileMoreActionsMenu
                      relPath={selectedFile}
                      active={active}
                      exportContent={fileContent}
                      exportTitle={getFileName(selectedFile)}
                    />
                  ) : null}
                />
                <FileEditorSurface
                  editing={editing}
                  value={editContent}
                  onChange={setEditContent}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  filePath={selectedFile}
                  mobile={isMobile}
                  minHeight
                  splitPreview={splitPreview}
                  supportsSplitPreview
                >
                    <MarkdownView content={fileContent} filePath={selectedFile} />
                </FileEditorSurface>
              </>
            ) : (
              <EmptyState icon={Download} title={t("imports.selectOrDrop")} full />
            )}
          </DetailPane>
        )}
      showList={showList}
      showDetail={showDetail}
    />
  );
}
