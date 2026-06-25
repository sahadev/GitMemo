import type { ClipboardStatus } from "../../../hooks/useAppStore";
import type { FileEntry } from "../../../types/files";

export type ClipFilter = "all" | "text" | "image";

export interface AdjacentClipAfterDelete {
  nextClip: FileEntry | null;
  shouldClearDetail: boolean;
}

export function normalizeClipImageLinks(content: string, clipPath: string) {
  const clipDir = clipPath.includes("/") ? clipPath.slice(0, clipPath.lastIndexOf("/")) : "";
  return content.replace(/(!\[[^\]]*]\()([^)\s]+)(\))/g, (match, prefix, src, suffix) => {
    if (!clipDir || isAbsoluteClipImageSource(src) || isKnownGitMemoContentPath(src)) {
      return match;
    }
    return `${prefix}${clipDir}/${src}${suffix}`;
  });
}

export function isAbsoluteClipImageSource(src: string) {
  return src.startsWith("http") || src.startsWith("data:") || src.startsWith("/");
}

export function isKnownGitMemoContentPath(src: string) {
  return /^(clips|imports|notes|conversations|plans|claude-config)\//.test(src);
}

export function areClipEntriesEquivalent(a: FileEntry[], b: FileEntry[]) {
  if (a.length !== b.length) return false;
  return a.every((clip, index) => {
    const other = b[index];
    return (
      clip.path === other.path &&
      clip.modified === other.modified &&
      clip.size === other.size &&
      clip.preview === other.preview &&
      clip.preview_image === other.preview_image
    );
  });
}

export function getVisibleClipEntries(entries: FileEntry[], deletedPaths: Set<string>) {
  return entries.filter((entry) => !deletedPaths.has(entry.path));
}

export function getNewClipEntries(prev: FileEntry[], entries: FileEntry[], deletedPaths: Set<string>) {
  const seen = new Set(prev.map((clip) => clip.path));
  return entries.filter((clip) => !seen.has(clip.path) && !deletedPaths.has(clip.path));
}

export function resolveAdjacentClipAfterDelete(
  clipsBeforeDelete: FileEntry[],
  deletedPaths: string[],
  deletedSelectedPath: string | null,
): AdjacentClipAfterDelete {
  if (!deletedSelectedPath || !deletedPaths.includes(deletedSelectedPath)) {
    return { nextClip: null, shouldClearDetail: false };
  }

  const deleted = new Set(deletedPaths);
  const deletedIndex = clipsBeforeDelete.findIndex((clip) => clip.path === deletedSelectedPath);
  const remainingClips = clipsBeforeDelete.filter((clip) => !deleted.has(clip.path));

  if (remainingClips.length === 0) {
    return { nextClip: null, shouldClearDetail: true };
  }

  const nextIndex = deletedIndex === -1 ? 0 : Math.min(deletedIndex, remainingClips.length - 1);
  return { nextClip: remainingClips[nextIndex] ?? null, shouldClearDetail: false };
}

export function shouldIgnoreClipWatcherRefresh(suppressUntil: number, now = Date.now()) {
  return now < suppressUntil;
}

export function shouldAutoRefreshClipboardList(enabled: boolean | null | undefined) {
  return enabled !== false;
}

export function canStartClipboardWatch(status: ClipboardStatus | null, privacyConfirmed: boolean) {
  return !status?.watching && privacyConfirmed;
}

export function shouldShowClipboardPrivacyDialog(status: ClipboardStatus | null, privacyConfirmed: boolean) {
  return !status?.watching && !privacyConfirmed;
}

export function getEmptyClipsMessageKey(filter: ClipFilter) {
  if (filter === "image") return "clipboard.noImageClips";
  if (filter === "text") return "clipboard.noTextClips";
  return "clipboard.noClips";
}

export function getDisplayedClipTotal(clipTotal: number | null, status: ClipboardStatus | null) {
  return clipTotal ?? status?.clips_count ?? 0;
}

export function shouldDisableClipboardSelectionActions(
  selectedClipPaths: string[],
  creatingNote: boolean,
  deletingSelected: boolean,
) {
  return selectedClipPaths.length === 0 || creatingNote || deletingSelected;
}

export function getSelectedClipDeletionPath(selectedFile: string | null, deletedPaths: string[]) {
  return selectedFile && deletedPaths.includes(selectedFile) ? selectedFile : null;
}

export function updateClipTotalAfterDelete(total: number | null, deletedCount: number) {
  return total === null ? total : Math.max(0, total - deletedCount);
}
