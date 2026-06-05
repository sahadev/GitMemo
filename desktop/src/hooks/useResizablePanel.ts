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

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = clampWidth(startWidth + ev.clientX - startX);
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [clampWidth, width]);

  useEffect(() => {
    setWidth((current) => clampWidth(current));
  }, [clampWidth]);

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
    window.dispatchEvent(new CustomEvent(panelResizeEvent, { detail: { key, width } }));
  }, [key, storageKey, width]);

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
