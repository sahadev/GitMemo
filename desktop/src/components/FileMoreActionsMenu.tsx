import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Ellipsis, FolderOpen, Link2 } from "lucide-react";
import { ExportPdfButton } from "./ExportPdfButton";
import { useI18n } from "../hooks/useI18n";
import { usePlatform } from "../hooks/usePlatform";
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
  const isMobile = usePlatform() === "mobile";
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

  const itemStyle = {
    alignItems: "center",
    background: "transparent",
    border: "none",
    borderRadius: 4,
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    fontSize: 12,
    gap: 8,
    lineHeight: 1.2,
    padding: "8px 10px",
    textAlign: "left" as const,
    whiteSpace: "nowrap" as const,
    width: "100%",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        title={t("common.more")}
        style={{
          alignItems: "center",
          background: isMobile ? "transparent" : "var(--bg)",
          border: isMobile ? "none" : "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-secondary)",
          cursor: "pointer",
          display: "flex",
          height: isMobile ? 38 : 32,
          justifyContent: "center",
          padding: 0,
          width: isMobile ? 38 : 32,
        }}
      >
        <Ellipsis size={16} />
      </button>

      {open ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,0.24)",
            minWidth: 178,
            padding: 6,
            position: "absolute",
            right: 0,
            top: 38,
            zIndex: 50,
          }}
        >
          {showReveal ? (
            <button type="button" onClick={() => void handleReveal()} style={itemStyle}>
              <FolderOpen size={14} />
              {t("common.reveal")}
            </button>
          ) : null}
          {showCopyPath ? (
            <button type="button" onClick={() => void handleCopyPath()} style={itemStyle}>
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
