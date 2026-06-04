import { useEffect, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Power, Clipboard, Sun, Moon, GitBranch, ExternalLink, Globe, FolderOpen, Globe2, Terminal, Code, Copy, MessageCircle, ScrollText, Download, RefreshCw, Wifi, RotateCcw } from "lucide-react";
import { useSync } from "../hooks/useSync";
import { useI18n, type Locale } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useTimedCopy } from "../hooks/useTimedCopy";
import type { Page } from "../App";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";
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
import { Switch } from "../components/base/Switch";
import {
  SettingsAbout,
  SettingsAboutMeta,
  SettingsAboutTitle,
  SettingsActionButton,
  SettingsCard,
  SettingsCardHeader,
  SettingsChangelogRelease,
  SettingsControlGroup,
  SettingsCopyValue,
  SettingsDiagnosticStep,
  SettingsDivider,
  SettingsEmptyModalText,
  SettingsFieldGroup,
  SettingsFooterButton,
  SettingsFooterDivider,
  SettingsFooterLinks,
  SettingsIconButton,
  SettingsIndentedFieldGroup,
  SettingsInfoPanel,
  SettingsInput,
  SettingsLogEntry,
  SettingsLogoImage,
  SettingsMobileSpacer,
  SettingsModal,
  SettingsModalBody,
  SettingsModalHeader,
  SettingsMonoPlaceholder,
  SettingsMonoValue,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsPanelActions,
  SettingsPanelText,
  SettingsPlainRow,
  SettingsRangeControl,
  SettingsRow,
  SettingsSegmentedButton,
  SettingsSegmentedGroup,
  SettingsStack,
  SettingsStatus,
  SettingsSubStack,
  SettingsUpdateProgress,
  SettingsUpdateStatus,
} from "../components/domain/settings/SettingsComponents";

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
  const { copied: copiedField, markCopied: markCopiedField } = useTimedCopy<"syncDir" | "gitRemote" | "cliCommand">();
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
      markCopiedField(field);
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
  const importFileSizeLimitKb = settings?.import_file_size_limit_kb ?? IMPORT_SIZE_LIMIT_DEFAULT_KB;
  const cliStatusLabel = !cliStatus
    ? t("settings.cliChecking")
    : cliStatus.installed
      ? cliStatus.version_matches
        ? t("settings.cliInstalled", cliStatus.version || cliStatus.recommended_version)
        : t("settings.cliVersionMismatch", cliStatus.version || "?", cliStatus.recommended_version)
      : t("settings.cliMissing");
  const languages: { id: Locale; label: string }[] = [
    { id: "en", label: "English" },
    { id: "zh", label: "中文" },
  ];

  return (
    <SettingsPageShell mobile={isMobile}>
      <SettingsPageHeader
        title={t("settings.title")}
        refreshIcon={RefreshCw}
        refreshTitle={t("common.refresh")}
        onRefresh={() => void handleRefresh()}
      />

      <SettingsCard>
        <SettingsStack>
          <SettingsRow
            icon={theme === "dark" ? Moon : Sun}
            title={t("settings.appearance")}
            description={t("settings.appearanceDesc", t(`settings.${theme}`))}
          >
            <Switch enabled={theme === "dark"} onToggle={toggleTheme} />
          </SettingsRow>

          <SettingsDivider />

          <SettingsRow icon={Globe} title={t("settings.language")} description={t("settings.languageDesc")}>
            <SettingsSegmentedGroup>
              {languages.map((lang) => (
                <SettingsSegmentedButton
                  key={lang.id}
                  active={locale === lang.id}
                  onClick={() => void changeLanguage(lang.id)}
                >
                  {lang.label}
                </SettingsSegmentedButton>
              ))}
            </SettingsSegmentedGroup>
          </SettingsRow>

          {isDesktop && (
            <>
              <SettingsDivider />
              <SettingsRow icon={Power} title={t("settings.launchAtLogin")} description={t("settings.launchAtLoginDesc")}>
                <Switch enabled={settings?.autostart ?? false} onToggle={toggleAutostart} />
              </SettingsRow>

              <SettingsDivider />
              <SettingsRow icon={Clipboard} title={t("settings.clipboardAutostart")} description={t("settings.clipboardAutostartDesc")}>
                <Switch enabled={settings?.clipboard_autostart ?? false} onToggle={toggleClipboardAutostart} />
              </SettingsRow>

              <SettingsDivider />
              <SettingsRow
                icon={Download}
                title={t("settings.importFileSizeLimit")}
                description={t(
                  "settings.importFileSizeLimitDesc",
                  formatImportSizeLimit(IMPORT_SIZE_LIMIT_MIN_KB),
                  formatImportSizeLimit(IMPORT_SIZE_LIMIT_MAX_KB),
                )}
              >
                <SettingsRangeControl
                  min={IMPORT_SIZE_LIMIT_MIN_KB}
                  max={IMPORT_SIZE_LIMIT_MAX_KB}
                  step={100}
                  value={importFileSizeLimitKb}
                  valueLabel={formatImportSizeLimit(importFileSizeLimitKb)}
                  onChange={(e) => void setImportFileSizeLimit(Number(e.target.value))}
                  disabled={savingImportLimit}
                  aria-label={t("settings.importFileSizeLimit")}
                />
              </SettingsRow>

              <SettingsDivider />
              <SettingsRow icon={Clipboard} title={t("settings.controlCopyPaste")} description={t("settings.controlCopyPasteDesc")}>
                <Switch enabled={settings?.control_copy_paste ?? false} onToggle={toggleControlCopyPaste} />
              </SettingsRow>
            </>
          )}

          <SettingsDivider />
          <SettingsSubStack>
            <SettingsRow icon={Wifi} title={t("settings.proxy")} description={t("settings.proxyDesc")}>
              <SettingsSegmentedGroup>
                {(["system", "none", "custom"] as const).map((mode) => (
                  <SettingsSegmentedButton
                    key={mode}
                    active={(settings?.proxy_mode ?? "system") === mode}
                    onClick={() => void setProxyMode(mode)}
                  >
                    {t(`settings.proxy${mode.charAt(0).toUpperCase() + mode.slice(1)}` as "settings.proxySystem" | "settings.proxyDirect" | "settings.proxyCustom")}
                  </SettingsSegmentedButton>
                ))}
              </SettingsSegmentedGroup>
            </SettingsRow>
            {(settings?.proxy_mode === "custom" || editingProxy) && (
              <SettingsIndentedFieldGroup>
                <SettingsInput
                  autoFocus
                  mono
                  width="proxy"
                  value={proxyUrlInput || settings?.proxy_url || ""}
                  onChange={(e) => setProxyUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveProxyUrl();
                    if (e.key === "Escape") { setEditingProxy(false); setProxyUrlInput(settings?.proxy_url ?? ""); }
                  }}
                  placeholder={t("settings.proxyUrlPlaceholder")}
                />
                <SettingsActionButton variant="primary" onClick={() => void saveProxyUrl()}>
                  {t("conversations.save")}
                </SettingsActionButton>
              </SettingsIndentedFieldGroup>
            )}
          </SettingsSubStack>

          {isDesktop && (
            <>
              <SettingsDivider />
              <SettingsSubStack>
                <SettingsRow
                  icon={Terminal}
                  title={t("settings.cliCapability")}
                  description={t("settings.cliCapabilityDesc")}
                  status={cliStatusLabel}
                  statusTone={cliStatus?.installed && cliStatus.version_matches ? "success" : cliStatus ? "warning" : "muted"}
                >
                  <SettingsControlGroup wrap>
                    <SettingsActionButton
                      icon={copiedField === "cliCommand" ? undefined : Copy}
                      variant="secondary"
                      onClick={() => void copyValue(CLI_INSTALL_COMMAND, "cliCommand")}
                    >
                      {copiedField === "cliCommand" ? t("common.copied") : t("settings.copyInstallCommand")}
                    </SettingsActionButton>
                    <SettingsIconButton icon={RefreshCw} onClick={() => void refreshCliStatus()} title={t("settings.detectCli")} />
                  </SettingsControlGroup>
                </SettingsRow>
                {cliStatus?.path ? <SettingsMonoValue max="full">{cliStatus.path}</SettingsMonoValue> : null}
              </SettingsSubStack>

              <SettingsDivider />
              <SettingsRow icon={Terminal} title={t("settings.claudeIntegration")} description={t("settings.claudeIntegrationDesc")}>
                <SettingsControlGroup>
                  {claudeEnabled && (
                    <SettingsActionButton
                      variant="secondary"
                      disabled={updatingClaudeSkills}
                      onClick={() => void updateClaudeSkills()}
                    >
                      {updatingClaudeSkills ? t("settings.checking") : t("settings.updateSkills")}
                    </SettingsActionButton>
                  )}
                  <Switch enabled={claudeEnabled} onToggle={toggleClaudeIntegration} />
                </SettingsControlGroup>
              </SettingsRow>

              <SettingsDivider />
              <SettingsRow icon={Code} title={t("settings.cursorIntegration")} description={t("settings.cursorIntegrationDesc")}>
                <SettingsControlGroup>
                  {cursorEnabled && (
                    <SettingsActionButton
                      variant="secondary"
                      disabled={updatingCursorSkills}
                      onClick={() => void updateCursorSkills()}
                    >
                      {updatingCursorSkills ? t("settings.checking") : t("settings.updateSkills")}
                    </SettingsActionButton>
                  )}
                  <Switch enabled={cursorEnabled} onToggle={toggleCursorIntegration} />
                </SettingsControlGroup>
              </SettingsRow>

              <SettingsDivider />
              <SettingsRow icon={FolderOpen} title={t("settings.localDirs")} description={t("settings.localDirsDesc")}>
                <SettingsActionButton variant="secondary" onClick={() => onNavigate?.("editor-home")}>
                  {t("settings.open")}
                </SettingsActionButton>
              </SettingsRow>
            </>
          )}

          <SettingsDivider />
          <SettingsRow icon={GitBranch} title={t("settings.syncBranch")} description={t("settings.syncBranchDesc")}>
            {editingBranch ? (
              <SettingsInput
                autoFocus
                mono
                width="branch"
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
                onBlur={() => void saveBranch()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveBranch();
                  if (e.key === "Escape") { setEditingBranch(false); setBranchInput(branch); }
                }}
              />
            ) : (
              <SettingsActionButton variant="secondary" onClick={() => setEditingBranch(true)}>
                {branch || "main"}
              </SettingsActionButton>
            )}
          </SettingsRow>

          <SettingsDivider />
          <SettingsRow icon={FolderOpen} title={t("settings.dataDir")} description={t("settings.dataDirDesc")}>
            {syncDir ? (
              <SettingsCopyValue
                displayValue={syncDir}
                copied={copiedField === "syncDir"}
                title={t("common.clickToCopy")}
                onClick={() => void copyValue(syncDir, "syncDir")}
              />
            ) : (
              <SettingsMonoPlaceholder>—</SettingsMonoPlaceholder>
            )}
          </SettingsRow>

          <SettingsDivider />
          <SettingsSubStack>
            <SettingsRow icon={Globe2} title={t("settings.remoteRepo")} description={t("settings.remoteRepoDesc")}>
              {editingRemote ? (
                <SettingsFieldGroup>
                  <SettingsInput
                    autoFocus
                    mono
                    width="remote"
                    value={remoteInput}
                    onChange={(e) => setRemoteInput(e.target.value)}
                    disabled={savingRemote}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveRemote();
                      if (e.key === "Escape" && !savingRemote) { setEditingRemote(false); setRemoteInput(gitRemote); }
                    }}
                    placeholder={isMobile ? "https://github.com/user/repo.git" : "git@github.com:user/repo.git"}
                  />
                  {isMobile && (
                    <>
                      <SettingsInput
                        type="password"
                        width="full"
                        value={remoteTokenInput}
                        onChange={(e) => setRemoteTokenInput(e.target.value)}
                        disabled={savingRemote}
                        placeholder={t("setup.mobileAccessToken")}
                      />
                      <SettingsInfoPanel>
                        <SettingsPanelText>{t("settings.remoteTokenHint")}</SettingsPanelText>
                        <SettingsPanelActions>
                          <SettingsActionButton
                            block
                            icon={ExternalLink}
                            variant="secondary"
                            onClick={() => void openUrl(accessTokenHelpUrl(remoteInput))}
                          >
                            {t("settings.createAccessTokenFor", accessTokenProvider(remoteInput || gitRemote))}
                          </SettingsActionButton>
                        </SettingsPanelActions>
                      </SettingsInfoPanel>
                    </>
                  )}
                  <SettingsActionButton variant="primary" disabled={savingRemote} onClick={() => void saveRemote()}>
                    {savingRemote ? t("settings.checking") : t("conversations.save")}
                  </SettingsActionButton>
                  <SettingsActionButton
                    variant="secondary"
                    tone="muted"
                    disabled={savingRemote}
                    onClick={() => { if (!savingRemote) { setEditingRemote(false); setRemoteInput(gitRemote); setRemoteTokenInput(""); } }}
                  >
                    {t("common.cancel")}
                  </SettingsActionButton>
                </SettingsFieldGroup>
              ) : gitRemote ? (
                <SettingsControlGroup wrap>
                  <SettingsCopyValue
                    displayValue={gitRemote}
                    copied={copiedField === "gitRemote"}
                    title={t("common.clickToCopy")}
                    max={isMobile ? "full" : "lg"}
                    onClick={() => void copyValue(gitRemote, "gitRemote")}
                  />
                  <SettingsActionButton
                    variant="secondary"
                    tone="muted"
                    onClick={() => { setRemoteInput(gitRemote); setRemoteTokenInput(""); setEditingRemote(true); }}
                  >
                    {t("conversations.edit")}
                  </SettingsActionButton>
                  <SettingsActionButton
                    variant="secondary"
                    tone="success"
                    disabled={testingRemote || diagnosingRemote}
                    onClick={() => void testRemoteSync()}
                  >
                    {testingRemote ? t("settings.checking") : t("settings.testSync")}
                  </SettingsActionButton>
                  {isMobile && (
                    <SettingsActionButton
                      variant="secondary"
                      disabled={testingRemote || diagnosingRemote}
                      onClick={() => void diagnoseRemoteSync()}
                    >
                      {diagnosingRemote ? t("settings.checking") : t("settings.mobileGitDiagnosticRun")}
                    </SettingsActionButton>
                  )}
                </SettingsControlGroup>
              ) : (
                <SettingsActionButton
                  variant="primary"
                  onClick={() => { setRemoteInput(""); setRemoteTokenInput(""); setEditingRemote(true); }}
                >
                  {t("settings.addRemote")}
                </SettingsActionButton>
              )}
            </SettingsRow>

            {isMobile && gitRemote && (
              <SettingsInfoPanel tone="muted">
                <SettingsCardHeader
                  title={t("settings.mobileRemoteStatus")}
                  actions={(
                    <SettingsActionButton
                      icon={ExternalLink}
                      variant="secondary"
                      onClick={() => void openUrl(accessTokenHelpUrl(gitRemote))}
                    >
                      {t("settings.createAccessTokenFor", accessTokenProvider(gitRemote))}
                    </SettingsActionButton>
                  )}
                >
                  <SettingsStatus tone={gitStatus && mobileRemoteStatus?.color === "var(--green)" ? "success" : "warning"}>
                    {mobileRemoteStatus?.text ?? t("settings.mobileRemoteStatusUnknown")}
                  </SettingsStatus>
                </SettingsCardHeader>
                <SettingsPanelText>{t("settings.mobileRemoteSummary")}</SettingsPanelText>
              </SettingsInfoPanel>
            )}

            {isMobile && mobileGitDiagnostic && (
              <SettingsInfoPanel>
                <SettingsCardHeader title={t("settings.mobileGitDiagnostic")} />
                {mobileDiagnosticSummary && (
                  <SettingsInfoPanel tone={mobileDiagnosticSummary.ok ? "success" : "danger"}>
                    <SettingsStatus tone={mobileDiagnosticSummary.ok ? "success" : "danger"}>
                      {mobileDiagnosticSummary.title}
                    </SettingsStatus>
                    <SettingsPanelText>{mobileDiagnosticSummary.detail}</SettingsPanelText>
                  </SettingsInfoPanel>
                )}
                <SettingsSubStack>
                  {visibleMobileDiagnosticSteps(mobileGitDiagnostic).map((step, index) => (
                    <SettingsDiagnosticStep
                      key={`${step.name}-${index}`}
                      name={step.name}
                      message={step.message}
                      ok={step.ok}
                    />
                  ))}
                </SettingsSubStack>
              </SettingsInfoPanel>
            )}

            {isDesktop && editingRemote && (
              <SettingsInfoPanel>
                <SettingsPanelText>{t("settings.remoteGuide")}</SettingsPanelText>
                <SettingsPanelActions>
                  <SettingsActionButton icon={ExternalLink} variant="ghost" onClick={() => void openUrl("https://github.com/new")}>
                    {t("settings.createRepo")}
                  </SettingsActionButton>
                  <SettingsActionButton
                    icon={Copy}
                    variant="ghost"
                    tone="accent"
                    onClick={() => void invoke<string>("get_ssh_public_key").then(key => {
                      if (key) {
                        void writeText(key);
                        showToast(t("common.copied"));
                      } else {
                        showToast("No SSH key found", true);
                      }
                    }).catch(() => showToast("No SSH key found", true))}
                  >
                    {t("settings.copySshKey")}
                  </SettingsActionButton>
                </SettingsPanelActions>
              </SettingsInfoPanel>
            )}
          </SettingsSubStack>

          <SettingsDivider />
          <SettingsRow icon={ScrollText} title={t("settings.syncLogs")} description={t("settings.syncLogsDesc")}>
            <SettingsActionButton variant="secondary" onClick={() => void openSyncLogs()}>
              {t("settings.openSyncLogs")}
            </SettingsActionButton>
          </SettingsRow>
        </SettingsStack>
      </SettingsCard>

      {isDesktop && (
        <SettingsCard topSpacing>
          <SettingsStack>
            <SettingsCardHeader
              title={t("settings.shortcuts")}
              description={t("settings.shortcutsDesc")}
              actions={(
                <SettingsActionButton
                  icon={RotateCcw}
                  variant="ghost"
                  disabled={savingShortcut !== null}
                  onClick={resetAllShortcuts}
                >
                  {t("settings.resetShortcuts")}
                </SettingsActionButton>
              )}
            />
            <SettingsSubStack>
              {shortcutRows.map((row) => {
                const recording = recordingShortcut === row.id;
                const saving = savingShortcut === row.id || savingShortcut === "all";
                return (
                  <SettingsPlainRow
                    key={row.id}
                    title={t(row.labelKey)}
                    description={t(row.descKey)}
                  >
                    <SettingsControlGroup>
                      <SettingsActionButton
                        data-shortcut-recorder="true"
                        variant={recording ? "secondary" : "ghost"}
                        onClick={() => setRecordingShortcut(row.id)}
                        onKeyDown={(e) => captureShortcut(row.id, e)}
                        disabled={saving}
                      >
                        {recording ? t("settings.pressShortcut") : formatShortcut(shortcutDrafts[row.id])}
                      </SettingsActionButton>
                      <SettingsIconButton
                        icon={RotateCcw}
                        onClick={() => resetShortcut(row.id)}
                        disabled={saving}
                        title={t("settings.resetShortcut")}
                      />
                    </SettingsControlGroup>
                  </SettingsPlainRow>
                );
              })}
            </SettingsSubStack>
          </SettingsStack>
        </SettingsCard>
      )}

      <SettingsAbout>
        <SettingsLogoImage src="/logo.png" alt="GitMemo" {...logoSaveProps} />
        <SettingsAboutTitle>{isMobile ? "GitMemo Mobile" : "GitMemo Desktop"}</SettingsAboutTitle>
        <SettingsAboutMeta>
          v{appMeta?.version ?? "—"} · {appMeta?.release_time || t("settings.releaseTimeUnknown")}
        </SettingsAboutMeta>

        {isDesktop && (
          <SettingsUpdateStatus>
            {updateStatus === "idle" && (
              <SettingsActionButton icon={Download} variant="secondary" tone="muted" onClick={() => void checkForUpdates()}>
                {t("settings.checkUpdate")}
              </SettingsActionButton>
            )}
            {updateStatus === "checking" && <SettingsStatus tone="muted">{t("settings.checking")}</SettingsStatus>}
            {updateStatus === "available" && (
              <>
                <SettingsStatus tone="success">{t("settings.updateAvailable", updateVersion ?? "")}</SettingsStatus>
                <SettingsActionButton variant="primary" onClick={() => void installUpdate()}>
                  {t("settings.installUpdate")}
                </SettingsActionButton>
              </>
            )}
            {updateStatus === "downloading" && (
              <SettingsUpdateProgress label={t("settings.downloading")} value={updateProgress} />
            )}
            {updateStatus === "error" && (
              <>
                <SettingsStatus tone="danger">{updateError || t("settings.updateError")}</SettingsStatus>
                <SettingsActionButton variant="secondary" tone="muted" onClick={() => void checkForUpdates()}>
                  {t("settings.checkUpdate")}
                </SettingsActionButton>
              </>
            )}
            {updateStatus === "upToDate" && <SettingsStatus tone="success">{t("settings.upToDate")}</SettingsStatus>}
          </SettingsUpdateStatus>
        )}

        <SettingsFooterLinks>
          <SettingsFooterButton
            icon={ExternalLink}
            tone="accent"
            onClick={() => void openUrl("https://github.com/sahadev/gitmemo")}
          >
            GitHub
          </SettingsFooterButton>
          <SettingsFooterDivider />
          <SettingsFooterButton
            icon={MessageCircle}
            onClick={() => void openUrl("https://github.com/sahadev/GitMemo/issues/new?labels=feedback&title=Feedback%3A+")}
          >
            {t("settings.sendFeedback")}
          </SettingsFooterButton>
          <SettingsFooterDivider />
          <SettingsFooterButton icon={ScrollText} onClick={openChangelog}>
            {t("settings.changelog")}
          </SettingsFooterButton>
        </SettingsFooterLinks>
      </SettingsAbout>

      {isMobile && <SettingsMobileSpacer />}

      {showSyncLogs && (
        <SettingsModal onBackdropClick={() => setShowSyncLogs(false)} width="lg">
          <SettingsModalHeader icon={ScrollText} title={t("settings.syncLogs")} onClose={() => setShowSyncLogs(false)}>
            <SettingsActionButton variant="ghost" disabled={loadingSyncLogs} onClick={() => void loadSyncLogs()}>
              {t("common.refresh")}
            </SettingsActionButton>
            <SettingsActionButton
              variant="ghost"
              tone="danger"
              disabled={clearingSyncLogs || syncLogs.length === 0}
              onClick={() => void clearSyncLogs()}
            >
              {t("settings.clearSyncLogs")}
            </SettingsActionButton>
          </SettingsModalHeader>
          <SettingsModalBody>
            {loadingSyncLogs ? (
              <SettingsEmptyModalText>{t("common.loading")}</SettingsEmptyModalText>
            ) : syncLogs.length === 0 ? (
              <SettingsEmptyModalText>{t("settings.syncLogsEmpty")}</SettingsEmptyModalText>
            ) : (
              <SettingsSubStack>
                {syncLogs.map((entry) => (
                  <SettingsLogEntry key={entry.filename} filename={entry.filename} content={entry.content} />
                ))}
              </SettingsSubStack>
            )}
          </SettingsModalBody>
        </SettingsModal>
      )}

      {showChangelog && (
        <SettingsModal onBackdropClick={() => setShowChangelog(false)}>
          <SettingsModalHeader
            icon={ScrollText}
            title={t("settings.changelog") || "Changelog"}
            onClose={() => setShowChangelog(false)}
          />
          <SettingsModalBody>
            {changelog.length === 0 ? (
              <SettingsEmptyModalText>{t("settings.noChangelog") || "No changelog available"}</SettingsEmptyModalText>
            ) : (
              changelog.map((release, index) => (
                <SettingsChangelogRelease
                  key={release.version}
                  version={`v${release.version}`}
                  date={release.date}
                  latest={index === 0}
                  changes={release.changes}
                />
              ))
            )}
          </SettingsModalBody>
        </SettingsModal>
      )}
    </SettingsPageShell>
  );
}
