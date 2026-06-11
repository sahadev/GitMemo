import type { Page } from "../App";
import type { AiRecordsTab } from "../hooks/useAppStore";

export const DESKTOP_PAGE_ORDER: readonly Page[] = [
  "dashboard",
  "search",
  "ai-records",
  "notes",
  "clipboard",
  "vault",
  "favorites",
  "claude-config",
  "external-files",
  "settings",
];

export const MOBILE_PAGE_ORDER: readonly Page[] = [
  "dashboard",
  "search",
  "ai-records",
  "notes",
  "clipboard",
  "favorites",
  "imports",
  "settings",
];

const APP_PAGES = new Set<Page>([
  "dashboard",
  "search",
  "ai-records",
  "notes",
  "clipboard",
  "vault",
  "favorites",
  "imports",
  "claude-config",
  "editor-home",
  "external-files",
  "settings",
]);

export interface MobileTouchPoint {
  x: number;
  y: number;
  time: number;
}

export interface ExternalSyncRoute {
  page: Page;
  aiRecordsTab?: AiRecordsTab;
}

export function getAppPageOrder(isDesktop: boolean) {
  return isDesktop ? DESKTOP_PAGE_ORDER : MOBILE_PAGE_ORDER;
}

export function isAppPage(value: string | null | undefined): value is Page {
  return Boolean(value && APP_PAGES.has(value as Page));
}

export function isMobileSupportedPage(page: Page) {
  return MOBILE_PAGE_ORDER.includes(page);
}

export function shouldResetUnsupportedMobilePage(isMobile: boolean, page: Page) {
  return isMobile && !isMobileSupportedPage(page);
}

export function shouldUseMobileBackFeatures(isMobile: boolean, initialized: boolean | null) {
  return isMobile && initialized !== false;
}

export function shouldInstallMobileHistoryGuard(
  isMobile: boolean,
  initialized: boolean | null,
  guardActive: boolean,
) {
  return shouldUseMobileBackFeatures(isMobile, initialized) && !guardActive;
}

export function shouldTriggerSearchEntryOnNavigate(isMobile: boolean, page: Page) {
  return isMobile && page === "search";
}

export function shouldPushMobilePageStack(isMobile: boolean, stackEnabled: boolean, page: Page, currentPage: Page) {
  return isMobile && stackEnabled && page !== currentPage;
}

export function getNextMobilePageStack(stack: Page[], currentPage: Page) {
  return [...stack, currentPage].slice(-30);
}

export function resolveMobileBackNavigation(currentPage: Page, stack: Page[]) {
  const previous = stack[stack.length - 1];
  if (previous) {
    return {
      handled: true,
      page: previous,
      stack: stack.slice(0, -1),
    };
  }
  if (currentPage !== "dashboard") {
    return {
      handled: true,
      page: "dashboard" as const,
      stack,
    };
  }
  return {
    handled: false,
    page: null,
    stack,
  };
}

export function shouldStartMobileBackGesture(
  isMobile: boolean,
  initialized: boolean | null,
  touchCount: number,
) {
  return shouldUseMobileBackFeatures(isMobile, initialized) && touchCount === 1;
}

export function isMobileBackSwipeGesture(start: MobileTouchPoint, end: MobileTouchPoint) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const elapsed = end.time - start.time;
  return start.x <= 36 && deltaX >= 72 && Math.abs(deltaY) <= 60 && elapsed <= 800;
}

export function resolveQuickPasteOpenPage(page: string | null | undefined): Extract<Page, "settings" | "clipboard" | "search"> | null {
  if (page === "settings" || page === "clipboard" || page === "search") return page;
  return null;
}

export function resolveExternalSyncRoute(targetPage: string | null): ExternalSyncRoute | null {
  if (targetPage === "conversations") {
    return { page: "ai-records", aiRecordsTab: "conversations" };
  }
  if (targetPage === "plans") {
    return { page: "ai-records", aiRecordsTab: "plans" };
  }
  if (isAppPage(targetPage)) {
    return { page: targetPage };
  }
  return null;
}
