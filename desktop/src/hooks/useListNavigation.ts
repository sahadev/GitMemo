import { useCallback, useEffect, useRef } from "react";

type ListNavigationKey = string;

interface UseListNavigationOptions<T> {
  items: T[];
  selectedKey: ListNavigationKey | null;
  getKey: (item: T) => ListNavigationKey;
  openItem: (key: ListNavigationKey, item: T) => void | Promise<void>;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMore?: () => void;
  selectFromEmpty?: boolean;
}

export function useListNavigation<T>({
  items,
  selectedKey,
  getKey,
  openItem,
  hasMore = false,
  loadingMore = false,
  loadMore,
  selectFromEmpty = true,
}: UseListNavigationOptions<T>) {
  const pendingNextIndexRef = useRef<number | null>(null);

  const openAtIndex = useCallback((index: number) => {
    const item = items[index];
    if (!item) return;
    void openItem(getKey(item), item);
  }, [getKey, items, openItem]);

  const navPrev = useCallback(() => {
    if (items.length === 0) return;
    if (!selectedKey) {
      if (selectFromEmpty) openAtIndex(items.length - 1);
      return;
    }

    const idx = items.findIndex((item) => getKey(item) === selectedKey);
    if (idx > 0) openAtIndex(idx - 1);
  }, [getKey, items, openAtIndex, selectFromEmpty, selectedKey]);

  const navNext = useCallback(() => {
    if (items.length === 0) return;
    if (!selectedKey) {
      if (selectFromEmpty) openAtIndex(0);
      return;
    }

    const idx = items.findIndex((item) => getKey(item) === selectedKey);
    if (idx < 0) return;
    if (idx < items.length - 1) {
      openAtIndex(idx + 1);
      return;
    }
    if (hasMore && !loadingMore && loadMore) {
      pendingNextIndexRef.current = idx + 1;
      loadMore();
    }
  }, [getKey, hasMore, items, loadMore, loadingMore, openAtIndex, selectFromEmpty, selectedKey]);

  useEffect(() => {
    const pendingIndex = pendingNextIndexRef.current;
    if (pendingIndex === null) return;
    if (items.length > pendingIndex) {
      pendingNextIndexRef.current = null;
      openAtIndex(pendingIndex);
      return;
    }
    if (!hasMore && !loadingMore) {
      pendingNextIndexRef.current = null;
    }
  }, [hasMore, items, loadingMore, openAtIndex]);

  const resetPendingNavigation = useCallback(() => {
    pendingNextIndexRef.current = null;
  }, []);

  return { navPrev, navNext, resetPendingNavigation };
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isEnterNativeTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  );
}

interface UseListKeyboardNavigationOptions {
  active?: boolean;
  disabled?: boolean;
  navPrev: () => void;
  navNext: () => void;
  onEnter?: () => void;
  allowFromEditable?: (event: KeyboardEvent) => boolean;
}

export function useListKeyboardNavigation({
  active = true,
  disabled = false,
  navPrev,
  navNext,
  onEnter,
  allowFromEditable,
}: UseListKeyboardNavigationOptions) {
  useEffect(() => {
    if (!active || disabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Enter") return;
      if (event.key === "Enter" && !onEnter) return;
      if (event.key === "Enter" && isEnterNativeTarget(event.target)) return;
      if (isEditableTarget(event.target) && !allowFromEditable?.(event)) return;

      event.preventDefault();
      if (event.key === "ArrowUp") navPrev();
      else if (event.key === "ArrowDown") navNext();
      else onEnter?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, allowFromEditable, disabled, navNext, navPrev, onEnter]);
}
