import type { PlatformCapabilities, PlatformFlags } from "../../../utils/platformLogic";

export interface ImageActionContext {
  src?: string | null;
  filePath?: string | null;
  capabilities: PlatformCapabilities;
  isDesktop: boolean;
}

export interface ImageContextMenuPoint {
  x: number;
  y: number;
}

export interface ImageActionAvailability {
  canOpenMenu: boolean;
  canCopyImage: boolean;
  canSaveImage: boolean;
  canRevealImage: boolean;
}

export function hasImageSource(ctx: ImageActionContext) {
  return Boolean(ctx.src || ctx.filePath);
}

export function hasLocalImageFile(ctx: ImageActionContext) {
  return Boolean(ctx.filePath);
}

export function canCopyRenderedImage(ctx: ImageActionContext) {
  return ctx.capabilities.supportsImageClipboardWrite && hasImageSource(ctx);
}

export function canSaveRenderedImage(ctx: ImageActionContext) {
  return hasImageSource(ctx);
}

export function canRevealRenderedImage(ctx: ImageActionContext) {
  return ctx.isDesktop && hasLocalImageFile(ctx);
}

export function getImageActionAvailability(ctx: ImageActionContext): ImageActionAvailability {
  const canCopyImage = canCopyRenderedImage(ctx);
  const canSaveImage = canSaveRenderedImage(ctx);
  const canRevealImage = canRevealRenderedImage(ctx);
  return {
    canOpenMenu: canCopyImage || canSaveImage || canRevealImage,
    canCopyImage,
    canSaveImage,
    canRevealImage,
  };
}

export function shouldOpenImageContextMenu(ctx: ImageActionContext) {
  return ctx.isDesktop && getImageActionAvailability(ctx).canOpenMenu;
}

export function getImageContextMenuPoint(clientX: number, clientY: number): ImageContextMenuPoint {
  return { x: clientX, y: clientY };
}

export function shouldUseLongPressImageSave(flags: PlatformFlags, ctx: ImageActionContext) {
  return flags.isMobile && canSaveRenderedImage(ctx);
}
