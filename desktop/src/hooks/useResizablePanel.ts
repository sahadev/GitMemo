import { useState, useCallback, useEffect, useRef } from "react";

const panelResizeEvent = "gitmemo-panel-width-change";

export function useResizablePanel(key: string, defaultWidth: number, min = 200, max = 600) {
  const storageKey = `gitmemo-panel-${key}`;
  const clampWidth = useCallback((value: number) => Math.max(min, Math.min(max, value)), [max, min]);
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const savedWidth = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(savedWidth) ? clampWidth(savedWidth) : defaultWidth;
  });
  const dragging = useRef(false);
  const widthRef = useRef(width);

  const publishWidth = useCallback((nextWidth: number) => {
    window.dispatchEvent(new CustomEvent(panelResizeEvent, { detail: { key, width: nextWidth } }));
  }, [key]);

  const commitWidth = useCallback((nextWidth: number) => {
    localStorage.setItem(storageKey, String(nextWidth));
    publishWidth(nextWidth);
  }, [publishWidth, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = clampWidth(startWidth + ev.clientX - startX);
      widthRef.current = newWidth;
      setWidth(newWidth);
      publishWidth(newWidth);
    };

    const finishDrag = () => {
      if (!dragging.current) return;
      dragging.current = false;
      commitWidth(widthRef.current);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("blur", finishDrag);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", finishDrag);
    window.addEventListener("blur", finishDrag);
  }, [clampWidth, commitWidth, publishWidth, width]);

  useEffect(() => {
    setWidth((current) => clampWidth(current));
  }, [clampWidth]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    const handlePanelResize = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; width?: number }>).detail;
      if (detail?.key !== key || typeof detail.width !== "number") return;
      setWidth(clampWidth(detail.width));
    };

    window.addEventListener(panelResizeEvent, handlePanelResize);
    return () => window.removeEventListener(panelResizeEvent, handlePanelResize);
  }, [clampWidth, key]);

  return { width, onMouseDown };
}
