import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  fallbackRuntimeInfo,
  normalizePlatform,
  normalizeRuntimeInfo,
  platformFromNavigator,
  type Platform,
  type RuntimeInfo,
} from "../utils/platformLogic";

export type { Platform, RuntimeInfo, RuntimeOs } from "../utils/platformLogic";

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
