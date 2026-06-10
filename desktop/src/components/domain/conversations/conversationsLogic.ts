import type { FileEntry } from "../../../types/files";

export interface ConversationMeta {
  title: string;
  date: string;
  model: string;
  messages: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  timestamp: string;
  content: string;
}

export interface ParsedConversationBody {
  intro: string;
  messages: ChatMessage[];
}

const EMPTY_CONVERSATION_META: ConversationMeta = {
  title: "",
  date: "",
  model: "",
  messages: "",
};

export function getConversationMetaFromEntry(file: FileEntry): ConversationMeta {
  return {
    title: file.title || "",
    date: "",
    model: file.model || "",
    messages: file.messages || "",
  };
}

export function parseConversationFrontmatter(raw: string): { meta: ConversationMeta; body: string } {
  const meta: ConversationMeta = { ...EMPTY_CONVERSATION_META };
  if (!raw.startsWith("---")) return { meta, body: raw };

  const secondDelimiterIndex = raw.indexOf("---", 3);
  if (secondDelimiterIndex === -1) return { meta, body: raw };

  const frontmatter = raw.slice(3, secondDelimiterIndex);
  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    if (key === "title") meta.title = value.trim();
    else if (key === "date") meta.date = value.trim();
    else if (key === "model") meta.model = value.trim();
    else if (key === "messages") meta.messages = value.trim();
  }

  return {
    meta,
    body: raw.slice(secondDelimiterIndex + 3).trim(),
  };
}

export function parseConversationBody(body: string): ParsedConversationBody {
  const messages: ChatMessage[] = [];
  const pattern = /^### (User|Assistant)\s*(?:\(([^)]*)\))?\s*$/gm;
  const matches: { role: string; timestamp: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    matches.push({
      role: match[1].toLowerCase(),
      timestamp: match[2] || "",
      index: match.index,
    });
  }

  if (matches.length === 0) {
    return { intro: body.trim(), messages: [] };
  }

  for (let index = 0; index < matches.length; index++) {
    const start = body.indexOf("\n", matches[index].index) + 1;
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    messages.push({
      role: matches[index].role as "user" | "assistant",
      timestamp: matches[index].timestamp,
      content: body.slice(start, end).trim(),
    });
  }

  return {
    intro: body.slice(0, matches[0].index).trim(),
    messages,
  };
}

export function parseConversationMarkdown(raw: string) {
  const { meta, body } = parseConversationFrontmatter(raw);
  const parsedBody = parseConversationBody(body);
  return {
    meta,
    body,
    intro: parsedBody.intro,
    messages: parsedBody.messages,
  };
}

export function getConversationPaneState(isMobile: boolean, selectedFile: string | null) {
  const hasDetail = selectedFile !== null;
  return {
    showList: !isMobile || !hasDetail,
    showDetail: !isMobile || hasDetail,
  };
}

export function getConversationListCountLabel(input: {
  selectedFile: string | null;
  files: FileEntry[];
  hasMore: boolean;
  totalFiles?: number;
}) {
  const selectedIndex = input.selectedFile
    ? input.files.findIndex((file) => file.path === input.selectedFile)
    : -1;
  const selectedPrefix = selectedIndex >= 0 ? `${selectedIndex + 1} / ` : "";
  const totalSuffix = input.hasMore && typeof input.totalFiles === "number" ? ` / ${input.totalFiles}` : "";
  return `${selectedPrefix}${input.files.length}${totalSuffix}`;
}

export function shouldOpenFirstConversationFromKeyboard(selectedFile: string | null, files: FileEntry[]) {
  return selectedFile === null && files.length > 0;
}

export function getNextConversationAfterDelete(files: FileEntry[], deletedPath: string) {
  const deletedIndex = files.findIndex((file) => file.path === deletedPath);
  const remaining = files.filter((file) => file.path !== deletedPath);
  if (remaining.length === 0) return null;
  const nextIndex = deletedIndex < remaining.length ? deletedIndex : remaining.length - 1;
  return remaining[nextIndex] ?? null;
}
