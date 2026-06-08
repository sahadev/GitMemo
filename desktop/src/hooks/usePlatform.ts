import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Platform = "desktop" | "mobile";
export type RuntimeOs = "macos" | "windows" | "linux" | "android" | "ios" | "unknown";

export interface RuntimeInfo {
  family: Platform;
  os: RuntimeOs;
}

function platformFromNavigator(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

function osFromNavigator(): RuntimeOs {
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

function normalizePlatform(value: unknown): Platform {
  return value === "mobile" ? "mobile" : "desktop";
}

function normalizeRuntimeOs(value: unknown): RuntimeOs {
  return value === "macos" || value === "windows" || value === "linux" || value === "android" || value === "ios"
    ? value
    : "unknown";
}

function fallbackRuntimeInfo(): RuntimeInfo {
  return {
    family: platformFromNavigator(),
    os: osFromNavigator(),
  };
}

function normalizeRuntimeInfo(value: unknown): RuntimeInfo {
  if (!value || typeof value !== "object") return fallbackRuntimeInfo();
  const raw = value as Partial<Record<keyof RuntimeInfo, unknown>>;
  return {
    family: normalizePlatform(raw.family),
    os: normalizeRuntimeOs(raw.os),
  };
}

let cachedRuntimeInfo: RuntimeInfo = fallbackRuntimeInfo();
let cachedPlatform: Platform = cachedRuntimeInfo.family;
let platformPromise: Promise<Platform> | null = null;
let runtimeInfoPromise: Promise<RuntimeInfo> | null = null;

export function getRuntimePlatformSync(): Platform {
  return cachedPlatform;
}

export function getRuntimeInfoSync(): RuntimeInfo {
  return cachedRuntimeInfo;
}

export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  if (!runtimeInfoPromise) {
    runtimeInfoPromise = invoke<RuntimeInfo>("get_runtime_info")
      .then(normalizeRuntimeInfo)
      .catch(fallbackRuntimeInfo)
      .then((info) => {
        cachedRuntimeInfo = info;
        cachedPlatform = info.family;
        return info;
      });
  }
  return runtimeInfoPromise;
}

export async function getRuntimePlatform(): Promise<Platform> {
  if (!platformPromise) {
    platformPromise = getRuntimeInfo()
      .then((info) => info.family)
      .catch(() => invoke<Platform>("get_runtime_platform").then(normalizePlatform).catch(platformFromNavigator))
      .then((platform) => {
        cachedPlatform = platform;
        cachedRuntimeInfo = { ...cachedRuntimeInfo, family: platform };
        return platform;
      });
  }
  return platformPromise;
}

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(getRuntimePlatformSync);

  useEffect(() => {
    let cancelled = false;
    void getRuntimePlatform().then((next) => {
      if (!cancelled) setPlatform(next);
    });
    return () => { cancelled = true; };
  }, []);

  return platform;
}

export function useRuntimeInfo(): RuntimeInfo {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>(getRuntimeInfoSync);

  useEffect(() => {
    let cancelled = false;
    void getRuntimeInfo().then((next) => {
      if (!cancelled) setRuntimeInfo(next);
    });
    return () => { cancelled = true; };
  }, []);

  return runtimeInfo;
}

export function usePlatformFlags() {
  const runtimeInfo = useRuntimeInfo();
  const platform = runtimeInfo.family;
  return {
    platform,
    os: runtimeInfo.os,
    runtimeInfo,
    isMobile: platform === "mobile",
    isDesktop: platform === "desktop",
  };
}
