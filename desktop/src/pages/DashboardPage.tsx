import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  MessageSquare, StickyNote, BookOpen, FileText, HardDrive, GitBranch, Settings, Power, Clipboard,
} from "lucide-react";

interface AppStats {
  conversations: number;
  daily_notes: number;
  manuals: number;
  scratch_notes: number;
  total_size_kb: number;
  unpushed: number;
}

interface AppStatus {
  initialized: boolean;
  sync_dir: string;
  git_remote: string;
  git_branch: string;
  unpushed: number;
}

interface DesktopSettings {
  autostart: boolean;
  clipboard_autostart: boolean;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, st, se] = await Promise.all([
        invoke<AppStats>("get_stats"),
        invoke<AppStatus>("get_status"),
        invoke<DesktopSettings>("get_settings"),
      ]);
      setStats(s);
      setStatus(st);
      setSettings(se);
    } catch (e) {
      setError(`${e}`);
    }
  };

  const toggleAutostart = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_autostart", { enabled: !settings.autostart });
      setSettings({ ...settings, autostart: !settings.autostart });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleClipboardAutostart = async () => {
    if (!settings) return;
    try {
      await invoke<string>("set_clipboard_autostart", { enabled: !settings.clipboard_autostart });
      setSettings({ ...settings, clipboard_autostart: !settings.clipboard_autostart });
    } catch (e) {
      console.error(e);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center px-8">
          <GitBranch size={40} style={{ color: "var(--border)" }} className="mx-auto mb-4" />
          <p className="text-[15px] mb-2" style={{ color: "var(--red)" }}>{error}</p>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Run <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)" }}>gitmemo init</code> to get started
          </p>
        </div>
      </div>
    );
  }

  if (!stats || !status) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  const cards = [
    { icon: MessageSquare, label: "Conversations", value: stats.conversations, color: "var(--accent)" },
    { icon: StickyNote, label: "Daily Notes", value: stats.daily_notes, color: "var(--green)" },
    { icon: BookOpen, label: "Manuals", value: stats.manuals, color: "var(--yellow)" },
    { icon: FileText, label: "Scratch Notes", value: stats.scratch_notes, color: "#c084fc" },
  ];

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h1 className="text-[20px] font-bold mb-6">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="p-4 rounded-lg border"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Icon size={18} style={{ color: card.color }} />
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{card.label}</span>
              </div>
              <p className="text-[28px] font-bold">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={16} style={{ color: "var(--text-secondary)" }} />
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Storage</span>
          </div>
          <p className="text-[16px] font-semibold">{stats.total_size_kb.toFixed(1)} KB</p>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{status.sync_dir}</p>
        </div>

        <div className="p-4 rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={16} style={{ color: "var(--text-secondary)" }} />
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Git Status</span>
          </div>
          <p className="text-[14px] font-semibold">
            {status.unpushed > 0 ? (
              <span style={{ color: "var(--yellow)" }}>{status.unpushed} unpushed</span>
            ) : (
              <span style={{ color: "var(--green)" }}>Synced</span>
            )}
          </p>
          <p className="text-[11px] mt-1 truncate" style={{ color: "var(--text-secondary)" }} title={status.git_remote}>
            {status.git_remote || "No remote configured"}
          </p>
        </div>
      </div>

      {/* Settings */}
      {settings && (
        <div className="rounded-lg border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} style={{ color: "var(--text-secondary)" }} />
            <span className="text-[14px] font-semibold">Settings</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Power size={14} style={{ color: "var(--text-secondary)" }} />
                <span className="text-[13px]">Launch at login</span>
              </div>
              <button
                onClick={toggleAutostart}
                className="w-10 h-5 rounded-full relative transition-colors"
                style={{ background: settings.autostart ? "var(--accent)" : "var(--bg-hover)" }}
              >
                <div
                  className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                  style={{
                    background: "#fff",
                    left: settings.autostart ? "22px" : "2px",
                  }}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clipboard size={14} style={{ color: "var(--text-secondary)" }} />
                <span className="text-[13px]">Auto-start clipboard monitor</span>
              </div>
              <button
                onClick={toggleClipboardAutostart}
                className="w-10 h-5 rounded-full relative transition-colors"
                style={{ background: settings.clipboard_autostart ? "var(--accent)" : "var(--bg-hover)" }}
              >
                <div
                  className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                  style={{
                    background: "#fff",
                    left: settings.clipboard_autostart ? "22px" : "2px",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
