export interface ExternalFileEntry {
  file_path: string;
  file_name: string;
  parent_dir: string;
  exists: boolean;
  last_opened_at: string;
  last_modified_at: string | null;
}

export interface ExternalFileOpenResult {
  entry: ExternalFileEntry;
  content: string;
}

export interface ExternalFileWriteResult {
  entry: ExternalFileEntry;
  message: string;
}

export interface ImportedFile {
  original_name: string;
  dest_path: string;
  category: string;
  size: number;
}

export interface ImportResult {
  success: boolean;
  imported: ImportedFile[];
  errors: string[];
}

export interface ExternalFileOpenTarget {
  filePath: string;
  requestId: number;
}

export function isProbablyMarkdownFileName(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx") || lower.endsWith(".mdc");
}

export function upsertExternalFileEntry(entries: ExternalFileEntry[], entry: ExternalFileEntry) {
  const existingIndex = entries.findIndex((item) => item.file_path === entry.file_path);
  if (existingIndex === -1) return [...entries, entry];

  const next = [...entries];
  next[existingIndex] = entry;
  return next;
}

export function getSelectedExternalEntry(entries: ExternalFileEntry[], selectedFilePath: string | null) {
  return entries.find((item) => item.file_path === selectedFilePath) ?? null;
}

export function hasExternalEntry(entries: ExternalFileEntry[], filePath: string) {
  return entries.some((item) => item.file_path === filePath);
}

export function shouldClearExternalSelection(entries: ExternalFileEntry[], selectedFilePath: string | null) {
  return selectedFilePath !== null && !hasExternalEntry(entries, selectedFilePath);
}

export function getMissingExternalFileCount(entries: ExternalFileEntry[]) {
  return entries.filter((entry) => !entry.exists).length;
}

export function hasMissingExternalFiles(missingCount: number) {
  return missingCount > 0;
}

export function canClearMissingExternalFiles(missingCount: number, clearingMissing: boolean) {
  return hasMissingExternalFiles(missingCount) && !clearingMissing;
}

export function shouldConsumeExternalOpenTarget(
  openTarget: ExternalFileOpenTarget | null | undefined,
  lastConsumedRequestId: number | null,
): openTarget is ExternalFileOpenTarget {
  return Boolean(openTarget?.filePath) && lastConsumedRequestId !== openTarget?.requestId;
}

export function isExternalOpenTargetAlreadyLoaded(
  openTarget: ExternalFileOpenTarget,
  selectedFilePath: string | null,
  fileContent: string,
) {
  return selectedFilePath === openTarget.filePath && Boolean(fileContent);
}

export function hasImportedExternalFiles(result: ImportResult) {
  return result.imported.length > 0;
}

export function getFirstExternalImportError(result: ImportResult) {
  return result.errors[0] ?? null;
}
