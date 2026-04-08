import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n, Locale } from "../hooks/useI18n";
import {
  Globe, HardDrive, Cloud, GitBranch, Code2, Check, ChevronRight,
  Loader2, Copy, AlertCircle, Rocket, ExternalLink,
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
}

type WizardStep = "language" | "storage" | "git_url" | "editors" | "running" | "done";
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

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState<WizardStep>("language");
  const [lang, setLang] = useState<Locale>(locale);
  const [storageMode, setStorageMode] = useState<"local" | "remote">("local");
  const [platform, setPlatform] = useState<GitPlatform | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [editors, setEditors] = useState<string[]>([]);
  const [result, setResult] = useState<InitResult | null>(null);
  const [error, setError] = useState("");
  const [sshKeyCopied, setSshKeyCopied] = useState(false);

  const handleLangSelect = useCallback((l: Locale) => {
    setLang(l);
    setLocale(l);
  }, [setLocale]);

  const toggleEditor = useCallback((editor: string) => {
    setEditors(prev =>
      prev.includes(editor) ? prev.filter(e => e !== editor) : [...prev, editor]
    );
  }, []);

  const runInit = useCallback(async () => {
    setStep("running");
    setError("");
    try {
      const res = await invoke<InitResult>("init_gitmemo", {
        request: {
          lang,
          git_url: storageMode === "remote" ? gitUrl : "",
          editors,
        },
      });
      setResult(res);
      setStep("done");
    } catch (e) {
      setError(`${e}`);
      setStep("done");
    }
  }, [lang, storageMode, gitUrl, editors]);

  const copySshKey = useCallback(() => {
    if (result?.ssh_public_key) {
      void navigator.clipboard.writeText(result.ssh_public_key);
      setSshKeyCopied(true);
      setTimeout(() => setSshKeyCopied(false), 2000);
    }
  }, [result]);

  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "24px",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 480,
    padding: "36px 32px",
    borderRadius: 16,
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
  };

  const btnPrimary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 20px",
    borderRadius: 10,
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
    borderRadius: 10,
    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "var(--accent)10" : "transparent",
    cursor: "pointer",
    transition: "all 0.15s",
    width: "100%",
    textAlign: "left" as const,
  });

  // Step indicators
  const steps: WizardStep[] = ["language", "storage", "editors"];
  const stepIndex = steps.indexOf(step);
  const showStepIndicator = stepIndex >= 0;

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Step indicator */}
        {showStepIndicator && (
          <div style={{ display: "flex", gap: 6, marginBottom: 28, justifyContent: "center" }}>
            {steps.map((s, i) => (
              <div
                key={s}
                style={{
                  width: i <= stepIndex ? 24 : 8,
                  height: 4,
                  borderRadius: 2,
                  background: i <= stepIndex ? "var(--accent)" : "var(--border)",
                  transition: "all 0.3s",
                }}
              />
            ))}
          </div>
        )}

        {/* Language Selection */}
        {step === "language" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <Globe size={36} style={{ color: "var(--accent)", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                Welcome to GitMemo
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Choose your preferred language
              </p>
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

        {/* Storage Mode */}
        {step === "storage" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <HardDrive size={36} style={{ color: "var(--accent)", display: "block", margin: "0 auto 12px" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                {t("setup.storageTitle")}
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {t("setup.storageDesc")}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              <button style={optionCard(storageMode === "local")} onClick={() => setStorageMode("local")}>
                <HardDrive size={20} style={{ color: "var(--green)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t("setup.localMode")}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("setup.localModeDesc")}</div>
                </div>
                {storageMode === "local" && <Check size={18} style={{ color: "var(--accent)" }} />}
              </button>
              <button style={optionCard(storageMode === "remote")} onClick={() => setStorageMode("remote")}>
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
                {/* Platform selector */}
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                  {t("setup.platformTitle")}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {(Object.keys(PLATFORM_META) as GitPlatform[]).map(p => {
                    const meta = PLATFORM_META[p];
                    const selected = platform === p;
                    return (
                      <button
                        key={p}
                        onClick={() => { setPlatform(p); if (!gitUrl) setGitUrl(""); }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                          background: selected ? "var(--accent)10" : "transparent",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textAlign: "left",
                          ...(p === "other" ? { gridColumn: "1 / -1" } : {}),
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: 4,
                            background: meta.color, flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {p === "other" ? t("setup.platformOther") : meta.label}
                          </span>
                          {selected && <Check size={14} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
                        </div>
                        {p !== "other" && (
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5, paddingLeft: 14 }}>
                            {t("setup.repoLimit")}: {meta.repoLimit}
                            {" · "}
                            {t("setup.fileLimit")}: {meta.fileLimit}
                            {" · "}
                            {t("setup.freeStorage")}: {meta.freeStorage}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Git URL input */}
                {platform && (
                  <>
                    <input
                      type="text"
                      value={gitUrl}
                      onChange={e => setGitUrl(e.target.value)}
                      placeholder={PLATFORM_META[platform].placeholder}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
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
                onClick={() => setStep("editors")}
              >
                {t("setup.next")} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Git URL step merged into storage */}

        {/* Editor Selection */}
        {step === "editors" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <Code2 size={36} style={{ color: "var(--accent)", display: "block", margin: "0 auto 12px" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                {t("setup.editorsTitle")}
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {t("setup.editorsDesc")}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              <button style={optionCard(editors.includes("claude"))} onClick={() => toggleEditor("claude")}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  border: `2px solid ${editors.includes("claude") ? "var(--accent)" : "var(--border)"}`,
                  background: editors.includes("claude") ? "var(--accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
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
                  width: 20, height: 20, borderRadius: 4,
                  border: `2px solid ${editors.includes("cursor") ? "var(--accent)" : "var(--border)"}`,
                  background: editors.includes("cursor") ? "var(--accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
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
              <button style={{ ...btnSecondary, width: "auto", padding: "10px 20px" }} onClick={() => setStep("storage")}>
                {t("setup.back")}
              </button>
              <button style={btnPrimary} onClick={runInit}>
                <Rocket size={16} /> {t("setup.startSetup")}
              </button>
            </div>
            <p style={{
              fontSize: 11, color: "var(--text-secondary)", textAlign: "center", marginTop: 10,
              visibility: editors.length === 0 ? "visible" : "hidden",
            }}>
              {t("setup.skipEditorsHint")}
            </p>
          </div>
        )}

        {/* Running */}
        {step === "running" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Loader2 size={40} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", marginBottom: 16 }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {t("setup.settingUp")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {t("setup.pleaseWait")}
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div>
            {error ? (
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <AlertCircle size={40} style={{ color: "var(--red)", marginBottom: 12 }} />
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--red)" }}>
                  {t("setup.failed")}
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{error}</p>
                <button style={btnPrimary} onClick={() => { setError(""); setStep("editors"); }}>
                  {t("setup.retry")}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 24,
                    background: "var(--green)20", margin: "0 auto 12px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={28} style={{ color: "var(--green)" }} />
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                    {t("setup.complete")}
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {t("setup.completeDesc")}
                  </p>
                </div>

                {/* Show steps */}
                {result && result.steps.length > 0 && (
                  <div style={{
                    marginBottom: 16, padding: "12px 16px",
                    borderRadius: 8, background: "var(--bg-hover)",
                    maxHeight: 160, overflowY: "auto",
                  }}>
                    {result.steps.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                        {s.ok ? (
                          <Check size={14} style={{ color: "var(--green)", flexShrink: 0 }} />
                        ) : (
                          <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />
                        )}
                        <span style={{ color: s.ok ? "var(--text)" : "var(--red)" }}>{s.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* SSH Key */}
                {result?.ssh_public_key && (
                  <div style={{
                    marginBottom: 16, padding: "12px 16px",
                    borderRadius: 8, border: "1px dashed var(--border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <GitBranch size={14} style={{ color: "var(--accent)" }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{t("setup.sshKeyTitle")}</span>
                      <button
                        onClick={copySshKey}
                        style={{
                          marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                          background: "transparent", color: "var(--text-secondary)",
                          fontSize: 11, cursor: "pointer",
                        }}
                      >
                        <Copy size={12} /> {sshKeyCopied ? t("setup.copied") : t("setup.copy")}
                      </button>
                    </div>
                    <code style={{
                      display: "block", fontSize: 10, color: "var(--text-secondary)",
                      wordBreak: "break-all", lineHeight: 1.4,
                    }}>
                      {result.ssh_public_key}
                    </code>
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
                      {t("setup.sshKeyHint")}
                    </p>
                    <p style={{
                      fontSize: 11, color: "var(--yellow, #fbbf24)", marginTop: 6, fontWeight: 600,
                    }}>
                      {t("setup.sshWriteAccess")}
                    </p>
                    {gitUrl.includes("github.com") && (() => {
                      const match = gitUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
                      if (!match) return null;
                      const deployUrl = `https://github.com/${match[1]}/${match[2]}/settings/keys/new`;
                      return (
                        <button
                          onClick={() => void openUrl(deployUrl)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            marginTop: 8, padding: "6px 12px", borderRadius: 6,
                            border: "1px solid var(--border)", background: "transparent",
                            color: "var(--accent)", fontSize: 11, cursor: "pointer",
                          }}
                        >
                          <ExternalLink size={12} /> {t("setup.openDeployKeys")}
                        </button>
                      );
                    })()}
                  </div>
                )}

                <button style={btnPrimary} onClick={onComplete}>
                  {t("setup.enterApp")} <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
