import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const CLIPBOARD_WATCH_RESTART_DELAY_MS = 200;

export async function withClipboardWatchPaused<T>(
  wasWatching: boolean | undefined,
  action: () => Promise<T>,
  onRestart?: () => void,
) {
  if (!wasWatching) {
    return action();
  }

  let stopped = false;
  try {
    await invoke<string>("stop_clipboard_watch");
    stopped = true;
    return await action();
  } finally {
    if (stopped) {
      await new Promise((resolve) => window.setTimeout(resolve, CLIPBOARD_WATCH_RESTART_DELAY_MS));
      await invoke<string>("start_clipboard_watch");
      onRestart?.();
    }
  }
}

export async function writeTextWithClipboardWatchPaused(
  text: string,
  wasWatching: boolean | undefined,
  onRestart?: () => void,
) {
  await withClipboardWatchPaused(wasWatching, () => writeText(text), onRestart);
}
