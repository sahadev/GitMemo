import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Power, Clipboard, Sun, Moon, GitBranch, ExternalLink, Globe, FolderOpen, Globe2, Terminal, Code, Copy, MessageCircle, ScrollText, Download, RefreshCw, Wifi, RotateCcw, ChevronDown, ChevronRight, ShieldCheck, KeyRound } from "lucide-react";
import { useSync } from "../hooks/useSync";
import { useI18n, type Locale } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useAppStore } from "../hooks/useAppStore";
import { usePlatformFlags } from "../hooks/usePlatform";
import { useTimedCopy } from "../hooks/useTimedCopy";
import type { Page } from "../App";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";
import { isMacOs } from "../utils/platformLogic";
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
  SettingsRowInset,
  SettingsSegmentedButton,
  SettingsSegmentedGroup,
  SettingsStack,
  SettingsStatus,
  SettingsSubStack,
  SettingsUpdateProgress,
  SettingsUpdateStatus,
} from "../components/domain/settings/SettingsComponents";
import {
  IMPORT_SIZE_LIMIT_DEFAULT_KB,
  IMPORT_SIZE_LIMIT_MAX_KB,
  IMPORT_SIZE_LIMIT_MIN_KB,
  accessTokenHelpUrl,
  accessTokenProvider,
  canRunMobileGitSpike,
  canRequestDesktopUpdateCheck,
  canStartRemoteDiagnostic,
  canStartRemoteTest,
  clampImportSizeLimitKb,
  formatImportSizeLimit,
  formatSyncLogsForClipboard,
  getCopySuccessToastKey,
  getCurrentImportSizeLimitKb,
  getMobileRemoteStatusView,
  getProxyUrlForMode,
  getRemoteSaveDecision,
  getSettingsCliStatusView,
  hasMobileGitSpikeInputs,
  shouldSaveImportSizeLimitKb,
  shouldShowDesktopUpdateCheckAction,
  shouldShowCustomProxyInput,
  shouldShowMobileRemoteStatus,
  summarizeMobileDiagnostic,
  visibleMobileDiagnosticSteps,
  type CopyField,
  type MobileGitDiagnosticStep,
  type MobileGitSpikeResult,
  type ProxyMode,
  type SyncLogEntry,
} from "../components/domain/settings/settingsLogic";

const shortcutRows: { id: ShortcutId; labelKey: string; descKey: string }[] = [
  { id: "global_search", labelKey: "settings.shortcutGlobalSearchLabel", descKey: "settings.shortcutGlobalSearchDesc" },
  { id: "app_search", labelKey: "settings.shortcutAppSearchLabel", descKey: "settings.shortcutAppSearchDesc" },
  { id: "quick_note", labelKey: "settings.shortcutQuickNoteLabel", descKey: "settings.shortcutQuickNoteDesc" },
  { id: "find_in_document", labelKey: "settings.shortcutFindLabel", descKey: "settings.shortcutFindDesc" },
  { id: "edit_selected", labelKey: "settings.shortcutEditLabel", descKey: "settings.shortcutEditDesc" },
  { id: "delete_selected", labelKey: "settings.shortcutDeleteLabel", descKey: "settings.shortcutDeleteDesc" },
  { id: "refresh_selected", labelKey: "settings.shortcutRefreshLabel", descKey: "settings.shortcutRefreshDesc" },
  { id: "favorite_selected", labelKey: "settings.shortcutFavoriteLabel", descKey: "settings.shortcutFavoriteDesc" },
  { id: "toggle_split_preview", labelKey: "settings.shortcutSplitPreviewLabel", descKey: "settings.shortcutSplitPreviewDesc" },
  { id: "copy_selected", labelKey: "settings.shortcutCopyLabel", descKey: "settings.shortcutCopyDesc" },
  { id: "more_actions", labelKey: "settings.shortcutMoreActionsLabel", descKey: "settings.shortcutMoreActionsDesc" },
];


