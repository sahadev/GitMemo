import { useEffect, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Power, Clipboard, Sun, Moon, GitBranch, ExternalLink, Globe, FolderOpen, Globe2, Terminal, Code, Copy, Check, MessageCircle, ScrollText, X, Download, RefreshCw, Wifi, RotateCcw } from "lucide-react";
import { useSync } from "../hooks/useSync";
import { useI18n, type Locale } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import type { Page } from "../App";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";
import { MOBILE_BOTTOM_NAV_HEIGHT } from "../utils/mobileLayout";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  findShortcutConflict,
  formatShortcut,
  normalizeShortcut,
  shortcutFromKeyboardEvent,
  withDefaultShortcuts,
  type KeyboardShortcuts,
  type ShortcutId,
} from "../utils/shortcuts";
import { CLI_INSTALL_COMMAND } from "../utils/cliInstall";

const IMPORT_SIZE_LIMIT_MIN_KB = 500;
const IMPORT_SIZE_LIMIT_MAX_KB = 20 * 1024;
const IMPORT_SIZE_LIMIT_DEFAULT_KB = 2 * 1024;

const shortcutRows: { id: ShortcutId; labelKey: string; descKey: string }[] = [
  { id: "global_search", labelKey: "settings.shortcutGlobalSearchLabel", descKey: "settings.shortcutGlobalSearchDesc" },
  { id: "app_search", labelKey: "settings.shortcutAppSearchLabel", descKey: "settings.shortcutAppSearchDesc" },
  { id: "quick_note", labelKey: "settings.shortcutQuickNoteLabel", descKey: "settings.shortcutQuickNoteDesc" },
  { id: "find_in_document", labelKey: "settings.shortcutFindLabel", descKey: "settings.shortcutFindDesc" },
  { id: "edit_selected", labelKey: "settings.shortcutEditLabel", descKey: "settings.shortcutEditDesc" },
  { id: "delete_selected", labelKey: "settings.shortcutDeleteLabel", descKey: "settings.shortcutDeleteDesc" },
];

interface MobileGitSpikeResult {
  success: boolean;
  repo_path: string;
  note_path: string | null;
  commit_id: string | null;
  ahead: number;
  behind: number;
  steps: { name: string; ok: boolean; message: string }[];
}

interface MobileGitDiagnosticStep {
  name: string;
  ok: boolean;
  message: string;
}

interface SyncLogEntry {
  filename: string;
  content: string;
}

function accessTokenHelpUrl(remoteUrl: string): string {
  const lower = remoteUrl.toLowerCase();
  if (lower.includes("gitee.com")) return "https://gitee.com/profile/personal_access_tokens";
  if (lower.includes("gitlab")) return "https://gitlab.com/-/user_settings/personal_access_tokens";
  if (lower.includes("bitbucket")) return "https://bitbucket.org/account/settings/app-passwords/";
  return "https://github.com/settings/personal-access-tokens/new";
}

function accessTokenProvider(remoteUrl: string): string {
  const lower = remoteUrl.toLowerCase();
  if (lower.includes("gitee.com")) return "Gitee";
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("gitlab")) return "GitLab";
  if (lower.includes("bitbucket")) return "Bitbucket";
  return "Git";
}

function summarizeMobileDiagnostic(
  steps: MobileGitDiagnosticStep[] | null,
  labels: { needsAttention: string; ready: string; defaultDetail: string },
): { ok: boolean; title: string; detail: string } | null {
  if (!steps) return null;
  const failed = steps.find((step) => !step.ok);
  if (failed) {
    return {
      ok: false,
      title: labels.needsAttention,
      detail: `${failed.name}: ${failed.message}`,
    };
  }
  const history = steps.find((step) => step.name === "history")?.message;
  const push = steps.find((step) => step.name === "push_auth")?.message;
  return {
    ok: true,
    title: labels.ready,
    detail: history || push || labels.defaultDetail,
  };
}

function visibleMobileDiagnosticSteps(steps: MobileGitDiagnosticStep[]): MobileGitDiagnosticStep[] {
  const important = new Set([
    "config",
    "origin",
    "fetch",
    "repo_state",
    "head",
    "local_head",
    "remote_head",
    "worktree",
    "history",
    "merge_preview",
    "push_auth",
    "tls_fallback",
  ]);
  return steps.filter((step) => !step.ok || important.has(step.name));
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="gm-switch"
      data-enabled={enabled ? "true" : "false"}
    >
      <div className="gm-switch-thumb" />
    </button>
  );
}

