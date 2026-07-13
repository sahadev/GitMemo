export interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

export type SearchSourceType = "conversation" | "note" | "clip" | "plan" | "import" | "config" | "unknown";
export type SearchLayoutMode = "results" | "split" | "detail";
export type SearchNavigationDirection = "previous" | "next";

const MOBILE_SEARCH_SOURCE_TYPES = new Set<SearchSourceType>([
  "conversation",
  "note",
  "clip",
  "plan",
  "import",
]);

export function isMobileSearchSourceType(sourceType: string) {
  return MOBILE_SEARCH_SOURCE_TYPES.has(sourceType as SearchSourceType);
}

export function getSearchSourceTypeFromPath(path: string): SearchSourceType {
  if (path.startsWith("conversations/")) return "conversation";
  if (path.startsWith("clips/")) return "clip";
  if (path.startsWith("plans/")) return "plan";
  if (path.startsWith("imports/")) return "import";
  if (path.startsWith("claude-config/") || path.startsWith("cursor-config/")) return "config";
  return path.startsWith("notes/") ? "note" : "unknown";
}

export function isMobileSearchContentPath(path: string) {
  return isMobileSearchSourceType(getSearchSourceTypeFromPath(path));
}

export function canOpenSearchPath(isDesktop: boolean, path: string) {
  return isDesktop || isMobileSearchContentPath(path);
}

export function canShowSearchResultOnPlatform(isDesktop: boolean, item: SearchResultItem) {
  return isDesktop || isMobileSearchSourceType(item.source_type);
}

export function filterSearchResultsForPlatform(isDesktop: boolean, results: SearchResultItem[]) {
  if (isDesktop) return results;
  return results.filter((item) => canShowSearchResultOnPlatform(isDesktop, item));
}

export function hasSelectedSearchResult(selectedFile: string | null) {
  return selectedFile !== null;
}

export function hasSearchResultPath(results: SearchResultItem[], path: string | null) {
  return path !== null && results.some((item) => item.file_path === path);
}

export function getRetainedSearchResultPath(results: SearchResultItem[], selectedFile: string | null) {
  return hasSearchResultPath(results, selectedFile) ? selectedFile : null;
}

export function getAdjacentSearchResultPath(
  results: SearchResultItem[],
  selectedFile: string | null,
  direction: SearchNavigationDirection,
) {
  if (results.length === 0) return null;
  const selectedIndex = selectedFile
    ? results.findIndex((item) => item.file_path === selectedFile)
    : -1;
  if (selectedIndex < 0) {
    return direction === "next" ? results[0].file_path : results[results.length - 1].file_path;
  }
  const nextIndex = direction === "next" ? selectedIndex + 1 : selectedIndex - 1;
  return results[nextIndex]?.file_path ?? null;
}

export function shouldUseSearchSplitLayout(
  isMobile: boolean,
  results: SearchResultItem[],
  selectedFile: string | null,
) {
  return !isMobile && hasSearchResultPath(results, selectedFile);
}

export function shouldUseSearchDetailLayout(
  isMobile: boolean,
  results: SearchResultItem[],
  selectedFile: string | null,
) {
  return hasSelectedSearchResult(selectedFile) && !shouldUseSearchSplitLayout(isMobile, results, selectedFile);
}

export function getSearchLayoutMode(
  isMobile: boolean,
  results: SearchResultItem[],
  selectedFile: string | null,
): SearchLayoutMode {
  if (shouldUseSearchSplitLayout(isMobile, results, selectedFile)) return "split";
  if (shouldUseSearchDetailLayout(isMobile, results, selectedFile)) return "detail";
  return "results";
}

export function getSearchResultLimit(isMobile: boolean) {
  return isMobile ? 60 : 30;
}

export function isClipSearchSource(sourceType: SearchSourceType) {
  return sourceType === "clip";
}

export function isPlanSearchSource(sourceType: SearchSourceType) {
  return sourceType === "plan";
}

export function isConversationSearchSource(sourceType: SearchSourceType) {
  return sourceType === "conversation";
}

export function isImportSearchSource(sourceType: SearchSourceType) {
  return sourceType === "import";
}

export function canEditSearchSource(isDesktop: boolean, sourceType: SearchSourceType) {
  return sourceType === "note"
    || isClipSearchSource(sourceType)
    || isImportSearchSource(sourceType)
    || (isDesktop && isConversationSearchSource(sourceType));
}

export function canDeleteSearchSource(isDesktop: boolean, sourceType: SearchSourceType) {
  return sourceType === "note"
    || isClipSearchSource(sourceType)
    || isImportSearchSource(sourceType)
    || (isDesktop && (isConversationSearchSource(sourceType) || isPlanSearchSource(sourceType)));
}

export function getSearchDeleteConfirmKey(sourceType: SearchSourceType) {
  if (isClipSearchSource(sourceType)) return "clipboard.deleteConfirm";
  if (isPlanSearchSource(sourceType)) return "plans.deleteConfirm";
  if (isConversationSearchSource(sourceType)) return "conversations.deleteConfirm";
  if (isImportSearchSource(sourceType)) return "imports.deleteConfirm";
  return "notes.deleteConfirm";
}

export function getSearchDeletedToastKey(sourceType: SearchSourceType) {
  if (isClipSearchSource(sourceType)) return "clipboard.clipDeleted";
  if (isPlanSearchSource(sourceType)) return "plans.deleted";
  if (isConversationSearchSource(sourceType)) return "conversations.deleted";
  if (isImportSearchSource(sourceType)) return "imports.deleted";
  return "notes.noteDeleted";
}

export function shouldWriteSearchEditAsMarkdownBody(sourceType: SearchSourceType) {
  return isClipSearchSource(sourceType);
}

export function shouldCopySelectedSearchClip(selectedFile: string | null) {
  return selectedFile !== null && isClipSearchSource(getSearchSourceTypeFromPath(selectedFile));
}
