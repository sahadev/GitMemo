import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { notify } from "../utils/notify";
import { summarizeSyncFailure } from "../utils/syncError";
import type { GitSyncEvent } from "../types/notes";

export interface GitStatus {
  initialized: boolean;
  sync_dir: string;
  git_remote: string;
  git_branch: string;
  unpushed: number;
  dirty_files: number;
  behind: number;
  last_commit_id: string;
  last_commit_msg: string;
  last_commit_time: string;
  checked_at: string;
}

type SyncState = "idle" | "syncing" | "success" | "failed";

interface SyncStore {
  state: SyncState;
  message: string;
  /** 上一次失败的完整信息，推送成功前一直保留，供弹窗随时打开查看 */
  failure: string;
  failureOpen: boolean;
  gitStatus: GitStatus | null;

  setSyncing: () => void;
  setSuccess: (msg?: string) => void;
  setFailed: (msg?: string) => void;
  setGitStatus: (status: GitStatus) => void;
  openFailure: () => void;
  closeFailure: () => void;
  reset: () => void;
  refreshGitStatus: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

let resetTimer: number | null = null;
let gitStatusRequest: Promise<GitStatus> | null = null;

async function loadGitStatusOnce() {
  if (!gitStatusRequest) {
    gitStatusRequest = invoke<GitStatus>("get_status").finally(() => {
      gitStatusRequest = null;
    });
  }
  return gitStatusRequest;
}

const useSyncStore = create<SyncStore>((set, get) => ({
  state: "idle",
  message: "",
  failure: "",
  failureOpen: false,
  gitStatus: null,

  setSyncing: () => set({ state: "syncing", message: "" }),
  setSuccess: (msg = "") => set({ state: "success", message: msg, failure: "", failureOpen: false }),
  setFailed: (msg = "") =>
    set((prev) => ({ state: "failed", message: msg, failure: msg || prev.failure })),
  setGitStatus: (status) => set({ gitStatus: status }),
  openFailure: () => set({ failureOpen: true }),
  closeFailure: () => set({ failureOpen: false }),
  reset: () => set({ state: "idle", message: "" }),

  refreshGitStatus: async () => {
    try {
      const status = await loadGitStatusOnce();
      set({ gitStatus: status });
    } catch {
      // ignore — may not be initialized yet
    }
  },

  triggerSync: async () => {
    const { state, refreshGitStatus } = get();
    if (state === "syncing") return;
    set({ state: "syncing", message: "" });
    const start = Date.now();
    try {
      const result = await invoke<string>("sync_to_git");
      const remaining = Math.max(1000 - (Date.now() - start), 0);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        get().setSuccess(result);
        void refreshGitStatus();
        resetTimer = window.setTimeout(() => set({ state: "idle", message: "" }), 3000);
      }, remaining);
    } catch (e) {
      const remaining = Math.max(1000 - (Date.now() - start), 0);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        get().setFailed(`${e}`);
        void refreshGitStatus();
        resetTimer = window.setTimeout(() => set({ state: "idle", message: "" }), 5000);
      }, remaining);
    }
  },
}));

// Public hook — adds derived boolean fields for convenience
export function useSync() {
  const store = useSyncStore();
  return {
    ...store,
    isSyncing: store.state === "syncing",
    isSuccess: store.state === "success",
    isFailed: store.state === "failed",
  };
}

// --- Side effects: listen for backend events + load initial status ---
// These run once when the module is imported.

let initialized = false;
export function initSyncListeners() {
  if (initialized) return;
  initialized = true;

  const store = useSyncStore;

  // Load git status on startup
  void store.getState().refreshGitStatus();

  // Listen for backend git-sync events (from bg_commit_and_push)
  void listen("git-sync-start", () => {
    store.getState().setSyncing();
  });

  void listen<GitSyncEvent>("git-sync-end", ({ payload }) => {
    const { setFailed, setSuccess, reset, refreshGitStatus } = useSyncStore.getState();
    if (payload?.ok === false) {
      const failure = payload.message || "Sync failed";
      setFailed(failure);
      // 通知只放一句话；完整输出留给弹窗，不然系统通知里全是远端返回的一屏日志。
      void notify("GitMemo Sync Failed", summarizeSyncFailure(failure), {
        target: { page: "settings" },
      });
    } else {
      setSuccess(payload?.message || "Synced");
    }
    void refreshGitStatus();
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => reset(), 3000);
  });
}
