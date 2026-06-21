export interface MobileTabBarContext {
  isMobile: boolean;
  mobileEditorChromeActive: boolean;
}

export interface MobileEditorChromeContext {
  pageActive: boolean;
  editing: boolean;
}

export function hasMobileEditorChrome(activeEditorIds: readonly string[]) {
  return activeEditorIds.length > 0;
}

export function shouldActivateMobileEditorChrome(ctx: MobileEditorChromeContext) {
  return ctx.pageActive && ctx.editing;
}

export function shouldHideMobileTabBar(ctx: MobileTabBarContext) {
  return ctx.isMobile && ctx.mobileEditorChromeActive;
}

export function shouldShowMobileTabBar(ctx: MobileTabBarContext) {
  return ctx.isMobile && !shouldHideMobileTabBar(ctx);
}
