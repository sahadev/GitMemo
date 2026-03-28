import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Power, Clipboard, Sun, Moon, GitBranch, ExternalLink } from "lucide-react";
import type { Theme } from "../App";

interface DesktopSettings {
  autostart: boolean;
  clipboard_autostart: boolean;
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
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [branch, setBranch] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [editingBranch, setEditingBranch] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    invoke<DesktopSettings>("get_settings").then(setSettings).catch(console.error);
    invoke<string>("get_branch").then((b) => { setBranch(b); setBranchInput(b); }).catch(console.error);
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
      setToast(msg);
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      setToast(`Error: ${e}`);
      setTimeout(() => setToast(""), 2500);
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

  return (
    <div style={{ padding: "20px 32px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Settings size={20} style={{ color: "var(--text-secondary)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h1>
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
                <p style={{ fontSize: 13, fontWeight: 500 }}>Appearance</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Currently using {theme} mode
                </p>
              </div>
            </div>
            <Toggle enabled={theme === "dark"} onToggle={onToggleTheme} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Launch at login */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Power size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>Launch at login</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Start GitMemo when you log in</p>
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
                <p style={{ fontSize: 13, fontWeight: 500 }}>Auto-start clipboard monitor</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Begin capturing clipboard on launch</p>
              </div>
            </div>
            <Toggle enabled={settings?.clipboard_autostart ?? false} onToggle={toggleClipboardAutostart} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Git branch */}
          <div style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GitBranch size={15} style={{ color: "var(--text-secondary)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>Sync branch</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Git branch used for syncing</p>
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
        </div>
      </div>

      {/* About */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0" }}>
        <img src="/logo.png" alt="GitMemo" style={{ width: 48, height: 48, borderRadius: 10, marginBottom: 10 }} />
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>GitMemo Desktop</p>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>v0.2.0</p>
        <button
          onClick={() => window.open("https://github.com/sahadev/gitmemo")}
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

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 16, right: 16, padding: "10px 16px",
          borderRadius: 8, fontSize: 12, zIndex: 50,
          background: toast.startsWith("Error") ? "#2d1515" : "var(--bg-card)",
          color: toast.startsWith("Error") ? "var(--red)" : "var(--green)",
          border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
