import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { useI18n } from "./useI18n";
import { usePlatformFlags } from "./usePlatform";
import { useToast } from "./useToast";
import {
  getImageActionAvailability,
  getImageContextMenuPoint,
  shouldOpenImageContextMenu,
  shouldUseLongPressImageSave,
  type ImageActionAvailability,
  type ImageContextMenuPoint,
} from "../components/domain/files/imageActionsLogic";
import { useAppStore } from "./useAppStore";
import { withClipboardWatchPaused } from "../utils/clipboard";

interface SavedLocalImage {
  path: string;
  message: string;
}

interface LongPressImageSaveOptions {
  src?: string | null;
  filePath?: string | null;
  fileName?: string | null;
}

const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 12;

type LongPressImageSaveProps = Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  | "draggable"
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onPointerLeave"
  | "onTouchStart"
  | "onTouchMove"
  | "onTouchEnd"
  | "onTouchCancel"
  | "onContextMenu"
  | "onClickCapture"
  | "style"
> & {
  ref: RefCallback<HTMLImageElement>;
};

export interface ImageContextMenuState {
  point: ImageContextMenuPoint;
  availability: ImageActionAvailability;
  copyImage: () => Promise<void>;
  saveImage: () => Promise<void>;
  revealImage: () => Promise<void>;
  close: () => void;
}

type ImageSaveStyle = CSSProperties & {
  WebkitUserDrag?: "none";
};

