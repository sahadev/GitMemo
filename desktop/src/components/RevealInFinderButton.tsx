import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { Button } from "./base/Button";
import { useI18n } from "../hooks/useI18n";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useToast } from "../hooks/useToast";
import { getRevealInFileManagerLabelKey } from "../utils/platformLogic";

export function RevealInFinderButton({
  relPath,
  absolutePath,
  disabled = false,
}: {
  relPath?: string;
  absolutePath?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { os } = usePlatformFlags();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const revealLabel = t(getRevealInFileManagerLabelKey(os));

  const handleClick = useCallback(async () => {
    if (disabled) return;
    try {
      setLoading(true);
      const absPath = absolutePath
        ?? (relPath ? await invoke<string>("resolve_sync_path", { relPath }) : "");
      if (!absPath) throw new Error("No path");
      await invoke("reveal_external_file_in_finder", { filePath: absPath });
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [absolutePath, relPath, disabled, showToast]);

  if (!absolutePath && !relPath) return null;

  return (
    <Button
      variant="secondary"
      onClick={(e) => {
        e.stopPropagation();
        void handleClick();
      }}
      disabled={disabled || loading}
      title={revealLabel}
      icon={FolderOpen}
    >
      {revealLabel}
    </Button>
  );
}
