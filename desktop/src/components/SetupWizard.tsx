import { useState, useCallback, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n, Locale } from "../hooks/useI18n";
import {
  Globe, HardDrive, Cloud, GitBranch, Code2, Check, ChevronRight,
  Loader2, Copy, AlertCircle, Rocket, ExternalLink, KeyRound,
} from "lucide-react";

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
    color: "#24292e",
  },
  gitlab: {
    label: "GitLab",
    placeholder: "git@gitlab.com:user/gitmemo-data.git",
    repoLimit: "10GB",
    fileLimit: "—",
    freeStorage: "5GB",
    color: "#fc6d26",
  },
  gitee: {
    label: "Gitee",
    placeholder: "git@gitee.com:user/gitmemo-data.git",
    repoLimit: "500MB",
    fileLimit: "100MB",
    freeStorage: "5GB",
    color: "#c71d23",
  },
  bitbucket: {
    label: "Bitbucket",
    placeholder: "git@bitbucket.org:user/gitmemo-data.git",
    repoLimit: "4GB",
    fileLimit: "—",
    freeStorage: "1GB",
    color: "#0052cc",
  },
  other: {
    label: "Other",
    placeholder: "git@your-server.com:user/gitmemo-data.git",
    repoLimit: "—",
    fileLimit: "—",
    freeStorage: "—",
    color: "#6b7280",
  },
};

