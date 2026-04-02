import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Settings, Power, Clipboard, Sun, Moon, GitBranch, ExternalLink, Globe, FolderOpen, Globe2, Terminal, Code, Copy, Check } from "lucide-react";
import type { Theme } from "../App";
import { useI18n, type Locale } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";

interface DesktopSettings {
  autostart: boolean;
  clipboard_autostart: boolean;
}

interface AppMeta {
  version: string;
  release_time: string;
  requires_cli: boolean;
  recommended_cli_version: string;
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: enabled ? "var(--accent)" : "#333",
        position: "relative",
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          background: "#fff",
          position: "absolute",
          top: 3,
          left: enabled ? 23 : 3,
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

interface SettingsPageProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export default function SettingsPage({ theme, onToggleTheme }: SettingsPageProps) {
  const { t, locale, setLocale } = useI18n();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [branch, setBranch] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [editingBranch, setEditingBranch] = useState(false);
  const [syncDir, setSyncDir] = useState("");
  const [gitRemote, setGitRemote] = useState("");
  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [cursorEnabled, setCursorEnabled] = useState(false);
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null);
  const [copiedField, setCopiedField] = useState<"syncDir" | "gitRemote" | null>(null);

  useEffect(() => {
    invoke<DesktopSettings>("get_settings").then(setSettings).catch(console.error);
    invoke<string>("get_branch").then((b) => { setBranch(b); setBranchInput(b); }).catch(console.error);
    invoke<{ sync_dir: string; git_remote: string }>("get_status").then((s) => {
      setSyncDir(s.sync_dir);
      setGitRemote(s.git_remote);
    }).catch(console.error);
    invoke<boolean>("get_claude_integration_status").then(setClaudeEnabled).catch(console.error);
    invoke<boolean>("get_cursor_integration_status").then(setCursorEnabled).catch(console.error);
    invoke<AppMeta>("get_app_meta").then(setAppMeta).catch(console.error);
  }, []);

