import { useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

interface FilesChangedEvent {
  folder: string;
}

interface UseFileWatcherOptions {
  active?: boolean;
  debounceMs?: number;
  shouldIgnore?: (event: FilesChangedEvent) => boolean;
}

/**
 * Listen for file system changes in the sync directory.
 * Calls `onChanged` when files in any of the specified folders change.
 */
export function useFileWatcher(
  folders: string[],
  onChanged: () => void,
  { active = true, debounceMs = 120, shouldIgnore }: UseFileWatcherOptions = {},
) {
  const onChangedRef = useRef(onChanged);
  const shouldIgnoreRef = useRef(shouldIgnore);
  const folderKey = useMemo(() => folders.join("\u0000"), [folders]);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    shouldIgnoreRef.current = shouldIgnore;
  }, [shouldIgnore]);

  useEffect(() => {
    if (!active || folderKey.length === 0) return;
    const watchedFolders = folderKey.split("\u0000");
    let timer: number | null = null;

    const flush = () => {
      timer = null;
      onChangedRef.current();
    };

    const unlisten = listen<FilesChangedEvent>("files-changed", ({ payload }) => {
      if (!watchedFolders.some((f) => payload.folder.startsWith(f))) return;
      if (shouldIgnoreRef.current?.(payload)) return;

      if (debounceMs <= 0) {
        onChangedRef.current();
        return;
      }

      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(flush, debounceMs);
    });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      unlisten.then((fn) => fn());
    };
  }, [active, debounceMs, folderKey]);
}
