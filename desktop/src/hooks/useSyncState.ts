import { useCallback, useMemo, useState } from "react";

type SyncState = "idle" | "syncing" | "success" | "failed";

export interface UseSyncStateReturn {
  isSyncing: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  message: string;
  setSyncing: () => void;
  setSuccess: (msg?: string) => void;
  setFailed: (msg?: string) => void;
  reset: () => void;
}

export function useSyncState(): UseSyncStateReturn {
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("");

  const isSyncing = useMemo(() => state === "syncing", [state]);
  const isSuccess = useMemo(() => state === "success", [state]);
  const isFailed = useMemo(() => state === "failed", [state]);

  const setSyncing = useCallback(() => {
    setState("syncing");
    setMessage("");
  }, []);

  const setSuccess = useCallback((msg = "") => {
    setState("success");
    setMessage(msg);
  }, []);

  const setFailed = useCallback((msg = "") => {
    setState("failed");
    setMessage(msg);
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
  }, []);

  return { isSyncing, isSuccess, isFailed, message, setSyncing, setSuccess, setFailed, reset };
}
