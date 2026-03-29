import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import {
  MessageSquare, StickyNote, BookOpen, FileText, Clipboard,
  HardDrive, GitBranch, GitCommit, RefreshCw, Zap, FolderOpen, Terminal,
} from "lucide-react";

interface AppStats {
  conversations: number;
  daily_notes: number;
  manuals: number;
  scratch_notes: number;
  clips: number;
  total_size_kb: number;
  unpushed: number;
}

interface AppStatus {
  initialized: boolean;
  sync_dir: string;
  git_remote: string;
  git_branch: string;
  unpushed: number;
  last_commit_id: string;
  last_commit_msg: string;
  last_commit_time: string;
}


export default function DashboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<AppStats | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    try {
      const [s, st] = await Promise.all([
        invoke<AppStats>("get_stats"),
        invoke<AppStatus>("get_status"),
      ]);
      setStats(s);
      setStatus(st);
    } catch (e) {
      setError(`${e}`);
    }
  };

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ textAlign: "center", padding: "0 32px" }}>
          <GitBranch size={48} style={{ color: "#555", margin: "0 auto 16px" }} />
          <p style={{ fontSize: 16, color: "var(--red)", marginBottom: 8 }}>{error}</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {t("dashboard.initHint")}
          </p>
        </div>
      </div>
    );
  }

  if (!stats || !status) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--text-secondary)" }}>{t("dashboard.loading")}</p>
      </div>
    );
  }

  const statCards = [
    { icon: MessageSquare, label: t("dashboard.conversations"), value: stats.conversations, color: "var(--accent)" },
    { icon: StickyNote, label: t("dashboard.dailyNotes"), value: stats.daily_notes, color: "var(--green)" },
    { icon: BookOpen, label: t("dashboard.manuals"), value: stats.manuals, color: "var(--yellow)" },
    { icon: FileText, label: t("dashboard.scratchNotes"), value: stats.scratch_notes, color: "#c084fc" },
    { icon: Clipboard, label: t("dashboard.clips"), value: stats.clips, color: "#f472b6" },
    { icon: HardDrive, label: t("dashboard.storage"), value: stats.total_size_kb >= 1024 ? `${(stats.total_size_kb / 1024).toFixed(1)} MB` : `${stats.total_size_kb.toFixed(1)} KB`, color: "var(--text-secondary)" },
  ];

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 20px",
  };

  return (
    <div style={{ padding: "20px 28px 28px", overflowY: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{t("dashboard.title")}</h1>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: `${card.color}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={13} style={{ color: card.color }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{card.label}</span>
              </div>
              <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Git Info — 3 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Branch */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <GitBranch size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.branch")}</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
            {status.git_branch || "main"}
          </p>
        </div>

        {/* Sync Status */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <RefreshCw size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.syncStatus")}</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700 }}>
            {status.unpushed > 0 ? (
              <span style={{ color: "var(--yellow)" }}>{status.unpushed} {t("dashboard.unpushed")}</span>
            ) : (
              <span style={{ color: "var(--green)" }}>{t("dashboard.synced")}</span>
            )}
          </p>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
            {new Date().toLocaleString()}
          </p>
        </div>

        {/* Last Commit */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <GitCommit size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.lastCommit")}</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: "var(--accent)" }}>
            {status.last_commit_id || "—"}
          </p>
          {status.last_commit_time && (
            <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
              {status.last_commit_time}
            </p>
          )}
        </div>
      </div>

      {/* Quick Info */}
      <div style={{
        marginTop: 20, padding: "16px 20px", borderRadius: 10,
        border: "1px dashed var(--border)", background: "transparent",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Zap size={13} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.quickInfo")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpen size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status.sync_dir}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={status.git_remote}>
              {status.git_remote || t("dashboard.noRemote")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Terminal size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              CLI: gitmemo --help
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {t("dashboard.totalFiles", String(stats.conversations + stats.daily_notes + stats.manuals + stats.scratch_notes + stats.clips))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