function formatImportSizeLimit(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export default function SettingsPage({ onNavigate }: { onNavigate?: (page: Page) => void } = {}) {
  const { t, locale, setLocale } = useI18n();
  const { showToast } = useToast();
  const { isMobile, isDesktop } = usePlatformFlags();
  const logoSaveProps = useLongPressImageSave({ src: "/logo.png", fileName: "gitmemo-logo.png" });
  const { gitStatus, refreshGitStatus } = useSync();
  const {
    settings, refreshSettings,
    claudeEnabled, cursorEnabled, refreshIntegrationStatus,
    cliStatus, refreshCliStatus,
    theme, toggleTheme,
    appMeta,
    updateStatus, updateVersion, updateProgress, updateError,
    checkForUpdates, installUpdate,
  } = useAppStore();
  const [branch, setBranch] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [editingBranch, setEditingBranch] = useState(false);
  const syncDir = gitStatus?.sync_dir ?? "";
  const gitRemote = gitStatus?.git_remote ?? "";
  const [copiedField, setCopiedField] = useState<"syncDir" | "gitRemote" | "cliCommand" | null>(null);
  const [editingRemote, setEditingRemote] = useState(false);
  const [remoteInput, setRemoteInput] = useState("");
  const [remoteTokenInput, setRemoteTokenInput] = useState("");
  const [savingRemote, setSavingRemote] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<{ version: string; date: string; changes: string[] }[]>([]);
  const [showSyncLogs, setShowSyncLogs] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loadingSyncLogs, setLoadingSyncLogs] = useState(false);
  const [clearingSyncLogs, setClearingSyncLogs] = useState(false);
  const [proxyUrlInput, setProxyUrlInput] = useState("");
  const [editingProxy, setEditingProxy] = useState(false);
  const [updatingClaudeSkills, setUpdatingClaudeSkills] = useState(false);
  const [updatingCursorSkills, setUpdatingCursorSkills] = useState(false);
  const [testingRemote, setTestingRemote] = useState(false);
  const [diagnosingRemote, setDiagnosingRemote] = useState(false);
  const [mobileGitDiagnostic, setMobileGitDiagnostic] = useState<MobileGitDiagnosticStep[] | null>(null);
  const [shortcutDrafts, setShortcutDrafts] = useState<KeyboardShortcuts>(() => withDefaultShortcuts());
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutId | null>(null);
  const [savingShortcut, setSavingShortcut] = useState<ShortcutId | "all" | null>(null);
  const [mobileGitRemote, setMobileGitRemote] = useState("");
  const [mobileGitBranch, setMobileGitBranch] = useState("main");
  const [mobileGitToken, setMobileGitToken] = useState("");
  const [mobileGitNote, setMobileGitNote] = useState("Android Git sync spike note");
  const [mobileGitReset, setMobileGitReset] = useState(false);
  const [mobileGitRunning, setMobileGitRunning] = useState(false);
  const [mobileGitResult, setMobileGitResult] = useState<MobileGitSpikeResult | null>(null);
  const [savingImportLimit, setSavingImportLimit] = useState(false);

  useEffect(() => {
    invoke<string>("get_branch").then((b) => { setBranch(b); setBranchInput(b); }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!editingRemote) setRemoteInput(gitRemote);
  }, [gitRemote, editingRemote]);

  useEffect(() => {
    setShortcutDrafts(withDefaultShortcuts(settings?.shortcuts));
  }, [settings?.shortcuts]);

  const openChangelog = async () => {
    try {
      const res = await fetch("/changelog.json");
      if (res.ok) setChangelog(await res.json());
    } catch { /* ignore */ }
    setShowChangelog(true);
  };

  const loadSyncLogs = async () => {
    setLoadingSyncLogs(true);
    try {
      setSyncLogs(await invoke<SyncLogEntry[]>("get_sync_logs"));
    } catch (e) {
      showToast(`${t("settings.syncLogsLoadFailed")}: ${e}`, true);
    } finally {
      setLoadingSyncLogs(false);
    }
  };

  const openSyncLogs = async () => {
    setShowSyncLogs(true);
    await loadSyncLogs();
  };

  const clearSyncLogs = async () => {
    setClearingSyncLogs(true);
    try {
      await invoke<string>("clear_sync_logs");
      setSyncLogs([]);
      showToast(t("settings.syncLogsCleared"));
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setClearingSyncLogs(false);
    }
  };

  const toggleAutostart = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_autostart", { enabled: !settings.autostart });
      refreshSettings();
    } catch (e) { console.error(e); }
  };

  const toggleClipboardAutostart = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_clipboard_autostart", { enabled: !settings.clipboard_autostart });
      refreshSettings();
    } catch (e) { console.error(e); }
  };

  const toggleControlCopyPaste = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_control_copy_paste", { enabled: !settings.control_copy_paste });
      refreshSettings();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const setImportFileSizeLimit = async (kb: number) => {
    const nextKb = Math.max(IMPORT_SIZE_LIMIT_MIN_KB, Math.min(IMPORT_SIZE_LIMIT_MAX_KB, Math.round(kb)));
    setSavingImportLimit(true);
    try {
      await invoke<string>("set_import_file_size_limit_kb", { kb: nextKb });
      await refreshSettings();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSavingImportLimit(false);
    }
  };

  const setProxyMode = async (mode: "system" | "none" | "custom") => {
    const url = mode === "custom" ? (proxyUrlInput || settings?.proxy_url || "") : "";
    try {
      await invoke<string>("set_proxy", { mode, url });
      refreshSettings();
      setEditingProxy(mode === "custom");
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const saveProxyUrl = async () => {
    const trimmed = proxyUrlInput.trim();
    try {
      await invoke<string>("set_proxy", { mode: "custom", url: trimmed });
      refreshSettings();
      setEditingProxy(false);
      showToast(t("conversations.saved"));
    } catch (e) {
      showToast(`${e}`, true);
    }
  };

  const changeLanguage = async (nextLocale: Locale) => {
    setLocale(nextLocale);
    try {
      await invoke<string>("set_language", { lang: nextLocale });
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const toggleClaudeIntegration = async () => {
    try {
      if (claudeEnabled) {
        await invoke<string>("remove_claude_integration");
        showToast("Claude integration disabled");
      } else {
        await invoke<string>("setup_claude_integration", { lang: locale });
        showToast("Claude integration enabled");
      }
      refreshIntegrationStatus();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const toggleCursorIntegration = async () => {
    try {
      if (cursorEnabled) {
        await invoke<string>("remove_cursor_integration");
        showToast("Cursor integration disabled");
      } else {
        await invoke<string>("setup_cursor_integration", { lang: locale });
        showToast("Cursor integration enabled");
      }
      refreshIntegrationStatus();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const updateClaudeSkills = async () => {
    setUpdatingClaudeSkills(true);
    try {
      await invoke<string>("update_claude_skills", { lang: locale });
      showToast("Claude skills updated");
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setUpdatingClaudeSkills(false);
    }
  };

  const updateCursorSkills = async () => {
    setUpdatingCursorSkills(true);
    try {
      await invoke<string>("update_cursor_skills", { lang: locale });
      showToast("Cursor skills updated");
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setUpdatingCursorSkills(false);
    }
  };

  const saveBranch = async () => {
    const trimmed = branchInput.trim();
    if (!trimmed || trimmed === branch) {
      setEditingBranch(false);
      setBranchInput(branch);
      return;
    }
    try {
      const msg = await invoke<string>("set_branch", { name: trimmed });
      setBranch(trimmed);
      setEditingBranch(false);
      showToast(msg);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const saveRemote = async () => {
    const trimmed = remoteInput.trim();
    const hasNewMobileToken = isMobile && !!remoteTokenInput.trim();
    if (trimmed === gitRemote && !hasNewMobileToken) {
      setEditingRemote(false);
      setRemoteTokenInput("");
      return;
    }
    if (isMobile && trimmed && !remoteTokenInput.trim() && !gitRemote) {
      showToast(t("settings.remoteTokenRequired"), true);
      return;
    }
    setSavingRemote(true);
    try {
      await invoke<string>("set_remote", {
        url: trimmed,
        accessToken: isMobile ? (remoteTokenInput.trim() || null) : null,
      });
      await refreshGitStatus();
      setRemoteInput(trimmed);
      setRemoteTokenInput("");
      setEditingRemote(false);
      showToast(trimmed ? "Saved" : "Removed");
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSavingRemote(false);
    }
  };

  const testRemoteSync = async () => {
    if (testingRemote) return;
    setTestingRemote(true);
    try {
      const msg = await invoke<string>("test_remote_sync");
      showToast(msg);
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setTestingRemote(false);
    }
  };

  const diagnoseRemoteSync = async () => {
    if (diagnosingRemote) return;
    setDiagnosingRemote(true);
    setMobileGitDiagnostic(null);
    try {
      const steps = await invoke<MobileGitDiagnosticStep[]>("mobile_git_diagnose_saved_remote");
      setMobileGitDiagnostic(steps);
      const failed = steps.find((step) => !step.ok);
      showToast(failed ? `${failed.name}: ${failed.message}` : t("settings.mobileGitDiagnosticSuccess"), !!failed);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setDiagnosingRemote(false);
    }
  };

  const runMobileGitSpike = async () => {
    if (mobileGitRunning) return;
    const remoteUrl = mobileGitRemote.trim();
    const branch = mobileGitBranch.trim() || "main";
    const token = mobileGitToken.trim();
    if (!remoteUrl || !token) {
      showToast(t("settings.mobileGitSpikeMissingInput"), true);
      return;
    }
    setMobileGitRunning(true);
    setMobileGitResult(null);
    try {
      const result = await invoke<MobileGitSpikeResult>("mobile_git_spike_sync", {
        request: {
          remote_url: remoteUrl,
          branch,
          username: "x-access-token",
          token,
          note_content: mobileGitNote.trim() || "Android Git sync spike note",
          reset: mobileGitReset,
        },
      });
      setMobileGitResult(result);
      showToast(result.success ? t("settings.mobileGitSpikeSuccess") : t("settings.mobileGitSpikeFailed"), !result.success);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setMobileGitRunning(false);
    }
  };

  const copyValue = async (value: string, field: "syncDir" | "gitRemote" | "cliCommand") => {
    if (!value) return;
    try {
      await writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500);
      showToast(field === "cliCommand" ? t("settings.cliCommandCopied") : t("common.copied"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const handleRefresh = async () => {
    await Promise.allSettled([
      refreshGitStatus(),
      refreshSettings(),
      isDesktop ? refreshIntegrationStatus() : Promise.resolve(),
      isDesktop ? refreshCliStatus() : Promise.resolve(),
    ]);
  };

  const saveShortcuts = async (nextShortcuts: KeyboardShortcuts, changedId: ShortcutId | "all") => {
    const normalized = Object.fromEntries(
      Object.entries(nextShortcuts).map(([id, value]) => [id, normalizeShortcut(value) ?? value]),
    ) as KeyboardShortcuts;

    for (const row of shortcutRows) {
      if (!normalizeShortcut(normalized[row.id])) {
        showToast(t("settings.shortcutInvalid"), true);
        return;
      }
      const conflict = findShortcutConflict(normalized, row.id);
      if (conflict) {
        const conflictRow = shortcutRows.find((r) => r.id === conflict);
        showToast(t("settings.shortcutConflict", t(row.labelKey), conflictRow ? t(conflictRow.labelKey) : conflict), true);
        return;
      }
    }

    setSavingShortcut(changedId);
    try {
      await invoke<string>("set_shortcuts", { shortcuts: normalized });
      setShortcutDrafts(normalized);
      await refreshSettings();
      showToast(t("conversations.saved"));
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setSavingShortcut(null);
      setRecordingShortcut(null);
    }
  };

  const captureShortcut = (id: ShortcutId, e: KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecordingShortcut(null);
      return;
    }

    const captured = shortcutFromKeyboardEvent(e.nativeEvent);
    const normalized = captured ? normalizeShortcut(captured) : null;
    if (!normalized) return;

    void saveShortcuts({ ...shortcutDrafts, [id]: normalized }, id);
  };

  const resetShortcut = (id: ShortcutId) => {
    void saveShortcuts({ ...shortcutDrafts, [id]: DEFAULT_KEYBOARD_SHORTCUTS[id] }, id);
  };

  const resetAllShortcuts = () => {
    void saveShortcuts(DEFAULT_KEYBOARD_SHORTCUTS, "all");
  };

  const cardStyle = {
    background: "color-mix(in srgb, var(--bg-card) 94%, var(--bg) 6%)",
    border: "1px solid var(--border)",
    borderRadius: "var(--gm-radius-md)",
    padding: isMobile ? "var(--gm-card-pad-y) var(--gm-card-pad-mobile)" : "var(--gm-section-gap-lg) var(--gm-space-12)",
  };

  const rowStyle = {
    display: "flex" as const,
    alignItems: isMobile ? "flex-start" as const : "center" as const,
    justifyContent: "space-between" as const,
    gap: isMobile ? "var(--gm-nav-item-gap)" : "var(--gm-card-header-gap)",
    flexDirection: isMobile ? "column" as const : "row" as const,
  };
  const segmentedButtonPadding = isMobile
    ? "var(--gm-control-pad-y-lg) var(--gm-control-pad-x-lg)"
    : "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)";
  const compactButtonPadding = isMobile
    ? "var(--gm-control-pad-y-lg) var(--gm-control-pad-x)"
    : "var(--gm-control-pad-y) var(--gm-row-pad-x)";
  const mobileFieldStyle = {
    padding: isMobile
      ? "var(--gm-row-pad-y-comfort) var(--gm-control-pad-x-lg)"
      : "var(--gm-control-pad-y) var(--gm-row-pad-x)",
    borderRadius: "var(--gm-radius-md)",
    fontSize: isMobile ? "var(--gm-font-sm)" : "var(--gm-font-xs)",
  };
  const mobileRemoteStatus = isMobile && gitRemote ? (() => {
    if (!gitStatus) {
      return { text: t("settings.mobileRemoteStatusUnknown"), color: "var(--text-secondary)" };
    }
    if (gitStatus.unpushed > 0 && gitStatus.behind > 0) {
      return {
        text: t("dashboard.diverged", String(gitStatus.unpushed), String(gitStatus.behind)),
        color: "var(--yellow)",
      };
    }
    if (gitStatus.behind > 0) {
      return { text: t("dashboard.behind", String(gitStatus.behind)), color: "var(--red)" };
    }
    if (gitStatus.unpushed > 0) {
      return { text: `${gitStatus.unpushed} ${t("dashboard.unpushed")}`, color: "var(--yellow)" };
    }
    return { text: t("dashboard.synced"), color: "var(--green)" };
  })() : null;
  const mobileDiagnosticSummary = summarizeMobileDiagnostic(mobileGitDiagnostic, {
    needsAttention: t("settings.mobileDiagnosticNeedsAttention"),
    ready: t("settings.mobileDiagnosticReady"),
    defaultDetail: t("settings.mobileDiagnosticDefaultDetail"),
  });
  const mobileBottomSpacer = `calc(${MOBILE_BOTTOM_NAV_HEIGHT + 24}px + env(safe-area-inset-bottom, 0px))`;
  const importFileSizeLimitKb = settings?.import_file_size_limit_kb ?? IMPORT_SIZE_LIMIT_DEFAULT_KB;
  const cliStatusLabel = !cliStatus
    ? t("settings.cliChecking")
    : cliStatus.installed
      ? cliStatus.version_matches
        ? t("settings.cliInstalled", cliStatus.version || cliStatus.recommended_version)
        : t("settings.cliVersionMismatch", cliStatus.version || "?", cliStatus.recommended_version)
      : t("settings.cliMissing");
  const cliStatusColor = !cliStatus
    ? "var(--text-secondary)"
    : cliStatus.installed && cliStatus.version_matches
      ? "var(--green)"
      : "var(--yellow)";

  const languages: { id: Locale; label: string }[] = [
    { id: "en", label: "English" },
    { id: "zh", label: "中文" },
  ];

  return (
    <div className="gm-page gm-page-scroll" style={{
      padding: isMobile
        ? "var(--gm-page-pad-mobile-y) var(--gm-page-pad-mobile-x) var(--gm-page-pad-mobile-y)"
        : "var(--gm-page-pad-y) var(--gm-page-pad-x) var(--gm-page-pad-bottom)",
      overflowY: "auto",
      height: "100%",
      width: "100%",
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      boxSizing: "border-box",
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
      scrollPaddingBottom: isMobile ? mobileBottomSpacer : undefined,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)", minHeight: "var(--gm-page-header-height)", marginBottom: "var(--gm-section-gap)" }}>
        <h1 className="gm-page-title" style={{ flex: 1 }}>{t("settings.title")}</h1>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          title={t("common.refresh")}
          className="gm-toolbar-button"
          style={{ cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        >
          <RefreshCw size="var(--gm-icon-xs)" />
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-section-gap)" }}>
          {/* Theme */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
              {theme === "dark" ? (
                <Moon size={16} style={{ color: "var(--text-secondary)" }} />
              ) : (
                <Sun size={16} style={{ color: "var(--text-secondary)" }} />
              )}
              <div>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.appearance")}</p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>
                  {t("settings.appearanceDesc", t(`settings.${theme}`))}
                </p>
              </div>
            </div>
            <Toggle enabled={theme === "dark"} onToggle={toggleTheme} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Language */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
              <Globe size={16} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.language")}</p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.languageDesc")}</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--gm-space-2)" }}>
              {languages.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => void changeLanguage(lang.id)}
                  style={{
                    padding: segmentedButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                    background: locale === lang.id ? "var(--accent)" : "var(--bg-hover)",
                    color: locale === lang.id ? "var(--gm-color-on-accent)" : "var(--text-secondary)",
                    border: locale === lang.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {isDesktop && (
            <>
              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Launch at login */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <Power size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.launchAtLogin")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.launchAtLoginDesc")}</p>
                  </div>
                </div>
                <Toggle enabled={settings?.autostart ?? false} onToggle={toggleAutostart} />
              </div>
            </>
          )}

          {isDesktop && (
            <>
              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Clipboard autostart */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <Clipboard size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.clipboardAutostart")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.clipboardAutostartDesc")}</p>
                  </div>
                </div>
                <Toggle enabled={settings?.clipboard_autostart ?? false} onToggle={toggleClipboardAutostart} />
              </div>
            </>
          )}

          {isDesktop && (
            <>
              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Import file size limit */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <Download size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.importFileSizeLimit")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>
                      {t(
                        "settings.importFileSizeLimitDesc",
                        formatImportSizeLimit(IMPORT_SIZE_LIMIT_MIN_KB),
                        formatImportSizeLimit(IMPORT_SIZE_LIMIT_MAX_KB),
                      )}
                    </p>
                  </div>
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--gm-nav-item-gap)",
                  width: isMobile ? "100%" : 280,
                }}>
                  <input
                    type="range"
                    min={IMPORT_SIZE_LIMIT_MIN_KB}
                    max={IMPORT_SIZE_LIMIT_MAX_KB}
                    step={100}
                    value={importFileSizeLimitKb}
                    onChange={(e) => void setImportFileSizeLimit(Number(e.target.value))}
                    disabled={savingImportLimit}
                    style={{ flex: 1, accentColor: "var(--accent)" }}
                    aria-label={t("settings.importFileSizeLimit")}
                  />
                  <span style={{
                    minWidth: 56,
                    textAlign: "right",
                    fontSize: "var(--gm-font-xs)",
                    color: savingImportLimit ? "var(--text-secondary)" : "var(--accent)",
                    fontWeight: 600,
                    fontFamily: "var(--gm-font-mono)",
                  }}>
                    {formatImportSizeLimit(importFileSizeLimitKb)}
                  </span>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Control copy/paste compatibility */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <Clipboard size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.controlCopyPaste")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.controlCopyPasteDesc")}</p>
                  </div>
                </div>
                <Toggle enabled={settings?.control_copy_paste ?? false} onToggle={toggleControlCopyPaste} />
              </div>
            </>
          )}

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Network proxy */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-icon-text-gap)" }}>
            <div style={rowStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                <Wifi size={16} style={{ color: "var(--text-secondary)" }} />
                <div>
                  <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.proxy")}</p>
                  <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.proxyDesc")}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--gm-space-2)" }}>
                {(["system", "none", "custom"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => void setProxyMode(mode)}
                    style={{
                      padding: segmentedButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                      background: (settings?.proxy_mode ?? "system") === mode ? "var(--accent)" : "var(--bg-hover)",
                      color: (settings?.proxy_mode ?? "system") === mode ? "var(--gm-color-on-accent)" : "var(--text-secondary)",
                      border: (settings?.proxy_mode ?? "system") === mode ? "1px solid var(--accent)" : "1px solid var(--border)",
                    }}
                  >
                    {t(`settings.proxy${mode.charAt(0).toUpperCase() + mode.slice(1)}` as "settings.proxySystem" | "settings.proxyDirect" | "settings.proxyCustom")}
                  </button>
                ))}
              </div>
            </div>
            {(settings?.proxy_mode === "custom" || editingProxy) && (
              <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: "var(--gm-control-gap)", paddingLeft: isMobile ? 0 : 25, flexDirection: isMobile ? "column" : "row" }}>
                <input
                  autoFocus
                  value={proxyUrlInput || settings?.proxy_url || ""}
                  onChange={(e) => setProxyUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveProxyUrl();
                    if (e.key === "Escape") { setEditingProxy(false); setProxyUrlInput(settings?.proxy_url ?? ""); }
                  }}
                  placeholder={t("settings.proxyUrlPlaceholder")}
                  style={{
                    flex: 1, maxWidth: isMobile ? "100%" : 320, ...mobileFieldStyle,
                    background: "var(--bg)", border: "1px solid var(--accent)", color: "var(--text)",
                    fontFamily: "var(--gm-font-mono)",
                  }}
                />
                <button
                  onClick={() => void saveProxyUrl()}
                  style={{
                    padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                    background: "var(--accent)", border: "none", color: "var(--gm-color-on-accent)", fontWeight: 600,
                  }}
                >
                  {t("conversations.save")}
                </button>
              </div>
            )}
          </div>

          {isDesktop && (
            <>
              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* CLI capability */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-icon-text-gap)" }}>
                <div style={rowStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)", minWidth: 0 }}>
                    <Terminal size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.cliCapability")}</p>
                      <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)", lineHeight: "var(--gm-leading-normal)" }}>
                        {t("settings.cliCapabilityDesc")}
                      </p>
                      <p style={{ fontSize: "var(--gm-font-xs)", color: cliStatusColor, marginTop: "var(--gm-space-2)", fontWeight: 600 }}>
                        {cliStatusLabel}
                      </p>
                      {cliStatus?.path && (
                        <p style={{
                          fontSize: "var(--gm-font-2xs)",
                          color: "var(--text-secondary)",
                          marginTop: "var(--gm-space-2)",
                          fontFamily: "var(--gm-font-mono)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: isMobile ? "100%" : 420,
                        }}>
                          {cliStatus.path}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: isMobile ? "flex-start" : "flex-end",
                    gap: "var(--gm-control-gap)",
                    flexWrap: "wrap",
                    flexShrink: 0,
                    maxWidth: "100%",
                  }}>
                    <button
                      type="button"
                      onClick={() => void copyValue(CLI_INSTALL_COMMAND, "cliCommand")}
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--gm-control-gap)",
                        padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                        background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {copiedField === "cliCommand" ? <Check size={12} /> : <Copy size={12} />}
                      {t("settings.copyInstallCommand")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshCliStatus()}
                      title={t("settings.detectCli")}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "var(--gm-control-height-xs)", height: "var(--gm-control-height-xs)", borderRadius: "var(--gm-radius-md)",
                        background: "transparent", border: "none", color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      <RefreshCw size="var(--gm-icon-2xs)" />
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Claude integration */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <Terminal size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.claudeIntegration")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.claudeIntegrationDesc")}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
                  {claudeEnabled && (
                    <button
                      type="button"
                      onClick={() => void updateClaudeSkills()}
                      disabled={updatingClaudeSkills}
                      style={{
                        padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)", cursor: updatingClaudeSkills ? "default" : "pointer",
                        background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                        opacity: updatingClaudeSkills ? 0.6 : 1,
                      }}
                    >
                      {updatingClaudeSkills ? t("settings.checking") : t("settings.updateSkills")}
                    </button>
                  )}
                  <Toggle enabled={claudeEnabled} onToggle={toggleClaudeIntegration} />
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Cursor integration */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <Code size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.cursorIntegration")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.cursorIntegrationDesc")}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
                  {cursorEnabled && (
                    <button
                      type="button"
                      onClick={() => void updateCursorSkills()}
                      disabled={updatingCursorSkills}
                      style={{
                        padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)", cursor: updatingCursorSkills ? "default" : "pointer",
                        background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                        opacity: updatingCursorSkills ? 0.6 : 1,
                      }}
                    >
                      {updatingCursorSkills ? t("settings.checking") : t("settings.updateSkills")}
                    </button>
                  )}
                  <Toggle enabled={cursorEnabled} onToggle={toggleCursorIntegration} />
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)" }} />

              {/* Local editor dirs */}
              <div style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
                  <FolderOpen size={16} style={{ color: "var(--text-secondary)" }} />
                  <div>
                    <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.localDirs")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.localDirsDesc")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.("editor-home")}
                  style={{
                    padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                    background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                  }}
                >
                  {t("settings.open")}
                </button>
              </div>
            </>
          )}

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Git branch */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
              <GitBranch size={16} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.syncBranch")}</p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.syncBranchDesc")}</p>
              </div>
            </div>
            {editingBranch ? (
              <input
                autoFocus
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
                onBlur={saveBranch}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveBranch(); if (e.key === "Escape") { setEditingBranch(false); setBranchInput(branch); } }}
                style={{
                  width: isMobile ? "100%" : 120, ...mobileFieldStyle,
                  background: "var(--bg)", border: "1px solid var(--accent)", color: "var(--text)",
                  fontFamily: "var(--gm-font-mono)",
                }}
              />
            ) : (
              <button
                onClick={() => setEditingBranch(true)}
                style={{
                  padding: segmentedButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                  background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                  fontFamily: "var(--gm-font-mono)",
                }}
              >
                {branch || "main"}
              </button>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Data directory */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)", flex: 1, minWidth: 0 }}>
              <FolderOpen size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.dataDir")}</p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.dataDirDesc")}</p>
              </div>
            </div>
            {syncDir ? (
              <button
                type="button"
                onClick={() => void copyValue(syncDir, "syncDir")}
                title={t("common.clickToCopy")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--gm-control-gap)",
                  maxWidth: 240,
                  padding: compactButtonPadding,
                  borderRadius: "var(--gm-radius-md)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {copiedField === "syncDir" ? <Check size={12} style={{ flexShrink: 0, color: "var(--green)" }} /> : <Copy size={12} style={{ flexShrink: 0 }} />}
                <span style={{
                  fontSize: "var(--gm-font-xs)",
                  fontFamily: "var(--gm-font-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }} title={syncDir}>
                  {syncDir}
                </span>
              </button>
            ) : (
              <span style={{
                fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", fontFamily: "var(--gm-font-mono)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200,
              }}>
                —
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Remote repo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-icon-text-gap)" }}>
            <div style={rowStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)", flex: 1, minWidth: 0 }}>
                <Globe2 size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.remoteRepo")}</p>
                  <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.remoteRepoDesc")}</p>
                </div>
              </div>
              {editingRemote ? (
                <div style={{
                  display: "flex",
                  alignItems: isMobile ? "stretch" : "center",
                  gap: "var(--gm-control-gap)",
                  flexDirection: isMobile ? "column" : "row",
                  width: isMobile ? "100%" : undefined,
                }}>
                  <input
                    autoFocus
                    value={remoteInput}
                    onChange={(e) => setRemoteInput(e.target.value)}
                    disabled={savingRemote}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveRemote();
                      if (e.key === "Escape" && !savingRemote) { setEditingRemote(false); setRemoteInput(gitRemote); }
                    }}
                    placeholder={isMobile ? "https://github.com/user/repo.git" : "git@github.com:user/repo.git"}
                    style={{
                      width: isMobile ? "100%" : 280, ...mobileFieldStyle,
                      background: "var(--bg)", border: "1px solid var(--accent)", color: "var(--text)",
                      fontFamily: "var(--gm-font-mono)",
                    }}
                  />
                  {isMobile && (
                    <>
                      <input
                        type="password"
                        value={remoteTokenInput}
                        onChange={(e) => setRemoteTokenInput(e.target.value)}
                        disabled={savingRemote}
                        placeholder={t("setup.mobileAccessToken")}
                        style={{
                          width: "100%", ...mobileFieldStyle,
                          background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                        }}
                      />
                      <div style={{
                        padding: "var(--gm-row-pad-y-comfort) var(--gm-control-pad-x-lg)",
                        borderRadius: "var(--gm-radius-md)",
                        border: "1px solid var(--border)",
                        background: "var(--bg-hover)",
                      }}>
                        <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-relaxed)" }}>
                          {t("settings.remoteTokenHint")}
                        </p>
                        <button
                          type="button"
                          onClick={() => void openUrl(accessTokenHelpUrl(remoteInput))}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--gm-control-gap)",
                            width: "100%", marginTop: "var(--gm-space-4)",
                            padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                            background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)",
                            fontWeight: 600,
                          }}
                        >
                          <ExternalLink size={12} /> {t("settings.createAccessTokenFor", accessTokenProvider(remoteInput || gitRemote))}
                        </button>
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => void saveRemote()}
                    disabled={savingRemote}
                    style={{
                      padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                      background: "var(--accent)", border: "none", color: "var(--gm-color-on-accent)", fontWeight: 600,
                      opacity: savingRemote ? 0.7 : 1,
                    }}
                  >
                    {savingRemote ? t("settings.checking") : t("conversations.save")}
                  </button>
                  <button
                    onClick={() => { if (!savingRemote) { setEditingRemote(false); setRemoteInput(gitRemote); setRemoteTokenInput(""); } }}
                    disabled={savingRemote}
                    style={{
                      padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                      background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                      opacity: savingRemote ? 0.6 : 1,
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : gitRemote ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-space-2)", flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => void copyValue(gitRemote, "gitRemote")}
                    title={t("common.clickToCopy")}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--gm-control-gap)",
                      maxWidth: isMobile ? "100%" : 280, padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)",
                      border: "1px solid var(--border)", background: "var(--bg)",
                      color: "var(--text-secondary)", cursor: "pointer",
                    }}
                  >
                    {copiedField === "gitRemote" ? <Check size={12} style={{ flexShrink: 0, color: "var(--green)" }} /> : <Copy size={12} style={{ flexShrink: 0 }} />}
                    <span style={{
                      fontSize: "var(--gm-font-xs)", fontFamily: "var(--gm-font-mono)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={gitRemote}>
                      {gitRemote}
                    </span>
                  </button>
                  <button
                    onClick={() => { setRemoteInput(gitRemote); setRemoteTokenInput(""); setEditingRemote(true); }}
                    style={{
                      padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                      background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                    }}
                  >
                    {t("conversations.edit")}
                  </button>
                  <button
                    onClick={() => void testRemoteSync()}
                    disabled={testingRemote || diagnosingRemote}
                    style={{
                      padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                      background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--green)",
                      opacity: testingRemote ? 0.7 : 1,
                    }}
                  >
                    {testingRemote ? t("settings.checking") : t("settings.testSync")}
                  </button>
                  {isMobile && (
                    <button
                      onClick={() => void diagnoseRemoteSync()}
                      disabled={testingRemote || diagnosingRemote}
                      style={{
                        padding: compactButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                        background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                        opacity: diagnosingRemote ? 0.7 : 1,
                      }}
                    >
                      {diagnosingRemote ? t("settings.checking") : t("settings.mobileGitDiagnosticRun")}
                    </button>
                  )}
                </div>
              ) : (
              <button
                onClick={() => { setRemoteInput(""); setRemoteTokenInput(""); setEditingRemote(true); }}
                style={{
                  padding: segmentedButtonPadding, borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                  background: "var(--accent)", border: "none", color: "var(--gm-color-on-accent)", fontWeight: 600,
                }}
              >
                {t("settings.addRemote")}
              </button>
            )}
            </div>
            {isMobile && gitRemote && (
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--gm-icon-text-gap)",
                padding: "var(--gm-row-pad-y-comfort) var(--gm-control-pad-x-lg)",
                borderRadius: "var(--gm-radius-lg)",
                border: "1px solid var(--border)",
                background: "var(--bg)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--gm-nav-item-gap)" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "var(--gm-font-xs)", fontWeight: 600 }}>{t("settings.mobileRemoteStatus")}</p>
                    <p style={{
                      marginTop: "var(--gm-space-1)",
                      fontSize: "var(--gm-font-xs)",
                      color: mobileRemoteStatus?.color ?? "var(--text-secondary)",
                      fontWeight: 600,
                    }}>
                      {mobileRemoteStatus?.text ?? t("settings.mobileRemoteStatusUnknown")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openUrl(accessTokenHelpUrl(gitRemote))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--gm-control-gap)",
                      padding: compactButtonPadding,
                      borderRadius: "var(--gm-radius-md)",
                      fontSize: "var(--gm-font-xs)",
                      cursor: "pointer",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      color: "var(--accent)",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    <ExternalLink size={12} /> {t("settings.createAccessTokenFor", accessTokenProvider(gitRemote))}
                  </button>
                </div>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-normal)" }}>
                  {t("settings.mobileRemoteSummary")}
                </p>
              </div>
            )}
            {isMobile && mobileGitDiagnostic && (
              <div style={{
                padding: "var(--gm-row-pad-y-comfort) var(--gm-control-pad-x-lg)",
                borderRadius: "var(--gm-radius-lg)",
                border: "1px solid var(--border)",
                background: "var(--bg-hover)",
              }}>
                <p style={{ fontSize: "var(--gm-font-xs)", fontWeight: 600, marginBottom: "var(--gm-space-4)" }}>{t("settings.mobileGitDiagnostic")}</p>
                {mobileDiagnosticSummary && (
                  <div style={{
                    padding: "var(--gm-row-pad-x) var(--gm-control-pad-x)",
                    marginBottom: "var(--gm-space-4)",
                    borderRadius: "var(--gm-radius-md)",
                    background: "var(--bg-card)",
                    border: `1px solid ${mobileDiagnosticSummary.ok ? "var(--gm-success-border)" : "var(--gm-danger-border)"}`,
                  }}>
                    <p style={{
                      fontSize: "var(--gm-font-xs)",
                      fontWeight: 700,
                      color: mobileDiagnosticSummary.ok ? "var(--green)" : "var(--red)",
                    }}>
                      {mobileDiagnosticSummary.title}
                    </p>
                    <p style={{ marginTop: "var(--gm-space-2)", fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-normal)", wordBreak: "break-word" }}>
                      {mobileDiagnosticSummary.detail}
                    </p>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-control-gap)" }}>
                  {visibleMobileDiagnosticSteps(mobileGitDiagnostic).map((step, index) => (
                    <div key={`${step.name}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: "var(--gm-icon-text-gap)" }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "var(--gm-radius-sm)",
                        background: step.ok ? "var(--green)" : "var(--red)",
                        marginTop: "var(--gm-space-3)",
                        flexShrink: 0,
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: "var(--gm-font-xs)", fontWeight: 600 }}>{step.name}</p>
                        <p style={{
                          fontSize: "var(--gm-font-xs)",
                          color: "var(--text-secondary)",
                          lineHeight: "var(--gm-leading-normal)",
                          wordBreak: "break-word",
                        }}>
                          {step.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* SSH guidance when editing */}
            {isDesktop && editingRemote && (
              <div style={{
                padding: "var(--gm-card-header-gap) var(--gm-section-gap)", borderRadius: "var(--gm-radius-lg)",
                background: "var(--bg-hover)", border: "1px solid var(--border)",
              }}>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: "var(--gm-leading-relaxed)", marginBottom: "var(--gm-space-4)" }}>
                  {t("settings.remoteGuide")}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--gm-control-gap)" }}>
                  <button
                    onClick={() => void openUrl("https://github.com/new")}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
                      padding: "var(--gm-control-pad-y) var(--gm-control-pad-x)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--text-secondary)", cursor: "pointer",
                    }}
                  >
                    <ExternalLink size={12} /> {t("settings.createRepo")}
                  </button>
                  <button
                    onClick={() => void invoke<string>("get_ssh_public_key").then(key => {
                      if (key) {
                        void writeText(key);
                        showToast(t("common.copied"));
                      } else {
                        showToast("No SSH key found", true);
                      }
                    }).catch(() => showToast("No SSH key found", true))}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
                      padding: "var(--gm-control-pad-y) var(--gm-control-pad-x)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--accent)", cursor: "pointer",
                    }}
                  >
                    <Copy size={12} /> {t("settings.copySshKey")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
              <ScrollText size={16} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{t("settings.syncLogs")}</p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>{t("settings.syncLogsDesc")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openSyncLogs()}
              style={{
                padding: segmentedButtonPadding,
                borderRadius: "var(--gm-radius-md)",
                fontSize: "var(--gm-font-xs)",
                cursor: "pointer",
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: "var(--accent)",
              }}
            >
              {t("settings.openSyncLogs")}
            </button>
          </div>
        </div>
      </div>

      {isDesktop && (
        <div style={{ ...cardStyle, marginTop: "var(--gm-section-gap-lg)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-nav-item-gap)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--gm-card-header-gap)" }}>
              <div>
                <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>{t("settings.shortcuts")}</p>
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-2)" }}>{t("settings.shortcutsDesc")}</p>
              </div>
              <button
                type="button"
                onClick={resetAllShortcuts}
                disabled={savingShortcut !== null}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
                  padding: "var(--gm-space-3) var(--gm-space-5)", borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-secondary)", cursor: savingShortcut ? "default" : "pointer",
                  opacity: savingShortcut ? 0.65 : 1,
                }}
              >
                <RotateCcw size={12} /> {t("settings.resetShortcuts")}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-icon-text-gap)" }}>
              {shortcutRows.map((row) => {
                const recording = recordingShortcut === row.id;
                const saving = savingShortcut === row.id || savingShortcut === "all";
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--gm-card-header-gap)",
                      padding: "var(--gm-row-pad-y-comfort) 0",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "var(--gm-font-xs)", fontWeight: 500 }}>{t(row.labelKey)}</p>
                      <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-2)" }}>{t(row.descKey)}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-control-gap)", flexShrink: 0 }}>
                      <button
                        type="button"
                        data-shortcut-recorder="true"
                        onClick={() => setRecordingShortcut(row.id)}
                        onKeyDown={(e) => captureShortcut(row.id, e)}
                        disabled={saving}
                        style={{
                          minWidth: 128,
                          padding: "var(--gm-control-pad-y) var(--gm-control-pad-x)",
                          borderRadius: "var(--gm-radius-md)",
                          border: `1px solid ${recording ? "var(--accent)" : "var(--border)"}`,
                          background: recording ? "var(--bg-hover)" : "var(--bg)",
                          color: recording ? "var(--accent)" : "var(--text)",
                          fontFamily: "var(--gm-font-mono)",
                          fontSize: "var(--gm-font-xs)",
                          cursor: saving ? "default" : "pointer",
                          opacity: saving ? 0.65 : 1,
                        }}
                      >
                        {recording ? t("settings.pressShortcut") : formatShortcut(shortcutDrafts[row.id])}
                      </button>
                      <button
                        type="button"
                        onClick={() => resetShortcut(row.id)}
                        disabled={saving}
                        title={t("settings.resetShortcut")}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: "var(--gm-control-height-xs)", height: "var(--gm-control-height-xs)", borderRadius: "var(--gm-radius-md)",
                          border: "none", background: "transparent",
                          color: "var(--text-secondary)", cursor: saving ? "default" : "pointer",
                          opacity: saving ? 0.65 : 1,
                        }}
                      >
                        <RotateCcw size="var(--gm-icon-2xs)" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* About */}
      <div style={{ marginTop: "var(--gm-section-gap-lg)", display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--gm-section-gap-lg) 0" }}>
        <img src="/logo.png" alt="GitMemo" {...logoSaveProps} style={{ width: "var(--gm-icon-hero)", height: "var(--gm-icon-hero)", borderRadius: "var(--gm-radius-md)", marginBottom: "var(--gm-nav-item-gap)", ...logoSaveProps.style }} />
        <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>{isMobile ? "GitMemo Mobile" : "GitMemo Desktop"}</p>
        <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-2)" }}>
          v{appMeta?.version ?? "—"} · {appMeta?.release_time || t("settings.releaseTimeUnknown")}
        </p>
        {/* Update status */}
        {isDesktop && <div style={{ marginTop: "var(--gm-nav-item-gap)", display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
          {updateStatus === "idle" && (
            <button
              onClick={() => void checkForUpdates()}
              style={{
                display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
                padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)",
              }}
            >
              <Download size={12} />
              {t("settings.checkUpdate")}
            </button>
          )}
          {updateStatus === "checking" && (
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("settings.checking")}</span>
          )}
          {updateStatus === "available" && (
            <>
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--green)", fontWeight: 500 }}>
                {t("settings.updateAvailable", updateVersion ?? "")}
              </span>
              <button
                onClick={() => void installUpdate()}
                style={{
                  padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                  background: "var(--accent)", border: "none", color: "var(--gm-color-on-accent)", fontWeight: 600,
                }}
              >
                {t("settings.installUpdate")}
              </button>
            </>
          )}
          {updateStatus === "downloading" && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", width: "100%" }}>
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{t("settings.downloading")}</span>
              <div style={{ flex: 1, height: 4, borderRadius: "var(--gm-radius-xs)", background: "var(--bg-hover)", overflow: "hidden", maxWidth: 120 }}>
                <div style={{ height: "100%", borderRadius: "var(--gm-radius-xs)", background: "var(--accent)", width: `${updateProgress}%`, transition: "width 0.2s" }} />
              </div>
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{updateProgress}%</span>
            </div>
          )}
          {updateStatus === "error" && (
            <>
              <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--red)", maxWidth: 260, wordBreak: "break-word" }}>
                {updateError || t("settings.updateError")}
              </span>
              <button
                onClick={() => void checkForUpdates()}
                style={{
                  padding: "var(--gm-control-pad-y) var(--gm-control-pad-x)", borderRadius: "var(--gm-radius-sm)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
                  background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                }}
              >
                {t("settings.checkUpdate")}
              </button>
            </>
          )}
          {updateStatus === "upToDate" && (
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--green)" }}>{t("settings.upToDate")}</span>
          )}
        </div>}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-card-header-gap)", marginTop: "var(--gm-card-header-gap)" }}>
          <button
            onClick={() => void openUrl("https://github.com/sahadev/gitmemo")}
            style={{
              display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
              fontSize: "var(--gm-font-xs)", color: "var(--accent)", background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <ExternalLink size={12} />
            GitHub
          </button>
          <span style={{ color: "var(--border)" }}>·</span>
          <button
            onClick={() => void openUrl("https://github.com/sahadev/GitMemo/issues/new?labels=feedback&title=Feedback%3A+")}
            style={{
              display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
              fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <MessageCircle size={12} />
            {t("settings.sendFeedback")}
          </button>
          <span style={{ color: "var(--border)" }}>·</span>
          <button
            onClick={openChangelog}
            style={{
              display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
              fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <ScrollText size={12} />
            {t("settings.changelog")}
          </button>
        </div>
      </div>
      {isMobile && <div aria-hidden="true" style={{ height: mobileBottomSpacer }} />}

      {showSyncLogs && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "var(--gm-overlay-dialog)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSyncLogs(false); }}
        >
          <div style={{
            width: "90%", maxWidth: 720, maxHeight: "78vh",
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "var(--gm-radius-lg)", display: "flex", flexDirection: "column",
            boxShadow: "var(--gm-shadow-modal)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "var(--gm-space-5)", padding: "var(--gm-space-7) var(--gm-space-8)", borderBottom: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)", minWidth: 0 }}>
                <ScrollText size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>{t("settings.syncLogs")}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-control-gap)", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => void loadSyncLogs()}
                  disabled={loadingSyncLogs}
                  style={{
                    padding: "var(--gm-space-3) var(--gm-space-5)", borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--text-secondary)", cursor: loadingSyncLogs ? "default" : "pointer",
                    opacity: loadingSyncLogs ? 0.65 : 1,
                  }}
                >
                  {t("common.refresh")}
                </button>
                <button
                  type="button"
                  onClick={() => void clearSyncLogs()}
                  disabled={clearingSyncLogs || syncLogs.length === 0}
                  style={{
                    padding: "var(--gm-space-3) var(--gm-space-5)", borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--red)", cursor: clearingSyncLogs || syncLogs.length === 0 ? "default" : "pointer",
                    opacity: clearingSyncLogs || syncLogs.length === 0 ? 0.55 : 1,
                  }}
                >
                  {t("settings.clearSyncLogs")}
                </button>
                <button onClick={() => setShowSyncLogs(false)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-secondary)", padding: "var(--gm-space-2)", borderRadius: "var(--gm-radius-sm)",
                }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--gm-space-6) var(--gm-space-8) var(--gm-space-8)" }}>
              {loadingSyncLogs ? (
                <p style={{ padding: "var(--gm-section-gap-lg)", textAlign: "center", color: "var(--text-secondary)", fontSize: "var(--gm-font-sm)" }}>
                  {t("common.loading")}
                </p>
              ) : syncLogs.length === 0 ? (
                <p style={{ padding: "var(--gm-section-gap-lg)", textAlign: "center", color: "var(--text-secondary)", fontSize: "var(--gm-font-sm)" }}>
                  {t("settings.syncLogsEmpty")}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-card-header-gap)" }}>
                  {syncLogs.map((entry) => (
                    <div
                      key={entry.filename}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--gm-radius-md)",
                        background: "var(--bg)",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{
                        padding: "var(--gm-row-pad-x) var(--gm-control-pad-x)",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "var(--gm-font-xs)",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--gm-font-mono)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {entry.filename}
                      </div>
                      <pre style={{
                        margin: 0,
                        padding: "var(--gm-row-pad-y-comfort)",
                        maxHeight: 260,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: "var(--text)",
                        fontSize: "var(--gm-font-xs)",
                        lineHeight: "var(--gm-leading-relaxed)",
                        fontFamily: "var(--gm-font-mono)",
                      }}>
                        {entry.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Changelog Modal */}
      {showChangelog && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "var(--gm-overlay-dialog)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowChangelog(false); }}
        >
          <div style={{
            width: "90%", maxWidth: 520, maxHeight: "70vh",
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "var(--gm-radius-lg)", display: "flex", flexDirection: "column",
            boxShadow: "var(--gm-shadow-modal)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "var(--gm-space-7) var(--gm-space-8)", borderBottom: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-icon-text-gap)" }}>
                <ScrollText size={16} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>{t("settings.changelog") || "Changelog"}</span>
              </div>
              <button onClick={() => setShowChangelog(false)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-secondary)", padding: "var(--gm-space-2)", borderRadius: "var(--gm-radius-sm)",
              }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--gm-space-4) var(--gm-space-8) var(--gm-space-8)" }}>
              {changelog.length === 0 ? (
                <p style={{ padding: "var(--gm-section-gap-lg)", textAlign: "center", color: "var(--text-secondary)", fontSize: "var(--gm-font-sm)" }}>
                  {t("settings.noChangelog") || "No changelog available"}
                </p>
              ) : (
                changelog.map((release, i) => (
                  <div key={release.version} style={{ marginTop: i === 0 ? 8 : 20 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--gm-icon-text-gap)", marginBottom: "var(--gm-space-4)" }}>
                      <span style={{
                        fontSize: "var(--gm-font-sm)", fontWeight: 600,
                        color: i === 0 ? "var(--accent)" : "var(--text)",
                      }}>
                        v{release.version}
                      </span>
                      <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{release.date}</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--gm-font-xs)", lineHeight: "var(--gm-leading-reading)", color: "var(--text-secondary)" }}>
                      {release.changes.map((change, j) => (
                        <li key={j}>{change}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
