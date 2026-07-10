import type { Page } from "../../../App";
import type { AiRecordsTab, CliStatus, NotesTab } from "../../../hooks/useAppStore";
import type { GitStatus } from "../../../hooks/useSync";
import type { AppIconTone } from "../../base/AppIcon";
import {
  getCliStatusTone,
  hasCliUpdateAvailable,
  isCliInstalled,
  isCliStatusKnown,
  needsCliAttention,
} from "../../../domain/cli/cliStatus";

export interface AppStats {
  conversations: number;
  manuals: number;
  scratch_notes: number;
  clips: number;
  plans: number;
  tracked_files?: number;
  total_size_kb: number;
  repository_size_kb?: number;
}

export interface RecentItem {
  name: string;
  path: string;
  category: string;
  modified: string;
  modified_ts: number;
}

export type DashboardContentCategory = "conversation" | "manual" | "scratch" | "clip" | "plan";

export type DashboardStatusTone = Extract<AppIconTone, "accent" | "secondary" | "success" | "warning" | "danger">;

export type DashboardText =
  | { kind: "translation"; key: string; args?: string[] }
  | { kind: "prefixedTranslation"; prefix: string; key: string; args?: string[] }
  | { kind: "literal"; text: string };

export interface DashboardCategoryRoute {
  page: Page;
  notesTab?: NotesTab;
  aiRecordsTab?: AiRecordsTab;
}

export interface DashboardSyncStatus {
  tone: DashboardStatusTone;
  text: DashboardText;
}

export interface DashboardMobileSyncState {
  tone: DashboardStatusTone;
  text: DashboardText;
  actionVariant: "primary" | "secondary";
  actionDisabled: boolean;
  actionText: DashboardText;
}

interface DashboardMobileSyncActionState {
  actionVariant: "primary" | "secondary";
  actionDisabled: boolean;
  actionText: DashboardText;
}

export const DASHBOARD_CONTENT_CATEGORIES: readonly DashboardContentCategory[] = [
  "conversation",
  "manual",
  "scratch",
  "clip",
  "plan",
];

const DASHBOARD_CATEGORY_ROUTES: Record<DashboardContentCategory, DashboardCategoryRoute> = {
  conversation: { page: "ai-records", aiRecordsTab: "conversations" },
  manual: { page: "notes", notesTab: "manual" },
  scratch: { page: "notes", notesTab: "scratch" },
  clip: { page: "clipboard" },
  plan: { page: "ai-records", aiRecordsTab: "plans" },
};

export function isDashboardContentCategory(category: string): category is DashboardContentCategory {
  return DASHBOARD_CONTENT_CATEGORIES.includes(category as DashboardContentCategory);
}

export function getDashboardContentCategory(category: string): DashboardContentCategory {
  return isDashboardContentCategory(category) ? category : "scratch";
}

export function getDashboardCategoryRoute(category: string): DashboardCategoryRoute {
  return DASHBOARD_CATEGORY_ROUTES[getDashboardContentCategory(category)];
}

export function isDashboardDesktopPlatform(isDesktop: boolean) {
  return isDesktop;
}

export function isDashboardMobileVisibleCategory(category: string) {
  return isDashboardContentCategory(category);
}

export function canOpenDashboardRecentItem(isDesktop: boolean, item: RecentItem) {
  return isDashboardDesktopPlatform(isDesktop) || isDashboardMobileVisibleCategory(item.category);
}

export function getDashboardContentFileCount(stats: AppStats) {
  return stats.conversations + stats.manuals + stats.scratch_notes + stats.clips + stats.plans;
}

export function hasDashboardConversations(stats: AppStats) {
  return stats.conversations > 0;
}

export function getDashboardDisplayedFileCount(stats: AppStats) {
  return stats.tracked_files ?? getDashboardContentFileCount(stats);
}

export function getDashboardDisplayedRepoSizeKb(stats: AppStats) {
  return stats.repository_size_kb ?? stats.total_size_kb;
}

export function getDashboardVisibleRecentItems(isDesktop: boolean, recent: RecentItem[]) {
  if (isDashboardDesktopPlatform(isDesktop)) return recent;
  return recent.filter((item) => canOpenDashboardRecentItem(isDesktop, item));
}

export function hasDashboardContentFiles(stats: AppStats) {
  return getDashboardContentFileCount(stats) > 0;
}

export function shouldShowDashboardEmptyGuide(stats: AppStats, visibleRecent: RecentItem[]) {
  return !hasDashboardContentFiles(stats) && visibleRecent.length === 0;
}

export function hasDashboardQuickNoteContent(content: string) {
  return content.trim().length > 0;
}

export function canSaveDashboardQuickNote(content: string, saving: boolean) {
  return hasDashboardQuickNoteContent(content) && !saving;
}

export function isDashboardQuickNoteDraftEmpty(content: string) {
  return content.length === 0;
}

export function isDashboardQuickNoteTemplateShortcut(key: string, hasModifierKey: boolean) {
  return key === "Tab" && !hasModifierKey;
}

export function shouldInsertDashboardQuickNoteTemplate(
  key: string,
  content: string,
  hasModifierKey: boolean,
  isComposing: boolean,
) {
  return isDashboardQuickNoteTemplateShortcut(key, hasModifierKey)
    && isDashboardQuickNoteDraftEmpty(content)
    && !isComposing;
}

export function isDashboardQuickNoteExpandedPreference(value: string | null) {
  return value === "true";
}

export function shouldScrollDashboardQuickNoteAfterExpand(expanded: boolean, scrollRequested: boolean) {
  return expanded && scrollRequested;
}

