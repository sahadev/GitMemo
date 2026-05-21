export type ShortcutId =
  | "global_search"
  | "app_search"
  | "quick_note"
  | "find_in_document"
  | "edit_selected"
  | "delete_selected";

export type KeyboardShortcuts = Record<ShortcutId, string>;

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  global_search: "CmdOrCtrl+Shift+G",
  app_search: "CmdOrCtrl+K",
  quick_note: "CmdOrCtrl+N",
  find_in_document: "CmdOrCtrl+F",
  edit_selected: "CmdOrCtrl+E",
  delete_selected: "CmdOrCtrl+Delete",
};

const MODIFIER_KEYS = new Set([
  "alt",
  "altgraph",
  "control",
  "ctrl",
  "meta",
  "os",
  "shift",
  "super",
]);

export function withDefaultShortcuts(shortcuts?: Partial<KeyboardShortcuts> | null): KeyboardShortcuts {
  return { ...DEFAULT_KEYBOARD_SHORTCUTS, ...(shortcuts ?? {}) };
}

function normalizeKeyName(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();

  if (lower === " " || lower === "spacebar") return "Space";
  if (lower === "esc") return "Escape";
  if (lower === "del") return "Delete";
  if (lower === "return") return "Enter";
  if (lower === "arrowup" || lower === "up") return "ArrowUp";
  if (lower === "arrowdown" || lower === "down") return "ArrowDown";
  if (lower === "arrowleft" || lower === "left") return "ArrowLeft";
  if (lower === "arrowright" || lower === "right") return "ArrowRight";
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();

  const namedKeys: Record<string, string> = {
    backspace: "Backspace",
    delete: "Delete",
    enter: "Enter",
    tab: "Tab",
    escape: "Escape",
    home: "Home",
    end: "End",
    insert: "Insert",
    pagedown: "PageDown",
    pageup: "PageUp",
  };
  if (namedKeys[lower]) return namedKeys[lower];
  if (trimmed.length === 1) return trimmed.toUpperCase();

  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function parseShortcut(shortcut: string) {
  const tokens = shortcut.split("+").map((token) => token.trim()).filter(Boolean);
  let cmdOrCtrl = false;
  let cmd = false;
  let ctrl = false;
  let alt = false;
  let shift = false;
  let key = "";

  for (const token of tokens) {
    const normalized = token.toLowerCase().replace(/\s+/g, "");
    if (["cmdorctrl", "cmdorcontrol", "commandorctrl", "commandorcontrol"].includes(normalized)) {
      cmdOrCtrl = true;
    } else if (["cmd", "command", "meta", "super"].includes(normalized)) {
      cmd = true;
    } else if (["ctrl", "control"].includes(normalized)) {
      ctrl = true;
    } else if (["alt", "option"].includes(normalized)) {
      alt = true;
    } else if (normalized === "shift") {
      shift = true;
    } else if (!key) {
      key = normalizeKeyName(token);
    } else {
      return null;
    }
  }

  if (!key || MODIFIER_KEYS.has(key.toLowerCase())) return null;
  return { cmdOrCtrl, cmd, ctrl, alt, shift, key };
}

export function normalizeShortcut(shortcut: string): string | null {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return null;
  const parts: string[] = [];
  if (parsed.cmdOrCtrl) parts.push("CmdOrCtrl");
  if (parsed.cmd) parts.push("Cmd");
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  parts.push(parsed.key);
  return parts.join("+");
}

export function shortcutFromKeyboardEvent(e: KeyboardEvent): string | null {
  const key = normalizeKeyName(e.key);
  if (!key || MODIFIER_KEYS.has(key.toLowerCase())) return null;
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.metaKey) parts.push("Cmd");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function shortcutMatches(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;

  const key = normalizeKeyName(e.key);
  const keyMatches =
    key === parsed.key ||
    (parsed.key === "Delete" && (key === "Delete" || key === "Backspace")) ||
    (parsed.key === "Backspace" && (key === "Backspace" || key === "Delete"));
  if (!keyMatches) return false;

  const cmdOrCtrlMatches = parsed.cmdOrCtrl ? e.metaKey || e.ctrlKey : true;
  const cmdMatches = parsed.cmd ? e.metaKey : !e.metaKey || parsed.cmdOrCtrl;
  const ctrlMatches = parsed.ctrl ? e.ctrlKey : !e.ctrlKey || parsed.cmdOrCtrl;

  return cmdOrCtrlMatches && cmdMatches && ctrlMatches && e.altKey === parsed.alt && e.shiftKey === parsed.shift;
}

export function formatShortcut(shortcut: string): string {
  const normalized = normalizeShortcut(shortcut) ?? shortcut;
  return normalized
    .replace(/CmdOrCtrl/g, "Cmd/Ctrl")
    .replace(/\+/g, "+");
}

export function findShortcutConflict(
  shortcuts: KeyboardShortcuts,
  changedId: ShortcutId,
): ShortcutId | null {
  const changed = shortcutConflictVariants(shortcuts[changedId]);
  if (changed.length === 0) return null;
  const changedSet = new Set(changed);

  for (const [id, value] of Object.entries(shortcuts) as [ShortcutId, string][]) {
    if (id === changedId) continue;
    if (shortcutConflictVariants(value).some((variant) => changedSet.has(variant))) return id;
  }
  return null;
}

function shortcutConflictVariants(shortcut: string): string[] {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return [];

  const ctrlMetaVariants = parsed.cmdOrCtrl
    ? [
        { cmd: true, ctrl: false },
        { cmd: false, ctrl: true },
      ]
    : [{ cmd: parsed.cmd, ctrl: parsed.ctrl }];
  const key = parsed.key === "Backspace" ? "Delete" : parsed.key;

  return ctrlMetaVariants.map(({ cmd, ctrl }) =>
    [cmd ? "cmd" : "", ctrl ? "ctrl" : "", parsed.alt ? "alt" : "", parsed.shift ? "shift" : "", key.toLowerCase()].join("|"),
  );
}