export function SetupWizard({ onComplete }: { onComplete: (needsRemoteSync?: boolean) => void }) {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState<WizardStep>("language");
  const [lang, setLang] = useState<Locale>(locale);
  const [storageMode, setStorageMode] = useState<"local" | "remote">("local");
  const [platform, setPlatform] = useState<GitPlatform | null>(null);
  const [gitUrl, setGitUrl] = useState("");
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

  const isSshRemote = storageMode === "remote" && gitUrl.trim().startsWith("git@");

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
    try {
      const res = await invoke<InitResult>("init_gitmemo", {
        request: {
          lang,
          git_url: storageMode === "remote" ? gitUrl : "",
          ssh_key_path: isSshRemote ? selectedSshKeyPath : null,
          editors,
        },
      });
      setResult(res);
      setStep("done");
    } catch (e) {
      setError(`${e}`);
      setStep("done");
    }
  }, [lang, storageMode, gitUrl, isSshRemote, selectedSshKeyPath, editors]);

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
    boxSizing: "border-box",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    borderRadius: 0,
    background: "var(--bg-card)",
    border: "none",
    display: "grid",
    gridTemplateColumns: step === "done" ? "300px minmax(0, 1fr)" : "280px minmax(0, 1fr)",
    overflow: "hidden",
    boxShadow: "none",
  };

  const btnPrimary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 20px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 14,
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

  const optionCard = (selected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    borderRadius: 8,
    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "var(--accent)10" : "transparent",
    cursor: "pointer",
    transition: "all 0.15s",
    width: "100%",
    textAlign: "left",
  });

  const steps: WizardStep[] = ["language", "storage", ...(isSshRemote ? ["ssh_key" as const] : []), "editors"];
  const stepIndex = steps.indexOf(step);
  const showStepIndicator = stepIndex >= 0;
  const selectedPlatformMeta = platform ? PLATFORM_META[platform] : null;
  const setupSucceeded = !!result?.success;
  const showSetupError = !!error || (!!result && !result.success);
  const retryStep: WizardStep = storageMode === "remote" ? "storage" : "editors";
  const selectedSshCandidate = sshCandidates.find(candidate => candidate.path === selectedSshKeyPath) ?? null;
  const doneDeployKeysUrl = result?.deploy_keys_url ?? deployKeysUrl;

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
    storage: t("setup.storageDesc"),
    ssh_key: t("setup.sshSelectDesc"),
    editors: t("setup.editorsDesc"),
    running: t("setup.pleaseWait"),
    done: showSetupError
      ? (storageMode === "remote"
          ? "Setup did not complete. Check the failed steps and retry after confirming your remote access."
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
        ? (storageMode === "remote" ? t("setup.tipStorageRemote") : t("setup.tipStorageLocal"))
        : step === "ssh_key"
          ? t("setup.sshWriteAccess")
          : step === "editors"
            ? t("setup.tipEditors")
            : step === "done"
              ? t("setup.tipSave")
              : t("setup.tipSettingUp");

  const renderPanel = (content: ReactNode) => (
    <div style={{ padding: "28px 30px 24px", overflowY: "auto", minWidth: 0, minHeight: 0, height: "100%" }}>
      {content}
    </div>
  );

  const candidateListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 12,
    maxHeight: 260,
    overflowY: "auto",
    paddingRight: 4,
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <aside style={{
          padding: "36px 24px 32px",
          borderRight: "1px solid var(--border)",
          background: "linear-gradient(180deg, var(--bg-hover) 0%, transparent 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 22,
          minWidth: 0,
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 10, letterSpacing: 0.3 }}>
              GitMemo Setup
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>
              {stepTitles[step]}
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {stepDescriptions[step]}
            </p>
          </div>

          {showStepIndicator && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {navSteps.map(({ key, label, active, complete }, index) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: active ? "var(--accent)10" : "transparent",
                    border: `1px solid ${active ? "var(--accent)30" : "transparent"}`,
                  }}
                >
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    background: complete || active ? "var(--accent)" : "var(--bg-input)",
                    color: complete || active ? "#fff" : "var(--text-secondary)",
                    flexShrink: 0,
                  }}>
                    {complete ? <Check size={13} /> : index + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--text)" : "var(--text-secondary)" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{
            marginTop: "auto",
            padding: "14px 14px 0",
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{t("setup.tipTitle")}</div>
            {sidebarTip}
          </div>
        </aside>

        <section style={{ minWidth: 0, minHeight: 0 }}>
          {step === "language" && renderPanel(
            <div>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <Globe size={36} style={{ color: "var(--accent)", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                <button style={optionCard(lang === "en")} onClick={() => handleLangSelect("en")}>
                  <span style={{ fontSize: 22 }}>EN</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>English</div>
                  </div>
                  {lang === "en" && <Check size={18} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
                </button>
                <button style={optionCard(lang === "zh")} onClick={() => handleLangSelect("zh")}>
                  <span style={{ fontSize: 22 }}>ZH</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>中文</div>
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

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                <button style={{ ...optionCard(storageMode === "local"), padding: "12px 16px" }} onClick={() => setStorageMode("local")}>
                  <HardDrive size={20} style={{ color: "var(--green)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t("setup.localMode")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.localModeDesc")}</div>
                  </div>
                  {storageMode === "local" && <Check size={18} style={{ color: "var(--accent)" }} />}
                </button>
                <button style={{ ...optionCard(storageMode === "remote"), padding: "12px 16px" }} onClick={() => setStorageMode("remote")}>
                  <Cloud size={20} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t("setup.remoteMode")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.remoteModeDesc")}</div>
                  </div>
                  {storageMode === "remote" && <Check size={18} style={{ color: "var(--accent)" }} />}
                </button>
              </div>

              {storageMode === "remote" && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
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
                            borderRadius: 999,
                            border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                            background: selected ? "var(--accent)10" : "transparent",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            color: selected ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: 4, background: meta.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
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
                        <p style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
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
                        placeholder={selectedPlatformMeta?.placeholder ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--bg-input)",
                          color: "var(--text)",
                          fontSize: 13,
                          fontFamily: "ui-monospace, monospace",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                        {t("setup.gitUrlHint")}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...btnSecondary, width: "auto", padding: "10px 20px" }} onClick={() => setStep("language")}>
                  {t("setup.back")}
                </button>
                <button
                  style={{
                    ...btnPrimary,
                    opacity: storageMode === "remote" && (!platform || !gitUrl.trim()) ? 0.5 : 1,
                  }}
                  disabled={storageMode === "remote" && (!platform || !gitUrl.trim())}
                  onClick={() => {
                    setSshKeyCopied(false);
                    void loadSshCandidates();
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
                  borderRadius: 8,
                  border: "1px solid var(--red)",
                  color: "var(--red)",
                  background: "var(--red)10",
                  fontSize: 12,
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
                        <span style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>{candidate.path}</span>
                        {candidate.recommended && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: "var(--accent)20",
                            color: "var(--accent)",
                          }}>
                            {t("setup.recommended")}
                          </span>
                        )}
                      </div>
                      {candidate.reason && (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
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
                  borderRadius: 8,
                  border: "1px dashed var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
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
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Copy size={12} /> {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                  </button>
                </div>
              )}

              {sshCandidates.length === 0 && !scanningSsh && (
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                  {t("setup.noSshKeysFound")}
                </p>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...btnSecondary, width: "auto", padding: "10px 20px" }} onClick={() => setStep("storage")}>
                  {t("setup.back")}
                </button>
                <button
                  style={{ ...btnPrimary, opacity: selectedSshKeyPath ? 1 : 0.5 }}
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
                    borderRadius: 4,
                    border: `2px solid ${editors.includes("claude") ? "var(--accent)" : "var(--border)"}`,
                    background: editors.includes("claude") ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {editors.includes("claude") && <Check size={12} color="#fff" />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Claude Code</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.claudeDesc")}</div>
                  </div>
                </button>
                <button style={optionCard(editors.includes("cursor"))} onClick={() => toggleEditor("cursor")}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: `2px solid ${editors.includes("cursor") ? "var(--accent)" : "var(--border)"}`,
                    background: editors.includes("cursor") ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {editors.includes("cursor") && <Check size={12} color="#fff" />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Cursor</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.cursorDesc")}</div>
                  </div>
                </button>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...btnSecondary, width: "auto", padding: "10px 20px" }} onClick={() => setStep(isSshRemote ? "ssh_key" : "storage")}>
                  {t("setup.back")}
                </button>
                <button style={btnPrimary} onClick={runInit}>
                  <Rocket size={16} /> {t("setup.startSetup")}
                </button>
              </div>
              <p style={{
                fontSize: 11,
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
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <Loader2
                size={40}
                style={{
                  color: "var(--accent)",
                  animation: "spin 1s linear infinite",
                  display: "block",
                  margin: "0 auto 16px",
                }}
              />
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t("setup.settingUp")}</h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("setup.pleaseWait")}</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {step === "done" && renderPanel(
            error ? (
              <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 60 }}>
                <AlertCircle size={40} style={{ color: "var(--red)", marginBottom: 12 }} />
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--red)" }}>{t("setup.failed")}</h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{error}</p>
                <button style={btnPrimary} onClick={() => { setError(""); setStep("editors"); }}>
                  {t("setup.retry")}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: showSetupError ? "var(--red)20" : "var(--green)20",
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
                    fontSize: 20,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: showSetupError ? "var(--red)" : "var(--text)",
                  }}>
                    {showSetupError ? t("setup.failed") : t("setup.complete")}
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {showSetupError
                      ? (storageMode === "remote"
                          ? "Setup did not complete. Check the failed steps below, make sure your SSH key is ready in the remote repository, then retry."
                          : "Setup did not complete. Review the failed steps below and retry.")
                      : t("setup.completeDesc")}
                  </p>
                </div>

                {result && result.steps.length > 0 && (
                  <div style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "var(--bg-hover)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}>
                    {result.steps.map((item, index) => (
                      <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
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

                {result?.ssh_public_key && doneDeployKeysUrl && (
                  <div style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "1px dashed var(--border)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <GitBranch size={14} style={{ color: "var(--accent)" }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{t("setup.sshKeyTitle")}</span>
                      <button
                        onClick={() => copySshKey(result.ssh_public_key)}
                        style={{
                          marginLeft: "auto",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        <Copy size={12} /> {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                      </button>
                    </div>
                    <code style={{ display: "block", fontSize: 10, color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.4 }}>
                      {result.ssh_public_key}
                    </code>
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>{t("setup.sshKeyHint")}</p>
                    <p style={{ fontSize: 11, color: "var(--yellow, #fbbf24)", marginTop: 6, fontWeight: 600 }}>
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
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--accent)",
                        fontSize: 11,
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
