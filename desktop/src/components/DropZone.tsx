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
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "var(--gm-radius-lg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                  color: "var(--accent)",
                  flexShrink: 0,
                }}
              >
                <Download size={24} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "var(--gm-font-xl)", fontWeight: 700, color: "var(--text)" }}>{t("dropzone.title")}</div>
                <div style={{ marginTop: 6, fontSize: "var(--gm-font-sm)", lineHeight: 1.55, color: "var(--text-secondary)" }}>
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
                  <X size={18} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="gm-drop-body">
            {pendingDrop ? (
              <>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "var(--gm-radius-md)",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    marginBottom: 22,
                  }}
                >
                  <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, color: "var(--text)", wordBreak: "break-word" }}>
                    {dropCopy.title}
                  </div>
                  <div style={{ marginTop: 6, fontSize: "var(--gm-font-xs)", lineHeight: 1.5, color: "var(--text-secondary)" }}>
                    {dropCopy.subtitle}
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: canOpen ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
                  gap: 16,
                }}>
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
                      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--accent)" }}>
                        <FolderOpen size={18} />
                        <span style={{ fontSize: "var(--gm-font-md)", fontWeight: 700 }}>{t("dropzone.openAction")}</span>
                      </div>
                      <div style={{ marginTop: 10, fontSize: "var(--gm-font-xs)", lineHeight: 1.6, color: "var(--text-secondary)" }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--green)" }}>
                      <Download size={18} />
                      <span style={{ fontSize: "var(--gm-font-md)", fontWeight: 700 }}>{t("dropzone.importAction")}</span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: "var(--gm-font-xs)", lineHeight: 1.6, color: "var(--text-secondary)" }}>
                      {t("dropzone.importDesc")}
                    </div>
                  </button>
                </div>

                <div style={{ marginTop: 18, fontSize: "var(--gm-font-xs)", lineHeight: 1.6, color: "var(--text-secondary)" }}>
                  {t("dropzone.routeHint")}
                </div>
                <div style={{ marginTop: 8, fontSize: "var(--gm-font-xs)", lineHeight: 1.6, color: "var(--text-secondary)" }}>
                  {t("dropzone.sizeLimit", maxImportSizeLabel)}
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "var(--gm-space-10) var(--gm-space-0) var(--gm-space-3)" }}>
                <div style={{ fontSize: "var(--gm-font-lg)", fontWeight: 700, color: "var(--accent)" }}>{t("dropzone.dropToChoose")}</div>
                <div style={{ marginTop: 10, fontSize: "var(--gm-font-sm)", lineHeight: 1.55, color: "var(--text-secondary)" }}>
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
        className="gm-floating-toast"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "var(--gm-space-6) var(--gm-space-8)",
        }}
      >
        <div style={{
          width: 16,
          height: 16,
          border: "2px solid color-mix(in srgb, var(--accent) 26%, transparent)",
          borderTopColor: "var(--accent)",
          borderRadius: "999px",
          animation: "spin 1s linear infinite",
        }} />
        <span style={{ fontSize: "var(--gm-font-sm)" }}>{importing ? t("dropzone.importing") : t("dropzone.opening")}</span>
      </div>
    );
  }

  if (result) {
    const hasErrors = result.errors.length > 0;
    return (
      <div
        className="gm-floating-toast"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "var(--gm-space-7) var(--gm-space-8)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {hasErrors ? (
            <X size={16} style={{ color: "var(--red)", flexShrink: 0 }} />
          ) : (
            <Check size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
          )}
          <span style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>
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
              minHeight: 26,
              minWidth: 26,
            }}
          >
            <X size={14} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {result.imported.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "var(--gm-space-7) var(--gm-space-8)",
                borderBottom: i === result.imported.length - 1 && result.errors.length === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <div style={{ marginTop: 2, flexShrink: 0 }}>{categoryIcon(f.category)}</div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.original_name}
                </p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                  → {f.dest_path}
                </p>
              </div>
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", flexShrink: 0, marginTop: 2 }}>
                {formatSize(f.size)}
              </span>
            </div>
          ))}
          {result.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "var(--gm-space-7) var(--gm-space-8)",
                color: "var(--red)",
                fontSize: "var(--gm-font-xs)",
                lineHeight: 1.5,
                wordBreak: "break-word",
              }}
            >
              <X size={12} style={{ marginTop: 3, flexShrink: 0 }} />
              <span>{err}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
