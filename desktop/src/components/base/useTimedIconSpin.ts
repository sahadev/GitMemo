import { useCallback, useEffect, useRef, useState, type MouseEventHandler } from "react";

export function useTimedIconSpin<T extends HTMLElement>(
  onClick?: MouseEventHandler<T>,
  enabled = false,
  durationMs = 2000,
) {
  const [spinning, setSpinning] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const triggerSpin = useCallback(() => {
    if (!enabled) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setSpinning(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setSpinning(false);
    }, durationMs);
  }, [durationMs, enabled]);

  const handleClick = useCallback<MouseEventHandler<T>>((event) => {
    onClick?.(event);
    if (!event.defaultPrevented) triggerSpin();
  }, [onClick, triggerSpin]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  return {
    spinning,
    handleClick: onClick || enabled ? handleClick : undefined,
    triggerSpin,
  };
}
