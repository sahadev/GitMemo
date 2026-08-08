export type EditorMode = "markdown" | "plain";
export type EditorColorTheme = "dark" | "light";

export type MarkdownCommandId =
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "link"
  | "heading"
  | "quote"
  | "bulletList"
  | "orderedList"
  | "codeBlock";

export interface EditorSelection {
  from: number;
  to: number;
}

export interface MarkdownChangeResult {
  from: number;
  to: number;
  insert: string;
  selection: EditorSelection;
}

export function isMarkdownEditorPath(filePath?: string): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx") || lower.endsWith(".mdc");
}

export function getEditorMode(filePath?: string): EditorMode {
  return isMarkdownEditorPath(filePath) ? "markdown" : "plain";
}

export function isDarkEditorTheme(theme: EditorColorTheme): boolean {
  return theme === "dark";
}

function wrapSelection(
  document: string,
  selection: EditorSelection,
  before: string,
  after: string,
  placeholder: string,
): MarkdownChangeResult {
  const selected = document.slice(selection.from, selection.to);
  const body = selected || placeholder;
  const insert = `${before}${body}${after}`;
  const bodyStart = selection.from + before.length;

  return {
    from: selection.from,
    to: selection.to,
    insert,
    selection: {
      from: bodyStart,
      to: bodyStart + body.length,
    },
  };
}

function wrapLink(document: string, selection: EditorSelection): MarkdownChangeResult {
  const selected = document.slice(selection.from, selection.to);
  const label = selected || "text";
  const insert = `[${label}](https://)`;
  const urlStart = selection.from + label.length + 3;

  return {
    from: selection.from,
    to: selection.to,
    insert,
    selection: {
      from: selected ? urlStart : selection.from + 1,
      to: selected ? urlStart + 8 : selection.from + 5,
    },
  };
}

function lineBounds(document: string, selection: EditorSelection) {
  const start = document.lastIndexOf("\n", Math.max(0, selection.from - 1)) + 1;
  const endIndex = document.indexOf("\n", selection.to);
  const end = endIndex === -1 ? document.length : endIndex;
  return { start, end };
}

function linePrefix(
  document: string,
  selection: EditorSelection,
  prefix: string,
): MarkdownChangeResult {
  const bounds = lineBounds(document, selection);
  const original = document.slice(bounds.start, bounds.end);
  const lines = original.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const shouldRemove = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => line.startsWith(prefix));
  const next = lines.map((line) => {
    if (shouldRemove && line.startsWith(prefix)) return line.slice(prefix.length);
    return line.trim().length === 0 ? line : `${prefix}${line}`;
  });
  const insert = next.join("\n");
  const mapOffset = (offset: number) => {
    const relativeOffset = Math.max(0, Math.min(offset - bounds.start, original.length));
    let sourceCursor = 0;
    let outputCursor = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const transformedLine = next[index];
      const lineEnd = sourceCursor + line.length;
      if (relativeOffset <= lineEnd || index === lines.length - 1) {
        const withinLine = Math.min(Math.max(0, relativeOffset - sourceCursor), line.length);
        const removesPrefix = shouldRemove && line.startsWith(prefix);
        const addsPrefix = !shouldRemove && line.trim().length > 0;
        const mappedWithinLine = removesPrefix
          ? Math.max(0, withinLine - prefix.length)
          : addsPrefix ? withinLine + prefix.length : withinLine;
        return bounds.start + outputCursor + Math.min(mappedWithinLine, transformedLine.length);
      }
      sourceCursor += line.length + 1;
      outputCursor += transformedLine.length + 1;
    }

    return bounds.end + (insert.length - original.length);
  };

  return {
    from: bounds.start,
    to: bounds.end,
    insert,
    selection: {
      from: selection.from === bounds.start && selection.to > selection.from
        ? bounds.start
        : mapOffset(selection.from),
      to: Math.max(
        selection.from === bounds.start && selection.to > selection.from
          ? bounds.start
          : mapOffset(selection.from),
        mapOffset(selection.to),
      ),
    },
  };
}

function codeBlock(document: string, selection: EditorSelection): MarkdownChangeResult {
  const selected = document.slice(selection.from, selection.to);
  const body = selected || "code";
  const insert = `\`\`\`\n${body}\n\`\`\``;
  const bodyStart = selection.from + 4;

  return {
    from: selection.from,
    to: selection.to,
    insert,
    selection: { from: bodyStart, to: bodyStart + body.length },
  };
}

export function applyMarkdownCommand(
  document: string,
  selection: EditorSelection,
  command: MarkdownCommandId,
): MarkdownChangeResult {
  switch (command) {
    case "bold":
      return wrapSelection(document, selection, "**", "**", "bold");
    case "italic":
      return wrapSelection(document, selection, "*", "*", "italic");
    case "strike":
      return wrapSelection(document, selection, "~~", "~~", "strike");
    case "inlineCode":
      return wrapSelection(document, selection, "`", "`", "code");
    case "link":
      return wrapLink(document, selection);
    case "heading":
      return linePrefix(document, selection, "## ");
    case "quote":
      return linePrefix(document, selection, "> ");
    case "bulletList":
      return linePrefix(document, selection, "- ");
    case "orderedList":
      return linePrefix(document, selection, "1. ");
    case "codeBlock":
      return codeBlock(document, selection);
  }
}
