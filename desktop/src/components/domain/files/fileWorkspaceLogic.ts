import type { FileEntry } from "../../../types/files";

/**
 * Fields exposed by the different file-like data sources in the desktop UI.
 * `title` and `name` are semantic values supplied by the backend; path fields
 * are only used when no semantic title is available.
 */
export interface DocumentTitleSource {
  title?: string | null;
  name?: string | null;
  file_name?: string | null;
  path?: string | null;
  file_path?: string | null;
  rel_path?: string | null;
  absolute_path?: string | null;
}

export function hasSelectedFile(selectedFile: string | null) {
  return selectedFile !== null;
}

export function getFileWorkspacePaneState(isMobile: boolean, selectedFile: string | null) {
  const hasDetail = hasSelectedFile(selectedFile);
  return {
    hasDetail,
    showList: !isMobile || !hasDetail,
    showDetail: !isMobile || hasDetail,
  };
}

export function isPendingPathForFolder(
  pendingOpenPath: string | null | undefined,
  folderPrefix: string,
): pendingOpenPath is string {
  return typeof pendingOpenPath === "string" && pendingOpenPath.startsWith(folderPrefix);
}

export function getFileName(path: string | null | undefined) {
  return path?.replace(/\\/g, "/").split("/").pop() ?? "";
}

export function getMarkdownTitleFromPath(path: string | null | undefined) {
  return stripMarkdownExtension(getFileName(path));
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function stripMarkdownExtension(name: string) {
  return name.replace(/\.(?:md|markdown|mdx|mdc)$/i, "");
}

/**
 * Resolve the single user-facing title for a file-like document.
 *
 * The backend owns title extraction. The UI only applies the agreed fallback
 * order and never treats a preview/snippet as a title.
 */
export function getDocumentTitle(
  source: DocumentTitleSource | string | null | undefined,
  fallbackPath?: string | null,
) {
  if (typeof source === "string") {
    return stripMarkdownExtension(getFileName(source));
  }

  const semanticTitle = firstNonEmpty(source?.title, source?.name);
  if (semanticTitle) return semanticTitle;

  const fileName = firstNonEmpty(source?.file_name);
  if (fileName) return stripMarkdownExtension(fileName);

  const path = firstNonEmpty(
    source?.path,
    source?.file_path,
    source?.rel_path,
    source?.absolute_path,
    fallbackPath,
  );
  return stripMarkdownExtension(getFileName(path)) || path;
}

export function getDocumentTitleForPath(
  path: string | null | undefined,
  source?: DocumentTitleSource | null,
) {
  return getDocumentTitle(source ?? path, path);
}

export function getMobileFileTitle(isMobile: boolean, path: string | null | undefined, stripMarkdownExtension = false) {
  if (!path) return "";
  if (!isMobile) return path;
  return stripMarkdownExtension ? getMarkdownTitleFromPath(path) : getFileName(path);
}

export function getRemainingFilesAfterDelete(files: FileEntry[], deletedPath: string) {
  return files.filter((file) => file.path !== deletedPath);
}

export function getNextFileAfterDelete(files: FileEntry[], deletedPath: string) {
  return getRemainingFilesAfterDelete(files, deletedPath)[0] ?? null;
}

export function getFileCountLabel(hasMore: boolean, loadedCount: number, totalFiles?: number) {
  return hasMore && typeof totalFiles === "number" ? `${loadedCount} / ${totalFiles}` : String(loadedCount);
}

export function getNoteListItemTitle(file: FileEntry) {
  return getDocumentTitle(file);
}

export function hasFilePreviewImage(file: FileEntry) {
  return Boolean(file.preview_image);
}
