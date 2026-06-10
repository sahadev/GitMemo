import type { Page } from "../../../App";

export interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

export type QuickPasteMode = "search" | "command" | "file";

export type CommandId = "sync" | "search" | "clipboard" | "settings";

export type QuickPasteCommandPage = Extract<Page, "search" | "clipboard" | "settings">;

export interface CommandItem {
  id: CommandId;
  title: string;
  subtitle: string;
}

export type QuickPasteVisibleItem = SearchResultItem | CommandItem;

export const QUICK_PASTE_COMMANDS: readonly CommandItem[] = [
  { id: "sync", title: "sync", subtitle: "Sync GitMemo to Git" },
  { id: "search", title: "search", subtitle: "Open main search page" },
  { id: "clipboard", title: "clipboard", subtitle: "Open clipboard page" },
  { id: "settings", title: "settings", subtitle: "Open settings page" },
];

export function stripQuickPasteFrontmatter(content: string) {
  return content.replace(/^---[\s\S]*?---\s*/, "").trim();
}

export function isQuickPasteCommandQuery(query: string) {
  return query.startsWith(">");
}

export function isQuickPasteFileQuery(query: string) {
  return query.startsWith("@");
}

export function getQuickPasteMode(query: string): QuickPasteMode {
  if (isQuickPasteCommandQuery(query)) return "command";
  if (isQuickPasteFileQuery(query)) return "file";
  return "search";
}

export function getQuickPasteQueryValue(query: string, mode: QuickPasteMode) {
  if (mode === "search") return query.trim();
  return query.slice(1).trim();
}

export function isQuickPasteCommandMode(mode: QuickPasteMode) {
  return mode === "command";
}

export function isQuickPasteFileMode(mode: QuickPasteMode) {
  return mode === "file";
}

export function isQuickPasteSearchMode(mode: QuickPasteMode) {
  return mode === "search";
}

export function shouldClearQuickPasteResults(modeQuery: string) {
  return modeQuery.length === 0;
}

export function getFilteredQuickPasteCommands(modeQuery: string) {
  const normalizedQuery = modeQuery.toLowerCase();
  return QUICK_PASTE_COMMANDS.filter((item) => item.title.includes(normalizedQuery));
}

export function getQuickPasteVisibleItems({
  mode,
  commandResults,
  fileResults,
  searchResults,
}: {
  mode: QuickPasteMode;
  commandResults: CommandItem[];
  fileResults: SearchResultItem[];
  searchResults: SearchResultItem[];
}): QuickPasteVisibleItem[] {
  if (isQuickPasteCommandMode(mode)) return commandResults;
  if (isQuickPasteFileMode(mode)) return fileResults;
  return searchResults;
}

export function getNextQuickPasteSelectedIndex(selectedIndex: number, itemCount: number) {
  return Math.min(selectedIndex + 1, Math.max(itemCount - 1, 0));
}

export function getPreviousQuickPasteSelectedIndex(selectedIndex: number) {
  return Math.max(selectedIndex - 1, 0);
}

export function getSelectedQuickPasteItem(items: QuickPasteVisibleItem[], selectedIndex: number) {
  return items[selectedIndex] ?? null;
}

export function isQuickPasteSyncCommand(command: CommandItem) {
  return command.id === "sync";
}

export function getQuickPasteCommandPage(command: CommandItem): QuickPasteCommandPage | null {
  if (isQuickPasteSyncCommand(command)) return null;
  if (command.id === "search" || command.id === "clipboard" || command.id === "settings") return command.id;
  return null;
}

export function getQuickPasteEmptyState(modeQuery: string) {
  return modeQuery ? "no-results" : "idle";
}

export function getQuickPasteFooterActionLabel(mode: QuickPasteMode) {
  if (isQuickPasteSearchMode(mode)) return "copy";
  if (isQuickPasteFileMode(mode)) return "open";
  return "run";
}
