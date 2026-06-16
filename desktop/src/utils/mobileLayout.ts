export const MOBILE_BOTTOM_NAV_HEIGHT = 52;
export const MOBILE_BOTTOM_CONTENT_PADDING = `calc(${MOBILE_BOTTOM_NAV_HEIGHT + 44}px + env(safe-area-inset-bottom, 0px))`;
export const MOBILE_DASHBOARD_BOTTOM_PADDING = `calc(${MOBILE_BOTTOM_NAV_HEIGHT + 96}px + env(safe-area-inset-bottom, 0px))`;
export const MOBILE_BOTTOM_SELECTION_PADDING = `calc(${MOBILE_BOTTOM_NAV_HEIGHT + 100}px + env(safe-area-inset-bottom, 0px))`;
export const MOBILE_FIXED_BAR_BOTTOM = `calc(${MOBILE_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;

export const MOBILE_EXTRA_TOP_SAFE_AREA_STORAGE_KEY = "gitmemo-mobile-extra-top-safe-area";
export const MOBILE_EXTRA_TOP_SAFE_AREA_ATTRIBUTE = "data-mobile-extra-top-safe-area";

export function isMobileExtraTopSafeAreaStoredValueEnabled(value: string | null | undefined) {
  return value === "true";
}

export function shouldApplyMobileExtraTopSafeArea(input: { isMobile: boolean; enabled: boolean }) {
  return input.isMobile && input.enabled;
}

export function shouldShowMobileExtraTopSafeAreaSetting(isMobile: boolean) {
  return isMobile;
}

export function loadMobileExtraTopSafeArea() {
  if (typeof window === "undefined") return false;
  try {
    return isMobileExtraTopSafeAreaStoredValueEnabled(
      window.localStorage.getItem(MOBILE_EXTRA_TOP_SAFE_AREA_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

export function saveMobileExtraTopSafeArea(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOBILE_EXTRA_TOP_SAFE_AREA_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Local storage can be unavailable in restricted WebView modes.
  }
}

export function applyMobileExtraTopSafeArea(input: { isMobile: boolean; enabled: boolean }) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(
    MOBILE_EXTRA_TOP_SAFE_AREA_ATTRIBUTE,
    shouldApplyMobileExtraTopSafeArea(input) ? "true" : "false",
  );
}
