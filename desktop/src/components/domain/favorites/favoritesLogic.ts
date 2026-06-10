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
