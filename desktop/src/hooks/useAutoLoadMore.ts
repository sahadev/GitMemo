import { useCallback, useEffect, useRef } from "react";

export function useAutoLoadMore({
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void> | void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || loadingRef.current) return;
    loadingRef.current = true;
    try {
      Promise.resolve(onLoadMoreRef.current()).finally(() => {
        loadingRef.current = false;
      });
    } catch {
      loadingRef.current = false;
    }
  }, [hasMore, loading, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return { sentinelRef, loadMore };
}
