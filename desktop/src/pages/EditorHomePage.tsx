import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ChevronLeft, File, Folder, RefreshCw, Trash2, FilePlus2, FolderPlus } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { MonoBlock } from "../components/base/MonoBlock";
import { shouldActivateMobileEditorChrome } from "../components/domain/app/appChromeLogic";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { getDocumentTitle, getDocumentTitleForPath } from "../components/domain/files/fileWorkspaceLogic";
import {
  EDITOR_ROOTS,
  getEditorEmptyTextKey,
  getEditorRootLabelKey,
  getEditorRootPath,
  getEditorSelectTitleKey,
  getNewEditorFileRel,
  getSelectedEditorEntry,
  isEditorRootAvailable,
  isProbablyMarkdownEditorPath,
  joinRel,
  parentRel,
  pruneFocusedEditorEntry,
  resolveAvailableEditorRoot,
  shouldSkipEditorTargetOpen,
  shouldSwitchEditorTargetDirectory,
  shouldSwitchEditorTargetRoot,
  type EditorDirEntry,
  type EditorOpenTarget,
  type EditorRoot,
  type EditorRootsStatus,
  type EditorWriteResult,
} from "../components/domain/editor-home/editorHomeLogic";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { useListKeyboardNavigation, useListNavigation } from "../hooks/useListNavigation";
import { usePlatform } from "../hooks/usePlatform";
import { useMobileEditorChrome } from "../hooks/useMobileEditorChrome";

