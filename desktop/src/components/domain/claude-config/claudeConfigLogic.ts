import type { FileEntry } from "../../../types/files";

export type ClaudeConfigTab = "memory" | "knowledge" | "skills" | "config" | "rules";
export type ClaudeConfigEditor = "claude" | "cursor";

export interface ClaudeConfigTabDefinition {
  id: ClaudeConfigTab;
  labelKey: string;
  folder: string;
}

export const CLAUDE_CONFIG_TABS: ClaudeConfigTabDefinition[] = [
  { id: "memory", labelKey: "claudeConfig.memory", folder: "claude-config/memory" },
  { id: "knowledge", labelKey: "claudeConfig.knowledge", folder: "claude-config/root-docs" },
  { id: "skills", labelKey: "claudeConfig.skills", folder: "claude-config/skills" },
  { id: "config", labelKey: "claudeConfig.config", folder: "claude-config" },
];

export const CURSOR_CONFIG_TABS: ClaudeConfigTabDefinition[] = [
  { id: "rules", labelKey: "claudeConfig.rules", folder: "cursor-config/rules" },
  { id: "knowledge", labelKey: "claudeConfig.knowledge", folder: "cursor-config/root-docs" },
  { id: "skills", labelKey: "claudeConfig.skills", folder: "cursor-config/skills" },
  { id: "config", labelKey: "claudeConfig.config", folder: "cursor-config" },
];

type ListFiles = (folder: string) => Promise<FileEntry[]>;

export function getClaudeConfigTabs(editor: ClaudeConfigEditor) {
  return editor === "claude" ? CLAUDE_CONFIG_TABS : CURSOR_CONFIG_TABS;
}

export function getInitialClaudeConfigTab(editor: ClaudeConfigEditor): ClaudeConfigTab {
  return editor === "claude" ? "memory" : "rules";
}

export function getClaudeConfigBaseFolder(editor: ClaudeConfigEditor) {
  return editor === "claude" ? "claude-config" : "cursor-config";
}

export function getClaudeConfigTabDefinition(editor: ClaudeConfigEditor, tab: ClaudeConfigTab) {
  return getClaudeConfigTabs(editor).find((item) => item.id === tab) ?? null;
}

export function isClaudeProjectMemoryFile(file: FileEntry) {
  return file.path.includes("/memory/") && file.path.endsWith(".md");
}

export function isProjectKnowledgeFile(file: FileEntry) {
  return (
    file.path.includes("/docs/") ||
    file.path.includes("/references/") ||
    file.path.includes("/specs/")
  ) && file.path.endsWith(".md");
}

export function sortFilesByModifiedDesc(files: FileEntry[]) {
  return [...files].sort((a, b) => (b.modifiedTs ?? 0) - (a.modifiedTs ?? 0));
}

export function isRootClaudeConfigFile(file: FileEntry) {
  return !file.path.includes("claude-config/memory/") &&
    !file.path.includes("claude-config/root-docs/") &&
    !file.path.includes("claude-config/skills/") &&
    !file.path.includes("claude-config/projects/");
}

export function isRootCursorConfigFile(file: FileEntry) {
  return !file.path.includes("cursor-config/root-docs/") &&
    !file.path.includes("cursor-config/rules/") &&
    !file.path.includes("cursor-config/skills/");
}

export function filterRootConfigFiles(editor: ClaudeConfigEditor, files: FileEntry[]) {
  return editor === "claude"
    ? files.filter(isRootClaudeConfigFile)
    : files.filter(isRootCursorConfigFile);
}

export async function loadClaudeConfigFiles(
  editor: ClaudeConfigEditor,
  tab: ClaudeConfigTab,
  listFiles: ListFiles,
) {
  const tabDef = getClaudeConfigTabDefinition(editor, tab);
  if (!tabDef) return [];

  if (editor === "claude" && tab === "memory") {
    const [globalMemory, projectsTree] = await Promise.all([
      listFiles("claude-config/memory"),
      listFiles("claude-config/projects"),
    ]);
    return sortFilesByModifiedDesc([
      ...globalMemory,
      ...projectsTree.filter(isClaudeProjectMemoryFile),
    ]);
  }

  if (tab === "knowledge") {
    const base = getClaudeConfigBaseFolder(editor);
    const [rootDocs, projectsTree] = await Promise.all([
      listFiles(`${base}/root-docs`),
      listFiles(`${base}/projects`),
    ]);
    return sortFilesByModifiedDesc([
      ...rootDocs,
      ...projectsTree.filter(isProjectKnowledgeFile),
    ]);
  }

  const files = await listFiles(tabDef.folder);
  return tab === "config" ? filterRootConfigFiles(editor, files) : files;
}
