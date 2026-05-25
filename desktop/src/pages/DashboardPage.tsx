import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { useAppStore, type AiRecordsTab, type NotesTab } from "../hooks/useAppStore";
import { relativeTime, formatAbsoluteTime } from "../utils/time";
import { Loading } from "../components/Loading";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { usePlatformFlags } from "../hooks/usePlatform";
import { MOBILE_DASHBOARD_BOTTOM_PADDING } from "../utils/mobileLayout";
import {
  MessageSquare, BookOpen, FileText, Clipboard,
  HardDrive, GitBranch, GitCommit, RefreshCw, Zap, FolderOpen, Terminal, Lightbulb,
  Activity, Circle, Search,
} from "lucide-react";
import { OnboardingChecklist } from "../components/OnboardingChecklist";

interface AppStats {
  conversations: number;
  manuals: number;
  scratch_notes: number;
  clips: number;
  plans: number;
  tracked_files?: number;
  total_size_kb: number;
  repository_size_kb?: number;
}

interface RecentItem {
  name: string;
  path: string;
  category: string;
  modified: string;
  modified_ts: number;
}

import type { Page } from "../App";
import { commitBrowseUrl } from "../utils/gitRemoteWeb";

const categoryConfig: Record<string, { icon: typeof MessageSquare; color: string; page: Page; notesTab?: NotesTab; aiRecordsTab?: AiRecordsTab }> = {
  conversation: { icon: MessageSquare, color: "var(--accent)", page: "ai-records", aiRecordsTab: "conversations" },
  manual: { icon: BookOpen, color: "var(--yellow)", page: "notes", notesTab: "manual" },
  scratch: { icon: FileText, color: "var(--purple)", page: "notes", notesTab: "scratch" },
  clip: { icon: Clipboard, color: "var(--pink)", page: "clipboard" },
  plan: { icon: Lightbulb, color: "var(--yellow)", page: "ai-records", aiRecordsTab: "plans" },
};

const DASHBOARD_CACHE_KEY = "gitmemo-dashboard-cache";
const mobileContentCategories = new Set(["conversation", "manual", "scratch", "clip", "plan"]);

