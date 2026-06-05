import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Download, Trash2, RefreshCw, Eye } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { MarkdownSplitEditor } from "../components/MarkdownSplitEditor";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { CodeTextarea } from "../components/base/CodeTextarea";
import { EmptyState } from "../components/base/EmptyState";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";
import { type FileEntry, type FilePage } from "../types/files";
import { type NoteResult } from "../types/notes";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
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
  const { pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [splitPreview, setSplitPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [favoriteToggleSignal, setFavoriteToggleSignal] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const detailOpenedFromCrossPageRef = useRef(false);
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

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setEditContent(content);
      setEditing(false);
      setSplitPreview(false);
      setMoreMenuOpen(false);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    } catch (e) { console.error(e); }
  }, [isMobile, scrollItemIntoView]);

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
    if (!pendingOpenPath?.startsWith("imports/")) return;
    void loadFiles().then(() => openFile(pendingOpenPath, true));
    consumePendingOpenPath();
  }, [pendingOpenPath, consumePendingOpenPath, loadFiles, openFile]);

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [selectedFile, loadFiles, openFile]);

  useFileWatcher(watchedFolders, loadFiles);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("imports.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      setSelectedFile(null);
      setFileContent("");
      setEditContent("");
      setEditing(false);
      setSplitPreview(false);
      setMoreMenuOpen(false);
      showToast(t("imports.deleted"));
      void loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  }, [selectedFile, t, showToast, loadFiles]);

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
    setSelectedFile(null);
    setFileContent("");
    setEditContent("");
    setEditing(false);
    setSplitPreview(false);
    setMoreMenuOpen(false);
    detailOpenedFromCrossPageRef.current = false;
  }, []);

  const startEdit = useCallback(() => {
    setEditContent(fileContent);
    setEditing(true);
    setSplitPreview(false);
    setMoreMenuOpen(false);
  }, [fileContent]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setSplitPreview(false);
  }, []);

  const toggleSplitPreview = useCallback(() => {
    if (isMobile || !selectedFile) return;
    if (!editing) {
      setEditContent(fileContent);
      setEditing(true);
      setSplitPreview(true);
      return;
    }
    setSplitPreview((value) => !value);
  }, [editing, fileContent, isMobile, selectedFile]);

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    openedFromCrossPageRef: detailOpenedFromCrossPageRef,
  });

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
      if (selectedFile && shortcutMatches(e, shortcuts.delete_selected)) {
        e.preventDefault();
        void handleDelete();
      }
      if (selectedFile && shortcutMatches(e, shortcuts.refresh_selected)) {
        e.preventDefault();
        handleRefresh();
      }
      if (selectedFile && shortcutMatches(e, shortcuts.favorite_selected)) {
        e.preventDefault();
        setFavoriteToggleSignal((value) => value + 1);
      }
      if (selectedFile && shortcutMatches(e, shortcuts.toggle_split_preview)) {
        e.preventDefault();
        toggleSplitPreview();
      }
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.more_actions)) {
        e.preventDefault();
        setMoreMenuOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    navPrev,
    navNext,
    selectedFile,
    editing,
    handleRefresh,
    handleDelete,
    toggleSplitPreview,
    shortcuts.delete_selected,
    shortcuts.refresh_selected,
    shortcuts.favorite_selected,
    shortcuts.toggle_split_preview,
    shortcuts.more_actions,
  ]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;

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
                  const hasImage = !!file.preview_image;
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
                  onBack={closeDetail}
                  onRefresh={handleRefresh}
                  refreshShortcut={shortcuts.refresh_selected}
                  editing={editing}
                  onEdit={startEdit}
                  onSave={() => void handleSave()}
                  onCancel={cancelEdit}
                  editTitle={t("common.edit")}
                  editShortcut={shortcuts.edit_selected}
                  saveTitle={t("common.save")}
                  cancelTitle={t("common.preview")}
                  cancelIcon={<AppIcon icon={Eye} size="xs" />}
                  splitPreview={splitPreview}
                  onToggleSplitPreview={toggleSplitPreview}
                  splitPreviewShortcut={shortcuts.toggle_split_preview}
                  saveDisabled={saving}
                  saveTone="accent"
                  metadata={selectedFile ? (
                    <FavoriteButton
                      relPath={selectedFile}
                      title={selectedFile.split("/").pop()}
                      sourceType="import"
                      shortcut={shortcuts.favorite_selected}
                      toggleSignal={favoriteToggleSignal}
                    />
                  ) : null}
                  actionsAfterEdit={[
                    {
                      key: "delete",
                      title: t("common.delete"),
                      shortcut: shortcuts.delete_selected,
                      icon: <AppIcon icon={Trash2} size="xs" />,
                      onClick: () => void handleDelete(),
                      tone: "danger",
                      hidden: editing,
                    },
                  ]}
                  more={!editing ? (
                    <FileMoreActionsMenu
                      relPath={selectedFile}
                      exportContent={fileContent}
                      exportTitle={selectedFile.split("/").pop()}
                      shortcut={shortcuts.more_actions}
                      open={moreMenuOpen}
                      onOpenChange={setMoreMenuOpen}
                    />
                  ) : null}
                />
                <DetailScroll className={editing && splitPreview ? "gm-detail-scroll-split" : undefined}>
                  {editing ? (
                    splitPreview && !isMobile ? (
                      <MarkdownSplitEditor
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                            e.preventDefault();
                            void handleSave();
                          }
                        }}
                        filePath={selectedFile}
                        minHeight
                      />
                    ) : (
                      <CodeTextarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                            e.preventDefault();
                            void handleSave();
                          }
                        }}
                        minHeight
                      />
                    )
                  ) : (
                    <MarkdownView content={fileContent} filePath={selectedFile} />
                  )}
                </DetailScroll>
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
