import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 未读判定只覆盖这三类栏目；路径与 `FileEntry.path` 同源（相对同步目录）。 */
export type UnreadFolder = "notes" | "conversations" | "plans";

const UNREAD_FOLDERS: UnreadFolder[] = ["notes", "conversations", "plans"];

/** files-changed 会按子目录连发好几条，合并成一次快照拉取。 */
const REFRESH_DEBOUNCE_MS = 200;

interface UnreadSnapshot {
  counts?: Record<string, number> | null;
  unreadPaths?: string[] | null;
}

type UnreadCounts = Record<UnreadFolder, number>;
type UnreadPathMap = Record<string, true>;

interface UnreadStore {
  counts: UnreadCounts;
  unread: UnreadPathMap;
  /** 快照成功落地前不显示、也不吞任何状态：宁可晚一点亮红点，也不要亮错的。 */
  hasSnapshot: boolean;
  refresh: () => Promise<void>;
  markRead: (filePath: string) => Promise<void>;
}

function emptyCounts(): UnreadCounts {
  return { notes: 0, conversations: 0, plans: 0 };
}

function toCounts(raw: Record<string, number> | null | undefined): UnreadCounts {
  const counts = emptyCounts();
  UNREAD_FOLDERS.forEach((folder) => {
    const value = raw?.[folder];
    if (typeof value === "number" && Number.isFinite(value)) {
      counts[folder] = Math.max(0, Math.trunc(value));
    }
  });
  return counts;
}

function toPathMap(paths: string[] | null | undefined): UnreadPathMap {
  const map: UnreadPathMap = {};
  (paths ?? []).forEach((path) => {
    if (typeof path === "string" && path.length > 0) map[path] = true;
  });
  return map;
}

function folderForPath(path: string): UnreadFolder | null {
  const folder = UNREAD_FOLDERS.find((candidate) => path === candidate || path.startsWith(`${candidate}/`));
  return folder ?? null;
}

function isWatchedFolder(folder: string | undefined): boolean {
  if (!folder) return false;
  return UNREAD_FOLDERS.some((candidate) => folder === candidate || folder.startsWith(`${candidate}/`));
}

const useUnreadStore = create<UnreadStore>((set, get) => ({
  counts: emptyCounts(),
  unread: {},
  hasSnapshot: false,

  refresh: async () => {
    try {
      const snapshot = await invoke<UnreadSnapshot>("unread_snapshot", { folders: UNREAD_FOLDERS });
      set({
        counts: toCounts(snapshot?.counts),
        unread: toPathMap(snapshot?.unreadPaths),
        hasSnapshot: true,
      });
    } catch {
      // 后端命令还没就绪时保持静默：没有快照就不亮红点，不弹错误。
    }
  },

  markRead: async (filePath) => {
    if (!filePath) return;
    const { unread } = get();
    const wasUnread = unread[filePath] === true;

    // 后端每次都记一次：本地快照可能还没反应过来（例如刚在外部编辑器改过、
    // 事件还在防抖里），那时 wasUnread 为 false，跳过写入会让红点在下次快照里复活。
    if (wasUnread) {
      const nextUnread = { ...unread };
      delete nextUnread[filePath];
      const nextCounts = { ...get().counts };
      const folder = folderForPath(filePath);
      if (folder && nextCounts[folder] > 0) nextCounts[folder] -= 1;
      set({ unread: nextUnread, counts: nextCounts });
    }

    try {
      await invoke("mark_file_read", { filePath });
    } catch {
      // 后端没写成：把本地状态拉回真实值，避免乐观更新把红点永久抹掉。
      void get().refresh();
    }
  },
}));

let syncStarted = false;
let refreshTimer: number | null = null;

function scheduleRefresh() {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void useUnreadStore.getState().refresh();
  }, REFRESH_DEBOUNCE_MS);
}

/** 监听只装一次：侧边栏和三个页面都会调用 useUnread，重复装会让同一事件触发多次快照。 */
function startUnreadSync() {
  if (syncStarted) return;
  syncStarted = true;
  void useUnreadStore.getState().refresh();
  void listen<{ folder?: string }>("files-changed", ({ payload }) => {
    if (isWatchedFolder(payload?.folder)) scheduleRefresh();
  }).catch(() => {
    // 非 Tauri 环境（纯浏览器预览）没有事件通道，降级为只在启动和 focus 时刷新。
  });
  window.addEventListener("focus", scheduleRefresh);
}

export function useUnread() {
  const counts = useUnreadStore((state) => state.counts);
  const unread = useUnreadStore((state) => state.unread);

  useEffect(() => {
    startUnreadSync();
  }, []);

  const isUnread = useCallback((path: string) => unread[path] === true, [unread]);
  const countFor = useCallback((folder: UnreadFolder) => counts[folder] ?? 0, [counts]);
  const markRead = useCallback((path: string) => {
    void useUnreadStore.getState().markRead(path);
  }, []);

  return { isUnread, countFor, markRead };
}
