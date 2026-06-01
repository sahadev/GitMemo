import type { Page } from "../App";
import type { AiRecordsTab } from "../hooks/useAppStore";

const EVENT_NAME = "gitmemo-notification-navigate";
const STORAGE_KEY = "gitmemo-pending-notification-target";
const DEFAULT_TTL_MS = 2 * 60 * 1000;
const VALID_PAGES = new Set<Page>([
  "dashboard",
  "search",
  "ai-records",
  "notes",
  "clipboard",
  "favorites",
  "imports",
  "claude-config",
  "editor-home",
  "external-files",
  "settings",
]);

export interface NotificationNavigateTarget {
  page: Page;
  focus?: boolean;
  aiRecordsTab?: AiRecordsTab;
  openPath?: string;
}

interface StoredNotificationTarget {
  target: NotificationNavigateTarget;
  at: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isNotificationNavigateTarget(value: unknown): value is NotificationNavigateTarget {
  if (!isRecord(value)) return false;
  if (typeof value.page !== "string" || !VALID_PAGES.has(value.page as Page)) return false;
  if (value.focus !== undefined && typeof value.focus !== "boolean") return false;
  if (value.openPath !== undefined && typeof value.openPath !== "string") return false;
  if (
    value.aiRecordsTab !== undefined &&
    value.aiRecordsTab !== "conversations" &&
    value.aiRecordsTab !== "plans"
  ) {
    return false;
  }
  return true;
}

export function rememberNotificationNavigateTarget(target: NotificationNavigateTarget) {
  const stored: StoredNotificationTarget = { target, at: Date.now() };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Session storage can be unavailable in restricted webviews.
  }
}

export function clearNotificationNavigateTarget() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function consumeNotificationNavigateTarget(ttlMs = DEFAULT_TTL_MS): NotificationNavigateTarget | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  clearNotificationNavigateTarget();

  try {
    const stored = JSON.parse(raw) as unknown;
    if (!isRecord(stored) || typeof stored.at !== "number") return null;
    if (Date.now() - stored.at > ttlMs) return null;
    return isNotificationNavigateTarget(stored.target) ? stored.target : null;
  } catch {
    return null;
  }
}

export function emitNotificationNavigate(target: NotificationNavigateTarget) {
  clearNotificationNavigateTarget();
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: target }));
}

export function subscribeNotificationNavigate(handler: (target: NotificationNavigateTarget) => void) {
  const listener = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (isNotificationNavigateTarget(detail)) handler(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

let focusFallbackInstalled = false;

export function installNotificationFocusFallback() {
  if (focusFallbackInstalled) return;
  focusFallbackInstalled = true;

  const navigateFromPendingTarget = () => {
    const target = consumeNotificationNavigateTarget();
    if (target) emitNotificationNavigate(target);
  };

  window.addEventListener("focus", navigateFromPendingTarget);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigateFromPendingTarget();
  });
}
