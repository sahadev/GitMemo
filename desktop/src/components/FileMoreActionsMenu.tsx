import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Ellipsis, FolderOpen, Link2 } from "lucide-react";
import { DetailIconButton } from "./DetailIconButton";
import { ExportPdfButton } from "./ExportPdfButton";
import { AppIcon } from "./base/AppIcon";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { useAppStore } from "../hooks/useAppStore";
import { formatTitleWithShortcut, isShortcutEditableTarget, shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import {
  getFileMoreActionVisibility,
  hasVisibleFileMoreActions,
  shouldEnableFileMoreActionsShortcut,
} from "./domain/files/fileActionsLogic";

interface FileMoreActionsMenuProps {
  relPath?: string;
  absolutePath?: string;
  canReveal?: boolean;
  canCopyPath?: boolean;
  canExportPdf?: boolean;
  exportContent?: string;
  exportTitle?: string;
  shortcut?: string;
  active?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FileMoreActionsMenu({
  relPath,
  absolutePath,
  canReveal = true,
  canCopyPath = true,
  canExportPdf = true,
  exportContent = "",
  exportTitle,
  shortcut,
  active = true,
  open: controlledOpen,
  onOpenChange,
}: FileMoreActionsMenuProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback((next: boolean | ((value: boolean) => boolean)) => {
    const nextValue = typeof next === "function" ? next(open) : next;
    if (controlledOpen === undefined) setUncontrolledOpen(nextValue);
    onOpenChange?.(nextValue);
  }, [controlledOpen, onOpenChange, open]);
  const { copied: pathCopied, copyText } = useTimedCopy<boolean>({ successMessage: t("common.pathCopied") });
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
      const copied = await copyText(await resolvePath(), true);
      if (copied) setOpen(false);
    } catch (e) {
      showToast(`${e}`, true);
    }
  }, [copyText, resolvePath, showToast]);

  const actionVisibility = getFileMoreActionVisibility({
    relPath,
    absolutePath,
    canReveal,
    canCopyPath,
    canExportPdf,
    exportContent,
  });
  const { showReveal, showCopyPath, showExportPdf } = actionVisibility;

  useEffect(() => {
    if (!shouldEnableFileMoreActionsShortcut(active, actionVisibility)) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutEditableTarget(event.target)) return;
      if (!shortcutMatches(event, shortcut ?? shortcuts.more_actions)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, shortcut, shortcuts.more_actions, setOpen, showCopyPath, showExportPdf, showReveal]);

  if (!hasVisibleFileMoreActions(actionVisibility)) return null;

  return (
    <div ref={rootRef} className="gm-menu-anchor">
      <DetailIconButton
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        title={formatTitleWithShortcut(t("common.more"), shortcut ?? shortcuts.more_actions)}
      >
        <AppIcon icon={Ellipsis} size="sm" />
      </DetailIconButton>

      {open ? (
        <div
          className="gm-menu-popover gm-file-menu-popover"
        >
          {showReveal ? (
            <button type="button" onClick={() => void handleReveal()} className="gm-menu-item">
              <AppIcon icon={FolderOpen} size="xs" />
              {t("common.reveal")}
            </button>
          ) : null}
          {showCopyPath ? (
            <button type="button" onClick={() => void handleCopyPath()} className="gm-menu-item">
              <AppIcon icon={pathCopied ? Check : Link2} size="xs" tone={pathCopied ? "success" : "current"} />
              {t("common.copyPath")}
            </button>
          ) : null}
          {showExportPdf ? (
            <ExportPdfButton
              content={exportContent}
              filePath={relPath ?? absolutePath}
              title={exportTitle}
              variant="menuItem"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
