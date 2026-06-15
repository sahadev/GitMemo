import type { Platform } from "./platformLogic";

export interface DashboardStartupContext {
  hasGitStatus: boolean;
  hasStats: boolean;
}

export function shouldLoadDesktopStatusLazily(platform: Platform) {
  return platform === "desktop";
}

export function getDashboardStartupMessageKey(ctx: DashboardStartupContext) {
  if (!ctx.hasGitStatus) return "dashboard.startupReadingRepository";
  if (!ctx.hasStats) return "dashboard.startupLoadingOverview";
  return null;
}

