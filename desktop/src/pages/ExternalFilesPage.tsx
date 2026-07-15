import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { FileSymlink, Eye, RefreshCw, Trash2, Download, Eraser, FileX, RotateCcw, FilePlus } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { AppIcon } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { MonoBlock } from "../components/base/MonoBlock";
import { shouldActivateMobileEditorChrome } from "../components/domain/app/appChromeLogic";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { getDocumentTitle } from "../components/domain/files/fileWorkspaceLogic";
import {
  canClearMissingExternalFiles,
  getFirstExternalImportError,
  getFirstExternalFileDialogPath,
  getMissingExternalFileCount,
  getSelectedExternalEntry,
  hasExternalEntry,
  hasImportedExternalFiles,
  isRecentExternalSelfSave,
  isSelectedExternalFileChange,
  isProbablyMarkdownFileName,
  shouldClearExternalSelection,
  shouldConsumeExternalOpenTarget,
  shouldPromptForExternalDiskChange,
  shouldReloadExternalDiskChange,
  upsertExternalFileEntry,
  type ExternalFileEntry,
  type ExternalFileChangedEvent,
  type ExternalFileOpenResult,
  type ExternalFileOpenTarget,
  type ExternalFileWriteResult,
  type RecentlySavedExternalFile,
  type ImportResult,
  type ExternalFileDialogSelection,
} from "../components/domain/external-files/externalFilesLogic";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { usePlatform } from "../hooks/usePlatform";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { useMobileEditorChrome } from "../hooks/useMobileEditorChrome";
import { relativeTime } from "../utils/time";
import { PaneHeader } from "../components/AppHeaders";

