import type { CliStatus } from "../../../hooks/useAppStore";
import type { GitStatus } from "../../../hooks/useSync";
import {
  isCliInstalled,
  isCliStatusKnown,
  isCliVersionMatched,
} from "../dashboard/dashboardLogic";

export const IMPORT_SIZE_LIMIT_MIN_KB = 500;
export const IMPORT_SIZE_LIMIT_MAX_KB = 20 * 1024;
export const IMPORT_SIZE_LIMIT_DEFAULT_KB = 2 * 1024;

export type CopyField = "syncDir" | "gitRemote" | "cliCommand" | "syncLogs";
export type ProxyMode = "system" | "none" | "custom";

export interface MobileGitSpikeResult {
  success: boolean;
  repo_path: string;
  note_path: string | null;
  commit_id: string | null;
  ahead: number;
  behind: number;
  steps: MobileGitDiagnosticStep[];
}

export interface MobileGitDiagnosticStep {
  name: string;
  ok: boolean;
  message: string;
}

export interface SyncLogEntry {
  filename: string;
  content: string;
}

export interface MobileRemoteStatusView {
  text: string;
  tone: "success" | "warning";
}

export interface RemoteSaveDecision {
  kind: "unchanged" | "missing_mobile_token" | "save";
  url: string;
  accessToken: string | null;
}

type Translate = (key: string, ...args: (string | number)[]) => string;

const IMPORTANT_MOBILE_DIAGNOSTIC_STEPS = new Set([
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

export function formatSyncLogsForClipboard(logs: SyncLogEntry[]): string {
  return logs
    .map((entry) => `===== ${entry.filename} =====\n${entry.content}`)
    .join("\n\n")
    .trim();
}

export function accessTokenHelpUrl(remoteUrl: string): string {
  const lower = remoteUrl.toLowerCase();
  if (lower.includes("gitee.com")) return "https://gitee.com/profile/personal_access_tokens";
  if (lower.includes("gitlab")) return "https://gitlab.com/-/user_settings/personal_access_tokens";
  if (lower.includes("bitbucket")) return "https://bitbucket.org/account/settings/app-passwords/";
  return "https://github.com/settings/personal-access-tokens/new";
}

export function accessTokenProvider(remoteUrl: string): string {
  const lower = remoteUrl.toLowerCase();
  if (lower.includes("gitee.com")) return "Gitee";
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("gitlab")) return "GitLab";
  if (lower.includes("bitbucket")) return "Bitbucket";
  return "Git";
}

export function summarizeMobileDiagnostic(
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

export function visibleMobileDiagnosticSteps(steps: MobileGitDiagnosticStep[]): MobileGitDiagnosticStep[] {
  return steps.filter((step) => !step.ok || IMPORTANT_MOBILE_DIAGNOSTIC_STEPS.has(step.name));
}

export function formatImportSizeLimit(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function clampImportSizeLimitKb(kb: number) {
  return Math.max(IMPORT_SIZE_LIMIT_MIN_KB, Math.min(IMPORT_SIZE_LIMIT_MAX_KB, Math.round(kb)));
}

export function getCurrentImportSizeLimitKb(settingsLimitKb: number | null | undefined) {
  return settingsLimitKb ?? IMPORT_SIZE_LIMIT_DEFAULT_KB;
}

export function shouldSaveImportSizeLimitKb(nextKb: number, currentKb: number, savingKb: number | null) {
  return nextKb !== currentKb && savingKb !== nextKb;
}

export function getProxyUrlForMode(mode: ProxyMode, proxyUrlInput: string, currentProxyUrl: string | null | undefined) {
  return mode === "custom" ? (proxyUrlInput || currentProxyUrl || "") : "";
}

export function shouldShowCustomProxyInput(proxyMode: ProxyMode | null | undefined, editingProxy: boolean) {
  return proxyMode === "custom" || editingProxy;
}

export function getCopySuccessToastKey(field: CopyField) {
  if (field === "cliCommand") return "settings.cliCommandCopied";
  if (field === "syncLogs") return "settings.syncLogsCopied";
  return "common.copied";
}

export function getRemoteSaveDecision(input: {
  isMobile: boolean;
  remoteInput: string;
  remoteTokenInput: string;
  currentRemote: string;
}): RemoteSaveDecision {
  const url = input.remoteInput.trim();
  const token = input.remoteTokenInput.trim();
  const hasNewMobileToken = input.isMobile && Boolean(token);

  if (url === input.currentRemote && !hasNewMobileToken) {
    return { kind: "unchanged", url, accessToken: null };
  }

  if (input.isMobile && url && !token && !input.currentRemote) {
    return { kind: "missing_mobile_token", url, accessToken: null };
  }

  return {
    kind: "save",
    url,
    accessToken: input.isMobile ? (token || null) : null,
  };
}

export function canStartRemoteTest(testingRemote: boolean) {
  return !testingRemote;
}

export function canStartRemoteDiagnostic(diagnosingRemote: boolean) {
  return !diagnosingRemote;
}

export function canRunMobileGitSpike(running: boolean) {
  return !running;
}

export function hasMobileGitSpikeInputs(remoteUrl: string, token: string) {
  return Boolean(remoteUrl.trim()) && Boolean(token.trim());
}

export function getMobileRemoteStatusView(gitStatus: GitStatus | null, t: Translate): MobileRemoteStatusView {
  if (!gitStatus) {
    return { text: t("settings.mobileRemoteStatusUnknown"), tone: "warning" };
  }
  if (gitStatus.unpushed > 0 && gitStatus.behind > 0) {
    return {
      text: t("dashboard.diverged", String(gitStatus.unpushed), String(gitStatus.behind)),
      tone: "warning",
    };
  }
  if (gitStatus.behind > 0) {
    return { text: t("dashboard.behind", String(gitStatus.behind)), tone: "warning" };
  }
  if (gitStatus.unpushed > 0) {
    return { text: `${gitStatus.unpushed} ${t("dashboard.unpushed")}`, tone: "warning" };
  }
  return { text: t("dashboard.synced"), tone: "success" };
}

export function shouldShowMobileRemoteStatus(isMobile: boolean, gitRemote: string) {
  return isMobile && Boolean(gitRemote);
}

export function getSettingsCliStatusView(cliStatus: CliStatus | null, t: Translate) {
  if (!isCliStatusKnown(cliStatus)) {
    return { label: t("settings.cliChecking"), tone: "muted" as const };
  }
  if (!isCliInstalled(cliStatus)) {
    return { label: t("settings.cliMissing"), tone: "warning" as const };
  }
  if (isCliVersionMatched(cliStatus)) {
    return {
      label: t("settings.cliInstalled", cliStatus.version || cliStatus.recommended_version),
      tone: "success" as const,
    };
  }
  return {
    label: t("settings.cliVersionMismatch", cliStatus.version || "?", cliStatus.recommended_version),
    tone: "warning" as const,
  };
}
