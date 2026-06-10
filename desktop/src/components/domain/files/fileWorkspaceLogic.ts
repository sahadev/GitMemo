import type { FileEntry } from "../../../types/files";

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
  return path?.split("/").pop() ?? "";
}

export function getMarkdownTitleFromPath(path: string | null | undefined) {
  return getFileName(path).replace(/\.md$/, "");
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
  const isDateName = /^\d{4}-\d{2}-\d{2}/.test(file.name);
  return isDateName && file.preview ? file.preview : file.name;
}

export function hasFilePreviewImage(file: FileEntry) {
  return Boolean(file.preview_image);
}
