import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSyncState, type UseSyncStateReturn } from "./useSyncState";

interface SyncContextType extends UseSyncStateReturn {
  /** Manually trigger a full sync (commit + pull + push) */
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const sync = useSyncState();
  const timer = useRef<number | null>(null);

  // Listen for backend git-sync events (from bg_commit_and_push)
  useEffect(() => {
    const unStart = listen("git-sync-start", () => {
      sync.setSyncing();
    });
    const unEnd = listen("git-sync-end", () => {
      sync.setSuccess("Synced");
      timer.current = window.setTimeout(() => sync.reset(), 3000);
    });
    return () => {
      unStart.then((fn) => fn());
      unEnd.then((fn) => fn());
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Manual sync with min 1s spinner
  const triggerSync = useCallback(async () => {
    if (sync.isSyncing) return;
    sync.setSyncing();
    const start = Date.now();
    try {
      const result = await invoke<string>("sync_to_git");
      const remaining = Math.max(1000 - (Date.now() - start), 0);
      timer.current = window.setTimeout(() => {
        sync.setSuccess(result);
        timer.current = window.setTimeout(() => sync.reset(), 3000);
      }, remaining);
    } catch (e) {
      const remaining = Math.max(1000 - (Date.now() - start), 0);
      timer.current = window.setTimeout(() => {
        sync.setFailed(`Error: ${e}`);
        timer.current = window.setTimeout(() => sync.reset(), 3000);
      }, remaining);
    }
  }, [sync.isSyncing]);

  return (
    <SyncContext.Provider value={{ ...sync, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
