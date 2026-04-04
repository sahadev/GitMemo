import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Download, FileText, Image, Code2, File, FolderOpen, Check, X } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

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

function categoryIcon(cat: string) {
  switch (cat) {
    case "Markdown":
      return <FileText size={14} style={{ color: "var(--accent)" }} />;
    case "Image":
      return <Image size={14} style={{ color: "var(--green)" }} />;
    case "Code":
      return <Code2 size={14} style={{ color: "var(--yellow)" }} />;
    case "Document":
      return <File size={14} style={{ color: "#c084fc" }} />;
    default:
      return <File size={14} style={{ color: "var(--text-secondary)" }} />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DropZone() {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [droppedPaths, setDroppedPaths] = useState<string[] | null>(null);

  // Event sources → state only
  useEffect(() => {
    const listeners: (() => void)[] = [];

    listen("tauri://drag-enter", () => {
      setIsDragging(true);
    }).then((fn) => listeners.push(fn));

    listen("tauri://drag-leave", () => {
      setIsDragging(false);
    }).then((fn) => listeners.push(fn));

    listen<DragDropPayload>("tauri://drag-drop", (event) => {
      setIsDragging(false);
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        setDroppedPaths(paths);
      }
    }).then((fn) => listeners.push(fn));

    return () => {
      listeners.forEach((fn) => fn());
    };
  }, []);

  // State-driven import: react to droppedPaths change
  useEffect(() => {
    if (!droppedPaths || importing) return;
    let cancelled = false;

    setImporting(true);
    invoke<ImportResult>("import_files", { paths: droppedPaths })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setTimeout(() => setResult(null), 5000);
      })
      .catch((e) => {
        if (cancelled) return;
        setResult({ success: false, imported: [], errors: [`${e}`] });
        setTimeout(() => setResult(null), 5000);
      })
      .finally(() => {
        if (!cancelled) {
          setImporting(false);
          setDroppedPaths(null);
        }
      });

    return () => { cancelled = true; };
  }, [droppedPaths]);

  // Full-screen drag overlay
  if (isDragging) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(4px)" }}
      >
        <div
          className="flex flex-col items-center gap-4 p-10 rounded-2xl border-2 border-dashed"
          style={{ borderColor: "var(--accent)", background: "rgba(79, 156, 247, 0.08)" }}
        >
          <Download size={48} style={{ color: "var(--accent)" }} className="animate-bounce" />
          <p className="text-[18px] font-semibold" style={{ color: "var(--accent)" }}>
            {t("dropzone.dropToImport")}
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {t("dropzone.routeHint")}
          </p>
          <div className="flex gap-4 mt-2">
            {[
              { icon: FileText, label: "Markdown → notes/", color: "var(--accent)" },
              { icon: Image, label: "Images → clips/", color: "var(--green)" },
              { icon: Code2, label: "Code → imports/code/", color: "var(--yellow)" },
              { icon: File, label: "Docs → imports/docs/", color: "#c084fc" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]"
                  style={{ background: "rgba(255,255,255,0.05)", color: item.color }}
                >
                  <Icon size={12} />
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Importing spinner
  if (importing) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)" }} />
        <span className="text-[13px]">{t("dropzone.importing")}</span>
      </div>
    );
  }

  // Result toast
  if (result) {
    const hasErrors = result.errors.length > 0;
    return (
      <div
        className="fixed bottom-4 right-4 z-50 max-w-[360px] rounded-lg shadow-lg overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {hasErrors ? (
            <X size={16} style={{ color: "var(--red)" }} />
          ) : (
            <Check size={16} style={{ color: "var(--green)" }} />
          )}
          <span className="text-[13px] font-medium">
            {result.imported.length > 0
              ? t("dropzone.imported", String(result.imported.length))
              : t("dropzone.importFailed")}
          </span>
          <button
            onClick={() => setResult(null)}
            className="ml-auto p-0.5 rounded hover:bg-[var(--bg-hover)]"
          >
            <X size={14} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* File list */}
        <div className="max-h-[200px] overflow-y-auto">
          {result.imported.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2 text-[12px]"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              {categoryIcon(f.category)}
              <div className="flex-1 min-w-0">
                <p className="truncate">{f.original_name}</p>
                <p className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
                  → {f.dest_path}
                </p>
              </div>
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-secondary)" }}>
                {formatSize(f.size)}
              </span>
            </div>
          ))}
          {result.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              className="flex items-center gap-2 px-4 py-2 text-[12px]"
              style={{ color: "var(--red)" }}
            >
              <X size={12} />
              <span className="truncate">{err}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