export default function SettingsPage({ onNavigate }: { onNavigate?: (page: Page) => void } = {}) {
  const { t, locale, setLocale } = useI18n();
  const { showToast } = useToast();
  const { isMobile, isDesktop, os } = usePlatformFlags();
  const showControlCopyPasteSetting = isDesktop && isMacOs(os);
  const logoSaveProps = useLongPressImageSave({ src: "/logo.png", fileName: "gitmemo-logo.png" });
  const { gitStatus, refreshGitStatus } = useSync();
  const {
    settings, refreshSettings,
    claudeEnabled, cursorEnabled, refreshIntegrationStatus,
    cliStatus, refreshCliStatus,
    theme, toggleTheme,
    appMeta,
    updateStatus, updateVersion, updateDate, updateBody, updateProgress, updateError,
    pendingUpdateDetailsOpen, consumeUpdateDetailsOpen,
    checkForUpdates, installUpdate,
  } = useAppStore();
  const [branch, setBranch] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [editingBranch, setEditingBranch] = useState(false);
  const syncDir = gitStatus?.sync_dir ?? "";
  const gitRemote = gitStatus?.git_remote ?? "";
  const { copied: copiedField, markCopied: markCopiedField } = useTimedCopy<CopyField>();
  const [editingRemote, setEditingRemote] = useState(false);
  const [remoteInput, setRemoteInput] = useState("");
  const [remoteTokenInput, setRemoteTokenInput] = useState("");
  const [savingRemote, setSavingRemote] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showUpdateDetails, setShowUpdateDetails] = useState(false);
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
  const [importFileSizeLimitDraftKb, setImportFileSizeLimitDraftKb] = useState(IMPORT_SIZE_LIMIT_DEFAULT_KB);
  const savingImportLimitValueRef = useRef<number | null>(null);
  const [shortcutsExpanded, setShortcutsExpanded] = useState(false);

  useEffect(() => {
    invoke<string>("get_branch").then((b) => { setBranch(b); setBranchInput(b); }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!editingRemote) setRemoteInput(gitRemote);
  }, [gitRemote, editingRemote]);

  useEffect(() => {
    setShortcutDrafts(withDefaultShortcuts(settings?.shortcuts));
  }, [settings?.shortcuts]);

  useEffect(() => {
    setImportFileSizeLimitDraftKb(settings?.import_file_size_limit_kb ?? IMPORT_SIZE_LIMIT_DEFAULT_KB);
  }, [settings?.import_file_size_limit_kb]);

  useEffect(() => {
    if (!pendingUpdateDetailsOpen) return;
    if (updateStatus === "available") {
      setShowUpdateDetails(true);
      setShowChangelog(true);
      consumeUpdateDetailsOpen();
    }
  }, [consumeUpdateDetailsOpen, pendingUpdateDetailsOpen, updateStatus]);

  const openChangelog = async () => {
    setShowUpdateDetails(false);
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

  const setSensitiveClipboardAction = async (action: "redact" | "plaintext") => {
    if (!settings || settings.sensitive_clipboard_action === action) return;
    try {
      await invoke<string>("set_sensitive_clipboard_action", { action });
      await refreshSettings();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const toggleVaultEnabled = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_vault_enabled", { enabled: !settings.vault_enabled });
      await refreshSettings();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const setImportFileSizeLimit = async (kb: number) => {
    const nextKb = clampImportSizeLimitKb(kb);
    const currentKb = getCurrentImportSizeLimitKb(settings?.import_file_size_limit_kb);
    if (!shouldSaveImportSizeLimitKb(nextKb, currentKb, savingImportLimitValueRef.current)) return;

    savingImportLimitValueRef.current = nextKb;
    setSavingImportLimit(true);
    try {
      await invoke<string>("set_import_file_size_limit_kb", { kb: nextKb });
      await refreshSettings();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      savingImportLimitValueRef.current = null;
      setSavingImportLimit(false);
    }
  };

  const setProxyMode = async (mode: ProxyMode) => {
    const url = getProxyUrlForMode(mode, proxyUrlInput, settings?.proxy_url);
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
    const decision = getRemoteSaveDecision({
      isMobile,
      remoteInput,
      remoteTokenInput,
      currentRemote: gitRemote,
    });

    if (decision.kind === "unchanged") {
      setEditingRemote(false);
      setRemoteTokenInput("");
      return;
    }
    if (decision.kind === "missing_mobile_token") {
      showToast(t("settings.remoteTokenRequired"), true);
      return;
    }

    setSavingRemote(true);
    try {
      await invoke<string>("set_remote", {
        url: decision.url,
        accessToken: decision.accessToken,
      });
      await refreshGitStatus();
      setRemoteInput(decision.url);
      setRemoteTokenInput("");
      setEditingRemote(false);
      showToast(decision.url ? "Saved" : "Removed");
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSavingRemote(false);
    }
  };

  const testRemoteSync = async () => {
    if (!canStartRemoteTest(testingRemote)) return;
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
    if (!canStartRemoteDiagnostic(diagnosingRemote)) return;
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
    if (!canRunMobileGitSpike(mobileGitRunning)) return;
    const remoteUrl = mobileGitRemote.trim();
    const branch = mobileGitBranch.trim() || "main";
    const token = mobileGitToken.trim();
    if (!hasMobileGitSpikeInputs(remoteUrl, token)) {
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

  const copyValue = async (value: string, field: CopyField) => {
    if (!value) return;
    try {
      await writeText(value);
      markCopiedField(field);
      showToast(t(getCopySuccessToastKey(field)));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const copySyncLogs = async () => {
    await copyValue(formatSyncLogsForClipboard(syncLogs), "syncLogs");
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

  const mobileRemoteStatus = shouldShowMobileRemoteStatus(isMobile, gitRemote)
    ? getMobileRemoteStatusView(gitStatus, t)
    : null;
  const mobileDiagnosticSummary = summarizeMobileDiagnostic(mobileGitDiagnostic, {
    needsAttention: t("settings.mobileDiagnosticNeedsAttention"),
    ready: t("settings.mobileDiagnosticReady"),
    defaultDetail: t("settings.mobileDiagnosticDefaultDetail"),
  });
  const displayedImportFileSizeLimitKb = importFileSizeLimitDraftKb;
  const cliStatusView = getSettingsCliStatusView(cliStatus, t);
  const updateNotes = updateBody
    ? updateBody.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const showDesktopUpdateDetails = updateStatus === "available";
  const canCheckDesktopUpdates = canRequestDesktopUpdateCheck(updateStatus);
  const showDesktopUpdateCheckAction = shouldShowDesktopUpdateCheckAction(updateStatus);
  const openDesktopVersionDetails = () => {
    if (showDesktopUpdateDetails) {
      setShowUpdateDetails(true);
      setShowChangelog(true);
      return;
    }
    void checkForUpdates();
  };
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
                icon={ShieldCheck}
                title={t("settings.sensitiveClipboard")}
                description={t("settings.sensitiveClipboardDesc")}
              >
                <SettingsSegmentedGroup>
                  {(["redact", "plaintext"] as const).map((action) => (
                    <SettingsSegmentedButton
                      key={action}
                      active={(settings?.sensitive_clipboard_action ?? "redact") === action}
                      onClick={() => void setSensitiveClipboardAction(action)}
                    >
                      {t(action === "redact" ? "settings.sensitiveClipboardRedact" : "settings.sensitiveClipboardPlaintext")}
                    </SettingsSegmentedButton>
                  ))}
                </SettingsSegmentedGroup>
              </SettingsRow>

              <SettingsDivider />
              <SettingsRow
                icon={KeyRound}
                title={t("settings.vaultMode")}
                description={t("settings.vaultModeDesc")}
              >
                <SettingsControlGroup>
                  <SettingsActionButton variant="secondary" onClick={() => onNavigate?.("vault")}>
                    {t("settings.openVault")}
                  </SettingsActionButton>
                  <Switch enabled={settings?.vault_enabled ?? false} onToggle={toggleVaultEnabled} />
                </SettingsControlGroup>
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
                  value={displayedImportFileSizeLimitKb}
                  valueLabel={formatImportSizeLimit(displayedImportFileSizeLimitKb)}
                  onChange={(e) => setImportFileSizeLimitDraftKb(Number(e.target.value))}
                  onPointerUp={(e) => void setImportFileSizeLimit(Number(e.currentTarget.value))}
                  onBlur={(e) => void setImportFileSizeLimit(Number(e.currentTarget.value))}
                  onKeyUp={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
                      void setImportFileSizeLimit(Number(e.currentTarget.value));
                    }
                  }}
                  aria-busy={savingImportLimit}
                  aria-label={t("settings.importFileSizeLimit")}
                />
              </SettingsRow>

              {showControlCopyPasteSetting && (
                <>
                  <SettingsDivider />
                  <SettingsRow icon={Clipboard} title={t("settings.controlCopyPaste")} description={t("settings.controlCopyPasteDesc")}>
                    <Switch enabled={settings?.control_copy_paste ?? false} onToggle={toggleControlCopyPaste} />
                  </SettingsRow>
                </>
              )}
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
            {shouldShowCustomProxyInput(settings?.proxy_mode, editingProxy) && (
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
                  status={cliStatusView.label}
                  statusTone={cliStatusView.tone}
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
                {cliStatus?.path ? (
                  <SettingsRowInset>
                    <SettingsMonoValue max="full">{cliStatus.path}</SettingsMonoValue>
                  </SettingsRowInset>
                ) : null}
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

            {mobileRemoteStatus && (
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
                  <SettingsStatus tone={mobileRemoteStatus.tone}>
                    {mobileRemoteStatus.text}
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
                <SettingsControlGroup>
                  <SettingsActionButton
                    icon={shortcutsExpanded ? ChevronDown : ChevronRight}
                    variant="ghost"
                    onClick={() => setShortcutsExpanded((expanded) => !expanded)}
                    aria-expanded={shortcutsExpanded}
                  >
                    {shortcutsExpanded ? t("settings.collapseShortcuts") : t("settings.expandShortcuts")}
                  </SettingsActionButton>
                  {shortcutsExpanded && (
                    <SettingsActionButton
                      icon={RotateCcw}
                      variant="ghost"
                      disabled={savingShortcut !== null}
                      onClick={resetAllShortcuts}
                    >
                      {t("settings.resetShortcuts")}
                    </SettingsActionButton>
                  )}
                </SettingsControlGroup>
              )}
            />
            {shortcutsExpanded && (
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
            )}
          </SettingsStack>
        </SettingsCard>
      )}

      <SettingsAbout>
        <SettingsLogoImage src="/logo.png" alt="GitMemo" {...logoSaveProps} />
        <SettingsAboutTitle>{isMobile ? "GitMemo Mobile" : "GitMemo Desktop"}</SettingsAboutTitle>
        <SettingsAboutMeta
          className="gm-settings-about-meta-clickable"
          role="button"
          tabIndex={0}
          onClick={openDesktopVersionDetails}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openDesktopVersionDetails();
            }
          }}
        >
          <span className="gm-settings-version-text">
            v{appMeta?.version ?? "—"} · {appMeta?.release_time || t("settings.releaseTimeUnknown")}
          </span>
          {showDesktopUpdateDetails && <span className="gm-version-update-dot" aria-label={t("settings.updateAvailableDot")} />}
        </SettingsAboutMeta>

        {isDesktop && (
          <SettingsUpdateStatus>
            {showDesktopUpdateCheckAction && updateStatus !== "idle" && (
              <SettingsStatus tone={updateStatus === "error" ? "danger" : "success"}>
                {updateStatus === "error" ? (updateError || t("settings.updateError")) : t("settings.upToDate")}
              </SettingsStatus>
            )}
            {showDesktopUpdateCheckAction && (
              <SettingsActionButton
                icon={updateStatus === "upToDate" ? RefreshCw : Download}
                variant="secondary"
                tone="muted"
                onClick={() => void checkForUpdates()}
                disabled={!canCheckDesktopUpdates}
              >
                {t("settings.checkUpdate")}
              </SettingsActionButton>
            )}
            {updateStatus === "checking" && <SettingsStatus tone="muted">{t("settings.checking")}</SettingsStatus>}
            {updateStatus === "available" && (
              <>
                <SettingsStatus tone="success">{t("settings.updateAvailable", updateVersion ?? "")}</SettingsStatus>
                <SettingsActionButton variant="secondary" tone="muted" onClick={() => { setShowUpdateDetails(true); setShowChangelog(true); }}>
                  {t("settings.viewUpdateDetails")}
                </SettingsActionButton>
                <SettingsActionButton variant="primary" onClick={() => void installUpdate()}>
                  {t("settings.installUpdate")}
                </SettingsActionButton>
              </>
            )}
            {updateStatus === "downloading" && (
              <SettingsUpdateProgress label={t("settings.downloading")} value={updateProgress} />
            )}
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
              icon={copiedField === "syncLogs" ? undefined : Copy}
              disabled={loadingSyncLogs || syncLogs.length === 0}
              onClick={() => void copySyncLogs()}
            >
              {copiedField === "syncLogs" ? t("common.copied") : t("settings.copySyncLogs")}
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
        <SettingsModal onBackdropClick={() => { setShowChangelog(false); setShowUpdateDetails(false); }}>
          <SettingsModalHeader
            icon={ScrollText}
            title={showUpdateDetails && showDesktopUpdateDetails ? t("settings.updateDetails") : (t("settings.changelog") || "Changelog")}
            onClose={() => { setShowChangelog(false); setShowUpdateDetails(false); }}
          >
            {showUpdateDetails && showDesktopUpdateDetails && (
              <SettingsActionButton variant="primary" onClick={() => void installUpdate()}>
                {t("settings.installUpdate")}
              </SettingsActionButton>
            )}
          </SettingsModalHeader>
          <SettingsModalBody>
            {showUpdateDetails && showDesktopUpdateDetails ? (
              <SettingsChangelogRelease
                version={`v${updateVersion ?? ""}`}
                date={updateDate ?? t("settings.releaseTimeUnknown")}
                latest
                changes={updateNotes.length > 0 ? updateNotes : [t("settings.updateNotesFallback")]}
              />
            ) : changelog.length === 0 ? (
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
