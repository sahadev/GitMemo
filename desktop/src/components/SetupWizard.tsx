import { useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n, Locale } from "../hooks/useI18n";
import { usePlatformFlags } from "../hooks/usePlatform";
import {
  Globe, HardDrive, Cloud, GitBranch, Code2, Check, ChevronRight,
  Loader2, Copy, AlertCircle, Rocket, ExternalLink, KeyRound,
} from "lucide-react";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";

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
      setSelectedSshKeyPath(scan.recommended_key_path ?? scan.candidates[0]?.path ?? null);
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

  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    minHeight: "100%",
    height: "100%",
    flex: 1,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    borderRadius: "var(--gm-radius-none)",
    background: "var(--bg-card)",
    border: "none",
    display: isMobile ? "flex" : "grid",
    flexDirection: isMobile ? "column" : undefined,
    gridTemplateColumns: isMobile ? undefined : step === "done" ? "var(--gm-size-setup-sidebar-width-done) minmax(0, 1fr)" : "var(--gm-size-setup-sidebar-width) minmax(0, 1fr)",
    overflow: "hidden",
    boxShadow: "none",
  };

  const btnPrimary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--gm-space-4)",
    width: "100%",
    padding: "var(--gm-space-6) var(--gm-space-10)",
    borderRadius: "var(--gm-radius-md)",
    border: "1px solid var(--accent)",
    background: "var(--accent)",
    color: "var(--gm-color-on-accent)",
    fontSize: "var(--gm-font-sm)",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  };

  const btnSecondary: React.CSSProperties = {
    ...btnPrimary,
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  const buttonRowStyle: React.CSSProperties = {
    display: "flex",
    gap: isMobile ? "var(--gm-space-4)" : "var(--gm-space-5)",
    alignItems: "stretch",
    flexWrap: "nowrap",
    width: "100%",
  };

  const navBackButtonStyle: React.CSSProperties = {
    ...btnSecondary,
    width: "auto",
    minWidth: isMobile ? "var(--gm-size-setup-nav-back-min-width-mobile)" : "var(--gm-size-setup-nav-back-min-width)",
    flex: "0 0 auto",
    padding: isMobile ? "var(--gm-space-5) var(--gm-space-7)" : "var(--gm-space-5) var(--gm-space-10)",
    whiteSpace: "nowrap",
  };

  const navPrimaryButtonStyle: React.CSSProperties = {
    ...btnPrimary,
    width: "auto",
    flex: "1 1 0",
    minWidth: 0,
    whiteSpace: "nowrap",
  };

  const optionCard = (selected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "var(--gm-space-7)",
    padding: isMobile ? "var(--gm-space-6) var(--gm-space-7)" : "var(--gm-space-7) var(--gm-space-10)",
    borderRadius: "var(--gm-radius-md)",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "var(--bg)",
    cursor: "pointer",
    transition: "all 0.15s",
    width: "100%",
    minWidth: 0,
    textAlign: "left",
  });

  const badgeStyle = (tone: "accent" | "success" | "warning" | "muted" = "muted"): React.CSSProperties => {
    const color = tone === "accent"
      ? "var(--accent)"
      : tone === "success"
        ? "var(--green)"
        : tone === "warning"
          ? "var(--yellow)"
          : "var(--text-secondary)";

    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "var(--gm-control-height-xs)",
      padding: "var(--gm-space-2) var(--gm-space-4)",
      borderRadius: "var(--gm-radius-md)",
      border: "1px solid var(--border)",
      background: "var(--bg)",
      color,
      fontSize: "var(--gm-font-xs)",
      fontWeight: 700,
      whiteSpace: "nowrap",
    };
  };

  const infoSurfaceStyle: React.CSSProperties = {
    padding: isMobile ? "var(--gm-space-6) var(--gm-space-7)" : "var(--gm-space-7) var(--gm-space-8)",
    borderRadius: "var(--gm-radius-md)",
    border: "1px solid var(--border)",
    background: "var(--bg)",
  };

  const setupValueStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gm-space-5)",
    padding: "var(--gm-space-4) var(--gm-space-5)",
    borderRadius: "var(--gm-radius-md)",
    border: "1px solid var(--border)",
    background: "var(--bg)",
    minWidth: 0,
  };

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

  const renderPanel = (content: ReactNode) => (
    <div style={{
      padding: isMobile ? `var(--gm-space-10) var(--gm-space-10) ${MOBILE_BOTTOM_CONTENT_PADDING}` : "var(--gm-space-14) var(--gm-space-16) var(--gm-space-12)",
      overflowY: "auto",
      minWidth: 0,
      minHeight: 0,
      height: isMobile ? "auto" : "100%",
      flex: 1,
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
    }}>
      <div style={{
        width: "100%",
        maxWidth: isMobile ? "none" : "var(--gm-size-setup-panel-max-width)",
        margin: "0 auto",
      }}>
        {content}
      </div>
    </div>
  );

  const candidateListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gm-space-4)",
    marginBottom: "var(--gm-space-6)",
    maxHeight: "var(--gm-size-setup-candidate-list-max-height)",
    overflowY: "auto",
    paddingRight: "var(--gm-space-2)",
  };

  const initLogIcon = (status: string) => {
    if (status === "ok") return <Check size={14} style={{ color: "var(--green)", flexShrink: 0 }} />;
    if (status === "error") return <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />;
    return <Loader2 size={14} style={{ color: "var(--accent)", flexShrink: 0, animation: "spin 1s linear infinite" }} />;
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <aside style={{
          padding: isMobile ? "var(--gm-space-8) var(--gm-space-8) var(--gm-space-6)" : "var(--gm-space-14) var(--gm-space-12) var(--gm-space-14)",
          borderRight: isMobile ? "none" : "1px solid var(--border)",
          borderBottom: isMobile ? "1px solid var(--border)" : "none",
          background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? "var(--gm-space-6)" : "var(--gm-space-10)",
          minWidth: 0,
          flexShrink: 0,
        }}>
          <div style={{ display: "grid", gap: isMobile ? "var(--gm-space-5)" : "var(--gm-space-7)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-space-6)", minWidth: 0 }}>
              <div style={{
                width: "var(--gm-size-setup-logo-box)",
                height: "var(--gm-size-setup-logo-box)",
                borderRadius: "var(--gm-radius-lg)",
                border: "1px solid var(--border-strong)",
                background: "var(--bg)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--gm-font-sm)",
                fontWeight: 800,
                flexShrink: 0,
              }}>
                GM
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--gm-font-xs)", fontWeight: 700, color: "var(--accent)", marginBottom: "var(--gm-space-2)", letterSpacing: 0 }}>
                  GitMemo Setup
                </div>
                <h2 style={{
                  fontSize: isMobile ? "var(--gm-font-lg)" : "var(--gm-font-xl)",
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.25,
                  overflowWrap: "anywhere",
                }}>
                  {stepTitles[step]}
                </h2>
              </div>
            </div>
            <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
              {stepDescriptions[step]}
            </p>
            {!isMobile && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={setupValueStyle}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)" }}>{t("dashboard.storage")}</span>
                  <strong style={{ color: "var(--text)", fontSize: "var(--gm-font-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ~/.gitmemo
                  </strong>
                </div>
                <div style={setupValueStyle}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)" }}>{t("settings.remoteRepo")}</span>
                  <strong style={{ color: "var(--text)", fontSize: "var(--gm-font-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {storageMode === "remote" ? (selectedPlatformMeta?.label ?? "Git") : t("settings.noRemote")}
                  </strong>
                </div>
                <div style={setupValueStyle}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)" }}>{t("dashboard.syncStatus")}</span>
                  <strong style={{ color: "var(--text)", fontSize: "var(--gm-font-xs)" }}>
                    {storageMode === "remote" ? t("setup.remoteMode") : t("setup.localMode")}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {showStepIndicator && (
            <div style={{
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: isMobile ? "var(--gm-space-4)" : "var(--gm-space-5)",
              overflowX: isMobile ? "auto" : undefined,
              paddingBottom: isMobile ? "var(--gm-space-1)" : undefined,
            }}>
              {navSteps.map(({ key, label, active, complete }, index) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: isMobile ? "var(--gm-space-4)" : "var(--gm-space-6)",
                    padding: isMobile ? "var(--gm-space-4) var(--gm-space-5)" : "var(--gm-space-5) var(--gm-space-6)",
                    borderRadius: "var(--gm-radius-md)",
                    background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                    border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 42%, var(--border))" : "transparent"}`,
                    flex: isMobile ? "0 0 auto" : undefined,
                    minWidth: 0,
                  }}
                >
                  <div style={{
                    width: "var(--gm-size-setup-step-index)",
                    height: "var(--gm-size-setup-step-index)",
                    borderRadius: "var(--gm-radius-md)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--gm-font-xs)",
                    fontWeight: 700,
                    background: complete || active ? "var(--accent)" : "var(--bg)",
                    border: `1px solid ${complete || active ? "var(--accent)" : "var(--border)"}`,
                    color: complete || active ? "var(--gm-color-on-accent)" : "var(--text-secondary)",
                    flexShrink: 0,
                  }}>
                    {complete ? <Check size={14} /> : index + 1}
                  </div>
                  <div style={{
                    fontSize: isMobile ? "var(--gm-font-xs)" : "var(--gm-font-sm)",
                    fontWeight: 600,
                    color: active ? "var(--text)" : "var(--text-secondary)",
                    whiteSpace: isMobile ? "nowrap" : undefined,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isMobile && <div style={{
            marginTop: "auto",
            ...infoSurfaceStyle,
            fontSize: "var(--gm-font-xs)",
            color: "var(--text-secondary)",
            lineHeight: "var(--gm-leading-relaxed)",
          }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "var(--gm-space-3)" }}>{t("setup.tipTitle")}</div>
            {sidebarTip}
          </div>}
        </aside>

        <section style={{
          minWidth: 0,
          minHeight: 0,
          flex: isMobile ? 1 : undefined,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {step === "language" && renderPanel(
            <div>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <Globe size={36} style={{ color: "var(--accent)", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                <button style={optionCard(lang === "en")} onClick={() => handleLangSelect("en")}>
                  <span style={{ fontSize: "var(--gm-font-2xl)" }}>EN</span>
                  <div>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>English</div>
                  </div>
                  {lang === "en" && <Check size={18} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
                </button>
                <button style={optionCard(lang === "zh")} onClick={() => handleLangSelect("zh")}>
                  <span style={{ fontSize: "var(--gm-font-2xl)" }}>ZH</span>
                  <div>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>中文</div>
                  </div>
                  {lang === "zh" && <Check size={18} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
                </button>
              </div>
              <button style={btnPrimary} onClick={() => setStep("storage")}>
                {t("setup.next")} <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === "storage" && renderPanel(
            <div>
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <HardDrive size={36} style={{ color: "var(--accent)", display: "block", margin: "0 auto 12px" }} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <span style={badgeStyle("success")}>{t("setup.localMode")}</span>
                <span style={badgeStyle("accent")}>Git</span>
                <span style={badgeStyle(storageMode === "remote" ? "warning" : "muted")}>
                  {storageMode === "remote" ? t("setup.remoteMode") : t("settings.noRemote")}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                <button style={{ ...optionCard(storageMode === "local"), padding: "12px 16px" }} onClick={() => setStorageMode("local")}>
                  <HardDrive size={20} style={{ color: "var(--green)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>{t("setup.localMode")}</div>
                    <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.localModeDesc")}</div>
                  </div>
                  {storageMode === "local" && <Check size={18} style={{ color: "var(--accent)" }} />}
                </button>
                <button style={{ ...optionCard(storageMode === "remote"), padding: "12px 16px" }} onClick={() => setStorageMode("remote")}>
                  <Cloud size={20} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>{t("setup.remoteMode")}</div>
                    <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.remoteModeDesc")}</div>
                  </div>
                  {storageMode === "remote" && <Check size={18} style={{ color: "var(--accent)" }} />}
                </button>
              </div>

              {storageMode === "remote" && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: "var(--gm-font-xs)", fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                    {t("setup.platformTitle")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {(Object.keys(PLATFORM_META) as GitPlatform[]).map(item => {
                      const meta = PLATFORM_META[item];
                      const selected = platform === item;
                      return (
                        <button
                          key={item}
                          onClick={() => setPlatform(item)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "8px 12px",
                            borderRadius: "var(--gm-radius-pill)",
                            border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                            background: selected ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            color: selected ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: "var(--gm-radius-sm)", background: meta.color, flexShrink: 0 }} />
                          <span style={{ fontSize: "var(--gm-font-xs)", fontWeight: 600 }}>
                            {item === "other" ? t("setup.platformOther") : meta.label}
                          </span>
                          {selected && <Check size={12} style={{ color: "var(--accent)" }} />}
                        </button>
                      );
                    })}
                  </div>

                  {platform && (
                    <>
                      {selectedPlatformMeta && platform !== "other" && (
                        <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
                          {t("setup.repoLimit")}: {selectedPlatformMeta.repoLimit}
                          {" · "}
                          {t("setup.fileLimit")}: {selectedPlatformMeta.fileLimit}
                          {" · "}
                          {t("setup.freeStorage")}: {selectedPlatformMeta.freeStorage}
                        </p>
                      )}
                      <input
                        type="text"
                        value={gitUrl}
                        onChange={(e) => setGitUrl(e.target.value)}
                        placeholder={gitUrlPlaceholder}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "var(--gm-radius-lg)",
                          border: "1px solid var(--border)",
                          background: "var(--bg-input)",
                          color: "var(--text)",
                          fontSize: "var(--gm-font-sm)",
                          fontFamily: "ui-monospace, monospace",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 6 }}>
                        {isMobile ? t("setup.mobileGitUrlHint") : t("setup.gitUrlHint")}
                      </p>
                      {isMobile && (
                        <>
                          <input
                            type="text"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder={t("setup.mobileAccessToken")}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "var(--gm-radius-lg)",
                              border: "1px solid var(--border)",
                              background: "var(--bg-input)",
                              color: "var(--text)",
                              fontSize: "var(--gm-font-sm)",
                              outline: "none",
                              boxSizing: "border-box",
                              marginTop: 10,
                            }}
                          />
                          <p style={{
                            fontSize: "var(--gm-font-xs)",
                            color: trimmedGitUrl && !isHttpsRemote ? "var(--red)" : "var(--text-secondary)",
                            marginTop: 6,
                            lineHeight: 1.5,
                          }}>
                            {trimmedGitUrl && !isHttpsRemote ? t("setup.mobileHttpsRequired") : t("setup.mobileTokenHint")}
                          </p>
                          <div style={{
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: "var(--gm-radius-lg)",
                            border: "1px solid var(--border)",
                            background: "var(--bg-hover)",
                          }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <KeyRound size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                              <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                {t("setup.mobileTokenGuide")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void openUrl(accessTokenHelpUrl(trimmedGitUrl, platform))}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 5,
                                marginTop: 8,
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: "var(--gm-radius-md)",
                                border: "1px solid var(--border)",
                                background: "var(--bg)",
                                color: "var(--accent)",
                                fontSize: "var(--gm-font-xs)",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              <ExternalLink size={12} /> {t("setup.createAccessToken")}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={buttonRowStyle}>
                <button style={navBackButtonStyle} onClick={() => setStep("language")}>
                  {t("setup.back")}
                </button>
                <button
                  style={{
                    ...navPrimaryButtonStyle,
                    opacity: remoteReady ? 1 : 0.5,
                  }}
                  disabled={!remoteReady}
                  onClick={() => {
                    setSshKeyCopied(false);
                    if (isMobile) {
                      void runInit();
                    } else {
                      void loadSshCandidates();
                    }
                  }}
                >
                  {scanningSsh ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : t("setup.next")}
                  {!scanningSsh && <ChevronRight size={16} />}
                </button>
              </div>
            </div>
          )}

          {step === "ssh_key" && renderPanel(
            <div>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <KeyRound size={36} style={{ color: "var(--accent)", display: "block", margin: "0 auto 12px" }} />
              </div>

              {sshScanError && (
                <div style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--gm-radius-lg)",
                  border: "1px solid var(--red)",
                  color: "var(--red)",
                  background: "color-mix(in srgb, var(--red) 10%, var(--bg-card))",
                  fontSize: "var(--gm-font-xs)",
                  lineHeight: 1.5,
                }}>
                  {sshScanError}
                </div>
              )}

              <div style={candidateListStyle}>
                {sshCandidates.map(candidate => (
                  <button
                    key={candidate.path}
                    style={{ ...optionCard(selectedSshKeyPath === candidate.path), alignItems: "flex-start" }}
                    onClick={() => {
                      setSelectedSshKeyPath(candidate.path);
                      setSshKeyCopied(false);
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, wordBreak: "break-all" }}>{candidate.path}</span>
                        {candidate.recommended && (
                          <span style={{
                            fontSize: "var(--gm-font-2xs)",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "var(--gm-radius-pill)",
                            background: "color-mix(in srgb, var(--accent) 14%, var(--bg-card))",
                            color: "var(--accent)",
                          }}>
                            {t("setup.recommended")}
                          </span>
                        )}
                      </div>
                      {candidate.reason && (
                        <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginBottom: 4 }}>
                          {candidate.reason}
                        </div>
                      )}
                    </div>
                    {selectedSshKeyPath === candidate.path && <Check size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <button
                  style={{ ...btnSecondary, flex: 1, opacity: generatingSshKey ? 0.7 : 1 }}
                  disabled={generatingSshKey}
                  onClick={() => {
                    setSshKeyCopied(false);
                    void generateSshKey();
                  }}
                >
                  {generatingSshKey ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={16} />}
                  {t("setup.generateSshKey")}
                </button>
                <button
                  style={{ ...btnSecondary, width: "auto", padding: "10px 14px" }}
                  onClick={() => {
                    setSshKeyCopied(false);
                    void loadSshCandidates();
                  }}
                >
                  {t("common.refresh")}
                </button>
              </div>

              {selectedSshCandidate && (
                <div style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--gm-radius-lg)",
                  border: "1px dashed var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "var(--gm-font-xs)",
                  color: "var(--text-secondary)",
                }}>
                  <GitBranch size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedSshCandidate.public_key}
                  </span>
                  <button
                    onClick={() => copySshKey(selectedSshCandidate.public_key)}
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: "var(--gm-radius-md)",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontSize: "var(--gm-font-xs)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Copy size={12} /> {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                  </button>
                </div>
              )}

              {sshCandidates.length === 0 && !scanningSsh && (
                <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                  {t("setup.noSshKeysFound")}
                </p>
              )}

              <div style={buttonRowStyle}>
                <button style={navBackButtonStyle} onClick={() => setStep("storage")}>
                  {t("setup.back")}
                </button>
                <button
                  style={{ ...navPrimaryButtonStyle, opacity: selectedSshKeyPath ? 1 : 0.5 }}
                  disabled={!selectedSshKeyPath}
                  onClick={() => setStep("editors")}
                >
                  {t("setup.next")} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "editors" && renderPanel(
            <div>
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <Code2 size={36} style={{ color: "var(--accent)", display: "block", margin: "0 auto 12px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                <button style={optionCard(editors.includes("claude"))} onClick={() => toggleEditor("claude")}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: "var(--gm-radius-sm)",
                    border: `2px solid ${editors.includes("claude") ? "var(--accent)" : "var(--border)"}`,
                    background: editors.includes("claude") ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {editors.includes("claude") && <Check size={12} color="var(--gm-color-on-accent)" />}
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>Claude Code</div>
                    <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.claudeDesc")}</div>
                  </div>
                </button>
                <button style={optionCard(editors.includes("cursor"))} onClick={() => toggleEditor("cursor")}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: "var(--gm-radius-sm)",
                    border: `2px solid ${editors.includes("cursor") ? "var(--accent)" : "var(--border)"}`,
                    background: editors.includes("cursor") ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {editors.includes("cursor") && <Check size={12} color="var(--gm-color-on-accent)" />}
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>Cursor</div>
                    <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.cursorDesc")}</div>
                  </div>
                </button>
                <button style={optionCard(editors.includes("codex"))} onClick={() => toggleEditor("codex")}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: "var(--gm-radius-sm)",
                    border: `2px solid ${editors.includes("codex") ? "var(--accent)" : "var(--border)"}`,
                    background: editors.includes("codex") ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {editors.includes("codex") && <Check size={12} color="var(--gm-color-on-accent)" />}
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600 }}>Codex</div>
                    <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.codexDesc")}</div>
                  </div>
                </button>
              </div>
              <div style={buttonRowStyle}>
                <button style={navBackButtonStyle} onClick={() => setStep(isSshRemote ? "ssh_key" : "storage")}>
                  {t("setup.back")}
                </button>
                <button style={navPrimaryButtonStyle} onClick={runInit}>
                  <Rocket size={16} /> {t("setup.startSetup")}
                </button>
              </div>
              <p style={{
                fontSize: "var(--gm-font-xs)",
                color: "var(--text-secondary)",
                textAlign: "center",
                marginTop: 10,
                visibility: editors.length === 0 ? "visible" : "hidden",
              }}>
                {t("setup.skipEditorsHint")}
              </p>
            </div>
          )}

          {step === "running" && renderPanel(
            <div style={{
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 18,
              padding: isMobile ? "28px 0" : "48px 0",
            }}>
              <div style={{ textAlign: "center" }}>
                <Loader2
                  size={isMobile ? 40 : 48}
                  style={{
                    color: "var(--accent)",
                    animation: "spin 1s linear infinite",
                    display: "block",
                    margin: "0 auto 16px",
                  }}
                />
                <h2 style={{ fontSize: isMobile ? "var(--gm-font-xl)" : "var(--gm-font-2xl)", fontWeight: 700, marginBottom: 8 }}>{t("setup.settingUp")}</h2>
                <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {latestInitLog?.message ?? (isMobile ? t("setup.mobilePleaseWait") : t("setup.pleaseWait"))}
                </p>
              </div>

              <div style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--gm-radius-lg)",
                background: "var(--bg-hover)",
                overflow: "hidden",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: "var(--gm-font-xs)", fontWeight: 700 }}>{t("setup.initLogTitle")}</span>
                  <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                    {t("setup.initLogCount", initLogs.length)}
                  </span>
                </div>
                <div
                  ref={initLogRef}
                  style={{
                    maxHeight: isMobile ? 230 : 260,
                    overflowY: "auto",
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {initLogs.length === 0 ? (
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("setup.initWaitingLog")}</p>
                  ) : initLogs.map((item, index) => (
                    <div key={`${item.step}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      {initLogIcon(item.status)}
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          fontSize: "var(--gm-font-xs)",
                          color: item.status === "error" ? "var(--red)" : "var(--text)",
                          lineHeight: 1.5,
                          wordBreak: "break-word",
                        }}>
                          {item.message}
                        </p>
                        <p style={{ fontSize: "var(--gm-font-2xs)", color: "var(--text-secondary)", marginTop: 2 }}>
                          {item.step}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", lineHeight: 1.6, textAlign: "center" }}>
                {t("setup.initLongRunningHint")}
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {step === "done" && renderPanel(
            error ? (
              <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 60 }}>
                <AlertCircle size={40} style={{ color: "var(--red)", marginBottom: 12 }} />
                <h2 style={{ fontSize: "var(--gm-font-lg)", fontWeight: 700, marginBottom: 8, color: "var(--red)" }}>{t("setup.failed")}</h2>
                <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>{error}</p>
                <button style={btnPrimary} onClick={() => { setError(""); setStep(retryStep); }}>
                  {t("setup.retry")}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: "var(--gm-radius-pill)",
                    background: showSetupError
                      ? "color-mix(in srgb, var(--red) 14%, var(--bg-card))"
                      : "color-mix(in srgb, var(--green) 14%, var(--bg-card))",
                    margin: "0 auto 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    {showSetupError ? (
                      <AlertCircle size={28} style={{ color: "var(--red)" }} />
                    ) : (
                      <Check size={28} style={{ color: "var(--green)" }} />
                    )}
                  </div>
                  <h2 style={{
                    fontSize: "var(--gm-font-xl)",
                    fontWeight: 700,
                    marginBottom: 6,
                    color: showSetupError ? "var(--red)" : "var(--text)",
                  }}>
                    {showSetupError ? t("setup.failed") : t("setup.complete")}
                  </h2>
                  <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>
                    {showSetupError
                      ? (storageMode === "remote"
                          ? (isMobile
                              ? t("setup.mobileRemoteErrorDesc")
                              : "Setup did not complete. Check the failed steps below, make sure your SSH key is ready in the remote repository, then retry.")
                          : "Setup did not complete. Review the failed steps below and retry.")
                      : t("setup.completeDesc")}
                  </p>
                </div>

                {result && result.steps.length > 0 && (
                  <div style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    borderRadius: "var(--gm-radius-lg)",
                    background: "var(--bg-hover)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}>
                    {result.steps.map((item, index) => (
                      <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "var(--gm-font-xs)" }}>
                        {item.ok ? (
                          <Check size={14} style={{ color: "var(--green)", flexShrink: 0 }} />
                        ) : (
                          <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />
                        )}
                        <span style={{ color: item.ok ? "var(--text)" : "var(--red)" }}>{item.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isDesktop && result?.ssh_public_key && doneDeployKeysUrl && (
                  <div style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    borderRadius: "var(--gm-radius-lg)",
                    border: "1px dashed var(--border)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <GitBranch size={14} style={{ color: "var(--accent)" }} />
                      <span style={{ fontSize: "var(--gm-font-xs)", fontWeight: 600 }}>{t("setup.sshKeyTitle")}</span>
                      <button
                        onClick={() => copySshKey(result.ssh_public_key)}
                        style={{
                          marginLeft: "auto",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          borderRadius: "var(--gm-radius-md)",
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          fontSize: "var(--gm-font-xs)",
                          cursor: "pointer",
                        }}
                      >
                        <Copy size={12} /> {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                      </button>
                    </div>
                    <code style={{ display: "block", fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.4 }}>
                      {result.ssh_public_key}
                    </code>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 8 }}>{t("setup.sshKeyHint")}</p>
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--yellow)", marginTop: 6, fontWeight: 600 }}>
                      {t("setup.sshWriteAccess")}
                    </p>
                    <button
                      onClick={() => void openUrl(doneDeployKeysUrl)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 8,
                        padding: "6px 12px",
                        borderRadius: "var(--gm-radius-md)",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--accent)",
                        fontSize: "var(--gm-font-xs)",
                        cursor: "pointer",
                      }}
                    >
                      <ExternalLink size={12} /> {t("setup.openDeployKeys")}
                    </button>
                  </div>
                )}

                {setupSucceeded ? (
                  <button
                    style={{ ...btnPrimary, opacity: entering ? 0.7 : 1 }}
                    disabled={entering}
                    onClick={() => {
                      setEntering(true);
                      onComplete(result?.needs_remote_sync);
                    }}
                  >
                    {entering ? (
                      <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t("setup.pleaseWait")}</>
                    ) : (
                      <>{t("setup.enterApp")} <ChevronRight size={16} /></>
                    )}
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button style={btnPrimary} onClick={() => setStep(retryStep)}>
                      {t("setup.retry")}
                    </button>
                    <button style={btnSecondary} onClick={() => setStep("language")}>
                      Start over
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
