import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { error as logPluginError, info as logPluginInfo, warn as logPluginWarn } from "@tauri-apps/plugin-log";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { KeyboardShortcuts } from "../utils/shortcuts";
import { initNotificationListeners, notify } from "../utils/notify";
import { configureControlCopyPasteBridge } from "../utils/controlCopyPaste";
import { getPlatformCapabilities, getPlatformFlags, type RuntimeInfo } from "../utils/platformLogic";
import { getRuntimeInfo, getRuntimeInfoSync, getRuntimePlatform } from "./usePlatform";
import { canRequestDesktopUpdateCheck, type DesktopUpdateStatus } from "../components/domain/settings/settingsLogic";

/** 检查更新请求超时（毫秒）。元数据从 GitHub 拉取，不设超时时弱网可能卡住数十秒。 */
const UPDATE_CHECK_TIMEOUT_MS = 15_000;
/** 下载安装包超时（毫秒），大文件在慢网下需要更长时间。 */
const UPDATE_DOWNLOAD_TIMEOUT_MS = 600_000;

function formatUnknownErr(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

function supportsControlCopyPasteBridge(runtimeInfo: RuntimeInfo) {
  return getPlatformCapabilities(getPlatformFlags(runtimeInfo)).supportsControlCopyPasteBridge;
}

/** 写入应用日志目录下的 `gitmemo.log`（与 Rust `tauri-plugin-log` 一致）；非 Tauri 环境回退到 console。 */
async function logUpdaterInfo(message: string): Promise<void> {
  const line = `[updater] ${message}`;
  try {
    await logPluginInfo(line);
  } catch {
    console.info(line);
  }
}

async function logUpdaterWarn(message: string): Promise<void> {
  const line = `[updater] ${message}`;
  try {
    await logPluginWarn(line);
  } catch {
    console.warn(line);
  }
}

async function logUpdaterError(message: string): Promise<void> {
  const line = `[updater] ${message}`;
  try {
    await logPluginError(line);
  } catch {
    console.error(line);
  }
}

// ---- Shared types (single source of truth) ----

export type Theme = "dark" | "light";
export type NotesTab = "scratch" | "manual";
export type AiRecordsTab = "conversations" | "plans";

export interface ClipboardStatus {
  watching: boolean;
  clips_count: number;
  clips_dir: string;
}

export interface DesktopSettings {
  autostart: boolean;
  clipboard_autostart: boolean;
  control_copy_paste: boolean;
  sensitive_clipboard_action: "redact" | "plaintext";
  vault_enabled: boolean;
  proxy_mode: "system" | "none" | "custom";
  proxy_url: string;
  shortcuts: KeyboardShortcuts;
  import_file_size_limit_kb: number;
}

export interface AppMeta {
  version: string;
  release_time: string;
  requires_cli: boolean;
}

export interface CliStatus {
  installed: boolean;
  path: string;
  version: string;
  latest_version: string | null;
  update_available: boolean;
  update_url: string | null;
  release_url: string | null;
  notes: string[];
  check_error: string | null;
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

  // Desktop layout
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  collapsedPanels: Record<string, boolean>;
  setPanelCollapsed: (panelKey: string, collapsed: boolean) => void;

  // Cross-page notes tab selection
  notesTab: NotesTab;
  setNotesTab: (tab: NotesTab) => void;

  // Cross-page AI records tab selection
  aiRecordsTab: AiRecordsTab;
  setAiRecordsTab: (tab: AiRecordsTab) => void;

  // Cross-page record opening
  pendingOpenPath: string | null;
  setPendingOpenPath: (path: string | null) => void;
  consumePendingOpenPath: () => void;

  // App meta (version, release)
  appMeta: AppMeta | null;
  cliStatus: CliStatus | null;
  refreshCliStatus: () => Promise<void>;

  // Update
  updateStatus: DesktopUpdateStatus;
  updateVersion: string | null;
  updateDate: string | null;
  updateBody: string | null;
  updateProgress: number;
  updateError: string | null;
  pendingUpdateDetailsOpen: boolean;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  requestUpdateDetailsOpen: () => void;
  consumeUpdateDetailsOpen: () => void;

  // Load all state at startup
  init: () => Promise<void>;
}

function loadTheme(): Theme {
  const saved = localStorage.getItem("gitmemo-theme") as Theme | null;
  if (saved) return saved;
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function loadBoolean(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

function panelCollapsedStorageKey(panelKey: string): string {
  return `gitmemo-layout-panel-collapsed-${panelKey}`;
}

function loadCollapsedPanels(panelKeys: string[]): Record<string, boolean> {
  return Object.fromEntries(panelKeys.map((panelKey) => [panelKey, loadBoolean(panelCollapsedStorageKey(panelKey))]));
}

const useAppStoreInternal = create<AppStore>((set, get) => ({
  clipboardStatus: null,
  settings: null,
  claudeEnabled: false,
  cursorEnabled: false,
  theme: loadTheme(),
  sidebarCollapsed: loadBoolean("gitmemo-layout-sidebar-collapsed"),
  collapsedPanels: loadCollapsedPanels(["notes", "conversations", "plans", "clipboard"]),
  notesTab: "scratch",
  aiRecordsTab: "conversations",
  pendingOpenPath: null,
  appMeta: null,
  cliStatus: null,
  updateStatus: "idle",
  updateVersion: null,
  updateDate: null,
  updateBody: null,
  updateProgress: 0,
  updateError: null,
  pendingUpdateDetailsOpen: false,

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

  refreshCliStatus: async () => {
    try {
      const status = await invoke<CliStatus>("get_cli_status");
      set({ cliStatus: status });
    } catch { /* ignore */ }
  },

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("gitmemo-theme", next);
    set({ theme: next });
  },

  setSidebarCollapsed: (collapsed) => {
    localStorage.setItem("gitmemo-layout-sidebar-collapsed", String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebarCollapsed: () => {
    get().setSidebarCollapsed(!get().sidebarCollapsed);
  },

  setPanelCollapsed: (panelKey, collapsed) => {
    localStorage.setItem(panelCollapsedStorageKey(panelKey), String(collapsed));
    set((state) => ({
      collapsedPanels: { ...state.collapsedPanels, [panelKey]: collapsed },
    }));
  },

  setNotesTab: (tab) => {
    set({ notesTab: tab });
  },

  setAiRecordsTab: (tab) => {
    set({ aiRecordsTab: tab });
  },

  setPendingOpenPath: (path) => {
    set({ pendingOpenPath: path });
  },

  consumePendingOpenPath: () => {
    set({ pendingOpenPath: null });
  },

  checkForUpdates: async () => {
    if (!canRequestDesktopUpdateCheck(get().updateStatus)) return;
    set({ updateStatus: "checking", updateProgress: 0, updateError: null });
    const t0 = performance.now();
    await logUpdaterInfo(
      `check start (timeout_ms=${UPDATE_CHECK_TIMEOUT_MS}, endpoint=tauri.conf updater endpoints)`,
    );
    try {
      const { settings } = get();
      const proxyOpt = settings?.proxy_mode === "custom" && settings.proxy_url
        ? { proxy: settings.proxy_url } : {};
      const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS, ...proxyOpt });
      const ms = Math.round(performance.now() - t0);
      if (update) {
        await logUpdaterInfo(`check ok in ${ms}ms: available version=${update.version}`);
        set({
          updateStatus: "available",
          updateVersion: update.version,
          updateDate: update.date ?? null,
          updateBody: update.body ?? null,
        });
      } else {
        await logUpdaterInfo(`check ok in ${ms}ms: already latest`);
        set({ updateStatus: "upToDate", updateVersion: null, updateDate: null, updateBody: null });
      }
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      const errStr = formatUnknownErr(e);
      await logUpdaterError(`check failed after ${ms}ms: ${errStr}`);
      set({ updateStatus: "error", updateError: errStr });
    }
  },

  installUpdate: async () => {
    set({ updateStatus: "downloading", updateProgress: 0 });
    const t0 = performance.now();
    await logUpdaterInfo(`install: re-check start (timeout_ms=${UPDATE_CHECK_TIMEOUT_MS})`);
    try {
      const { settings } = get();
      const proxyOpt = settings?.proxy_mode === "custom" && settings.proxy_url
        ? { proxy: settings.proxy_url } : {};
      const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS, ...proxyOpt });
      if (!update?.available) {
        await logUpdaterWarn(`install: re-check found no update after ${Math.round(performance.now() - t0)}ms, abort`);
        set({ updateStatus: "idle" });
        return;
      }
      await logUpdaterInfo(`install: download+install start version=${update.version} (download_timeout_ms=${UPDATE_DOWNLOAD_TIMEOUT_MS})`);
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
          void logUpdaterInfo(`install: download started content_length=${contentLength ?? "unknown"}`);
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
          set({ updateProgress: pct });
        } else if (event.event === "Finished") {
          set({ updateProgress: 100 });
          void logUpdaterInfo("install: download finished, invoking install/relaunch");
        }
      }, { timeout: UPDATE_DOWNLOAD_TIMEOUT_MS });
      await relaunch();
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      const errStr = formatUnknownErr(e);
      await logUpdaterError(`install failed after ${ms}ms: ${errStr}`);
      set({ updateStatus: "error", updateError: errStr });
    }
  },

  requestUpdateDetailsOpen: () => {
    set({ pendingUpdateDetailsOpen: true });
  },

  consumeUpdateDetailsOpen: () => {
    set({ pendingUpdateDetailsOpen: false });
  },

  init: async () => {
    const { refreshClipboardStatus, refreshSettings, refreshIntegrationStatus, refreshCliStatus } = get();
    const platform = await getRuntimePlatform();
    const metaPromise = invoke<AppMeta>("get_app_meta").catch(() => null);
    const tasks: Promise<unknown>[] = [
      refreshClipboardStatus(),
      refreshSettings(),
      metaPromise.then((m) => { if (m) set({ appMeta: m }); }),
    ];

    if (platform === "desktop") {
      tasks.push(refreshIntegrationStatus());
      tasks.push(refreshCliStatus());
    } else {
      set({ claudeEnabled: false, cursorEnabled: false });
      set({ cliStatus: null });
    }

    await Promise.all(tasks);
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

  initNotificationListeners();

  // Load all state on startup
  void useAppStoreInternal.getState().init();
  void getRuntimeInfo().then((runtimeInfo) => {
    if (supportsControlCopyPasteBridge(runtimeInfo)) {
      configureControlCopyPasteBridge(
        useAppStoreInternal.getState().settings?.control_copy_paste ?? false,
      );
    }
  });

  // Keep clipboard status in sync when backend toggles it (e.g. tray menu)
  void listen("tray-clipboard-update", () => {
    void useAppStoreInternal.getState().refreshClipboardStatus();
  });

  // System notification for saved clips. Keep this as a singleton listener so
  // App re-renders and page navigation cannot multiply macOS notifications.
  void listen<{ preview?: string }>("clipboard-saved", ({ payload }) => {
    void notify("GitMemo Clipboard", payload?.preview || "Clip saved", {
      target: { page: "clipboard" },
    });
  });

  // Apply theme to DOM
  const applyTheme = (theme: Theme) => {
    document.documentElement.setAttribute("data-theme", theme);
  };
  applyTheme(useAppStoreInternal.getState().theme);
  useAppStoreInternal.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme);
    if (
      supportsControlCopyPasteBridge(getRuntimeInfoSync()) &&
      s.settings?.control_copy_paste !== prev.settings?.control_copy_paste
    ) {
      configureControlCopyPasteBridge(s.settings?.control_copy_paste ?? false);
    }
  });
}
