import type { FavoriteContent, FavoriteEntry } from "../../../types/favorites";

export function sourceLabelKey(sourceType: string) {
  switch (sourceType) {
    case "conversation": return "favorites.sourceConversation";
    case "note": return "favorites.sourceNote";
    case "clip": return "favorites.sourceClip";
    case "plan": return "favorites.sourcePlan";
    case "import": return "favorites.sourceImport";
    case "config": return "favorites.sourceConfig";
    case "external": return "favorites.sourceExternal";
    default: return "favorites.sourceUnknown";
  }
}

export function areFavoriteEntriesEquivalent(a: FavoriteEntry[], b: FavoriteEntry[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return (
      item.target_id === other.target_id &&
      item.title === other.title &&
      item.source_type === other.source_type &&
      item.modified === other.modified &&
      item.preview === other.preview &&
      item.exists === other.exists
    );
  });
}

export function getSelectedFavoriteEntry(favorites: FavoriteEntry[], selectedTargetId: string | null) {
  return favorites.find((item) => item.target_id === selectedTargetId) ?? null;
}

export function getNextSelectedFavoriteTargetId(favorites: FavoriteEntry[], selectedTargetId: string | null) {
  return selectedTargetId && favorites.some((item) => item.target_id === selectedTargetId) ? selectedTargetId : null;
}

export function getFavoritesPaneState(isMobile: boolean, selectedTargetId: string | null) {
  const hasDetail = selectedTargetId !== null;
  return {
    showList: !isMobile || !hasDetail,
    showDetail: !isMobile || hasDetail,
  };
}

export function getFavoriteDetailTitle(
  content: FavoriteContent | null,
  selectedEntry: FavoriteEntry | null,
  fallbackTitle: string,
) {
  return content?.title || selectedEntry?.title || fallbackTitle;
}

export function getFavoriteDetailPath(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  return content?.rel_path || content?.absolute_path || selectedEntry?.rel_path || selectedEntry?.absolute_path || "";
}

export function getFavoriteEditablePath(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  return content?.rel_path || selectedEntry?.rel_path || content?.absolute_path || selectedEntry?.absolute_path || "";
}

export function isExternalFavorite(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  return Boolean(content?.absolute_path || selectedEntry?.absolute_path)
    && !Boolean(content?.rel_path || selectedEntry?.rel_path);
}

export function isConversationFavorite(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  return (content?.source_type || selectedEntry?.source_type) === "conversation";
}

export function isEditableFavoriteSource(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  const sourceType = content?.source_type || selectedEntry?.source_type;
  return sourceType === "note"
    || sourceType === "clip"
    || sourceType === "import"
    || sourceType === "conversation"
    || sourceType === "external";
}

export function canEditFavoriteContent(
  isMobile: boolean,
  content: FavoriteContent | null,
  selectedEntry: FavoriteEntry | null,
) {
  if (!content?.exists) return false;
  if (!getFavoriteEditablePath(content, selectedEntry)) return false;
  if (!isEditableFavoriteSource(content, selectedEntry)) return false;
  return !(isMobile && isConversationFavorite(content, selectedEntry));
}

export function shouldSaveFavoriteAsExternalFile(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  return isExternalFavorite(content, selectedEntry);
}

export function supportsFavoriteSplitPreview(content: FavoriteContent | null, selectedEntry: FavoriteEntry | null) {
  const path = getFavoriteEditablePath(content, selectedEntry).toLowerCase();
  return /\.(md|markdown|mdx|mdc)$/.test(path);
}
