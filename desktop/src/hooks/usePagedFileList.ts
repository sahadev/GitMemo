import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FILE_PAGE_SIZE, type FilePage } from "../types/files";
import { useAutoLoadMore } from "./useAutoLoadMore";

interface UsePagedFileListOptions<T extends { path: string }> {
  loadPage: (offset: number, limit: number) => Promise<FilePageOf<T>>;
  pageSize?: number;
  preventConcurrentLoads?: boolean;
  onPageLoaded?: (page: FilePageOf<T>, reset: boolean) => void;
}

type FilePageOf<T extends { path: string }> = Omit<FilePage, "entries"> & {
  entries: T[];
};

export function usePagedFileList<T extends { path: string }>({
  loadPage,
  pageSize = FILE_PAGE_SIZE,
  preventConcurrentLoads = false,
  onPageLoaded,
}: UsePagedFileListOptions<T>) {
  const [files, setFiles] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  /** 最近一次分页请求的错误信息；有值时就地显示重试，不交给页面级错误边界。 */
  const [loadError, setLoadError] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const filesLengthRef = useRef(0);
  const loadInFlight = useRef<Promise<void> | null>(null);
  const loadGenerationRef = useRef(0);
  const requestSeqRef = useRef(0);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  useLayoutEffect(() => {
    loadGenerationRef.current += 1;
    loadInFlight.current = null;
    setFiles([]);
    setHasMore(false);
    setTotalFiles(0);
    setLoading(true);
    setLoadingMore(false);
    setLoadError(null);
  }, [loadPage]);

  const loadFiles = useCallback((reset = true) => {
    if (preventConcurrentLoads && loadInFlight.current) return loadInFlight.current;

    const generation = loadGenerationRef.current;
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    latestRequestRef.current = requestId;
    let task: Promise<void> | null = null;

    task = (async () => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const page = await loadPage(reset ? 0 : filesLengthRef.current, pageSize);
        if (generation !== loadGenerationRef.current || requestId !== latestRequestRef.current) return;
        // 分页接口若返回残缺对象，宁可当空页也不要让 undefined 进 state：
        // 一旦 state 不是数组，整个应用会落到全局 ErrorBoundary（不是单页降级）。
        const entries = Array.isArray(page?.entries) ? page.entries : [];
        setFiles((prev) => reset ? entries : [...prev, ...entries]);
        setLoadError(null);
        setHasMore(Boolean(page?.has_more));
        setTotalFiles(typeof page?.total === "number" ? page.total : entries.length);
        onPageLoaded?.(page, reset);
      } catch (e) {
        if (generation === loadGenerationRef.current && requestId === latestRequestRef.current) {
          console.error(e);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (generation === loadGenerationRef.current && requestId === latestRequestRef.current) {
          if (reset) setLoading(false);
          else setLoadingMore(false);
        }
        if (loadInFlight.current === task) loadInFlight.current = null;
      }
    })();

    if (preventConcurrentLoads) loadInFlight.current = task;
    return task;
  }, [loadPage, onPageLoaded, pageSize, preventConcurrentLoads]);

  const { sentinelRef, loadMore } = useAutoLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore: () => loadFiles(false),
  });

  const registerItemRef = useCallback((path: string, el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(path, el);
    else itemRefs.current.delete(path);
  }, []);

  const scrollItemIntoView = useCallback((path: string) => {
    window.setTimeout(() => {
      itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);
  }, []);

  return {
    files,
    loadError,
    setFiles,
    loading,
    setLoading,
    loadingMore,
    hasMore,
    totalFiles,
    loadFiles,
    loadMore,
    sentinelRef,
    itemRefs,
    registerItemRef,
    scrollItemIntoView,
  };
}
