import {
  useCallback,
  useEffect,
  useRef,
  type ImgHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "./useI18n";
import { usePlatform } from "./usePlatform";
import { useToast } from "./useToast";

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

type ImageSaveStyle = CSSProperties & {
  WebkitUserDrag?: "none";
};

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useLongPressImageSave({ src, filePath, fileName }: LongPressImageSaveOptions) {
  const isMobile = usePlatform() === "mobile";
  const { t } = useI18n();
  const { showToast } = useToast();
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const savingRef = useRef(false);
  const lastSaveStartedAtRef = useRef(0);
  const nativeCleanupRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    return () => {
      clearTimer();
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
    };
  }, [clearTimer]);

  const beginLongPress = useCallback((x: number, y: number) => {
    if (!isMobile || (!src && !filePath) || startRef.current) return;
    clearTimer();
    triggeredRef.current = false;
    startRef.current = { x, y };
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      suppressClickUntilRef.current = Date.now() + 900;
      if (navigator.vibrate) navigator.vibrate(12);
      void saveImage();
    }, LONG_PRESS_MS);
  }, [clearTimer, filePath, isMobile, saveImage, src]);

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
      if (!isMobile) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = Date.now() + 900;
      void saveImage();
    };
    const handleClickCapture = (event: MouseEvent) => {
      if (!isMobile || Date.now() > suppressClickUntilRef.current) return;
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
  }, [beginLongPress, finishLongPress, isMobile, moveLongPress, saveImage]);

  const contextMenu = useCallback((e: ReactMouseEvent<HTMLImageElement>) => {
    if (!isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickUntilRef.current = Date.now() + 900;
    void saveImage();
  }, [isMobile, saveImage]);

  const clickCapture = useCallback((e: ReactMouseEvent<HTMLImageElement>) => {
    if (!isMobile || Date.now() > suppressClickUntilRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, [isMobile]);

  const imageStyle: ImageSaveStyle = {
    WebkitTouchCallout: "none",
    WebkitUserDrag: "none",
    touchAction: "manipulation",
    userSelect: "none",
  };

  return {
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
  } satisfies LongPressImageSaveProps;
}
