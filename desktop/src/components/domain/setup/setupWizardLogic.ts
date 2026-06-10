import type { Locale } from "../../../hooks/useI18n";

export interface InitStep {
  name: string;
  ok: boolean;
  message: string;
}

export interface InitResult {
  success: boolean;
  steps: InitStep[];
  ssh_public_key: string | null;
  deploy_keys_url?: string | null;
  needs_remote_sync: boolean;
}

export interface InitProgressEvent {
  step: string;
  status: "running" | "ok" | "error" | string;
  message: string;
}

export interface SshKeyCandidate {
  path: string;
  public_key: string;
  source: string;
  recommended: boolean;
  encrypted: boolean;
  reason?: string | null;
}

export interface SshKeyScanResult {
  candidates: SshKeyCandidate[];
  recommended_key_path: string | null;
  deploy_keys_url?: string | null;
}

export type WizardStep = "language" | "storage" | "ssh_key" | "editors" | "running" | "done";
export type GitPlatform = "github" | "gitlab" | "gitee" | "bitbucket" | "other";
export type StorageMode = "local" | "remote";

export interface InitGitmemoRequestContext {
  lang: Locale;
  storageMode: StorageMode;
  gitUrl: string;
  isDesktop: boolean;
  isSshRemote: boolean;
  selectedSshKeyPath: string | null;
  isMobile: boolean;
  accessToken: string;
  editors: string[];
}

export function getAccessTokenHelpUrl(gitUrl: string, platform: GitPlatform | null): string {
  const lower = gitUrl.toLowerCase();
  if (platform === "gitee" || lower.includes("gitee.com")) return "https://gitee.com/profile/personal_access_tokens";
  if (platform === "gitlab" || lower.includes("gitlab")) return "https://gitlab.com/-/user_settings/personal_access_tokens";
  if (platform === "bitbucket" || lower.includes("bitbucket.org")) return "https://bitbucket.org/account/settings/app-passwords/";
  return "https://github.com/settings/personal-access-tokens/new";
}

export function isRemoteStorageMode(storageMode: StorageMode) {
  return storageMode === "remote";
}

export function isSshRemoteSetup(isDesktop: boolean, storageMode: StorageMode, trimmedGitUrl: string) {
  return isDesktop && isRemoteStorageMode(storageMode) && trimmedGitUrl.startsWith("git@");
}

export function isHttpsRemoteUrl(trimmedGitUrl: string) {
  return /^https:\/\//i.test(trimmedGitUrl);
}

export function isMobileRemoteReady(
  isMobile: boolean,
  storageMode: StorageMode,
  isHttpsRemote: boolean,
  accessToken: string,
) {
  return !isMobile || !isRemoteStorageMode(storageMode) || (isHttpsRemote && accessToken.trim().length > 0);
}

export function isRemoteSetupReady({
  storageMode,
  platform,
  trimmedGitUrl,
  mobileRemoteReady,
}: {
  storageMode: StorageMode;
  platform: GitPlatform | null;
  trimmedGitUrl: string;
  mobileRemoteReady: boolean;
}) {
  return !isRemoteStorageMode(storageMode) || (Boolean(platform) && Boolean(trimmedGitUrl) && mobileRemoteReady);
}

export function getFirstUsableSshKeyPath(candidates: SshKeyCandidate[]) {
  return candidates.find((candidate) => !candidate.encrypted)?.path ?? null;
}

export function getSelectedSshKeyPath(scan: SshKeyScanResult) {
  return scan.recommended_key_path ?? getFirstUsableSshKeyPath(scan.candidates);
}

export function getSetupSteps(isDesktop: boolean, isSshRemote: boolean): WizardStep[] {
  return isDesktop
    ? ["language", "storage", ...(isSshRemote ? ["ssh_key" as const] : []), "editors"]
    : ["language", "storage"];
}

export function getSetupStepIndex(steps: WizardStep[], step: WizardStep) {
  return steps.indexOf(step);
}

export function shouldShowSetupStepIndicator(stepIndex: number) {
  return stepIndex >= 0;
}

export function isSetupSucceeded(result: InitResult | null) {
  return result?.success === true;
}

export function shouldShowSetupError(error: string, result: InitResult | null) {
  return Boolean(error) || Boolean(result && !result.success);
}

export function getRetrySetupStep(isDesktop: boolean, storageMode: StorageMode): WizardStep {
  return isDesktop && !isRemoteStorageMode(storageMode) ? "editors" : "storage";
}

export function getDoneDeployKeysUrl(result: InitResult | null, deployKeysUrl: string | null) {
  return result?.deploy_keys_url ?? deployKeysUrl;
}

export function getLatestInitLog(initLogs: InitProgressEvent[]) {
  return initLogs[initLogs.length - 1] ?? null;
}

export function getGitUrlPlaceholder(isMobile: boolean, selectedPlatformPlaceholder?: string) {
  return isMobile ? "https://github.com/user/gitmemo-data.git" : selectedPlatformPlaceholder ?? "";
}

export function getSetupNavSteps(
  steps: WizardStep[],
  step: WizardStep,
  stepTitles: Partial<Record<WizardStep, string>>,
) {
  const stepIndex = getSetupStepIndex(steps, step);
  return steps.map((item, index) => ({
    key: item,
    label: stepTitles[item] ?? item,
    active: item === step,
    complete: stepIndex > index,
  }));
}

export function getSetupSidebarTipKey(step: WizardStep, storageMode: StorageMode, isMobile: boolean) {
  if (step === "language") return "setup.tipLanguage";
  if (step === "storage") {
    if (isRemoteStorageMode(storageMode)) {
      return isMobile ? "setup.tipMobileStorageRemote" : "setup.tipStorageRemote";
    }
    return "setup.tipStorageLocal";
  }
  if (step === "ssh_key") return "setup.sshWriteAccess";
  if (step === "editors") return "setup.tipEditors";
  if (step === "done") return "setup.tipSave";
  return "setup.tipSettingUp";
}

export function getEditorBackStep(isSshRemote: boolean): WizardStep {
  return isSshRemote ? "ssh_key" : "storage";
}

export function hasOnlyEncryptedSshKeys(candidates: SshKeyCandidate[]) {
  return candidates.length > 0 && candidates.every((candidate) => candidate.encrypted);
}

export function getInitGitmemoRequest({
  lang,
  storageMode,
  gitUrl,
  isDesktop,
  isSshRemote,
  selectedSshKeyPath,
  isMobile,
  accessToken,
  editors,
}: InitGitmemoRequestContext) {
  return {
    lang,
    git_url: isRemoteStorageMode(storageMode) ? gitUrl : "",
    ssh_key_path: isDesktop && isSshRemote ? selectedSshKeyPath : null,
    access_token: isMobile && isRemoteStorageMode(storageMode) ? accessToken.trim() : null,
    editors: isDesktop ? editors : [],
  };
}