const formatSize = (sizeKb: number) => (
  sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb.toFixed(1)} KB`
);

interface DashboardCache {
  stats: AppStats | null;
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

export default function DashboardPage({ onNavigate, active = false }: { onNavigate?: (page: Page) => void; active?: boolean }) {
  const { t } = useI18n();
  const { isMobile, isDesktop } = usePlatformFlags();
  const { isSyncing, isSuccess, isFailed, message: syncMessage, gitStatus, refreshGitStatus, triggerSync } = useSync();
  const { clipboardStatus: clipStatus, claudeEnabled, cursorEnabled, setNotesTab, setAiRecordsTab, setPendingOpenPath } = useAppStore();
  useRelativeTimeTick();
  const navigateTo = useCallback((page: Page, notesTab?: NotesTab, aiRecordsTab?: AiRecordsTab) => {
    if (page === "notes" && notesTab) setNotesTab(notesTab);
    if (page === "ai-records" && aiRecordsTab) setAiRecordsTab(aiRecordsTab);
    onNavigate?.(page);
  }, [onNavigate, setAiRecordsTab, setNotesTab]);

  const openRecord = useCallback((item: RecentItem) => {
    if (!isDesktop && !mobileContentCategories.has(item.category)) return;
    const cfg = categoryConfig[item.category] || categoryConfig.scratch;
    if (cfg.page === "notes" && cfg.notesTab) setNotesTab(cfg.notesTab);
    if (cfg.page === "ai-records" && cfg.aiRecordsTab) setAiRecordsTab(cfg.aiRecordsTab);
    setPendingOpenPath(item.path);
    onNavigate?.(cfg.page);
  }, [isDesktop, onNavigate, setAiRecordsTab, setNotesTab, setPendingOpenPath]);


  const cached = loadCache();
  const [stats, setStats] = useState<AppStats | null>(cached?.stats ?? null);
  const [recent, setRecent] = useState<RecentItem[]>(cached?.recent ?? []);
  const [error, setError] = useState("");
  const [reviewItem, setReviewItem] = useState<RecentItem | null>(null);
  const [reviewPreview, setReviewPreview] = useState("");

  // Derived state
  const editorConfigured = isDesktop && (claudeEnabled || cursorEnabled);
  const watchedFolders = useMemo(() => ["conversations", "notes", "clips", "plans"], []);
  const lastCommitBrowseUrl = useMemo(
    () => commitBrowseUrl(gitStatus?.git_remote, gitStatus?.last_commit_id),
    [gitStatus?.git_remote, gitStatus?.last_commit_id],
  );

  // Load content stats only (no git status — that comes from global useSync)
  const loadData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        invoke<AppStats>("get_stats"),
        invoke<RecentItem[]>("get_recent_activity").catch(() => []),
      ]);
      setStats(s);
      setRecent(r);
      saveCache({ stats: s, recent: r });
      // Load review item
      invoke<RecentItem | null>("get_review_item").then(item => {
        setReviewItem(item);
        if (item) {
          invoke<string>("read_file", { filePath: item.path })
            .then(content => {
              const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
              setReviewPreview(body.slice(0, 200));
            })
            .catch(() => {});
        }
      }).catch(() => {});
    } catch (e) {
      setError(`${e}`);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!active) return;
    loadData();
    void refreshGitStatus();
  }, [active, loadData, refreshGitStatus]);

  // Refresh content stats when sync completes (state-driven)
  useEffect(() => {
    if (isSuccess || isFailed) {
      loadData();
    }
  }, [isSuccess, isFailed, loadData]);
  useFileWatcher(watchedFolders, loadData);

  const handleRefresh = useCallback(() => {
    loadData();
    void refreshGitStatus();
  }, [loadData, refreshGitStatus]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flex: 1, minWidth: 0, minHeight: 0 }}>
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
    return <Loading text={t("dashboard.loading")} />;
  }

  const contentFileCount = stats.conversations + stats.manuals + stats.scratch_notes + stats.clips + stats.plans;
  const displayedFileCount = stats.tracked_files ?? contentFileCount;
  const displayedRepoSizeKb = stats.repository_size_kb ?? stats.total_size_kb;
  const displayedRecent = isDesktop
    ? recent
    : recent.filter((item) => mobileContentCategories.has(item.category));
  const showReviewItem = !!reviewItem && (isDesktop || mobileContentCategories.has(reviewItem.category));

  const statCards: { icon: typeof MessageSquare; label: string; value: number | string; color: string; page?: Page; notesTab?: NotesTab; aiRecordsTab?: AiRecordsTab }[] = [
    { icon: MessageSquare, label: t("dashboard.conversations"), value: stats.conversations, color: "var(--accent)", page: "ai-records", aiRecordsTab: "conversations" },
    { icon: BookOpen, label: t("dashboard.manuals"), value: stats.manuals, color: "var(--yellow)", page: "notes", notesTab: "manual" },
    { icon: FileText, label: t("dashboard.scratchNotes"), value: stats.scratch_notes, color: "var(--purple)", page: "notes", notesTab: "scratch" },
    { icon: Clipboard, label: t("dashboard.clips"), value: stats.clips, color: "var(--pink)", page: "clipboard" },
    { icon: Lightbulb, label: t("dashboard.plans"), value: stats.plans, color: "var(--yellow)", page: "ai-records", aiRecordsTab: "plans" },
  ];

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: isMobile ? "14px" : "16px 20px",
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
  const mobileSyncText = isSyncing
    ? t("sidebar.syncing")
    : syncMessage || (gitStatus?.git_remote ? syncStatus.text : t("dashboard.noRemote"));
  const mobileSyncColor = isSyncing
    ? "var(--accent)"
    : syncMessage
      ? (isFailed ? "var(--red)" : "var(--green)")
      : (gitStatus?.git_remote ? syncStatus.color : "var(--text-secondary)");

  return (
    <div style={{
      padding: isMobile ? "14px 14px 0" : "20px 28px 28px",
      overflowY: "auto",
      height: "100%",
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{t("dashboard.title")}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isMobile && (
            <button
              type="button"
              onClick={() => onNavigate?.("search")}
              title={t("nav.search")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 8,
                borderRadius: 8,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 36,
                minHeight: 36,
              }}
            >
              <Search size={19} />
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6,
              color: "var(--text-secondary)", display: "flex", alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <RefreshCw size={14} />
          </button>
          {isDesktop && clipStatus && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 20,
              background: clipStatus.watching ? "var(--bg-success)" : "var(--bg-hover)",
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
      </div>

      {isMobile && (
        <div style={{
          ...cardStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <RefreshCw size={13} style={{ color: mobileSyncColor, animation: isSyncing ? "spin 1s linear infinite" : undefined }} />
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.syncStatus")}</span>
            </div>
            <p style={{
              fontSize: 14,
              fontWeight: 700,
              color: mobileSyncColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}>
              {mobileSyncText}
            </p>
          </div>
          <button
            type="button"
            disabled={!gitStatus?.git_remote || isSyncing}
            onClick={() => void triggerSync()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minHeight: 38,
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${gitStatus?.git_remote ? "var(--accent)" : "var(--border)"}`,
              background: gitStatus?.git_remote ? "var(--accent)" : "var(--bg-hover)",
              color: gitStatus?.git_remote ? "#fff" : "var(--text-secondary)",
              cursor: !gitStatus?.git_remote || isSyncing ? "default" : "pointer",
              opacity: isSyncing ? 0.7 : 1,
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <RefreshCw size={13} style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined} />
            {gitStatus?.git_remote ? t("sidebar.syncToGit") : t("dashboard.noRemote")}
          </button>
        </div>
      )}

      {/* Onboarding Checklist */}
      {isDesktop && (
        <OnboardingChecklist
          onNavigate={(page) => onNavigate?.(page)}
          hasConversations={stats.conversations > 0}
          clipboardActive={clipStatus?.watching ?? false}
          editorConfigured={editorConfigured}
        />
      )}

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              onClick={() => card.page && navigateTo(card.page, card.notesTab, card.aiRecordsTab)}
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
              <p style={{ fontSize: isMobile ? 24 : 26, fontWeight: 700, letterSpacing: 0 }}>{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Empty state guide */}
      {contentFileCount === 0 && displayedRecent.length === 0 && (
        <div style={{
          padding: "20px 24px", borderRadius: 6, marginBottom: 16,
          border: "1px dashed var(--accent)40", background: "var(--accent)06",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("dashboard.emptyGuideTitle")}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {isMobile ? t("dashboard.emptyGuideMobileDesc") : t("dashboard.emptyGuideDesc")}
          </p>
        </div>
      )}

      {/* Git Info — only when remote is configured */}
      {gitStatus?.git_remote && (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 10 : 12, marginBottom: 16 }}>
        {/* Sync Status */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <RefreshCw size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.syncStatus")}</span>
          </div>
          <p style={{
            fontSize: isMobile ? 14 : 18,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            <span style={{ color: syncStatus.color }}>{syncStatus.text}</span>
          </p>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {formatAbsoluteTime(gitStatus?.checked_at || gitStatus?.last_commit_time || "")}
          </p>
        </div>

        {/* Last Commit */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <GitCommit size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("dashboard.lastCommit")}</span>
          </div>
          {lastCommitBrowseUrl && gitStatus?.last_commit_id ? (
            <button
              type="button"
              title={t("dashboard.openCommitPage")}
              onClick={() => void openUrl(lastCommitBrowseUrl)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: 0, margin: 0,
                fontSize: isMobile ? 14 : 18, fontWeight: 700, fontFamily: "ui-monospace, monospace",
                color: "var(--accent)", background: "none", border: "none", cursor: "pointer",
                textDecoration: "underline", textDecorationColor: "transparent",
                transition: "text-decoration-color 0.15s",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = "transparent"; }}
            >
              {gitStatus.last_commit_id}
            </button>
          ) : (
            <p style={{
              fontSize: isMobile ? 14 : 18,
              fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
              color: "var(--accent)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {gitStatus?.last_commit_id || "—"}
            </p>
          )}
          {gitStatus?.last_commit_time && (
            <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {formatAbsoluteTime(gitStatus?.last_commit_time || "")}
            </p>
          )}
        </div>
      </div>
      )}

      {/* Recent Activity — full width */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Activity size={13} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.recentActivity")}</span>
          </div>
          {displayedRecent.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", padding: "12px 0" }}>
              {t("dashboard.noActivity")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {displayedRecent.map((item) => {
                const cfg = categoryConfig[item.category] || categoryConfig.scratch;
                const Icon = cfg.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => openRecord(item)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      minHeight: isMobile ? 44 : undefined,
                      padding: isMobile ? "10px 6px" : "6px 8px", borderRadius: 6,
                      background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left",
                      color: "var(--text)", width: "100%",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.background = "transparent"; }}
                  >
                    <Icon size={isMobile ? 14 : 12} style={{ color: cfg.color, flexShrink: 0 }} />
                    <span style={{
                      flex: 1, fontSize: isMobile ? 13 : 12, overflow: "hidden",
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

      {/* Today's Review */}
      {showReviewItem && reviewItem && (
        <div style={{ ...cardStyle, marginBottom: 16, cursor: "pointer" }}
          onClick={() => openRecord(reviewItem)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <RefreshCw size={13} style={{ color: "var(--yellow)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.todayReview")}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                invoke<RecentItem | null>("get_review_item").then(item => {
                  setReviewItem(item);
                  if (item) {
                    invoke<string>("read_file", { filePath: item.path })
                      .then(content => {
                        const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
                        setReviewPreview(body.slice(0, 200));
                      })
                      .catch(() => {});
                  }
                }).catch(() => {});
              }}
              style={{
                marginLeft: "auto", padding: "2px 8px", borderRadius: 4,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-secondary)", fontSize: 10, cursor: "pointer",
              }}
            >
              {t("dashboard.shuffle")}
            </button>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{reviewItem.name}</p>
          {reviewPreview && (
            <p style={{
              fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {reviewPreview}
            </p>
          )}
          <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
            {relativeTime(reviewItem.modified, t)}
          </p>
        </div>
      )}

      {/* Quick Info */}
      <div style={{
        padding: "16px 20px", borderRadius: 6,
        border: "1px dashed var(--border)", background: "transparent",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Zap size={13} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{t("dashboard.quickInfo")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
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
          {isDesktop && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={12} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                CLI: gitmemo --help
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {t("dashboard.totalFiles", String(displayedFileCount))}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={12} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {formatSize(displayedRepoSizeKb)}
            </span>
          </div>
        </div>
      </div>
      {isMobile && <div aria-hidden="true" style={{ height: MOBILE_DASHBOARD_BOTTOM_PADDING, flexShrink: 0 }} />}
    </div>
  );
}
