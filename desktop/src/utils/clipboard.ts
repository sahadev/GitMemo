import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const CLIPBOARD_WATCH_RESTART_DELAY_MS = 200;

export async function writeTextWithClipboardWatchPaused(
  text: string,
  wasWatching: boolean | undefined,
  onRestart?: () => void,
) {
  if (!wasWatching) {
    await writeText(text);
    return;
  }

  let stopped = false;
  try {
    await invoke<string>("stop_clipboard_watch");
    stopped = true;
    await writeText(text);
  } finally {
    if (stopped) {
      await new Promise((resolve) => window.setTimeout(resolve, CLIPBOARD_WATCH_RESTART_DELAY_MS));
      await invoke<string>("start_clipboard_watch");
      onRestart?.();
    }
  }
}
