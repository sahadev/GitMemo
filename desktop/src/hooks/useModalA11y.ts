import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * 弹层的基础键盘行为：进入时把焦点送进弹层，Esc 关闭，关闭后把焦点还给打开它的元素。
 *
 * 只做行为，不碰样式。容器需要能接焦点（tabIndex={-1}）——没有可聚焦子元素时焦点落在容器上，
 * 否则 Tab 会从页面头部重新走一遍。
 */
export function useModalA11y(containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const container = containerRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? container).focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      opener?.focus({ preventScroll: true });
    };
  }, [containerRef, onClose]);
}
