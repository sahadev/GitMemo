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

export interface ImportFileRejection {
  path: string;
  file_name: string;
  size: number | null;
  reason: string;
}

export interface ImportFileCheckResult {
  accepted: string[];
  rejected: ImportFileRejection[];
  max_size: number;
}

export type ImportDialogSelection = string | string[] | null;

export function getImportDialogPaths(selection: ImportDialogSelection) {
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSizeLimitFromKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function formatImportCheckLimit(bytes: number): string {
  return formatFileSize(bytes);
}

export function getAcceptedImportPaths(result: ImportFileCheckResult) {
  return result.accepted;
}

export function hasRejectedImportFiles(result: ImportFileCheckResult) {
  return result.rejected.length > 0;
}

export function getFirstRejectedImportFile(result: ImportFileCheckResult) {
  return result.rejected[0] ?? null;
}