  const toggleAutostart = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_autostart", { enabled: !settings.autostart });
      setSettings({ ...settings, autostart: !settings.autostart });
    } catch (e) { console.error(e); }
  };

  const toggleClipboardAutostart = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_clipboard_autostart", { enabled: !settings.clipboard_autostart });
      setSettings({ ...settings, clipboard_autostart: !settings.clipboard_autostart });
    } catch (e) { console.error(e); }
  };

  const toggleClaudeIntegration = async () => {
    try {
      if (claudeEnabled) {
        await invoke<string>("remove_claude_integration");
        setClaudeEnabled(false);
        showToast("Claude integration disabled");
      } else {
        await invoke<string>("setup_claude_integration");
        setClaudeEnabled(true);
        showToast("Claude integration enabled");
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const toggleCursorIntegration = async () => {
    try {
      if (cursorEnabled) {
        await invoke<string>("remove_cursor_integration");
        setCursorEnabled(false);
        showToast("Cursor integration disabled");
      } else {
        await invoke<string>("setup_cursor_integration", { lang: locale });
        setCursorEnabled(true);
        showToast("Cursor integration enabled");
      }
    } catch (e) {
      showToast(`Error: ${e}`, true);
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

  const copyValue = async (value: string, field: "syncDir" | "gitRemote") => {
    if (!value) return;
    try {
      await writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500);
      showToast(t("common.copied"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  };

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "20px 24px",
  };

  const rowStyle = {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  };

  const languages: { id: Locale; label: string }[] = [
    { id: "en", label: "English" },
    { id: "zh", label: "中文" },
  ];

  return (
    <div style={{ padding: "20px 32px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Settings size={20} style={{ color: "var(--text-secondary)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t("settings.title")}</h1>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Theme */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {theme === "dark" ? (
                <Moon size={15} style={{ color: "var(--text-secondary)" }} />
              ) : (
                <Sun size={15} style={{ color: "var(--text-secondary)" }} />
              )}
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.appearance")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {t("settings.appearanceDesc", t(`settings.${theme}`))}
                </p>
              </div>
            </div>
            <Toggle enabled={theme === "dark"} onToggle={onToggleTheme} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Language */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Globe size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.language")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.languageDesc")}</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {languages.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLocale(lang.id)}
                  style={{
                    padding: "4px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                    background: locale === lang.id ? "var(--accent)" : "var(--bg-hover)",
                    color: locale === lang.id ? "#fff" : "var(--text-secondary)",
                    border: locale === lang.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Launch at login */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Power size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.launchAtLogin")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.launchAtLoginDesc")}</p>
              </div>
            </div>
            <Toggle enabled={settings?.autostart ?? false} onToggle={toggleAutostart} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Clipboard autostart */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Clipboard size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.clipboardAutostart")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.clipboardAutostartDesc")}</p>
              </div>
            </div>
            <Toggle enabled={settings?.clipboard_autostart ?? false} onToggle={toggleClipboardAutostart} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Claude integration */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Terminal size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.claudeIntegration")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.claudeIntegrationDesc")}</p>
              </div>
            </div>
            <Toggle enabled={claudeEnabled} onToggle={toggleClaudeIntegration} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Cursor integration */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Code size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.cursorIntegration")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.cursorIntegrationDesc")}</p>
              </div>
            </div>
            <Toggle enabled={cursorEnabled} onToggle={toggleCursorIntegration} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Git branch */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GitBranch size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.syncBranch")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.syncBranchDesc")}</p>
              </div>
            </div>
            {editingBranch ? (
              <input
                autoFocus
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
                onBlur={saveBranch}
                onKeyDown={(e) => { if (e.key === "Enter") saveBranch(); if (e.key === "Escape") { setEditingBranch(false); setBranchInput(branch); } }}
                style={{
                  width: 120, padding: "4px 8px", borderRadius: 4, fontSize: 12,
                  background: "var(--bg)", border: "1px solid var(--accent)", color: "var(--text)",
                  fontFamily: "ui-monospace, monospace",
                }}
              />
            ) : (
              <button
                onClick={() => setEditingBranch(true)}
                style={{
                  padding: "4px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                  background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--accent)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {branch || "main"}
              </button>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Data directory */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <FolderOpen size={15} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.dataDir")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.dataDirDesc")}</p>
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
                  gap: 6,
                  maxWidth: 240,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {copiedField === "syncDir" ? <Check size={12} style={{ flexShrink: 0, color: "var(--green)" }} /> : <Copy size={12} style={{ flexShrink: 0 }} />}
                <span style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }} title={syncDir}>
                  {syncDir}
                </span>
              </button>
            ) : (
              <span style={{
                fontSize: 11, color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200,
              }}>
                —
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Remote repo */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <Globe2 size={15} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.remoteRepo")}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.remoteRepoDesc")}</p>
              </div>
            </div>
            {gitRemote ? (
              <button
                type="button"
                onClick={() => void copyValue(gitRemote, "gitRemote")}
                title={t("common.clickToCopy")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  maxWidth: 340,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {copiedField === "gitRemote" ? <Check size={12} style={{ flexShrink: 0, color: "var(--green)" }} /> : <Copy size={12} style={{ flexShrink: 0 }} />}
                <span style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }} title={gitRemote}>
                  {gitRemote}
                </span>
              </button>
            ) : (
              <span style={{
                fontSize: 11, color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300,
              }}>
                {t("settings.noRemote")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.shortcuts")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.shortcutSearch")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.shortcutGlobalSearch")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.shortcutQuickNote")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.shortcutTogglePaste")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.shortcutFind")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.shortcutEditDelete")}</p>
        </div>
      </div>

      {/* About */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0" }}>
        <img src="/logo.png" alt="GitMemo" style={{ width: 48, height: 48, borderRadius: 10, marginBottom: 10 }} />
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>GitMemo Desktop</p>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>v{appMeta?.version ?? "—"}</p>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
          {t("settings.releaseTime")}: {appMeta?.release_time || t("settings.releaseTimeUnknown")}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8, textAlign: "center" }}>
          {appMeta?.requires_cli ? t("settings.cliRequired") : t("settings.cliOptional")}
          {appMeta?.recommended_cli_version ? ` · ${t("settings.recommendedCliVersion", appMeta.recommended_cli_version)}` : ""}
        </p>
        <button
          onClick={() => void openUrl("https://github.com/sahadev/gitmemo")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, color: "var(--accent)", background: "none",
            border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <ExternalLink size={11} />
          github.com/sahadev/gitmemo
        </button>
      </div>
    </div>
  );
}
