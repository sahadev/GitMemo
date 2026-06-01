import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  emitNotificationNavigate,
  installNotificationFocusFallback,
  isNotificationNavigateTarget,
  rememberNotificationNavigateTarget,
  type NotificationNavigateTarget,
} from "./notificationNavigation";

let permissionGranted: boolean | null = null;
let lastNotification: { title: string; body: string; at: number } | null = null;
let notificationListenersInitialized = false;

export interface NotifyOptions {
  target?: NotificationNavigateTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNotificationTarget(value: unknown): NotificationNavigateTarget | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isNotificationNavigateTarget(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isNotificationNavigateTarget(value) ? value : null;
}

function extractNotificationTarget(event: unknown): NotificationNavigateTarget | null {
  const notification = isRecord(event) && isRecord(event.notification) ? event.notification : event;
  if (!isRecord(notification) || !isRecord(notification.extra)) return null;
  return parseNotificationTarget(notification.extra.gitmemoNavigate);
}

export function initNotificationListeners() {
  if (notificationListenersInitialized) return;
  notificationListenersInitialized = true;

  installNotificationFocusFallback();

  void onAction((event: unknown) => {
    const target = extractNotificationTarget(event);
    if (target) emitNotificationNavigate(target);
  }).catch(() => {
    // Desktop notification clicks are handled by the focus fallback above.
  });
}

async function ensurePermission(): Promise<boolean> {
  if (permissionGranted === true) return true;
  try {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const result = await requestPermission();
      permissionGranted = result === "granted";
    }
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

/**
 * Send a system notification only when the app window is not focused.
 */
export async function notify(title: string, body?: string, options?: NotifyOptions) {
  initNotificationListeners();
  if (document.hasFocus()) return;
  const normalizedBody = body ?? "";
  const now = Date.now();
  if (
    lastNotification &&
    lastNotification.title === title &&
    lastNotification.body === normalizedBody &&
    now - lastNotification.at < 1500
  ) {
    return;
  }
  lastNotification = { title, body: normalizedBody, at: now };
  const ok = await ensurePermission();
  if (!ok) return;
  if (options?.target) rememberNotificationNavigateTarget(options.target);
  sendNotification({
    title,
    body,
    autoCancel: true,
    extra: options?.target ? { gitmemoNavigate: JSON.stringify(options.target) } : undefined,
  });
}
