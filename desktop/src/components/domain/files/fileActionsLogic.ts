export interface FileMoreActionVisibility {
  showReveal: boolean;
  showCopyPath: boolean;
  showExportPdf: boolean;
}

export function hasActionFilePath(relPath?: string | null, absolutePath?: string | null) {
  return Boolean(relPath || absolutePath);
}

export function canToggleFavoriteTarget(hasTarget: boolean, loading: boolean) {
  return hasTarget && !loading;
}

export function shouldEnableFavoriteShortcut(input: {
  active: boolean;
  isMobile: boolean;
  disabled?: boolean;
  hasTarget: boolean;
  loading: boolean;
}) {
  return input.active && !input.isMobile && !input.disabled && canToggleFavoriteTarget(input.hasTarget, input.loading);
}

export function isFavoriteButtonDisabled(disabled: boolean | undefined, hasTarget: boolean, loading: boolean) {
  return Boolean(disabled) || !hasTarget || loading;
}

export function getNextFavoriteState(favorited: boolean) {
  return !favorited;
}

export function getFavoriteTitleKey(favorited: boolean) {
  return favorited ? "favorites.remove" : "favorites.add";
}

export function shouldRefreshForFavoritesFolder(folder: string | null | undefined) {
  return folder === "favorites";
}

export function getFileMoreActionVisibility(input: {
  relPath?: string | null;
  absolutePath?: string | null;
  canReveal: boolean;
  canCopyPath: boolean;
  canExportPdf: boolean;
  supportsPdfExport: boolean;
  exportContent: string;
}): FileMoreActionVisibility {
  const hasFilePath = hasActionFilePath(input.relPath, input.absolutePath);
  return {
    showReveal: input.canReveal && hasFilePath,
    showCopyPath: input.canCopyPath && hasFilePath,
    showExportPdf: input.canExportPdf && input.supportsPdfExport && Boolean(input.exportContent.trim()),
  };
}

export function hasVisibleFileMoreActions(visibility: FileMoreActionVisibility) {
  return visibility.showReveal || visibility.showCopyPath || visibility.showExportPdf;
}

export function shouldEnableFileMoreActionsShortcut(active: boolean, visibility: FileMoreActionVisibility) {
  return active && hasVisibleFileMoreActions(visibility);
}
