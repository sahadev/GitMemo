export type EditorRoot = "claude" | "cursor" | "codex" | "anonymous";

export interface EditorRootsStatus {
  claude_path: string;
  claude_exists: boolean;
  cursor_path: string;
  cursor_exists: boolean;
  codex_path: string;
  codex_exists: boolean;
  anonymous_path: string;
  anonymous_exists: boolean;
}

export interface EditorDirEntry {
  name: string;
  rel_path: string;
  title?: string | null;
  is_dir: boolean;
}

export interface EditorWriteResult {
  success: boolean;
  rel_path: string;
  message: string;
}

export interface EditorOpenTarget {
  root: EditorRoot;
  relPath: string;
}

export const EDITOR_ROOTS: EditorRoot[] = ["claude", "cursor", "codex", "anonymous"];

export function parentRel(rel: string): string {
  const normalized = rel.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return "";
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex < 0 ? "" : normalized.slice(0, separatorIndex);
}

export function isProbablyMarkdownEditorPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".mdc");
}

export function joinRel(base: string, name: string): string {
  return base ? `${base.replace(/\/+$/, "")}/${name}` : name;
}

export function getPreferredEditorRoot(roots: EditorRootsStatus): EditorRoot {
  if (!roots.claude_exists && roots.cursor_exists) return "cursor";
  if (!roots.claude_exists && !roots.cursor_exists && roots.codex_exists) return "codex";
  if (!roots.claude_exists && !roots.cursor_exists && !roots.codex_exists) return "anonymous";
  return "claude";
}

export function resolveAvailableEditorRoot(currentRoot: EditorRoot, roots: EditorRootsStatus): EditorRoot {
  return isEditorRootAvailable(roots, currentRoot) ? currentRoot : getPreferredEditorRoot(roots);
}

export function isEditorRootAvailable(roots: EditorRootsStatus | null, root: EditorRoot) {
  if (!roots) return false;
  if (root === "claude") return roots.claude_exists;
  if (root === "cursor") return roots.cursor_exists;
  if (root === "codex") return roots.codex_exists;
  return roots.anonymous_exists;
}

export function getEditorRootPath(roots: EditorRootsStatus | null, root: EditorRoot) {
  if (!roots) return "";
  if (root === "claude") return roots.claude_path;
  if (root === "cursor") return roots.cursor_path;
  if (root === "codex") return roots.codex_path;
  return roots.anonymous_path;
}

export function getEditorRootLabelKey(root: EditorRoot) {
  if (root === "claude") return "editorHome.claude";
  if (root === "cursor") return "editorHome.cursor";
  if (root === "codex") return "editorHome.codex";
  return "editorHome.anonymous";
}

export function getEditorEmptyTextKey(root: EditorRoot) {
  return root === "anonymous" ? "editorHome.emptyAnonymous" : "editorHome.emptyDir";
}

export function getEditorSelectTitleKey(root: EditorRoot) {
  return root === "anonymous" ? "editorHome.selectOrCreate" : "editorHome.selectFile";
}

export function pruneFocusedEditorEntry(entries: EditorDirEntry[], current: string | null) {
  return current && entries.some((entry) => entry.rel_path === current) ? current : null;
}

export function getSelectedEditorEntry(entries: EditorDirEntry[], selectedEntryKey: string | null) {
  return selectedEntryKey ? entries.find((entry) => entry.rel_path === selectedEntryKey) ?? null : null;
}

export function shouldSwitchEditorTargetRoot(currentRoot: EditorRoot, openTarget: EditorOpenTarget) {
  return currentRoot !== openTarget.root;
}

export function shouldSwitchEditorTargetDirectory(currentRel: string, openTarget: EditorOpenTarget) {
  return currentRel !== parentRel(openTarget.relPath);
}

export function shouldSkipEditorTargetOpen(selectedFileRel: string | null, openTarget: EditorOpenTarget) {
  return selectedFileRel === openTarget.relPath;
}

export function getNewEditorFileRel(root: EditorRoot, currentRel: string, untitledName: string) {
  return root === "anonymous" ? null : joinRel(currentRel, `${untitledName}.md`);
}
