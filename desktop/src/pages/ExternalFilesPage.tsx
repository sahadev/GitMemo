import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FileSymlink, Pencil, Save, X, RefreshCw, Trash2, FolderOpen, Download } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { CopyPathButton } from "../components/CopyPathButton";
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

interface ExternalFileImportResult {
  rel_path: string;
  message: string;
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
  onOpenImportedDraft,
}: {
  openTarget?: ExternalFileOpenTarget | null;
  onOpenTargetConsumed?: () => void;
  onOpenImportedDraft?: (relPath: string) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
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

  const upsertEntry = useCallback((entry: ExternalFileEntry, moveToTop = false) => {
    setEntries((prev) => {
      const existingIndex = prev.findIndex((item) => item.file_path === entry.file_path);
      if (existingIndex === -1) {
        return moveToTop ? [entry, ...prev] : [...prev, entry];
      }
      if (!moveToTop) {
        const next = [...prev];
        next[existingIndex] = entry;
        return next;
      }
      return [entry, ...prev.filter((item) => item.file_path !== entry.file_path)];
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

  const openExternalFile = useCallback(async (filePath: string, options?: { preserveListOrder?: boolean }) => {
    const preserveListOrder = options?.preserveListOrder ?? false;
    setSelectedFilePath(filePath);
    setFileLoading(true);
    setFileError("");
    setEditing(false);
    setEditContent("");
    try {
      const result = await invoke<ExternalFileOpenResult>("open_external_file", { filePath });
      setSelectedFilePath(result.entry.file_path);
      setFileContent(result.content);
      upsertEntry(result.entry, !preserveListOrder);
    } catch (e) {
      setFileContent("");
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }, [upsertEntry]);

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
    void openExternalFile(openTarget.filePath, { preserveListOrder: true });
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
      setEditing(false);
      upsertEntry(result.entry, false);
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

  const handleImport = useCallback(async () => {
    if (!selectedFilePath) return;
    setImporting(true);
    try {
      const result = await invoke<ExternalFileImportResult>("import_external_file_to_anonymous", {
        filePath: selectedFilePath,
      });
      showToast(result.message || t("externalFiles.imported"));
      onOpenImportedDraft?.(result.rel_path);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setImporting(false);
    }
  }, [selectedFilePath, showToast, t, onOpenImportedDraft]);

  const handleReveal = useCallback(async () => {
    if (!selectedFilePath) return;
    try {
      const result = await openPath(selectedFilePath);
      if (typeof result === "string" && result) {
        showToast(result, true);
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFilePath, showToast]);

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <div style={{
        padding: "18px 24px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <FileSymlink size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("externalFiles.title")}</h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            {t("externalFiles.subtitle")}
          </p>
        </div>
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 404, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            {t("externalFiles.localOnlyHint")}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? <Loading compact text={t("dashboard.loading")} /> : null}
            {!loading && entries.length === 0 ? (
              <p style={{ padding: 16, fontSize: 12, color: "var(--text-secondary)" }}>{t("externalFiles.empty")}</p>
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
                    padding: "16px 18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15, fontWeight: 650 }}>
                      {entry.file_name}
                    </span>
                    {!entry.exists ? (
                      <span style={{ fontSize: 10, opacity: 0.85 }}>{t("externalFiles.missing")}</span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.parent_dir}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, opacity: 0.62 }}>
                    {t("externalFiles.lastOpened", relativeTime(entry.last_opened_at, t))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {!selectedEntry ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("externalFiles.selectFile")}</p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{t("externalFiles.localOnlyHint")}</p>
            </div>
          ) : (
            <>
              <div style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={selectedEntry.file_path}>
                    {selectedEntry.file_path}
                  </span>
                  <CopyPathButton absolutePath={selectedEntry.file_path} />
                  <button
                    type="button"
                    onClick={() => void handleReveal()}
                    style={{ padding: 6, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    title={t("externalFiles.reveal")}
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>

                <div style={{ fontSize: 11, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                  <div>{t("externalFiles.localOnlyHint")}</div>
                  <div style={{ marginTop: 4 }}>
                    {selectedEntry.exists ? t("externalFiles.editingLive") : t("externalFiles.fileMissing")}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void handleImport()}
                    disabled={importing}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                      borderRadius: 6, fontSize: 12, cursor: "pointer",
                      background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                    }}
                    title={t("externalFiles.import")}
                  >
                    <Download size={12} />
                    {t("externalFiles.import")}
                  </button>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditing(false); setEditContent(fileContent); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                          borderRadius: 6, fontSize: 12, cursor: "pointer",
                          background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                        }}
                      >
                        <X size={12} />
                        {t("externalFiles.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                          borderRadius: 6, fontSize: 12, cursor: "pointer",
                          background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)",
                        }}
                      >
                        <Save size={12} />
                        {t("externalFiles.save")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditContent(fileContent); setEditing(true); }}
                      disabled={!selectedEntry.exists}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                        borderRadius: 6, fontSize: 12, cursor: selectedEntry.exists ? "pointer" : "not-allowed",
                        background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                      }}
                    >
                      <Pencil size={12} />
                      {t("externalFiles.edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRemove(selectedEntry.file_path)}
                    style={{ padding: 6, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    title={t("common.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
          )}
        </div>
      </div>
    </div>
  );
}
