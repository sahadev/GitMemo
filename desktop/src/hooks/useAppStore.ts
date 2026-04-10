import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// ---- Shared types (single source of truth) ----

export type Theme = "dark" | "light";

export interface ClipboardStatus {
  watching: boolean;
  clips_count: number;
  clips_dir: string;
}

export interface DesktopSettings {
  autostart: boolean;
  clipboard_autostart: boolean;
}

export interface AppMeta {
  version: string;
  release_time: string;
  requires_cli: boolean;
  recommended_cli_version: string;
}

// ---- Store ----

interface AppStore {
  // Clipboard runtime status
  clipboardStatus: ClipboardStatus | null;
  refreshClipboardStatus: () => Promise<void>;

  // Desktop settings
  settings: DesktopSettings | null;
  refreshSettings: () => Promise<void>;

  // Editor integration flags
  claudeEnabled: boolean;
  cursorEnabled: boolean;
  refreshIntegrationStatus: () => Promise<void>;

  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // App meta (version, release)
  appMeta: AppMeta | null;

  // Update
  updateStatus: "idle" | "checking" | "available" | "downloading" | "error";
  updateVersion: string | null;
  updateProgress: number;
  updateError: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;

  // Load all state at startup
  init: () => Promise<void>;
}

function loadTheme(): Theme {
  const saved = localStorage.getItem("gitmemo-theme") as Theme | null;
  if (saved) return saved;
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

const useAppStoreInternal = create<AppStore>((set, get) => ({
  clipboardStatus: null,
  settings: null,
  claudeEnabled: false,
  cursorEnabled: false,
  theme: loadTheme(),
  appMeta: null,
  updateStatus: "idle",
  updateVersion: null,
  updateProgress: 0,
  updateError: null,

  refreshClipboardStatus: async () => {
    try {
      const status = await invoke<ClipboardStatus>("get_clipboard_status");
      set({ clipboardStatus: status });
    } catch { /* not initialized yet */ }
  },

  refreshSettings: async () => {
    try {
      const s = await invoke<DesktopSettings>("get_settings");
      set({ settings: s });
    } catch { /* ignore */ }
  },

  refreshIntegrationStatus: async () => {
    try {
      const [claude, cursor] = await Promise.all([
        invoke<boolean>("get_claude_integration_status").catch(() => false),
        invoke<boolean>("get_cursor_integration_status").catch(() => false),
      ]);
      set({ claudeEnabled: claude, cursorEnabled: cursor });
    } catch { /* ignore */ }
  },

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("gitmemo-theme", next);
    set({ theme: next });
  },

  checkForUpdates: async () => {
    set({ updateStatus: "checking", updateProgress: 0, updateError: null });
    try {
      const update = await check();
      if (update?.available) {
        set({ updateStatus: "available", updateVersion: update.version });
      } else {
        set({ updateStatus: "idle", updateVersion: null });
      }
    } catch (e) {
      set({ updateStatus: "error", updateError: String(e) });
    }
  },

  installUpdate: async () => {
    set({ updateStatus: "downloading", updateProgress: 0 });
    try {
      const update = await check();
      if (!update?.available) {
        set({ updateStatus: "idle" });
        return;
      }
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
          set({ updateProgress: pct });
        } else if (event.event === "Finished") {
          set({ updateProgress: 100 });
        }
      });
      await relaunch();
    } catch (e) {
      set({ updateStatus: "error", updateError: String(e) });
    }
  },

  init: async () => {
    const { refreshClipboardStatus, refreshSettings, refreshIntegrationStatus } = get();
    const metaPromise = invoke<AppMeta>("get_app_meta").catch(() => null);
    await Promise.all([
      refreshClipboardStatus(),
      refreshSettings(),
      refreshIntegrationStatus(),
      metaPromise.then((m) => { if (m) set({ appMeta: m }); }),
    ]);
  },
}));

// ---- Public hook ----

export function useAppStore(): AppStore;
export function useAppStore<T>(selector: (s: AppStore) => T): T;
export function useAppStore<T>(selector?: (s: AppStore) => T) {
  if (selector) return useAppStoreInternal(selector);
  return useAppStoreInternal();
}

// Direct access for non-React code
useAppStore.getState = useAppStoreInternal.getState;

// ---- Side-effect listeners (call once from main.tsx) ----

let _initialized = false;
export function initAppListeners() {
  if (_initialized) return;
  _initialized = true;

  // Load all state on startup
  void useAppStoreInternal.getState().init();

  // Keep clipboard status in sync when backend toggles it (e.g. tray menu)
  void listen("tray-clipboard-update", () => {
    void useAppStoreInternal.getState().refreshClipboardStatus();
  });

  // Apply theme to DOM
  const applyTheme = (theme: Theme) => {
    document.documentElement.setAttribute("data-theme", theme);
  };
  applyTheme(useAppStoreInternal.getState().theme);
  useAppStoreInternal.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme);
  });
}
