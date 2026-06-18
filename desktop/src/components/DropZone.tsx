import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import { useAppStore } from "../hooks/useAppStore";
import {
  DropAction,
  DropActionsGrid,
  DropBody,
  DropCard,
  DropEmptyChoice,
  DropHead,
  DropHeadCopy,
  DropHeadRow,
  DropHeroIcon,
  DropHint,
  DropIconButton,
  DropOverlay,
  DropProgressToast,
  DropResultToast,
  DropSummary,
  DropToastBody,
  DropToastErrorRow,
  DropToastHead,
  DropToastRow,
  dropCloseIcon,
  dropImportIcon,
  dropOpenIcon,
} from "./domain/dropzone/DropZoneComponents";
import { formatFileSize, formatSizeLimitFromKb, type ImportResult } from "./domain/imports/importsLogic";

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

function isOpenableByGitMemo(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx") || lower.endsWith(".mdc") || lower.endsWith(".txt");
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
      <DropOverlay
        onClick={() => {
          if (!importing && !opening && pendingDrop) clearPendingDrop();
        }}
      >
        <DropCard onClick={(e) => e.stopPropagation()}>
          <DropHead>
            <DropHeadRow>
              <DropHeroIcon />
              <DropHeadCopy title={t("dropzone.title")} description={t("dropzone.chooseMode")} />
              {pendingDrop ? (
                <DropIconButton
                  icon={dropCloseIcon}
                  onClick={clearPendingDrop}
                  disabled={importing || opening}
                />
              ) : null}
            </DropHeadRow>
          </DropHead>

          <DropBody>
            {pendingDrop ? (
              <>
                <DropSummary title={dropCopy.title} subtitle={dropCopy.subtitle} />

                <DropActionsGrid dual={canOpen}>
                  {canOpen ? (
                    <DropAction
                      icon={dropOpenIcon}
                      tone="accent"
                      label={t("dropzone.openAction")}
                      description={t("dropzone.openDesc")}
                      onClick={() => void handleOpen(pendingDrop.paths)}
                      disabled={importing || opening}
                    />
                  ) : null}

                  <DropAction
                    icon={dropImportIcon}
                    tone="success"
                    label={t("dropzone.importAction")}
                    description={t("dropzone.importDesc")}
                    onClick={() => void handleImport(pendingDrop.paths)}
                    disabled={importing || opening}
                  />
                </DropActionsGrid>

                <DropHint>{t("dropzone.routeHint")}</DropHint>
                <DropHint size>{t("dropzone.sizeLimit", maxImportSizeLabel)}</DropHint>
              </>
            ) : (
              <DropEmptyChoice title={t("dropzone.dropToChoose")} description={t("dropzone.dragHint")} />
            )}
          </DropBody>
        </DropCard>
      </DropOverlay>
    );
  }

  if (importing || opening) {
    return <DropProgressToast>{importing ? t("dropzone.importing") : t("dropzone.opening")}</DropProgressToast>;
  }

  if (result) {
    const hasErrors = result.errors.length > 0;
    return (
      <DropResultToast>
        <DropToastHead
          error={hasErrors}
          title={result.imported.length > 0
            ? t("dropzone.imported", String(result.imported.length))
            : t("dropzone.importFailed")}
          onClose={() => setResult(null)}
        />

        <DropToastBody>
          {result.imported.map((f, i) => (
            <DropToastRow
              key={i}
              last={i === result.imported.length - 1 && result.errors.length === 0}
              category={f.category}
              name={f.original_name}
              path={f.dest_path}
              size={formatFileSize(f.size)}
            />
          ))}
          {result.errors.map((err, i) => (
            <DropToastErrorRow key={`err-${i}`}>{err}</DropToastErrorRow>
          ))}
        </DropToastBody>
      </DropResultToast>
    );
  }

  return null;
}
