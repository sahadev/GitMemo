import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { FileSymlink, Pencil, Save, Eye, RefreshCw, Trash2, FolderOpen, Download, Eraser } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";

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

  const handleReveal = useCallback(async () => {
    if (!selectedFilePath) return;
    try {
      await invoke("reveal_external_file_in_finder", { filePath: selectedFilePath });
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFilePath, showToast]);

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <div style={{
        padding: "12px 18px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <FileSymlink size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t("externalFiles.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, lineHeight: 1.4, color: "var(--text-secondary)" }}>
            {t("externalFiles.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleClearAll()}
          disabled={loading || entries.length === 0}
          title={t("externalFiles.clearAll")}
          style={{
            background: "none", border: "none", cursor: loading || entries.length === 0 ? "not-allowed" : "pointer", padding: 6, borderRadius: 6,
            color: "var(--text-secondary)", display: "flex", alignItems: "center", opacity: loading || entries.length === 0 ? 0.45 : 1,
          }}
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          onClick={() => void loadEntries()}
          title={t("common.refresh")}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6,
            color: "var(--text-secondary)", display: "flex", alignItems: "center",
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <DesktopSplitPane
        panelKey="external-files"
        defaultWidth={404}
        minWidth={260}
        maxWidth={560}
        left={(
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {loading ? <Loading compact text={t("dashboard.loading")} /> : null}
            {!loading && entries.length === 0 ? (
              <p style={{ padding: 20, fontSize: 12, color: "var(--text-secondary)" }}>{t("externalFiles.empty")}</p>
            ) : null}
            {!loading && entries.map((entry) => {
              const active = selectedFilePath === entry.file_path;
              return (
                <button
                  key={entry.file_path}
                  type="button"
                  onClick={() => void openExternalFile(entry.file_path)}
                  style={{
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: active ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15, fontWeight: 650, lineHeight: 1.3 }}>
                      {entry.file_name}
                    </span>
                    {!entry.exists ? (
                      <span style={{ fontSize: 10, opacity: 0.85 }}>{t("externalFiles.missing")}</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                    {entry.parent_dir}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.62, lineHeight: 1.5 }}>
                    {t("externalFiles.lastSaved", relativeTime(entry.last_modified_at || entry.last_opened_at, t))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        right={
          !selectedEntry ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("externalFiles.selectFile")}</p>
            </div>
          ) : (
            <>
              <div style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}>
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={importing}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32,
                    borderRadius: 8, cursor: importing ? "not-allowed" : "pointer",
                    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                    opacity: importing ? 0.5 : 1,
                  }}
                  title={t("externalFiles.import")}
                >
                  <Download size={14} />
                </button>
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32,
                        borderRadius: 8, cursor: "pointer",
                        background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                      }}
                      title={t("common.preview")}
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32,
                        borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
                        background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)",
                        opacity: saving ? 0.5 : 1,
                      }}
                      title={t("externalFiles.save")}
                    >
                      <Save size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    disabled={!selectedEntry.exists}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32,
                      borderRadius: 8, cursor: selectedEntry.exists ? "pointer" : "not-allowed",
                      background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                      opacity: selectedEntry.exists ? 1 : 0.5,
                    }}
                    title={t("externalFiles.edit")}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => void handleRemove(selectedEntry.file_path)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32,
                    borderRadius: 8, cursor: "pointer",
                    background: "none", border: "none", color: "var(--text-secondary)"
                  }}
                  title={t("common.delete")}
                >
                  <Trash2 size={14} />
                </button>
                <CopyPathButton absolutePath={selectedEntry.file_path} />
                <button
                  type="button"
                  onClick={() => void handleReveal()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32,
                    borderRadius: 8, cursor: "pointer",
                    background: "none", border: "none", color: "var(--text-secondary)"
                  }}
                  title={t("externalFiles.reveal")}
                >
                  <FolderOpen size={14} />
                </button>
              </div>

              <div style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}>
                {fileLoading ? <Loading compact text={t("dashboard.loading")} /> : null}
                {!fileLoading && fileError ? (
                  <p style={{ fontSize: 12, color: "var(--red)" }}>{fileError}</p>
                ) : null}
                {!fileLoading && !fileError && selectedEntry ? (
                  editing ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                          e.preventDefault();
                          void handleSave();
                        }
                      }}
                      style={{
                        width: "100%", height: "100%", resize: "none", padding: 0,
                        background: "transparent", border: "none", color: "var(--text)",
                        fontSize: 13, fontFamily: "ui-monospace, monospace", lineHeight: 1.7,
                        outline: "none", minHeight: 420,
                      }}
                    />
                  ) : isProbablyMarkdown(selectedEntry.file_name) ? (
                    <MarkdownView content={fileContent} />
                  ) : (
                    <pre style={{
                      margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      fontFamily: "ui-monospace, monospace", color: "var(--text)",
                    }}>
                      {fileContent}
                    </pre>
                  )
                ) : null}
              </div>
            </>
          )
        }
      />
    </div>
  );
}
