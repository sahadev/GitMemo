import { useListNavigation } from "./useListNavigation";

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
  return useListNavigation({
    items: files,
    selectedKey: selectedPath,
    getKey: (file) => file.path,
    openItem: openFile,
    hasMore,
    loadingMore,
    loadMore,
    selectFromEmpty,
  });
}
