import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";

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
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

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
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void handleClick();
      }}
      disabled={disabled || loading}
      title={t("common.reveal")}
      onMouseEnter={(e) => {
        if (disabled || loading) return;
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        if (disabled || loading) return;
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        borderRadius: 4,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        background: "none",
        border: "none",
        color: "var(--text-secondary)",
        fontSize: 12,
        lineHeight: 1,
        opacity: disabled || loading ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      <FolderOpen size={13} />
      <span>{t("common.reveal")}</span>
    </button>
  );
}
