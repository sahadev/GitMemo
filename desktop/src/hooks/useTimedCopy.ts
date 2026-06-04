import { useCallback, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useToast } from "./useToast";

export function useTimedCopy<T extends string | boolean = boolean>({
  resetDelay = 1500,
  successMessage,
  errorPrefix = "Copy failed",
}: {
  resetDelay?: number;
  successMessage?: string;
  errorPrefix?: string;
} = {}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState<T | null>(null);

  const markCopied = useCallback((marker: T) => {
    setCopied(marker);
    window.setTimeout(() => {
      setCopied((current) => (current === marker ? null : current));
    }, resetDelay);
  }, [resetDelay]);

  const copyText = useCallback(async (text: string, marker: T) => {
    try {
      await writeText(text);
      markCopied(marker);
      if (successMessage) showToast(successMessage);
      return true;
    } catch (e) {
      showToast(`${errorPrefix}: ${e}`, true);
      return false;
    }
  }, [errorPrefix, markCopied, showToast, successMessage]);

  const clearCopied = useCallback(() => setCopied(null), []);

  return { copied, copyText, markCopied, clearCopied };
}
