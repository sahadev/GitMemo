import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Download, FileText, Image, Code2, File, FolderOpen, Check, X } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useAppStore } from "../hooks/useAppStore";

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

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

interface DropZoneProps {
  onOpenDroppedFiles?: (paths: string[]) => Promise<boolean>;
  onNavigateAfterImport?: (result: ImportResult) => void;
}

interface PendingDrop {
  paths: string[];
}

function categoryIcon(cat: string) {
  switch (cat) {
    case "Markdown":
      return <FileText size={14} style={{ color: "var(--accent)" }} />;
    case "Image":
      return <Image size={14} style={{ color: "var(--green)" }} />;
    case "Code":
      return <Code2 size={14} style={{ color: "var(--yellow)" }} />;
    case "Document":
      return <File size={14} style={{ color: "var(--purple)" }} />;
    default:
      return <File size={14} style={{ color: "var(--text-secondary)" }} />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSizeLimitFromKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

function isOpenableByGitMemo(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".mdc") || lower.endsWith(".txt");
}

function describeDrop(paths: string[], t: (key: string, ...args: (string | number)[]) => string) {
  if (paths.length === 1) {
    const name = paths[0].split(/[/\\]/).pop() || paths[0];
    return {
      title: name,
      subtitle: t("dropzone.singleFileHint"),
    };
  }
  return {
    title: t("dropzone.multiFileTitle", String(paths.length)),
    subtitle: t("dropzone.multiFileHint"),
  };
}

export default function DropZone({ onOpenDroppedFiles, onNavigateAfterImport }: DropZoneProps) {
  const { t } = useI18n();
  const settings = useAppStore((s) => s.settings);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [opening, setOpening] = useState(false);

  const clearPendingDrop = useCallback(() => {
    setPendingDrop(null);
    setIsDragging(false);
  }, []);

  const dismissResultLater = useCallback(() => {
    window.setTimeout(() => setResult(null), 5000);
  }, []);

  const handleImport = useCallback(async (paths: string[]) => {
    setImporting(true);
    try {
      const res = await invoke<ImportResult>("import_files", { paths });
      setResult(res);
      dismissResultLater();
      if (res.imported.length > 0) onNavigateAfterImport?.(res);
    } catch (e) {
      setResult({ success: false, imported: [], errors: [`${e}`] });
      dismissResultLater();
    } finally {
      setImporting(false);
      setPendingDrop(null);
    }
  }, [dismissResultLater, onNavigateAfterImport]);

  const handleOpen = useCallback(async (paths: string[]) => {
    if (!onOpenDroppedFiles) return;
    setOpening(true);
    try {
      const opened = await onOpenDroppedFiles(paths);
      if (!opened && paths.length > 1) {
        setResult({ success: false, imported: [], errors: [t("dropzone.openSingleOnly")] });
        dismissResultLater();
      }
      if (opened) {
        setPendingDrop(null);
      }
    } finally {
      setOpening(false);
    }
  }, [dismissResultLater, onOpenDroppedFiles, t]);

  useEffect(() => {
    const listeners: (() => void)[] = [];

    listen("tauri://drag-enter", () => {
      setIsDragging(true);
    }).then((fn) => listeners.push(fn));

    listen("tauri://drag-leave", () => {
      if (!pendingDrop) {
        setIsDragging(false);
      }
    }).then((fn) => listeners.push(fn));

    listen<DragDropPayload>("tauri://drag-drop", (event) => {
      setIsDragging(false);
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        setPendingDrop({ paths });
      }
    }).then((fn) => listeners.push(fn));

    return () => {
      listeners.forEach((fn) => fn());
    };
  }, [pendingDrop]);

  const overlayActive = isDragging || !!pendingDrop;
  const activePaths = pendingDrop?.paths ?? [];
  const dropCopy = describeDrop(activePaths, t);
  const canOpen = activePaths.length === 1 && isOpenableByGitMemo(activePaths[0]);
  const maxImportSizeLabel = formatSizeLimitFromKb(settings?.import_file_size_limit_kb ?? 2048);

  if (overlayActive) {
    return (
      <div
        className="gm-drop-overlay"
        onClick={() => {
          if (!importing && !opening && pendingDrop) clearPendingDrop();
        }}
      >
        <div className="gm-drop-card" onClick={(e) => e.stopPropagation()}>
          <div className="gm-drop-head">
            <div className="gm-drop-head-row">
              <div className="gm-drop-hero-icon">
                <Download size="var(--gm-icon-xl)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="gm-drop-title">{t("dropzone.title")}</div>
                <div className="gm-drop-description">
                  {t("dropzone.chooseMode")}
                </div>
              </div>
              {pendingDrop ? (
                <button
                  type="button"
                  onClick={clearPendingDrop}
                  disabled={importing || opening}
                  className="gm-icon-button"
                  style={{
                    cursor: importing || opening ? "default" : "pointer",
                  }}
                >
                  <X size="var(--gm-icon-md)" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="gm-drop-body">
            {pendingDrop ? (
              <>
                <div className="gm-drop-summary">
                  <div className="gm-drop-summary-title">
                    {dropCopy.title}
                  </div>
                  <div className="gm-drop-summary-subtitle">
                    {dropCopy.subtitle}
                  </div>
                </div>

                <div className="gm-drop-actions-grid" style={{ gridTemplateColumns: canOpen ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
                  {canOpen ? (
                    <button
                      type="button"
                      onClick={() => void handleOpen(pendingDrop.paths)}
                      disabled={importing || opening}
                      className="gm-drop-action"
                      style={{
                        cursor: importing || opening ? "default" : "pointer",
                      }}
                    >
                      <div className="gm-drop-action-head" style={{ color: "var(--accent)" }}>
                        <FolderOpen size="var(--gm-icon-md)" />
                        <span className="gm-drop-action-title">{t("dropzone.openAction")}</span>
                      </div>
                      <div className="gm-drop-action-description">
                        {t("dropzone.openDesc")}
                      </div>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleImport(pendingDrop.paths)}
                    disabled={importing || opening}
                    className="gm-drop-action"
                    style={{
                        cursor: importing || opening ? "default" : "pointer",
                      }}
                    >
                    <div className="gm-drop-action-head" style={{ color: "var(--green)" }}>
                      <Download size="var(--gm-icon-md)" />
                      <span className="gm-drop-action-title">{t("dropzone.importAction")}</span>
                    </div>
                    <div className="gm-drop-action-description">
                      {t("dropzone.importDesc")}
                    </div>
                  </button>
                </div>

                <div className="gm-drop-hint">
                  {t("dropzone.routeHint")}
                </div>
                <div className="gm-drop-hint gm-drop-size-hint">
                  {t("dropzone.sizeLimit", maxImportSizeLabel)}
                </div>
              </>
            ) : (
              <div className="gm-drop-empty-choice">
                <div className="gm-card-title" style={{ color: "var(--accent)" }}>{t("dropzone.dropToChoose")}</div>
                <div className="gm-drop-description">
                  {t("dropzone.dragHint")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (importing || opening) {
    return (
      <div
        className="gm-floating-toast gm-toast-fixed gm-toast-progress"
      >
        <div className="gm-spinner-sm" />
        <span className="gm-card-title">{importing ? t("dropzone.importing") : t("dropzone.opening")}</span>
      </div>
    );
  }

  if (result) {
    const hasErrors = result.errors.length > 0;
    return (
      <div
        className="gm-floating-toast gm-toast-fixed gm-toast-result"
      >
        <div className="gm-toast-head">
          {hasErrors ? (
            <X size="var(--gm-icon-sm)" style={{ color: "var(--red)", flexShrink: 0 }} />
          ) : (
            <Check size="var(--gm-icon-sm)" style={{ color: "var(--green)", flexShrink: 0 }} />
          )}
          <span className="gm-toast-title">
            {result.imported.length > 0
              ? t("dropzone.imported", String(result.imported.length))
              : t("dropzone.importFailed")}
          </span>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="gm-icon-button"
            style={{
              marginLeft: "auto",
              minHeight: "var(--gm-control-height-xs)",
              minWidth: "var(--gm-control-height-xs)",
            }}
          >
            <X size="var(--gm-icon-xs)" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        <div className="gm-toast-body-scroll">
          {result.imported.map((f, i) => (
            <div
              key={i}
              className="gm-toast-row"
              style={{ borderBottom: i === result.imported.length - 1 && result.errors.length === 0 ? "none" : "1px solid var(--border)" }}
            >
              <div style={{ marginTop: "var(--gm-space-1)", flexShrink: 0 }}>{categoryIcon(f.category)}</div>
              <div className="gm-toast-row-main">
                <p className="gm-toast-row-title">
                  {f.original_name}
                </p>
                <p className="gm-toast-row-path">
                  → {f.dest_path}
                </p>
              </div>
              <span className="gm-toast-row-size">
                {formatSize(f.size)}
              </span>
            </div>
          ))}
          {result.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              className="gm-toast-error-row"
            >
              <X size="var(--gm-icon-2xs)" style={{ marginTop: "var(--gm-space-1)", flexShrink: 0 }} />
              <span>{err}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
