import { useState, useCallback, useEffect, useRef } from "react";

export function useResizablePanel(key: string, defaultWidth: number, min = 200, max = 600) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(`gitmemo-panel-${key}`);
    return saved ? Math.max(min, Math.min(max, parseInt(saved, 10))) : defaultWidth;
  });
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = Math.max(min, Math.min(max, startWidth + ev.clientX - startX));
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
  }, [width, min, max]);

  useEffect(() => {
    localStorage.setItem(`gitmemo-panel-${key}`, String(width));
  }, [key, width]);

  const handleStyle: React.CSSProperties = {
    width: 4,
    cursor: "col-resize",
    background: "transparent",
    flexShrink: 0,
    position: "relative",
  };

  const handleHoverStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -2,
    width: 8,
  };

  return { width, onMouseDown, handleStyle, handleHoverStyle };
}
