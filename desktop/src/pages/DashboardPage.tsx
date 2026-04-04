import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { relativeTime, formatAbsoluteTime } from "../utils/time";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import {
  MessageSquare, StickyNote, BookOpen, FileText, Clipboard,
  HardDrive, GitBranch, GitCommit, RefreshCw, Zap, FolderOpen, Terminal, Lightbulb,
  Activity, Circle,
} from "lucide-react";

interface AppStats {
  conversations: number;
  daily_notes: number;
  manuals: number;
  scratch_notes: number;
  clips: number;
  plans: number;
  total_size_kb: number;
}

interface ClipboardStatus {
  watching: boolean;
  clips_count: number;
  clips_dir: string;
}

interface RecentItem {
  name: string;
  path: string;
  category: string;
  modified: string;
  modified_ts: number;
}

import type { Page } from "../App";

const categoryConfig: Record<string, { icon: typeof MessageSquare; color: string; page: Page }> = {
  conversation: { icon: MessageSquare, color: "var(--accent)", page: "conversations" },
  daily: { icon: StickyNote, color: "var(--green)", page: "notes" },
  manual: { icon: BookOpen, color: "var(--yellow)", page: "notes" },
  scratch: { icon: FileText, color: "#c084fc", page: "notes" },
  clip: { icon: Clipboard, color: "#f472b6", page: "clipboard" },
  plan: { icon: Lightbulb, color: "#fbbf24", page: "plans" },
};

const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";

interface DashboardCache {
  stats: AppStats | null;
  clipStatus: ClipboardStatus | null;
  recent: RecentItem[];
}

function loadCache(): DashboardCache | null {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch { return null; }
}

function saveCache(c: DashboardCache) {
  try { sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(c)); } catch {}
}

export default function DashboardPage({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const { t } = useI18n();
  const { isSuccess, isFailed, gitStatus } = useSync();
  useRelativeTimeTick();

  const cached = loadCache();
  const [stats, setStats] = useState<AppStats | null>(cached?.stats ?? null);
  const [clipStatus, setClipStatus] = useState<ClipboardStatus | null>(cached?.clipStatus ?? null);
  const [recent, setRecent] = useState<RecentItem[]>(cached?.recent ?? []);
  const [error, setError] = useState("");

  // Load content stats only (no git status — that comes from global useSync)
  const loadData = useCallback(async () => {
    try {
      const [s, cs, r] = await Promise.all([
        invoke<AppStats>("get_stats"),
        invoke<ClipboardStatus>("get_clipboard_status").catch(() => null),
        invoke<RecentItem[]>("get_recent_activity").catch(() => []),
      ]);
      setStats(s);
      setClipStatus(cs);
      setRecent(r);
      saveCache({ stats: s, clipStatus: cs, recent: r });
    } catch (e) {
      setError(`${e}`);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh content stats when sync completes (state-driven)
  useEffect(() => {
    if (isSuccess || isFailed) {
      loadData();
    }
  }, [isSuccess, isFailed, loadData]);

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

  if (!stats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--text-secondary)" }}>{t("dashboard.loading")}</p>
      </div>
    );
  }

  const statCards: { icon: typeof MessageSquare; label: string; value: number | string; color: string; page?: Page }[] = [
    { icon: MessageSquare, label: t("dashboard.conversations"), value: stats.conversations, color: "var(--accent)", page: "conversations" },
    { icon: StickyNote, label: t("dashboard.dailyNotes"), value: stats.daily_notes, color: "var(--green)", page: "notes" },
    { icon: BookOpen, label: t("dashboard.manuals"), value: stats.manuals, color: "var(--yellow)", page: "notes" },
    { icon: FileText, label: t("dashboard.scratchNotes"), value: stats.scratch_notes, color: "#c084fc", page: "notes" },
    { icon: Clipboard, label: t("dashboard.clips"), value: stats.clips, color: "#f472b6", page: "clipboard" },
    { icon: Lightbulb, label: t("dashboard.plans"), value: stats.plans, color: "#fbbf24", page: "plans" },
  ];

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 20px",
  };

  const syncStatus = (() => {
    if (!gitStatus) return { text: t("dashboard.loading"), color: "var(--text-secondary)" };
    if (gitStatus.behind > 0 && gitStatus.unpushed > 0) {
      return {
        text: t("dashboard.diverged", String(gitStatus.unpushed), String(gitStatus.behind)),
        color: "var(--yellow)",
      };
    }
    if (gitStatus.behind > 0) {
      return {
        text: t("dashboard.behind", String(gitStatus.behind)),
        color: "var(--red)",
      };
    }
    if (gitStatus.unpushed > 0) {
      return {
        text: `${gitStatus.unpushed} ${t("dashboard.unpushed")}`,
        color: "var(--yellow)",
      };
    }
    return {
      text: t("dashboard.synced"),
      color: "var(--green)",
    };
  })();

  return (
    <div style={{ padding: "20px 28px 28px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{t("dashboard.title")}</h1>
        {clipStatus && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 20,
            background: clipStatus.watching ? "#0f2d0f" : "var(--bg-hover)",
            cursor: "pointer",
          }} onClick={() => onNavigate?.("clipboard")}>
            <Circle
              size={7}
              fill={clipStatus.watching ? "var(--green)" : "var(--text-secondary)"}
              style={{ color: clipStatus.watching ? "var(--green)" : "var(--text-secondary)" }}
            />
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: clipStatus.watching ? "var(--green)" : "var(--text-secondary)",
            }}>
              {clipStatus.watching ? t("dashboard.clipboardActive") : t("dashboard.clipboardInactive")}
            </span>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              onClick={() => card.page && onNavigate?.(card.page)}
              style={{
                ...cardStyle,
                cursor: card.page ? "pointer" : "default",
                transition: "background 0.15s",
              }}
            >
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

      {/* Git Info — 2 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Sync Status */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <RefreshCw size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.syncStatus")}</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: syncStatus.color }}>{syncStatus.text}</span>
          </p>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
            {formatAbsoluteTime(gitStatus?.checked_at || gitStatus?.last_commit_time || "")}
          </p>
        </div>

        {/* Last Commit */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <GitCommit size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.lastCommit")}</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: "var(--accent)" }}>
            {gitStatus?.last_commit_id || "—"}
          </p>
          {gitStatus?.last_commit_time && (
            <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
              {formatAbsoluteTime(gitStatus?.last_commit_time || "")}
            </p>
          )}
        </div>
      </div>

      {/* Recent Activity — full width */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Activity size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.recentActivity")}</span>
          </div>
          {recent.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", padding: "12px 0" }}>
              {t("dashboard.noActivity")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recent.map((item) => {
                const cfg = categoryConfig[item.category] || categoryConfig.scratch;
                const Icon = cfg.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => onNavigate?.(cfg.page)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", borderRadius: 6,
                      background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left",
                      color: "var(--text)", width: "100%",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Icon size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                    <span style={{
                      flex: 1, fontSize: 12, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", flexShrink: 0 }}>
                      {relativeTime(item.modified, t)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </div>

      {/* Quick Info */}
      <div style={{
        padding: "16px 20px", borderRadius: 10,
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
              {gitStatus?.sync_dir}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={gitStatus?.git_remote}>
              {gitStatus?.git_remote || t("dashboard.noRemote")}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {stats.total_size_kb >= 1024 ? `${(stats.total_size_kb / 1024).toFixed(1)} MB` : `${stats.total_size_kb.toFixed(1)} KB`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
