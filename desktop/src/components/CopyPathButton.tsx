import { invoke } from "@tauri-apps/api/core";
import { Link2, Check } from "lucide-react";
import { Button } from "./base/Button";
import { useI18n } from "../hooks/useI18n";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { useToast } from "../hooks/useToast";

export function CopyPathButton({ relPath, absolutePath }: { relPath?: string; absolutePath?: string }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { copied, copyText } = useTimedCopy<boolean>({ successMessage: t("common.pathCopied") });

  const onClick = async () => {
    try {
      const abs = absolutePath
        ?? (relPath ? await invoke<string>("resolve_sync_path", { relPath }) : "");
      if (!abs) throw new Error("No path");
      await copyText(abs, true);
    } catch (e) {
      showToast(`${e}`, true);
    }
  };

  return (
    <Button
      variant="icon"
      onClick={(e) => { e.stopPropagation(); void onClick(); }}
      title={t("common.copyPath")}
      icon={copied ? Check : Link2}
      iconTone={copied ? "success" : "current"}
      tone={copied ? "success" : "default"}
    />
  );
}
