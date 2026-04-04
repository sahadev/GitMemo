import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { notify } from "../utils/notify";

export interface GitStatus {
  initialized: boolean;
  sync_dir: string;
  git_remote: string;
  git_branch: string;
  unpushed: number;
  behind: number;
  last_commit_id: string;
  last_commit_msg: string;
  last_commit_time: string;
  checked_at: string;
}

type SyncState = "idle" | "syncing" | "success" | "failed";

interface GitSyncEvent {
  ok: boolean;
  message: string;
}

interface SyncStore {
  state: SyncState;
  message: string;
  gitStatus: GitStatus | null;

  setSyncing: () => void;
  setSuccess: (msg?: string) => void;
  setFailed: (msg?: string) => void;
  setGitStatus: (status: GitStatus) => void;
  reset: () => void;
  refreshGitStatus: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

let resetTimer: number | null = null;

const useSyncStore = create<SyncStore>((set, get) => ({
  state: "idle",
  message: "",
  gitStatus: null,

  setSyncing: () => set({ state: "syncing", message: "" }),
  setSuccess: (msg = "") => set({ state: "success", message: msg }),
  setFailed: (msg = "") => set({ state: "failed", message: msg }),
  setGitStatus: (status) => set({ gitStatus: status }),
  reset: () => set({ state: "idle", message: "" }),

  refreshGitStatus: async () => {
    try {
      const status = await invoke<GitStatus>("get_status");
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
        set({ state: "success", message: result });
        void refreshGitStatus();
        resetTimer = window.setTimeout(() => set({ state: "idle", message: "" }), 3000);
      }, remaining);
    } catch (e) {
      const remaining = Math.max(1000 - (Date.now() - start), 0);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        set({ state: "failed", message: `Error: ${e}` });
        void refreshGitStatus();
        resetTimer = window.setTimeout(() => set({ state: "idle", message: "" }), 3000);
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
      setFailed(payload.message || "Sync failed");
      void notify("GitMemo Sync Failed", payload.message);
    } else {
      setSuccess(payload?.message || "Synced");
    }
    void refreshGitStatus();
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => reset(), 3000);
  });
}
