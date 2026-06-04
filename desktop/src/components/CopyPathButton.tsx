import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Link2, Check } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";

export function CopyPathButton({ relPath, absolutePath }: { relPath?: string; absolutePath?: string }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [done, setDone] = useState(false);

  const onClick = async () => {
    try {
      const abs = absolutePath
        ?? (relPath ? await invoke<string>("resolve_sync_path", { relPath }) : "");
      if (!abs) throw new Error("No path");
      await writeText(abs);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
      showToast(t("common.pathCopied"));
    } catch (e) {
      showToast(`${e}`, true);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void onClick(); }}
      title={t("common.copyPath")}
      className="gm-icon-button"
      style={{
        color: done ? "var(--green)" : "var(--text-secondary)",
      }}
    >
      {done ? <Check size={14} /> : <Link2 size={14} />}
    </button>
  );
}
