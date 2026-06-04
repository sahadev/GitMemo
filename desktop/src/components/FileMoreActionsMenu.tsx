import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Ellipsis, FolderOpen, Link2 } from "lucide-react";
import { DetailIconButton } from "./DetailIconButton";
import { ExportPdfButton } from "./ExportPdfButton";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";

interface FileMoreActionsMenuProps {
  relPath?: string;
  absolutePath?: string;
  canReveal?: boolean;
  canCopyPath?: boolean;
  canExportPdf?: boolean;
  exportContent?: string;
  exportTitle?: string;
}

export function FileMoreActionsMenu({
  relPath,
  absolutePath,
  canReveal = true,
  canCopyPath = true,
  canExportPdf = true,
  exportContent = "",
  exportTitle,
}: FileMoreActionsMenuProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const resolvePath = useCallback(async () => {
    const abs = absolutePath ?? (relPath ? await invoke<string>("resolve_sync_path", { relPath }) : "");
    if (!abs) throw new Error("No path");
    return abs;
  }, [absolutePath, relPath]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleReveal = useCallback(async () => {
    try {
      await invoke("reveal_external_file_in_finder", { filePath: await resolvePath() });
      setOpen(false);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [resolvePath, showToast]);

  const handleCopyPath = useCallback(async () => {
    try {
      await writeText(await resolvePath());
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 1500);
      showToast(t("common.pathCopied"));
      setOpen(false);
    } catch (e) {
      showToast(`${e}`, true);
    }
  }, [resolvePath, showToast, t]);

  const hasFilePath = Boolean(relPath || absolutePath);
  const showReveal = canReveal && hasFilePath;
  const showCopyPath = canCopyPath && hasFilePath;
  const showExportPdf = canExportPdf && Boolean(exportContent.trim());

  if (!showReveal && !showCopyPath && !showExportPdf) return null;

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <DetailIconButton
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        title={t("common.more")}
      >
        <Ellipsis size={16} />
      </DetailIconButton>

      {open ? (
        <div
          className="gm-menu-popover"
          style={{
            minWidth: 178,
            position: "absolute",
            right: 0,
            top: 38,
            zIndex: 50,
          }}
        >
          {showReveal ? (
            <button type="button" onClick={() => void handleReveal()} className="gm-menu-item">
              <FolderOpen size={14} />
              {t("common.reveal")}
            </button>
          ) : null}
          {showCopyPath ? (
            <button type="button" onClick={() => void handleCopyPath()} className="gm-menu-item">
              {pathCopied ? <Check size={14} /> : <Link2 size={14} />}
              {t("common.copyPath")}
            </button>
          ) : null}
          {showExportPdf ? (
            <ExportPdfButton
              content={exportContent}
              filePath={relPath}
              title={exportTitle}
              variant="menuItem"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