function dataUrlToBytes(dataUrl: string) {
  const [, b64] = dataUrl.split(",", 2);
  if (!b64) throw new Error("Invalid image data");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useLongPressImageSave({ src, filePath, fileName }: LongPressImageSaveOptions) {
  const platformFlags = usePlatformFlags();
  const { t } = useI18n();
  const { showToast } = useToast();
  const clipboardWatching = useAppStore((s) => s.clipboardStatus?.watching ?? false);
  const [contextMenuPoint, setContextMenuPoint] = useState<ImageContextMenuPoint | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const savingRef = useRef(false);
  const lastSaveStartedAtRef = useRef(0);
  const nativeCleanupRef = useRef<(() => void) | null>(null);
  const imageContext = useMemo(() => ({
    src,
    filePath,
    capabilities: platformFlags.capabilities,
    isDesktop: platformFlags.isDesktop,
  }), [filePath, platformFlags.capabilities, platformFlags.isDesktop, src]);
  const availability = useMemo<ImageActionAvailability>(
    () => getImageActionAvailability(imageContext),
    [imageContext],
  );
  const useLongPressSave = shouldUseLongPressImageSave(platformFlags, imageContext);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveImage = useCallback(async () => {
    if (savingRef.current || (!src && !filePath)) return;
    const now = Date.now();
    if (now - lastSaveStartedAtRef.current < 1500) return;
    lastSaveStartedAtRef.current = now;
    savingRef.current = true;
    try {
      let source = src ?? "";
      if (!filePath && source && !source.startsWith("data:") && !/^https?:\/\//i.test(source)) {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source = await blobToDataUrl(await response.blob());
      }
      const result = await invoke<SavedLocalImage>("save_image_to_local", {
        source,
        filePath: filePath ?? null,
        fileName: fileName ?? null,
      });
      showToast(t("common.imageSaved", result.path));
    } catch (e) {
      showToast(`${t("common.imageSaveFailed")}: ${e}`, true);
    } finally {
      savingRef.current = false;
    }
  }, [fileName, filePath, showToast, src, t]);

  const copyImage = useCallback(async () => {
    if (!availability.canCopyImage || (!src && !filePath)) return;
    try {
      let imageSource = src ?? "";
      if (filePath) {
        const base64 = await invoke<string>("read_file_base64", { filePath });
        imageSource = `data:image/png;base64,${base64}`;
      }
      if (imageSource.startsWith("data:image/")) {
        const bytes = dataUrlToBytes(imageSource);
        await withClipboardWatchPaused(clipboardWatching, () => writeImage(bytes));
      } else if (/^https?:\/\//i.test(imageSource)) {
        const response = await fetch(imageSource);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        await withClipboardWatchPaused(clipboardWatching, () => writeImage(bytes));
      } else {
        throw new Error("Unsupported image source");
      }
      showToast(t("common.imageCopied"));
      setContextMenuPoint(null);
    } catch (e) {
      showToast(`${t("common.imageCopyFailed")}: ${e}`, true);
    }
  }, [availability.canCopyImage, clipboardWatching, filePath, showToast, src, t]);

  const revealImage = useCallback(async () => {
    if (!availability.canRevealImage || !filePath) return;
    try {
      const absPath = await invoke<string>("resolve_sync_path", { relPath: filePath });
      await invoke("reveal_external_file_in_finder", { filePath: absPath });
      setContextMenuPoint(null);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [availability.canRevealImage, filePath, showToast]);

  const saveImageFromMenu = useCallback(async () => {
    await saveImage();
    setContextMenuPoint(null);
  }, [saveImage]);

  useEffect(() => {
    return () => {
      clearTimer();
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
    };
  }, [clearTimer]);

  const beginLongPress = useCallback((x: number, y: number) => {
    if (!useLongPressSave || startRef.current) return;
    clearTimer();
    triggeredRef.current = false;
    startRef.current = { x, y };
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      suppressClickUntilRef.current = Date.now() + 900;
      if (navigator.vibrate) navigator.vibrate(12);
      void saveImage();
    }, LONG_PRESS_MS);
  }, [clearTimer, saveImage, useLongPressSave]);

  const moveLongPress = useCallback((x: number, y: number) => {
    const startPoint = startRef.current;
    if (!startPoint) return;
    if (Math.abs(x - startPoint.x) > MOVE_CANCEL_PX || Math.abs(y - startPoint.y) > MOVE_CANCEL_PX) {
      clearTimer();
    }
  }, [clearTimer]);

  const finishLongPress = useCallback((e?: { preventDefault: () => void; stopPropagation: () => void }) => {
    clearTimer();
    startRef.current = null;
    if (triggeredRef.current) {
      e?.preventDefault();
      e?.stopPropagation();
      triggeredRef.current = false;
    }
  }, [clearTimer]);

  const pointerStart = useCallback((e: ReactPointerEvent<HTMLImageElement>) => {
    if (e.pointerType === "mouse") return;
    beginLongPress(e.clientX, e.clientY);
  }, [beginLongPress]);

  const pointerMove = useCallback((e: ReactPointerEvent<HTMLImageElement>) => {
    moveLongPress(e.clientX, e.clientY);
  }, [moveLongPress]);

  const touchStart = useCallback((e: ReactTouchEvent<HTMLImageElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    beginLongPress(touch.clientX, touch.clientY);
  }, [beginLongPress]);

  const touchMove = useCallback((e: ReactTouchEvent<HTMLImageElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    moveLongPress(touch.clientX, touch.clientY);
  }, [moveLongPress]);

  const imageRef = useCallback<RefCallback<HTMLImageElement>>((node) => {
    nativeCleanupRef.current?.();
    nativeCleanupRef.current = null;

    if (!node) return;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      beginLongPress(touch.clientX, touch.clientY);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      moveLongPress(touch.clientX, touch.clientY);
    };
    const handleTouchEnd = (event: TouchEvent) => finishLongPress(event);
    const handleContextMenu = (event: MouseEvent) => {
      if (shouldOpenImageContextMenu(imageContext)) {
        event.preventDefault();
        event.stopPropagation();
        setContextMenuPoint(getImageContextMenuPoint(event.clientX, event.clientY));
        return;
      }
      if (!useLongPressSave) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = Date.now() + 900;
      void saveImage();
    };
    const handleClickCapture = (event: MouseEvent) => {
      if (!useLongPressSave || Date.now() > suppressClickUntilRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: true });
    node.addEventListener("touchend", handleTouchEnd, { passive: false });
    node.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    node.addEventListener("contextmenu", handleContextMenu, { passive: false });
    node.addEventListener("click", handleClickCapture, true);

    nativeCleanupRef.current = () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
      node.removeEventListener("contextmenu", handleContextMenu);
      node.removeEventListener("click", handleClickCapture, true);
    };
  }, [beginLongPress, finishLongPress, imageContext, moveLongPress, saveImage, useLongPressSave]);

  useEffect(() => {
    if (!contextMenuPoint) return;
    const close = () => setContextMenuPoint(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuPoint]);

  const contextMenu = useCallback((e: ReactMouseEvent<HTMLImageElement>) => {
    if (shouldOpenImageContextMenu(imageContext)) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPoint(getImageContextMenuPoint(e.clientX, e.clientY));
      return;
    }
    if (!useLongPressSave) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickUntilRef.current = Date.now() + 900;
    void saveImage();
  }, [imageContext, saveImage, useLongPressSave]);

  const clickCapture = useCallback((e: ReactMouseEvent<HTMLImageElement>) => {
    if (!useLongPressSave || Date.now() > suppressClickUntilRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, [useLongPressSave]);

  const imageStyle: ImageSaveStyle = {
    WebkitTouchCallout: "none",
    WebkitUserDrag: "none",
    touchAction: "manipulation",
    userSelect: "none",
  };

  const imgProps: LongPressImageSaveProps = {
    ref: imageRef,
    draggable: false,
    onPointerDown: pointerStart,
    onPointerMove: pointerMove,
    onPointerUp: finishLongPress,
    onPointerCancel: finishLongPress,
    onPointerLeave: finishLongPress,
    onTouchStart: touchStart,
    onTouchMove: touchMove,
    onTouchEnd: finishLongPress,
    onTouchCancel: finishLongPress,
    onContextMenu: contextMenu,
    onClickCapture: clickCapture,
    style: imageStyle,
  };

  const menu: ImageContextMenuState | null = contextMenuPoint
    ? {
        point: contextMenuPoint,
        availability,
        copyImage,
        saveImage: saveImageFromMenu,
        revealImage,
        close: () => setContextMenuPoint(null),
      }
    : null;

  return { imgProps, menu };
}