export default function ExternalFilesPage({
  active = true,
  openTarget,
  onOpenTargetConsumed,
  onImportResult,
}: {
  active?: boolean;
  openTarget?: ExternalFileOpenTarget | null;
  onOpenTargetConsumed?: () => void;
  onImportResult?: (result: ImportResult) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  const [entries, setEntries] = useState<ExternalFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
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
  useMobileEditorChrome({ active: shouldActivateMobileEditorChrome({ pageActive: active, editing }), id: "external-files" });
  const [saving, setSaving] = useState(false);
  const [choosingFile, setChoosingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearingMissing, setClearingMissing] = useState(false);
  const [diskChangePending, setDiskChangePending] = useState<ExternalFileChangedEvent | null>(null);
  const selectedFilePathRef = useRef<string | null>(null);
  const lastConsumedOpenTargetRef = useRef<number | null>(null);
  const recentSelfSaveRef = useRef<RecentlySavedExternalFile | null>(null);
  const editingRef = useRef(false);
  const loadEntriesRef = useRef<() => Promise<void>>(async () => {});
  const openExternalFileRef = useRef<(filePath: string) => Promise<void>>(async () => {});
  const upsertEntryRef = useRef<(entry: ExternalFileEntry) => void>(() => {});

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const clearSelection = useCallback(() => {
    setSelectedFilePath(null);
    setFileContent("");
    resetEditor();
    setFileError("");
    setDiskChangePending(null);
  }, [resetEditor]);

  const upsertEntry = useCallback((entry: ExternalFileEntry) => {
    setEntries((prev) => upsertExternalFileEntry(prev, entry));
  }, []);

  useEffect(() => {
    upsertEntryRef.current = upsertEntry;
  }, [upsertEntry]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const next = await invoke<ExternalFileEntry[]>("list_external_files");
      setEntries(next);
      const currentSelectedPath = selectedFilePathRef.current;
      if (shouldClearExternalSelection(next, currentSelectedPath)) {
        clearSelection();
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [clearSelection, showToast]);

  const openExternalFile = useCallback(async (filePath: string) => {
    setSelectedFilePath(filePath);
    setFileLoading(true);
    setFileError("");
    setDiskChangePending(null);
    resetEditor();
    try {
      const result = await invoke<ExternalFileOpenResult>("open_external_file", { filePath });
      setSelectedFilePath(result.entry.file_path);
      setFileContent(result.content);
      resetEditor(result.content);
      upsertEntry(result.entry);
      void loadEntries();
    } catch (e) {
      setFileContent("");
      resetEditor();
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }, [loadEntries, resetEditor, upsertEntry]);

  useEffect(() => {
    loadEntriesRef.current = loadEntries;
  }, [loadEntries]);

  useEffect(() => {
    openExternalFileRef.current = openExternalFile;
  }, [openExternalFile]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!selectedFilePath) {
      void invoke("stop_external_file_watcher").catch(() => {});
      return;
    }

    let cancelled = false;
    void invoke("watch_external_file", { filePath: selectedFilePath }).catch(() => {});
    const unlisten = listen<ExternalFileChangedEvent>("external-file-changed", ({ payload }) => {
      if (cancelled || !isSelectedExternalFileChange(payload, selectedFilePathRef.current)) return;

      upsertEntryRef.current({
        file_path: payload.file_path,
        file_name: payload.file_path.split(/[\\/]/).pop() || "file",
        parent_dir: payload.file_path.replace(/[\\/][^\\/]*$/, ""),
        exists: payload.exists,
        last_opened_at: new Date().toISOString(),
        last_modified_at: payload.last_modified_at,
      });
      void loadEntriesRef.current();

      if (isRecentExternalSelfSave(payload, recentSelfSaveRef.current, Date.now())) {
        return;
      }

      if (shouldPromptForExternalDiskChange(payload, editingRef.current)) {
        setDiskChangePending(payload);
        if (!editingRef.current) {
          setFileContent("");
          resetEditor();
          setFileError(t("externalFiles.fileMissing"));
        }
        return;
      }

      if (shouldReloadExternalDiskChange(payload, editingRef.current)) {
        void openExternalFileRef.current(payload.file_path);
      }
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
      void invoke("stop_external_file_watcher").catch(() => {});
    };
  }, [resetEditor, selectedFilePath, t]);

  useEffect(() => {
    if (!shouldConsumeExternalOpenTarget(openTarget, lastConsumedOpenTargetRef.current)) return;
    lastConsumedOpenTargetRef.current = openTarget.requestId;
    onOpenTargetConsumed?.();
    void openExternalFile(openTarget.filePath);
  }, [openTarget, openExternalFile, onOpenTargetConsumed]);

  const selectedEntry = useMemo(
    () => getSelectedExternalEntry(entries, selectedFilePath),
    [entries, selectedFilePath],
  );
  const selectedIsMarkdown = selectedEntry ? isProbablyMarkdownFileName(selectedEntry.file_name) : false;
  const selectedEntryTitle = getDocumentTitle(selectedEntry);
  const missingCount = useMemo(() => getMissingExternalFileCount(entries), [entries]);

  const handleSave = useCallback(async () => {
    if (!selectedFilePath) return;
    setSaving(true);
    try {
      recentSelfSaveRef.current = {
        filePath: selectedFilePath,
        savedAtMs: Date.now(),
      };
      const result = await invoke<ExternalFileWriteResult>("save_external_file", {
        filePath: selectedFilePath,
        content: editContent,
      });
      setFileContent(editContent);
      setDiskChangePending(null);
      upsertEntry(result.entry);
      void loadEntries();
      showToast(result.message || t("externalFiles.saved"));
    } catch (e) {
      recentSelfSaveRef.current = null;
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [selectedFilePath, editContent, upsertEntry, showToast, t]);

  const handleChooseFile = useCallback(async () => {
    if (choosingFile) return;
    setChoosingFile(true);
    try {
      const selection = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Markdown",
            extensions: ["md", "markdown", "mdx", "mdc"],
          },
        ],
      }) as ExternalFileDialogSelection;
      const filePath = getFirstExternalFileDialogPath(selection);
      if (filePath) {
        await openExternalFile(filePath);
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setChoosingFile(false);
    }
  }, [choosingFile, openExternalFile, showToast]);

  const handleRemove = useCallback(async (filePath: string) => {
    const confirmed = await ask(t("externalFiles.removeConfirm"), {
      title: t("common.confirm"),
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      const next = await invoke<ExternalFileEntry[]>("remove_external_file", { filePath });
      setEntries(next);
      if (selectedFilePath === filePath) {
        clearSelection();
      }
      showToast(t("externalFiles.removed"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFilePath, clearSelection, showToast, t]);

  const handleClearAll = useCallback(async () => {
    const confirmed = await ask(t("externalFiles.clearAllConfirm"), {
      title: t("common.confirm"),
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      await invoke<ExternalFileEntry[]>("clear_external_files");
      setEntries([]);
      clearSelection();
      showToast(t("externalFiles.cleared"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [clearSelection, showToast, t]);

  const handleClearMissing = useCallback(async () => {
    if (!canClearMissingExternalFiles(missingCount, clearingMissing)) return;
    setClearingMissing(true);
    try {
      const next = await invoke<ExternalFileEntry[]>("clear_missing_external_files");
      setEntries(next);
      if (selectedFilePath && !hasExternalEntry(next, selectedFilePath)) {
        clearSelection();
      }
      showToast(t("externalFiles.clearedMissing", missingCount));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setClearingMissing(false);
    }
  }, [clearSelection, clearingMissing, missingCount, selectedFilePath, showToast, t]);

  const handleImport = useCallback(async () => {
    if (!selectedFilePath) return;
    setImporting(true);
    try {
      const result = await invoke<ImportResult>("import_files", {
        paths: [selectedFilePath],
      });
      if (hasImportedExternalFiles(result)) {
        showToast(t("externalFiles.imported"));
        onImportResult?.(result);
      } else {
        const firstError = getFirstExternalImportError(result);
        if (firstError) showToast(`Error: ${firstError}`, true);
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setImporting(false);
    }
  }, [selectedFilePath, showToast, t, onImportResult]);

  const handleReloadFromDisk = useCallback(() => {
    const filePath = diskChangePending?.file_path ?? selectedFilePath;
    if (!filePath) return;
    void openExternalFile(filePath);
  }, [diskChangePending?.file_path, openExternalFile, selectedFilePath]);

  return (
    <FileWorkspace
        panelKey="external-files"
        showList
        showDetail
        left={(
          <ListPane>
            <PaneHeader
              icon={FileSymlink}
              title={t("externalFiles.title")}
              actions={(
                <>
                  <Button
                    variant="toolbar"
                    onClick={() => void handleChooseFile()}
                    disabled={choosingFile}
                    title={t("externalFiles.openMarkdown")}
                    icon={FilePlus}
                  />
                  <Button
                    variant="toolbar"
                    onClick={() => void handleClearMissing()}
                    disabled={loading || !canClearMissingExternalFiles(missingCount, clearingMissing)}
                    title={t("externalFiles.clearMissing")}
                    icon={FileX}
                  />
                  <Button
                    variant="toolbar"
                    onClick={() => void handleClearAll()}
                    disabled={loading || entries.length === 0}
                    title={t("externalFiles.clearAll")}
                    icon={Eraser}
                  />
                  <Button
                    variant="toolbar"
                    onClick={() => void loadEntries()}
                    title={t("common.refresh")}
                    icon={RefreshCw}
                  />
                </>
              )}
            />
            <ListPaneBody>
              {loading ? <Loading compact text={t("dashboard.loading")} /> : null}
              {!loading && entries.length === 0 ? (
                <EmptyState compact title={t("externalFiles.empty")} />
              ) : null}
              {!loading && entries.map((entry) => {
                const active = selectedFilePath === entry.file_path;
                const title = getDocumentTitle(entry);
                return (
                  <FileListItem
                    key={entry.file_path}
                    onClick={() => void openExternalFile(entry.file_path)}
                    active={active}
                    title={title}
                    subtitle={entry.parent_dir}
                    meta={(
                      <>
                        <span className="gm-file-list-meta">
                          {t("externalFiles.lastSaved", relativeTime(entry.last_modified_at || entry.last_opened_at, t))}
                        </span>
                        {!entry.exists ? <Badge tone="danger">{t("externalFiles.missing")}</Badge> : null}
                      </>
                    )}
                  />
                );
              })}
            </ListPaneBody>
          </ListPane>
        )}
        right={
          !selectedEntry ? (
            <EmptyState title={t("externalFiles.selectFile")} full />
          ) : (
            <DetailPane>
            <>
              <FileDetailToolbar
                title={selectedEntryTitle}
                titleText={selectedEntry.file_path}
                active={active}
                onBack={clearSelection}
                onRefresh={() => {
                  if (selectedEntry) void openExternalFile(selectedEntry.file_path);
                }}
                refreshDisabled={fileLoading}
                editing={editing}
                onEdit={startEdit}
                onSave={() => void handleSave()}
                onCancel={cancelEdit}
                editTitle={t("externalFiles.edit")}
                saveTitle={t("externalFiles.save")}
                cancelTitle={t("common.preview")}
                cancelIcon={<AppIcon icon={Eye} size="xs" />}
                splitPreview={splitPreview}
                onToggleSplitPreview={selectedIsMarkdown ? toggleSplitPreview : undefined}
                editDisabled={!selectedEntry.exists}
                saveDisabled={saving}
                saveTone="accent"
                metadata={selectedEntry ? (
                  <FavoriteButton
                    absolutePath={selectedEntry.file_path}
                    active={active}
                    title={selectedEntryTitle}
                    sourceType="external"
                  />
                ) : null}
                actionsBeforeEdit={[
                  {
                    key: "import",
                    title: t("externalFiles.import"),
                    icon: <AppIcon icon={Download} size="xs" />,
                    onClick: () => void handleImport(),
                    disabled: importing,
                  },
                ]}
                actionsAfterEdit={[
                  {
                    key: "remove",
                    title: t("common.delete"),
                    icon: <AppIcon icon={Trash2} size="xs" />,
                    onClick: () => void handleRemove(selectedEntry.file_path),
                    tone: "danger",
                    hidden: editing,
                  },
                ]}
                more={!editing ? (
                  <FileMoreActionsMenu
                    absolutePath={selectedEntry.file_path}
                    active={active}
                    canReveal={selectedEntry.exists}
                    canExportPdf={isProbablyMarkdownFileName(selectedEntry.file_name)}
                    exportContent={fileContent}
                    exportTitle={selectedEntryTitle}
                  />
                ) : null}
              />

              {diskChangePending ? (
                <div className="gm-external-file-change-banner">
                  <span>{diskChangePending.exists ? t("externalFiles.diskChanged") : t("externalFiles.diskMissing")}</span>
                  {diskChangePending.exists ? (
                    <Button
                      variant="ghost"
                      tone="warning"
                      icon={RotateCcw}
                      onClick={handleReloadFromDisk}
                      disabled={fileLoading}
                    >
                      {t("externalFiles.reloadFromDisk")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {fileLoading || fileError ? (
                <DetailScroll>
                  {fileLoading ? <Loading compact text={t("dashboard.loading")} /> : null}
                  {!fileLoading && fileError ? (
                    <p className="gm-error-inline">{fileError}</p>
                  ) : null}
                </DetailScroll>
              ) : !editing ? (
                <DetailScroll selectable className="gm-external-file-preview-scroll">
                  {selectedIsMarkdown ? (
                    <MarkdownView content={fileContent} filePath={selectedEntry.file_path} />
                  ) : (
                    <MonoBlock>{fileContent}</MonoBlock>
                  )}
                </DetailScroll>
              ) : (
                <FileEditorSurface
                  editing={editing}
                  value={editContent}
                  onChange={setEditContent}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  filePath={selectedEntry.file_path}
                  mobile={isMobile}
                  minHeight={editing}
                  splitPreview={splitPreview}
                  supportsSplitPreview={selectedIsMarkdown}
                />
              )}
            </>
            </DetailPane>
          )
        }
    />
  );
}
