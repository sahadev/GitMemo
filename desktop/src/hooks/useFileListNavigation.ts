import { useCallback, useEffect, useRef } from "react";

interface UseFileListNavigationOptions<T extends { path: string }> {
  files: T[];
  selectedPath: string | null;
  openFile: (path: string) => void | Promise<void>;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMore?: () => void;
  selectFromEmpty?: boolean;
}

export function useFileListNavigation<T extends { path: string }>({
  files,
  selectedPath,
  openFile,
  hasMore = false,
  loadingMore = false,
  loadMore,
  selectFromEmpty = false,
}: UseFileListNavigationOptions<T>) {
  const pendingNextIndexRef = useRef<number | null>(null);

  const navPrev = useCallback(() => {
    if (files.length === 0) return;
    if (!selectedPath) {
      if (selectFromEmpty) void openFile(files[files.length - 1].path);
      return;
    }
    const idx = files.findIndex((f) => f.path === selectedPath);
    if (idx > 0) void openFile(files[idx - 1].path);
  }, [files, openFile, selectFromEmpty, selectedPath]);

  const navNext = useCallback(() => {
    if (files.length === 0) return;
    if (!selectedPath) {
      if (selectFromEmpty) void openFile(files[0].path);
      return;
    }
    const idx = files.findIndex((f) => f.path === selectedPath);
    if (idx < 0) return;
    if (idx < files.length - 1) {
      void openFile(files[idx + 1].path);
      return;
    }
    if (hasMore && !loadingMore && loadMore) {
      pendingNextIndexRef.current = idx + 1;
      loadMore();
    }
  }, [files, hasMore, loadMore, loadingMore, openFile, selectFromEmpty, selectedPath]);

  useEffect(() => {
    const pendingIndex = pendingNextIndexRef.current;
    if (pendingIndex === null) return;
    if (files.length > pendingIndex) {
      pendingNextIndexRef.current = null;
      void openFile(files[pendingIndex].path);
      return;
    }
    if (!hasMore && !loadingMore) {
      pendingNextIndexRef.current = null;
    }
  }, [files, hasMore, loadingMore, openFile]);

  const resetPendingNavigation = useCallback(() => {
    pendingNextIndexRef.current = null;
  }, []);

  return { navPrev, navNext, resetPendingNavigation };
}
