import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { FileSymlink, Eye, RefreshCw, Trash2, Download, Eraser } from "lucide-react";
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
import { CodeTextarea } from "../components/base/CodeTextarea";
import { EmptyState } from "../components/base/EmptyState";
import { MonoBlock } from "../components/base/MonoBlock";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { PaneHeader } from "../components/AppHeaders";

interface ExternalFileEntry {
  file_path: string;
  file_name: string;
  parent_dir: string;
  exists: boolean;
  last_opened_at: string;
  last_modified_at: string | null;
}

interface ExternalFileOpenResult {
  entry: ExternalFileEntry;
  content: string;
}

interface ExternalFileWriteResult {
  entry: ExternalFileEntry;
  message: string;
}

interface ImportedFile {
  original_name: string;
  dest_path: string;
  category: string;
  size: number;
}

interface ImportResult {
  success: boolean;
  imported: ImportedFile[];
  errors: string[];
}

interface ExternalFileOpenTarget {
  filePath: string;
  requestId: number;
}

function isProbablyMarkdown(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".mdc");
}

export default function ExternalFilesPage({
  openTarget,
  onOpenTargetConsumed,
  onImportResult,
}: {
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
  const [editContent, setEditContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const selectedFilePathRef = useRef<string | null>(null);
  const lastConsumedOpenTargetRef = useRef<number | null>(null);

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

  const clearSelection = useCallback(() => {
    setSelectedFilePath(null);
    setFileContent("");
    setEditContent("");
    setEditing(false);
    setFileError("");
  }, []);

  const upsertEntry = useCallback((entry: ExternalFileEntry) => {
    setEntries((prev) => {
      const existingIndex = prev.findIndex((item) => item.file_path === entry.file_path);
      if (existingIndex === -1) {
        return [...prev, entry];
      }
      const next = [...prev];
      next[existingIndex] = entry;
      return next;
    });
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const next = await invoke<ExternalFileEntry[]>("list_external_files");
      setEntries(next);
      const currentSelectedPath = selectedFilePathRef.current;
      if (currentSelectedPath && !next.some((item) => item.file_path === currentSelectedPath)) {
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
    setEditing(true);
    setEditContent("");
    try {
      const result = await invoke<ExternalFileOpenResult>("open_external_file", { filePath });
      setSelectedFilePath(result.entry.file_path);
      setFileContent(result.content);
      setEditContent(result.content);
      upsertEntry(result.entry);
      void loadEntries();
    } catch (e) {
      setFileContent("");
      setEditContent("");
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }, [loadEntries, upsertEntry]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!openTarget?.filePath) return;
    if (lastConsumedOpenTargetRef.current === openTarget.requestId) return;
    lastConsumedOpenTargetRef.current = openTarget.requestId;
    onOpenTargetConsumed?.();
    if (selectedFilePathRef.current === openTarget.filePath && fileContent) {
      return;
    }
    void openExternalFile(openTarget.filePath);
  }, [openTarget, openExternalFile, onOpenTargetConsumed, fileContent]);

  const selectedEntry = useMemo(
    () => entries.find((item) => item.file_path === selectedFilePath) ?? null,
    [entries, selectedFilePath],
  );

  const handleSave = useCallback(async () => {
    if (!selectedFilePath) return;
    setSaving(true);
    try {
      const result = await invoke<ExternalFileWriteResult>("save_external_file", {
        filePath: selectedFilePath,
        content: editContent,
      });
      setFileContent(editContent);
      upsertEntry(result.entry);
      void loadEntries();
      showToast(result.message || t("externalFiles.saved"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [selectedFilePath, editContent, upsertEntry, showToast, t]);

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

  const handleImport = useCallback(async () => {
    if (!selectedFilePath) return;
    setImporting(true);
    try {
      const result = await invoke<ImportResult>("import_files", {
        paths: [selectedFilePath],
      });
      if (result.imported.length > 0) {
        showToast(t("externalFiles.imported"));
        onImportResult?.(result);
      } else if (result.errors.length > 0) {
        showToast(`Error: ${result.errors[0]}`, true);
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setImporting(false);
    }
  }, [selectedFilePath, showToast, t, onImportResult]);

  return (
    <FileWorkspace
        panelKey="external-files"
        defaultWidth={404}
        minWidth={260}
        maxWidth={560}
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
                return (
                  <FileListItem
                    key={entry.file_path}
                    onClick={() => void openExternalFile(entry.file_path)}
                    active={active}
                    title={entry.file_name}
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
                title={selectedEntry.file_name}
                titleText={selectedEntry.file_path}
                onBack={clearSelection}
                onRefresh={() => {
                  if (selectedEntry) void openExternalFile(selectedEntry.file_path);
                }}
                refreshDisabled={fileLoading}
                editing={editing}
                onEdit={() => setEditing(true)}
                onSave={() => void handleSave()}
                onCancel={() => setEditing(false)}
                editTitle={t("externalFiles.edit")}
                saveTitle={t("externalFiles.save")}
                cancelTitle={t("common.preview")}
                cancelIcon={<AppIcon icon={Eye} size="xs" />}
                editDisabled={!selectedEntry.exists}
                saveDisabled={saving}
                saveTone="accent"
                metadata={selectedEntry ? (
                  <FavoriteButton
                    absolutePath={selectedEntry.file_path}
                    title={selectedEntry.file_name}
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
                    canReveal={selectedEntry.exists}
                    canExportPdf={isProbablyMarkdown(selectedEntry.file_name)}
                    exportContent={fileContent}
                    exportTitle={selectedEntry.file_name}
                  />
                ) : null}
              />

              <DetailScroll>
                {fileLoading ? <Loading compact text={t("dashboard.loading")} /> : null}
                {!fileLoading && fileError ? (
                  <p className="gm-error-inline">{fileError}</p>
                ) : null}
                {!fileLoading && !fileError && selectedEntry ? (
                  editing ? (
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
                  ) : isProbablyMarkdown(selectedEntry.file_name) ? (
                    <MarkdownView content={fileContent} />
                  ) : (
                    <MonoBlock>{fileContent}</MonoBlock>
                  )
                ) : null}
              </DetailScroll>
            </>
            </DetailPane>
          )
        }
    />
  );
}
