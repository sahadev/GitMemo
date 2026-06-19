export type Platform = "desktop" | "mobile";
export type RuntimeOs = "macos" | "windows" | "linux" | "android" | "ios" | "unknown";
export type RevealLabelNamespace = "common" | "externalFiles";

export interface RuntimeInfo {
  family: Platform;
  os: RuntimeOs;
}

export interface PlatformFlags {
  platform: Platform;
  os: RuntimeOs;
  isDesktop: boolean;
  isMobile: boolean;
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isAndroid: boolean;
  isIos: boolean;
}

export interface PlatformCapabilities {
  supportsControlCopyPasteBridge: boolean;
  supportsImageClipboardWrite: boolean;
  supportsPdfExport: boolean;
  supportsSystemProxyDetection: boolean;
}

export function platformFromNavigator(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

export function osFromNavigator(): RuntimeOs {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux")) return "linux";
  return "unknown";
}

export function normalizePlatform(value: unknown): Platform {
  return value === "mobile" ? "mobile" : "desktop";
}

export function normalizeRuntimeOs(value: unknown): RuntimeOs {
  return value === "macos" || value === "windows" || value === "linux" || value === "android" || value === "ios"
    ? value
    : "unknown";
}

export function fallbackRuntimeInfo(): RuntimeInfo {
  return {
    family: platformFromNavigator(),
    os: osFromNavigator(),
  };
}

export function normalizeRuntimeInfo(value: unknown): RuntimeInfo {
  if (!value || typeof value !== "object") return fallbackRuntimeInfo();
  const raw = value as Partial<Record<keyof RuntimeInfo, unknown>>;
  return {
    family: normalizePlatform(raw.family),
    os: normalizeRuntimeOs(raw.os),
  };
}

export function isDesktopRuntime(info: RuntimeInfo) {
  return info.family === "desktop";
}

export function isMobileRuntime(info: RuntimeInfo) {
  return info.family === "mobile";
}

export function isMacOs(os: RuntimeOs) {
  return os === "macos";
}

export function isWindowsOs(os: RuntimeOs) {
  return os === "windows";
}

export function isLinuxOs(os: RuntimeOs) {
  return os === "linux";
}

export function isAndroidOs(os: RuntimeOs) {
  return os === "android";
}

export function isIosOs(os: RuntimeOs) {
  return os === "ios";
}

export function getPlatformFlags(info: RuntimeInfo): PlatformFlags {
  return {
    platform: info.family,
    os: info.os,
    isDesktop: isDesktopRuntime(info),
    isMobile: isMobileRuntime(info),
    isMac: isMacOs(info.os),
    isWindows: isWindowsOs(info.os),
    isLinux: isLinuxOs(info.os),
    isAndroid: isAndroidOs(info.os),
    isIos: isIosOs(info.os),
  };
}

export function supportsControlCopyPasteBridge(flags: PlatformFlags) {
  return flags.isDesktop && flags.isMac;
}

export function supportsSystemProxyDetection(flags: PlatformFlags) {
  return flags.isDesktop && flags.isMac;
}

export function supportsImageClipboardWrite(flags: PlatformFlags) {
  return flags.isDesktop;
}

export function supportsPdfExport(flags: PlatformFlags) {
  return flags.isDesktop;
}

export function getPlatformCapabilities(flags: PlatformFlags): PlatformCapabilities {
  return {
    supportsControlCopyPasteBridge: supportsControlCopyPasteBridge(flags),
    supportsImageClipboardWrite: supportsImageClipboardWrite(flags),
    supportsPdfExport: supportsPdfExport(flags),
    supportsSystemProxyDetection: supportsSystemProxyDetection(flags),
  };
}

export function getRevealInFileManagerLabelKey(os: RuntimeOs, namespace: RevealLabelNamespace = "common") {
  if (isMacOs(os)) return `${namespace}.revealInFinder`;
  if (isWindowsOs(os)) return `${namespace}.revealInExplorer`;
  return `${namespace}.revealInFileManager`;
}
