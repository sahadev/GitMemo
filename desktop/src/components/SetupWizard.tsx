import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n, Locale } from "../hooks/useI18n";
import { usePlatformFlags } from "../hooks/usePlatform";
import {
  Globe, HardDrive, Cloud, GitBranch, Code2, ChevronRight,
  Loader2, Copy, Rocket, ExternalLink, KeyRound,
} from "lucide-react";
import { AppIcon } from "./base/AppIcon";
import {
  SetupBadge,
  SetupBadgeRow,
  SetupBrand,
  SetupButton,
  SetupButtonRow,
  SetupCandidateList,
  SetupCenteredBlock,
  SetupCheck,
  SetupCheckbox,
  SetupDoneIcon,
  SetupFieldHint,
  SetupHeroIcon,
  SetupInfoPanel,
  SetupInfoRow,
  SetupInlineActions,
  SetupInput,
  SetupLanguageMark,
  SetupLogBody,
  SetupLogIcon,
  SetupLogItem,
  SetupLogPanel,
  SetupOptionButton,
  SetupOptionCopy,
  SetupOptionIcon,
  SetupPanel,
  SetupPlatformButton,
  SetupPlatformGrid,
  SetupPublicKeyBox,
  SetupResultList,
  SetupResultRow,
  SetupRunningLayout,
  SetupSectionLabel,
  SetupSidebar,
  SetupSidebarStack,
  SetupStack,
  SetupStepItem,
  SetupStepList,
  SetupText,
  SetupTip,
  SetupTitle,
  SetupValueGrid,
  SetupValueRow,
  SetupWizardFrame,
} from "./domain/setup/SetupWizardComponents";

interface InitStep {
  name: string;
  ok: boolean;
  message: string;
}

interface InitResult {
  success: boolean;
  steps: InitStep[];
  ssh_public_key: string | null;
  deploy_keys_url?: string | null;
  needs_remote_sync: boolean;
}

interface InitProgressEvent {
  step: string;
  status: "running" | "ok" | "error" | string;
  message: string;
}

interface SshKeyCandidate {
  path: string;
  public_key: string;
  source: string;
  recommended: boolean;
  encrypted: boolean;
  reason?: string | null;
}

interface SshKeyScanResult {
  candidates: SshKeyCandidate[];
  recommended_key_path: string | null;
  deploy_keys_url?: string | null;
}

type WizardStep = "language" | "storage" | "ssh_key" | "editors" | "running" | "done";
type GitPlatform = "github" | "gitlab" | "gitee" | "bitbucket" | "other";

function accessTokenHelpUrl(gitUrl: string, platform: GitPlatform | null): string {
  const lower = gitUrl.toLowerCase();
  if (platform === "gitee" || lower.includes("gitee.com")) return "https://gitee.com/profile/personal_access_tokens";
  if (platform === "gitlab" || lower.includes("gitlab")) return "https://gitlab.com/-/user_settings/personal_access_tokens";
  if (platform === "bitbucket" || lower.includes("bitbucket.org")) return "https://bitbucket.org/account/settings/app-passwords/";
  return "https://github.com/settings/personal-access-tokens/new";
}

const PLATFORM_META: Record<GitPlatform, {
  label: string;
  placeholder: string;
  repoLimit: string;
  fileLimit: string;
  freeStorage: string;
  color: string;
}> = {
  github: {
    label: "GitHub",
    placeholder: "git@github.com:user/gitmemo-data.git",
    repoLimit: "< 5GB",
    fileLimit: "100MB",
    freeStorage: "unlimited",
    color: "var(--gm-provider-github)",
  },
  gitlab: {
    label: "GitLab",
    placeholder: "git@gitlab.com:user/gitmemo-data.git",
    repoLimit: "10GB",
    fileLimit: "—",
    freeStorage: "5GB",
    color: "var(--gm-provider-gitlab)",
  },
  gitee: {
    label: "Gitee",
    placeholder: "git@gitee.com:user/gitmemo-data.git",
    repoLimit: "500MB",
    fileLimit: "100MB",
    freeStorage: "5GB",
    color: "var(--gm-provider-gitee)",
  },
  bitbucket: {
    label: "Bitbucket",
    placeholder: "git@bitbucket.org:user/gitmemo-data.git",
    repoLimit: "4GB",
    fileLimit: "—",
    freeStorage: "1GB",
    color: "var(--gm-provider-bitbucket)",
  },
  other: {
    label: "Other",
    placeholder: "git@your-server.com:user/gitmemo-data.git",
    repoLimit: "—",
    fileLimit: "—",
    freeStorage: "—",
    color: "var(--gm-provider-other)",
  },
};

