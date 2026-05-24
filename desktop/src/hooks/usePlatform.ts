import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Platform = "desktop" | "mobile";

function platformFromNavigator(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

function normalizePlatform(value: unknown): Platform {
  return value === "mobile" ? "mobile" : "desktop";
}

let cachedPlatform: Platform = platformFromNavigator();
let platformPromise: Promise<Platform> | null = null;

export function getRuntimePlatformSync(): Platform {
  return cachedPlatform;
}

export async function getRuntimePlatform(): Promise<Platform> {
  if (!platformPromise) {
    platformPromise = invoke<Platform>("get_runtime_platform")
      .then(normalizePlatform)
      .catch(platformFromNavigator)
      .then((platform) => {
        cachedPlatform = platform;
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

export function usePlatformFlags() {
  const platform = usePlatform();
  return {
    platform,
    isMobile: platform === "mobile",
    isDesktop: platform === "desktop",
  };
}