export default function EditorHomePage({ active = true, openTarget, onOpenTargetConsumed }: { active?: boolean; openTarget?: EditorOpenTarget | null; onOpenTargetConsumed?: () => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  const [roots, setRoots] = useState<EditorRootsStatus | null>(null);
  const [root, setRoot] = useState<EditorRoot>("claude");
  const [rel, setRel] = useState("");
  const [entries, setEntries] = useState<EditorDirEntry[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [focusedEntryRel, setFocusedEntryRel] = useState<string | null>(null);
  const [selectedFileRel, setSelectedFileRel] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileAbs, setFileAbs] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const {
    editing,
    editContent,
    splitPreview,
    setEditContent,
    startEdit,
    cancelEdit,
    completeEdit,
    resetEditor,
    toggleSplitPreview,
  } = useFileEditorState({ sourceContent: fileContent });
  useMobileEditorChrome({ active: shouldActivateMobileEditorChrome({ pageActive: active, editing }), id: "editor-home" });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingDir, setCreatingDir] = useState(false);

  const loadRoots = useCallback(async () => {
    try {
      const r = await invoke<EditorRootsStatus>("get_editor_data_roots");
      setRoots(r);
      setRoot((current) => resolveAvailableEditorRoot(current, r));
    } catch {
      setRoots(null);
    }
  }, []);

  const loadDir = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const list = await invoke<EditorDirEntry[]>("list_editor_directory", { root, rel });
      setEntries(list);
      setFocusedEntryRel((current) => pruneFocusedEditorEntry(list, current));
    } catch (e) {
      setEntries([]);
      setFocusedEntryRel(null);
      setListError(String(e));
    } finally {
      setListLoading(false);
    }
  }, [root, rel]);

  const clearSelection = useCallback(() => {
    setFocusedEntryRel(null);
    setSelectedFileRel(null);
    setFileContent("");
    setFileAbs("");
    setFileError("");
    resetEditor();
  }, [resetEditor]);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots]);

  useEffect(() => {
    void loadDir();
  }, [loadDir]);

  const rootOk = useMemo(() => isEditorRootAvailable(roots, root), [root, roots]);

  const rootPath = useMemo(() => getEditorRootPath(roots, root), [root, roots]);

  const openFile = useCallback(async (fileRel: string) => {
    setFocusedEntryRel(fileRel);
    setSelectedFileRel(fileRel);
    setFileContent("");
    setFileError("");
    setFileAbs("");
    resetEditor();
    setFileLoading(true);
    try {
      const [text, abs] = await Promise.all([
        invoke<string>("read_editor_home_file", { root, rel: fileRel }),
        invoke<string>("resolve_editor_file_abs", { root, rel: fileRel }),
      ]);
      setFileContent(text);
      setFileAbs(abs);
    } catch (e) {
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }, [resetEditor, root]);

  const handleRefresh = useCallback(() => {
    void loadRoots();
    void loadDir();
    if (selectedFileRel) void openFile(selectedFileRel);
  }, [loadRoots, loadDir, selectedFileRel, openFile]);

  const handleSwitchRoot = useCallback((nextRoot: EditorRoot) => {
    setRoot(nextRoot);
    setRel("");
    clearSelection();
  }, [clearSelection]);

  const handleSave = useCallback(async () => {
    if (!selectedFileRel) return;
    setSaving(true);
    try {
      const result = await invoke<EditorWriteResult>("write_editor_file", {
        root,
        rel: selectedFileRel,
        content: editContent,
      });
      setFileContent(editContent);
      completeEdit();
      showToast(result.message || t("editorHome.saved"));
      void loadDir();
      void openFile(result.rel_path);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [selectedFileRel, root, editContent, completeEdit, showToast, t, loadDir, openFile]);

  const handleDelete = useCallback(async () => {
    if (!selectedFileRel) return;
    const confirmed = await ask(t("editorHome.deleteConfirm"), {
      title: t("common.confirm"),
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      const result = await invoke<EditorWriteResult>("delete_editor_file", {
        root,
        rel: selectedFileRel,
      });
      clearSelection();
      showToast(result.message || t("editorHome.deleted"));
      void loadDir();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFileRel, root, t, clearSelection, showToast, loadDir]);

  const handleCreateFile = useCallback(async () => {
    setCreating(true);
    try {
      const relPath = getNewEditorFileRel(root, rel, t("editorHome.untitled"));
      const result = await invoke<EditorWriteResult>("create_editor_file", {
        root,
        rel: relPath,
        initialContent: "",
      });
      showToast(result.message || t("editorHome.created"));
      await loadDir();
      await openFile(result.rel_path);
      startEdit({ content: "", focus: false });
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setCreating(false);
    }
  }, [root, rel, t, showToast, loadDir, openFile, startEdit]);

  const handleCreateFolder = useCallback(async () => {
    const base = t("editorHome.newFolderName");
    const targetRel = joinRel(rel, base);
    setCreatingDir(true);
    try {
      const result = await invoke<EditorWriteResult>("create_editor_directory", {
        root,
        rel: targetRel,
      });
      showToast(result.message || t("editorHome.created"));
      await loadDir();
      setRel(result.rel_path);
      clearSelection();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setCreatingDir(false);
    }
  }, [root, rel, t, showToast, loadDir, clearSelection]);

  const selectedIsMarkdown = selectedFileRel ? isProbablyMarkdownEditorPath(selectedFileRel) : false;
  const selectedEntryKey = focusedEntryRel ?? selectedFileRel;

  const handleCancelEdit = useCallback(() => {
    cancelEdit(fileContent);
  }, [cancelEdit, fileContent]);

  const openEntry = useCallback((entryRel: string, entry: EditorDirEntry) => {
    setFocusedEntryRel(entryRel);
    if (entry.is_dir) {
      return;
    }
    void openFile(entryRel);
  }, [openFile]);

  const enterSelectedEntry = useCallback(() => {
    const selectedEntry = getSelectedEditorEntry(entries, selectedEntryKey);
    if (!selectedEntry) return;
    if (selectedEntry.is_dir) {
      setRel(selectedEntry.rel_path);
      clearSelection();
      return;
    }
    void openFile(selectedEntry.rel_path);
  }, [clearSelection, entries, openFile, selectedEntryKey]);

  const { navPrev, navNext } = useListNavigation({
    items: entries,
    selectedKey: selectedEntryKey,
    getKey: (entry) => entry.rel_path,
    openItem: openEntry,
  });

  useListKeyboardNavigation({
    active,
    navPrev,
    navNext,
    onEnter: enterSelectedEntry,
  });

  useEffect(() => {
    if (!openTarget) return;
    if (shouldSwitchEditorTargetRoot(root, openTarget)) {
      setRoot(openTarget.root);
      setRel(parentRel(openTarget.relPath));
      clearSelection();
      return;
    }
    if (shouldSwitchEditorTargetDirectory(rel, openTarget)) {
      setRel(parentRel(openTarget.relPath));
      clearSelection();
      return;
    }
    if (shouldSkipEditorTargetOpen(selectedFileRel, openTarget)) {
      onOpenTargetConsumed?.();
      return;
    }
    void openFile(openTarget.relPath).finally(() => onOpenTargetConsumed?.());
  }, [openTarget, root, rel, selectedFileRel, openFile, clearSelection, onOpenTargetConsumed]);

  const leftEmptyText = t(getEditorEmptyTextKey(root));
  const selectedFileEntry = getSelectedEditorEntry(entries, selectedFileRel);
  const selectedFileTitle = getDocumentTitleForPath(selectedFileRel, selectedFileEntry);

  const list = (
    <ListPane>
      <PaneHeader
        icon={FolderOpen}
        title={t("editorHome.title")}
        actions={(
          <Button
            variant="toolbar"
            onClick={handleRefresh}
            title={t("common.refresh")}
            icon={RefreshCw}
          />
        )}
      />

      <div className="gm-segment-row">
        {EDITOR_ROOTS.map((r) => {
          const exists = isEditorRootAvailable(roots, r);
          return (
            <button
              key={r}
              type="button"
              disabled={!exists}
              onClick={() => handleSwitchRoot(r)}
              className="gm-segment-button gm-segment-button-fluid"
              data-active={root === r ? "true" : "false"}
            >
              {t(getEditorRootLabelKey(r))}
            </button>
          );
        })}
      </div>

      <div className="gm-editor-path-row">
        {rel ? (
          <Button
            variant="secondary"
            onClick={() => { setRel(parentRel(rel)); clearSelection(); }}
            icon={ChevronLeft}
          >
            {t("editorHome.up")}
          </Button>
        ) : null}
        <span className="gm-editor-path-text" title={rootPath || rel || "."}>
          {rel || rootPath || "~"}
        </span>
      </div>

      <div className="gm-editor-actions-row">
        <Button
          variant="secondary"
          onClick={() => void handleCreateFile()}
          disabled={!rootOk || creating}
          icon={FilePlus2}
          block
        >
          {t("editorHome.newFile")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void handleCreateFolder()}
          disabled={!rootOk || creatingDir}
          icon={FolderPlus}
          block
        >
          {t("editorHome.newFolder")}
        </Button>
      </div>

      <ListPaneBody>
        {!rootOk ? (
          <EmptyState compact title={rootPath} description={t("editorHome.missingDir")} />
        ) : listLoading ? (
          <Loading compact text={t("dashboard.loading")} />
        ) : listError ? (
          <p className="gm-error-inline">{listError}</p>
        ) : entries.length === 0 ? (
          <EmptyState compact title={leftEmptyText} />
        ) : (
          entries.map((entry) => {
            const sel = selectedEntryKey === entry.rel_path;
            return (
              <FileListItem
                key={entry.rel_path}
                onClick={() => {
                  setFocusedEntryRel(entry.rel_path);
                  if (entry.is_dir) {
                    setRel(entry.rel_path);
                    clearSelection();
                  } else {
                    void openFile(entry.rel_path);
                  }
                }}
                active={sel}
                icon={<AppIcon icon={entry.is_dir ? Folder : File} size="xs" />}
                title={entry.is_dir ? entry.name : getDocumentTitle(entry)}
                subtitle={entry.is_dir ? t("editorHome.folder") : undefined}
              />
            );
          })
        )}
      </ListPaneBody>
    </ListPane>
  );

  const detail = (
    <DetailPane>
      {!selectedFileRel ? (
        <EmptyState
          title={t(getEditorSelectTitleKey(root))}
          description={t("editorHome.editableWarning")}
          full
        />
      ) : (
        <>
          <FileDetailToolbar
            title={selectedFileTitle}
            titleText={fileAbs || selectedFileRel}
            active={active}
            onBack={clearSelection}
            onRefresh={handleRefresh}
            editing={editing}
            onEdit={startEdit}
            onSave={() => void handleSave()}
            onCancel={handleCancelEdit}
            editTitle={t("editorHome.edit")}
            saveTitle={t("editorHome.save")}
            cancelTitle={t("editorHome.cancel")}
            saveDisabled={saving}
            saveTone="accent"
            splitPreview={splitPreview}
            onToggleSplitPreview={selectedIsMarkdown ? toggleSplitPreview : undefined}
            metadata={selectedFileRel ? (
              <FavoriteButton
                absolutePath={fileAbs || undefined}
                active={active}
                title={selectedFileTitle}
                sourceType="external"
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
            more={!editing && selectedFileRel ? (
              <FileMoreActionsMenu
                absolutePath={fileAbs || undefined}
                active={active}
                canExportPdf={isProbablyMarkdownEditorPath(selectedFileRel)}
                exportContent={fileContent}
                exportTitle={selectedFileTitle}
              />
            ) : null}
            density="compact"
          />
          {fileLoading || fileError ? (
            <DetailScroll>
              {fileLoading ? <Loading compact text={t("dashboard.loading")} /> : null}
              {!fileLoading && fileError ? (
                <p className="gm-error-inline">{fileError}</p>
              ) : null}
            </DetailScroll>
          ) : (
            <FileEditorSurface
              editing={editing}
              value={editContent}
              onChange={setEditContent}
              onSave={handleSave}
              onCancel={handleCancelEdit}
              filePath={fileAbs || selectedFileRel}
              mobile={isMobile}
              minHeight
              splitPreview={splitPreview}
              supportsSplitPreview={selectedIsMarkdown}
            >
              {selectedIsMarkdown ? (
                <MarkdownView content={fileContent} filePath={fileAbs || selectedFileRel} />
              ) : (
                <MonoBlock>{fileContent}</MonoBlock>
              )}
            </FileEditorSurface>
          )}
        </>
      )}
    </DetailPane>
  );

  return (
    <FileWorkspace
      panelKey="editor-home"
      showList
      showDetail
      left={list}
      right={detail}
    />
  );
}