export function SetupWizard({ onComplete }: { onComplete: (needsRemoteSync?: boolean) => void }) {
  const { t, locale, setLocale } = useI18n();
  const { isMobile, isDesktop } = usePlatformFlags();
  const [step, setStep] = useState<WizardStep>("language");
  const [lang, setLang] = useState<Locale>(locale);
  const [storageMode, setStorageMode] = useState<"local" | "remote">("local");
  const [platform, setPlatform] = useState<GitPlatform | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [editors, setEditors] = useState<string[]>([]);
  const [sshCandidates, setSshCandidates] = useState<SshKeyCandidate[]>([]);
  const [selectedSshKeyPath, setSelectedSshKeyPath] = useState<string | null>(null);
  const [deployKeysUrl, setDeployKeysUrl] = useState<string | null>(null);
  const [scanningSsh, setScanningSsh] = useState(false);
  const [sshScanError, setSshScanError] = useState("");
  const [generatingSshKey, setGeneratingSshKey] = useState(false);
  const [result, setResult] = useState<InitResult | null>(null);
  const [error, setError] = useState("");
  const [sshKeyCopied, setSshKeyCopied] = useState(false);
  const [entering, setEntering] = useState(false);
  const [initLogs, setInitLogs] = useState<InitProgressEvent[]>([]);
  const initLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const unlisten = listen<InitProgressEvent>("setup-init-progress", ({ payload }) => {
      if (disposed) return;
      setInitLogs(prev => [...prev.slice(-80), payload]);
    });
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    initLogRef.current?.scrollTo({ top: initLogRef.current.scrollHeight });
  }, [initLogs]);

  const handleLangSelect = useCallback((value: Locale) => {
    setLang(value);
    setLocale(value);
    void invoke<string>("set_language", { lang: value }).catch(() => undefined);
  }, [setLocale]);

  const toggleEditor = useCallback((editor: string) => {
    setEditors(prev => (
      prev.includes(editor) ? prev.filter(e => e !== editor) : [...prev, editor]
    ));
  }, []);

  const trimmedGitUrl = gitUrl.trim();
  const isSshRemote = isDesktop && storageMode === "remote" && trimmedGitUrl.startsWith("git@");
  const isHttpsRemote = /^https:\/\//i.test(trimmedGitUrl);
  const mobileRemoteReady = !isMobile || storageMode !== "remote" || (isHttpsRemote && accessToken.trim().length > 0);
  const remoteReady = storageMode !== "remote" || (!!platform && !!trimmedGitUrl && mobileRemoteReady);

  const loadSshCandidates = useCallback(async () => {
    if (!isSshRemote) {
      setSshCandidates([]);
      setSelectedSshKeyPath(null);
      setDeployKeysUrl(null);
      setSshScanError("");
      setStep("editors");
      return;
    }

    setScanningSsh(true);
    setSshScanError("");
    try {
      const scan = await invoke<SshKeyScanResult>("scan_ssh_keys", { gitUrl });
      setSshCandidates(scan.candidates);
      const firstUsable = scan.candidates.find(candidate => !candidate.encrypted)?.path ?? null;
      setSelectedSshKeyPath(scan.recommended_key_path ?? firstUsable);
      setDeployKeysUrl(scan.deploy_keys_url ?? null);
      setStep("ssh_key");
    } catch (e) {
      setSshScanError(`${e}`);
    } finally {
      setScanningSsh(false);
    }
  }, [gitUrl, isSshRemote]);

  const generateSshKey = useCallback(async () => {
    setGeneratingSshKey(true);
    setSshScanError("");
    try {
      const candidate = await invoke<SshKeyCandidate>("generate_ssh_key", { gitUrl });
      setSshCandidates(prev => {
        const next = prev
          .filter(item => item.path !== candidate.path)
          .map(item => ({ ...item, recommended: false }));
        return [candidate, ...next];
      });
      setSelectedSshKeyPath(candidate.path);
    } catch (e) {
      setSshScanError(`${e}`);
    } finally {
      setGeneratingSshKey(false);
    }
  }, [gitUrl]);

  const runInit = useCallback(async () => {
    setStep("running");
    setError("");
    setResult(null);
    setInitLogs([{
      step: "start",
      status: "running",
      message: t("setup.initStarting"),
    }]);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    try {
      const res = await invoke<InitResult>("init_gitmemo", {
        request: {
          lang,
          git_url: storageMode === "remote" ? gitUrl : "",
          ssh_key_path: isDesktop && isSshRemote ? selectedSshKeyPath : null,
          access_token: isMobile && storageMode === "remote" ? accessToken.trim() : null,
          editors: isDesktop ? editors : [],
        },
      });
      setResult(res);
      setStep("done");
    } catch (e) {
      setError(`${e}`);
      setStep("done");
    }
  }, [lang, storageMode, gitUrl, isDesktop, isSshRemote, selectedSshKeyPath, isMobile, accessToken, editors, t]);

  const copySshKey = useCallback((publicKey?: string | null) => {
    if (!publicKey) return;
    void navigator.clipboard.writeText(publicKey);
    setSshKeyCopied(true);
    setTimeout(() => setSshKeyCopied(false), 2000);
  }, []);

  const steps: WizardStep[] = isDesktop
    ? ["language", "storage", ...(isSshRemote ? ["ssh_key" as const] : []), "editors"]
    : ["language", "storage"];
  const stepIndex = steps.indexOf(step);
  const showStepIndicator = stepIndex >= 0;
  const selectedPlatformMeta = platform ? PLATFORM_META[platform] : null;
  const setupSucceeded = !!result?.success;
  const showSetupError = !!error || (!!result && !result.success);
  const retryStep: WizardStep = isDesktop && storageMode !== "remote" ? "editors" : "storage";
  const selectedSshCandidate = sshCandidates.find(candidate => candidate.path === selectedSshKeyPath) ?? null;
  const doneDeployKeysUrl = result?.deploy_keys_url ?? deployKeysUrl;
  const latestInitLog = initLogs[initLogs.length - 1] ?? null;
  const gitUrlPlaceholder = isMobile
    ? "https://github.com/user/gitmemo-data.git"
    : selectedPlatformMeta?.placeholder ?? "";

  const stepTitles: Partial<Record<WizardStep, string>> = {
    language: "Welcome to GitMemo",
    storage: t("setup.storageTitle"),
    ssh_key: t("setup.sshSelectTitle"),
    editors: t("setup.editorsTitle"),
    running: t("setup.settingUp"),
    done: showSetupError ? t("setup.failed") : t("setup.complete"),
  };

  const stepDescriptions: Partial<Record<WizardStep, string>> = {
    language: "Choose your preferred language",
    storage: isMobile ? t("setup.mobileStorageDesc") : t("setup.storageDesc"),
    ssh_key: t("setup.sshSelectDesc"),
    editors: t("setup.editorsDesc"),
    running: isMobile ? t("setup.mobilePleaseWait") : t("setup.pleaseWait"),
    done: showSetupError
      ? (storageMode === "remote"
          ? (isMobile
              ? t("setup.mobileRemoteErrorDesc")
              : "Setup did not complete. Check the failed steps and retry after confirming your remote access.")
          : "Setup did not complete. Review the failed steps below and retry.")
      : t("setup.completeDesc"),
  };

  const navSteps = steps.map((item, index) => ({
    key: item,
    label: stepTitles[item] ?? item,
    active: item === step,
    complete: stepIndex > index,
  }));

  const sidebarTip =
    step === "language"
      ? t("setup.tipLanguage")
      : step === "storage"
        ? (storageMode === "remote"
            ? (isMobile ? t("setup.tipMobileStorageRemote") : t("setup.tipStorageRemote"))
            : t("setup.tipStorageLocal"))
        : step === "ssh_key"
          ? t("setup.sshWriteAccess")
          : step === "editors"
            ? t("setup.tipEditors")
            : step === "done"
              ? t("setup.tipSave")
              : t("setup.tipSettingUp");

  const sidebar = (
    <SetupSidebar mobile={isMobile}>
      <SetupSidebarStack>
        <SetupBrand title={stepTitles[step]} description={stepDescriptions[step]} />
        {!isMobile && (
          <SetupValueGrid>
            <SetupValueRow label={t("dashboard.storage")} value="~/.gitmemo" />
            <SetupValueRow
              label={t("settings.remoteRepo")}
              value={storageMode === "remote" ? (selectedPlatformMeta?.label ?? "Git") : t("settings.noRemote")}
            />
            <SetupValueRow
              label={t("dashboard.syncStatus")}
              value={storageMode === "remote" ? t("setup.remoteMode") : t("setup.localMode")}
            />
          </SetupValueGrid>
        )}
      </SetupSidebarStack>

      {showStepIndicator && (
        <SetupStepList mobile={isMobile}>
          {navSteps.map(({ key, label, active, complete }, index) => (
            <SetupStepItem
              key={key}
              index={index}
              label={label}
              active={active}
              complete={complete}
              mobile={isMobile}
            />
          ))}
        </SetupStepList>
      )}

      {!isMobile && <SetupTip title={t("setup.tipTitle")}>{sidebarTip}</SetupTip>}
    </SetupSidebar>
  );

  return (
    <SetupWizardFrame mobile={isMobile} done={step === "done"} sidebar={sidebar}>
      {step === "language" && (
        <SetupPanel mobile={isMobile}>
          <SetupHeroIcon icon={Globe} />
          <SetupStack gap="lg">
            <SetupStack gap="sm">
              <SetupOptionButton selected={lang === "en"} onClick={() => handleLangSelect("en")}>
                <SetupLanguageMark>EN</SetupLanguageMark>
                <SetupOptionCopy title="English" />
                <SetupCheck selected={lang === "en"} />
              </SetupOptionButton>
              <SetupOptionButton selected={lang === "zh"} onClick={() => handleLangSelect("zh")}>
                <SetupLanguageMark>ZH</SetupLanguageMark>
                <SetupOptionCopy title="中文" />
                <SetupCheck selected={lang === "zh"} />
              </SetupOptionButton>
            </SetupStack>
            <SetupButton onClick={() => setStep("storage")} icon={ChevronRight} iconPosition="end">
              {t("setup.next")}
            </SetupButton>
          </SetupStack>
        </SetupPanel>
      )}

      {step === "storage" && (
        <SetupPanel mobile={isMobile}>
          <SetupHeroIcon icon={HardDrive} />
          <SetupBadgeRow>
            <SetupBadge tone="success">{t("setup.localMode")}</SetupBadge>
            <SetupBadge tone="accent">Git</SetupBadge>
            <SetupBadge tone={storageMode === "remote" ? "warning" : "muted"}>
              {storageMode === "remote" ? t("setup.remoteMode") : t("settings.noRemote")}
            </SetupBadge>
          </SetupBadgeRow>

          <SetupStack gap="lg">
            <SetupStack gap="sm">
              <SetupOptionButton selected={storageMode === "local"} compact onClick={() => setStorageMode("local")}>
                <SetupOptionIcon icon={HardDrive} tone="success" />
                <SetupOptionCopy title={t("setup.localMode")} description={t("setup.localModeDesc")} />
                <SetupCheck selected={storageMode === "local"} />
              </SetupOptionButton>
              <SetupOptionButton selected={storageMode === "remote"} compact onClick={() => setStorageMode("remote")}>
                <SetupOptionIcon icon={Cloud} tone="accent" />
                <SetupOptionCopy title={t("setup.remoteMode")} description={t("setup.remoteModeDesc")} />
                <SetupCheck selected={storageMode === "remote"} />
              </SetupOptionButton>
            </SetupStack>

            {storageMode === "remote" && (
              <SetupStack gap="sm">
                <SetupSectionLabel>{t("setup.platformTitle")}</SetupSectionLabel>
                <SetupPlatformGrid>
                  {(Object.keys(PLATFORM_META) as GitPlatform[]).map(item => {
                    const meta = PLATFORM_META[item];
                    return (
                      <SetupPlatformButton
                        key={item}
                        selected={platform === item}
                        platform={item}
                        label={item === "other" ? t("setup.platformOther") : meta.label}
                        onClick={() => setPlatform(item)}
                      />
                    );
                  })}
                </SetupPlatformGrid>

                {platform && (
                  <SetupStack gap="sm">
                    {selectedPlatformMeta && platform !== "other" && (
                      <SetupFieldHint>
                        {t("setup.repoLimit")}: {selectedPlatformMeta.repoLimit}
                        {" · "}
                        {t("setup.fileLimit")}: {selectedPlatformMeta.fileLimit}
                        {" · "}
                        {t("setup.freeStorage")}: {selectedPlatformMeta.freeStorage}
                      </SetupFieldHint>
                    )}
                    <SetupInput
                      type="text"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      placeholder={gitUrlPlaceholder}
                    />
                    <SetupFieldHint>
                      {isMobile ? t("setup.mobileGitUrlHint") : t("setup.gitUrlHint")}
                    </SetupFieldHint>

                    {isMobile && (
                      <>
                        <SetupInput
                          type="text"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder={t("setup.mobileAccessToken")}
                        />
                        <SetupFieldHint tone={trimmedGitUrl && !isHttpsRemote ? "danger" : "muted"}>
                          {trimmedGitUrl && !isHttpsRemote ? t("setup.mobileHttpsRequired") : t("setup.mobileTokenHint")}
                        </SetupFieldHint>
                        <SetupInfoPanel>
                          <SetupStack gap="sm">
                            <SetupInfoRow>
                              <AppIcon icon={KeyRound} size="xs" tone="accent" />
                              <SetupText>{t("setup.mobileTokenGuide")}</SetupText>
                            </SetupInfoRow>
                            <SetupButton
                              variant="secondary"
                              icon={ExternalLink}
                              iconPosition="end"
                              onClick={() => void openUrl(accessTokenHelpUrl(trimmedGitUrl, platform))}
                            >
                              {t("setup.createAccessToken")}
                            </SetupButton>
                          </SetupStack>
                        </SetupInfoPanel>
                      </>
                    )}
                  </SetupStack>
                )}
              </SetupStack>
            )}

            <SetupButtonRow>
              <SetupButton variant="secondary" layout="nav-back" onClick={() => setStep("language")}>
                {t("setup.back")}
              </SetupButton>
              <SetupButton
                layout="nav-primary"
                disabled={!remoteReady}
                icon={scanningSsh ? Loader2 : ChevronRight}
                iconPosition="end"
                iconSpin={scanningSsh}
                onClick={() => {
                  setSshKeyCopied(false);
                  if (isMobile) {
                    void runInit();
                  } else {
                    void loadSshCandidates();
                  }
                }}
              >
                {t("setup.next")}
              </SetupButton>
            </SetupButtonRow>
          </SetupStack>
        </SetupPanel>
      )}

      {step === "ssh_key" && (
        <SetupPanel mobile={isMobile}>
          <SetupHeroIcon icon={KeyRound} />
          <SetupStack gap="lg">
            {sshScanError && (
              <SetupInfoPanel tone="danger">
                <SetupText tone="danger">{sshScanError}</SetupText>
              </SetupInfoPanel>
            )}

            <SetupCandidateList>
              {sshCandidates.map(candidate => (
                <SetupOptionButton
                  key={candidate.path}
                  selected={selectedSshKeyPath === candidate.path}
                  disabled={candidate.encrypted}
                  className="gm-setup-option-top"
                  onClick={() => {
                    if (candidate.encrypted) return;
                    setSelectedSshKeyPath(candidate.path);
                    setSshKeyCopied(false);
                  }}
                >
                  <div className="gm-setup-option-copy">
                    <div className="gm-setup-candidate-head">
                      <span className="gm-setup-candidate-path">{candidate.path}</span>
                      {candidate.recommended && <SetupBadge tone="accent">{t("setup.recommended")}</SetupBadge>}
                      {candidate.encrypted && <SetupBadge tone="warning">{t("setup.sshKeyEncrypted")}</SetupBadge>}
                    </div>
                    <div className="gm-setup-candidate-reason">
                      {candidate.encrypted ? t("setup.sshKeyEncryptedReason") : candidate.reason}
                    </div>
                  </div>
                  <SetupCheck selected={selectedSshKeyPath === candidate.path} />
                </SetupOptionButton>
              ))}
            </SetupCandidateList>

            <SetupInlineActions>
              <SetupButton
                variant="secondary"
                disabled={generatingSshKey}
                icon={generatingSshKey ? Loader2 : KeyRound}
                iconSpin={generatingSshKey}
                onClick={() => {
                  setSshKeyCopied(false);
                  void generateSshKey();
                }}
              >
                {t("setup.generateSshKey")}
              </SetupButton>
              <SetupButton
                variant="secondary"
                layout="auto"
                className="gm-setup-button-compact"
                onClick={() => {
                  setSshKeyCopied(false);
                  void loadSshCandidates();
                }}
              >
                {t("common.refresh")}
              </SetupButton>
            </SetupInlineActions>

            {selectedSshCandidate && (
              <SetupPublicKeyBox>
                <AppIcon icon={GitBranch} size="xs" tone="accent" />
                <span>{selectedSshCandidate.public_key}</span>
                <SetupButton
                  variant="ghost"
                  layout="auto"
                  className="gm-setup-button-compact"
                  icon={Copy}
                  onClick={() => copySshKey(selectedSshCandidate.public_key)}
                >
                  {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                </SetupButton>
              </SetupPublicKeyBox>
            )}

            {sshCandidates.length === 0 && !scanningSsh && (
              <SetupText>{t("setup.noSshKeysFound")}</SetupText>
            )}
            {sshCandidates.length > 0 && sshCandidates.every(candidate => candidate.encrypted) && (
              <SetupFieldHint tone="warning">{t("setup.onlyEncryptedSshKeysFound")}</SetupFieldHint>
            )}

            <SetupButtonRow>
              <SetupButton variant="secondary" layout="nav-back" onClick={() => setStep("storage")}>
                {t("setup.back")}
              </SetupButton>
              <SetupButton
                layout="nav-primary"
                disabled={!selectedSshKeyPath}
                icon={ChevronRight}
                iconPosition="end"
                onClick={() => setStep("editors")}
              >
                {t("setup.next")}
              </SetupButton>
            </SetupButtonRow>
          </SetupStack>
        </SetupPanel>
      )}

      {step === "editors" && (
        <SetupPanel mobile={isMobile}>
          <SetupHeroIcon icon={Code2} />
          <SetupStack gap="lg">
            <SetupStack gap="sm">
              <SetupOptionButton selected={editors.includes("claude")} onClick={() => toggleEditor("claude")}>
                <SetupCheckbox checked={editors.includes("claude")} />
                <SetupOptionCopy title="Claude Code" description={t("setup.claudeDesc")} />
              </SetupOptionButton>
              <SetupOptionButton selected={editors.includes("cursor")} onClick={() => toggleEditor("cursor")}>
                <SetupCheckbox checked={editors.includes("cursor")} />
                <SetupOptionCopy title="Cursor" description={t("setup.cursorDesc")} />
              </SetupOptionButton>
              <SetupOptionButton selected={editors.includes("codex")} onClick={() => toggleEditor("codex")}>
                <SetupCheckbox checked={editors.includes("codex")} />
                <SetupOptionCopy title="Codex" description={t("setup.codexDesc")} />
              </SetupOptionButton>
            </SetupStack>

            <SetupButtonRow>
              <SetupButton variant="secondary" layout="nav-back" onClick={() => setStep(isSshRemote ? "ssh_key" : "storage")}>
                {t("setup.back")}
              </SetupButton>
              <SetupButton layout="nav-primary" icon={Rocket} onClick={runInit}>
                {t("setup.startSetup")}
              </SetupButton>
            </SetupButtonRow>
            {editors.length === 0 && (
              <SetupText align="center" className="gm-setup-skip-hint">
                {t("setup.skipEditorsHint")}
              </SetupText>
            )}
          </SetupStack>
        </SetupPanel>
      )}

      {step === "running" && (
        <SetupPanel mobile={isMobile}>
          <SetupRunningLayout>
            <SetupCenteredBlock>
              <AppIcon icon={Loader2} size={isMobile ? "empty-lg" : "hero"} tone="accent" spin className="gm-setup-running-spinner" />
              <h2 className="gm-setup-running-title">{t("setup.settingUp")}</h2>
              <SetupText align="center">
                {latestInitLog?.message ?? (isMobile ? t("setup.mobilePleaseWait") : t("setup.pleaseWait"))}
              </SetupText>
            </SetupCenteredBlock>

            <SetupLogPanel title={t("setup.initLogTitle")} count={t("setup.initLogCount", initLogs.length)}>
              <SetupLogBody refNode={initLogRef}>
                {initLogs.length === 0 ? (
                  <SetupText>{t("setup.initWaitingLog")}</SetupText>
                ) : initLogs.map((item, index) => (
                  <SetupLogItem
                    key={`${item.step}-${index}`}
                    icon={<SetupLogIcon status={item.status} />}
                    message={item.message}
                    step={item.step}
                    error={item.status === "error"}
                  />
                ))}
              </SetupLogBody>
            </SetupLogPanel>

            <SetupText align="center">{t("setup.initLongRunningHint")}</SetupText>
          </SetupRunningLayout>
        </SetupPanel>
      )}

      {step === "done" && (
        <SetupPanel mobile={isMobile}>
          {error ? (
            <SetupCenteredBlock padded>
              <SetupDoneIcon error />
              <SetupTitle tone="danger">{t("setup.failed")}</SetupTitle>
              <SetupText align="center" tone="danger">{error}</SetupText>
              <SetupButton onClick={() => { setError(""); setStep(retryStep); }}>
                {t("setup.retry")}
              </SetupButton>
            </SetupCenteredBlock>
          ) : (
            <SetupStack gap="lg">
              <SetupCenteredBlock>
                <SetupDoneIcon error={showSetupError} />
                <SetupTitle tone={showSetupError ? "danger" : "default"}>
                  {showSetupError ? t("setup.failed") : t("setup.complete")}
                </SetupTitle>
                <SetupText align="center">
                  {showSetupError
                    ? (storageMode === "remote"
                        ? (isMobile
                            ? t("setup.mobileRemoteErrorDesc")
                            : "Setup did not complete. Check the failed steps below, make sure your SSH key is ready in the remote repository, then retry.")
                        : "Setup did not complete. Review the failed steps below and retry.")
                    : t("setup.completeDesc")}
                </SetupText>
              </SetupCenteredBlock>

              {result && result.steps.length > 0 && (
                <SetupResultList>
                  {result.steps.map((item, index) => (
                    <SetupResultRow key={index} ok={item.ok} message={item.message} />
                  ))}
                </SetupResultList>
              )}

              {isDesktop && result?.ssh_public_key && doneDeployKeysUrl && (
                <SetupInfoPanel tone="dashed">
                  <SetupStack gap="sm">
                    <SetupInfoRow>
                      <AppIcon icon={GitBranch} size="xs" tone="accent" />
                      <SetupOptionCopy title={t("setup.sshKeyTitle")} />
                      <SetupButton
                        variant="ghost"
                        layout="auto"
                        className="gm-setup-button-compact"
                        icon={Copy}
                        onClick={() => copySshKey(result.ssh_public_key)}
                      >
                        {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                      </SetupButton>
                    </SetupInfoRow>
                    <code className="gm-setup-code-block">{result.ssh_public_key}</code>
                    <SetupFieldHint>{t("setup.sshKeyHint")}</SetupFieldHint>
                    <SetupFieldHint tone="warning">{t("setup.sshWriteAccess")}</SetupFieldHint>
                    <SetupButton
                      variant="secondary"
                      layout="auto"
                      className="gm-setup-button-compact"
                      icon={ExternalLink}
                      iconPosition="end"
                      onClick={() => void openUrl(doneDeployKeysUrl)}
                    >
                      {t("setup.openDeployKeys")}
                    </SetupButton>
                  </SetupStack>
                </SetupInfoPanel>
              )}

              {setupSucceeded ? (
                <SetupButton
                  disabled={entering}
                  icon={entering ? Loader2 : ChevronRight}
                  iconPosition="end"
                  iconSpin={entering}
                  onClick={() => {
                    setEntering(true);
                    onComplete(result?.needs_remote_sync);
                  }}
                >
                  {entering ? t("setup.pleaseWait") : t("setup.enterApp")}
                </SetupButton>
              ) : (
                <SetupStack gap="sm">
                  <SetupButton onClick={() => setStep(retryStep)}>
                    {t("setup.retry")}
                  </SetupButton>
                  <SetupButton variant="secondary" onClick={() => setStep("language")}>
                    Start over
                  </SetupButton>
                </SetupStack>
              )}
            </SetupStack>
          )}
        </SetupPanel>
      )}
    </SetupWizardFrame>
  );
}