export function getDashboardQuickNoteToggleText(expanded: boolean): DashboardText {
  return {
    kind: "translation",
    key: expanded ? "dashboard.quickNoteCollapse" : "dashboard.quickNoteExpand",
  };
}

export function isAnyEditorIntegrationEnabled(claudeEnabled: boolean, cursorEnabled: boolean) {
  return claudeEnabled || cursorEnabled;
}

export function isDashboardEditorConfigured(
  isDesktop: boolean,
  integrationStatusChecked: boolean,
  claudeEnabled: boolean,
  cursorEnabled: boolean,
) {
  return isDashboardDesktopPlatform(isDesktop) && integrationStatusChecked && isAnyEditorIntegrationEnabled(claudeEnabled, cursorEnabled);
}

export function shouldShowCliCapabilityCard(
  isDesktop: boolean,
  cliCardDismissed: boolean,
  cliStatusChecked: boolean,
  cliStatus: CliStatus | null,
) {
  return isDashboardDesktopPlatform(isDesktop) && !cliCardDismissed && cliStatusChecked && needsCliAttention(cliStatus);
}

export function getCliStatusText(cliStatus: CliStatus | null): DashboardText {
  if (!isCliStatusKnown(cliStatus)) return { kind: "translation", key: "dashboard.cliCardChecking" };
  if (!isCliInstalled(cliStatus)) return { kind: "translation", key: "dashboard.cliCardNotInstalled" };
  if (hasCliUpdateAvailable(cliStatus)) {
    return {
      kind: "translation",
      key: "dashboard.cliCardUpgrade",
      args: [cliStatus.version || "?", cliStatus.latest_version ?? "?"],
    };
  }
  return {
    kind: "translation",
    key: "dashboard.cliCardInstalled",
    args: [cliStatus.version || "?"],
  };
}

export function getCliStatusBadgeTone(cliStatus: CliStatus | null): Extract<AppIconTone, "success" | "warning" | "muted"> {
  return getCliStatusTone(cliStatus);
}

export function hasGitStatus(gitStatus: GitStatus | null): gitStatus is GitStatus {
  return gitStatus !== null;
}

export function hasGitRemote(gitStatus: GitStatus | null) {
  return Boolean(gitStatus?.git_remote);
}

export function hasLocalCommitsToPush(gitStatus: GitStatus) {
  return gitStatus.unpushed > 0;
}

export function hasRemoteCommitsToPull(gitStatus: GitStatus) {
  return gitStatus.behind > 0;
}

export function hasDivergedGitHistory(gitStatus: GitStatus) {
  return hasLocalCommitsToPush(gitStatus) && hasRemoteCommitsToPull(gitStatus);
}

export function getDashboardMobileSyncActionState(
  gitStatus: GitStatus | null,
  isSyncing: boolean,
): DashboardMobileSyncActionState {
  if (!hasGitRemote(gitStatus)) {
    return {
      actionVariant: "secondary",
      actionDisabled: true,
      actionText: { kind: "translation", key: "dashboard.noRemote" },
    };
  }
  return {
    actionVariant: "primary",
    actionDisabled: isSyncing,
    actionText: { kind: "translation", key: "sidebar.syncToGit" },
  };
}

export function getDashboardSyncStatus(gitStatus: GitStatus | null): DashboardSyncStatus {
  if (!hasGitStatus(gitStatus)) {
    return { tone: "secondary", text: { kind: "translation", key: "dashboard.loading" } };
  }
  if (hasDivergedGitHistory(gitStatus)) {
    return {
      tone: "warning",
      text: {
        kind: "translation",
        key: "dashboard.diverged",
        args: [String(gitStatus.unpushed), String(gitStatus.behind)],
      },
    };
  }
  if (hasRemoteCommitsToPull(gitStatus)) {
    return {
      tone: "danger",
      text: { kind: "translation", key: "dashboard.behind", args: [String(gitStatus.behind)] },
    };
  }
  if (hasLocalCommitsToPush(gitStatus)) {
    return {
      tone: "warning",
      text: { kind: "prefixedTranslation", prefix: String(gitStatus.unpushed), key: "dashboard.unpushed" },
    };
  }
  return { tone: "success", text: { kind: "translation", key: "dashboard.synced" } };
}

export function getDashboardMobileSyncState({
  isSyncing,
  syncMessage,
  isFailed,
  gitStatus,
  syncStatus,
}: {
  isSyncing: boolean;
  syncMessage: string;
  isFailed: boolean;
  gitStatus: GitStatus | null;
  syncStatus: DashboardSyncStatus;
}): DashboardMobileSyncState {
  const actionState = getDashboardMobileSyncActionState(gitStatus, isSyncing);

  if (isSyncing) {
    return {
      tone: "accent",
      text: { kind: "translation", key: "sidebar.syncing" },
      ...actionState,
    };
  }

  if (syncMessage) {
    return {
      tone: isFailed ? "danger" : "success",
      text: { kind: "literal", text: syncMessage },
      ...actionState,
    };
  }

  const remoteConfigured = hasGitRemote(gitStatus);
  return {
    tone: remoteConfigured ? syncStatus.tone : "secondary",
    text: remoteConfigured ? syncStatus.text : { kind: "translation", key: "dashboard.noRemote" },
    ...actionState,
  };
}

export function formatDashboardText(text: DashboardText, t: (key: string, ...args: string[]) => string) {
  if (text.kind === "literal") return text.text;
  if (text.kind === "prefixedTranslation") {
    return `${text.prefix} ${t(text.key, ...(text.args ?? []))}`;
  }
  return t(text.key, ...(text.args ?? []));
}
