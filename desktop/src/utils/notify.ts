import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionGranted: boolean | null = null;
let lastNotification: { title: string; body: string; at: number } | null = null;

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
 * Send a macOS system notification, only when the window is not focused.
 */
export async function notify(title: string, body?: string) {
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
  sendNotification({ title, body });
}
