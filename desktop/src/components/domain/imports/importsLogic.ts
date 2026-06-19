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

export interface MarkdownImportDocument {
  fileName: string;
  content: string;
  size: number;
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

const MARKDOWN_IMPORT_EXTENSIONS = new Set(["md", "markdown", "mdx"]);

export function getImportDialogPaths(selection: ImportDialogSelection) {
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export function getFileNameExtension(fileName: string) {
  const lastSegment = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return "";
  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

export function isMarkdownImportFileName(fileName: string) {
  return MARKDOWN_IMPORT_EXTENSIONS.has(getFileNameExtension(fileName));
}

export function getImportFilesFromFileList(fileList: FileList | null) {
  return Array.from(fileList ?? []);
}

export function getImportSizeLimitBytes(limitKb: number | null | undefined, fallbackKb = 2048) {
  return (limitKb ?? fallbackKb) * 1024;
}

export function isFileWithinImportSizeLimit(file: Pick<File, "size">, maxBytes: number) {
  return file.size <= maxBytes;
}

export function getImportableBrowserFiles(files: File[], maxBytes: number) {
  return files.filter((file) => (
    isMarkdownImportFileName(file.name) && isFileWithinImportSizeLimit(file, maxBytes)
  ));
}

export function getOversizedBrowserFiles(files: File[], maxBytes: number) {
  return files.filter((file) => (
    isMarkdownImportFileName(file.name) && !isFileWithinImportSizeLimit(file, maxBytes)
  ));
}

export function hasBrowserImportSkippedFiles(files: File[], acceptedFiles: File[]) {
  return acceptedFiles.length < files.length;
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
