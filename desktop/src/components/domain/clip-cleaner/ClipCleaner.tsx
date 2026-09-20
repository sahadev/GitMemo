import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, ChevronLeft, ChevronRight, Trash2, Images, Loader2 } from "lucide-react";
import { useToast } from "../../../hooks/useToast";
import { useI18n } from "../../../hooks/useI18n";
import { getCachedLocalImageDataUrl, cacheLocalImageDataUrl } from "../../../utils/localImages";
import type { ClipImageEntry } from "../../../types/files";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Load a local image as a data URL (uses the shared cache when available). */
function useImageDataUrl(path: string | null) {
  const [src, setSrc] = useState<string | null>(() =>
    path ? getCachedLocalImageDataUrl(path) : null,
  );

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    const cached = getCachedLocalImageDataUrl(path);
    setSrc(cached);
    let cancelled = false;
    invoke<string>("read_file_base64", { filePath: path })
      .then((b64) => {
        if (!cancelled) setSrc(cacheLocalImageDataUrl(path, b64));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path]);

  return src;
}

/** Lazily loaded thumbnail; only fetches the image once it enters the viewport. */
function CleanerThumb({ path, className }: { path: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(() => getCachedLocalImageDataUrl(path));

  useEffect(() => {
    if (src) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          io.disconnect();
          invoke<string>("read_file_base64", { filePath: path })
            .then((b64) => setSrc(cacheLocalImageDataUrl(path, b64)))
            .catch(() => undefined);
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [path, src]);

  if (src) {
    return <img src={src} alt="" loading="lazy" className={className} draggable={false} />;
  }
  return <div ref={ref} className={className} />;
}

export default function ClipCleaner({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [images, setImages] = useState<ClipImageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const imagesRef = useRef<ClipImageEntry[]>([]);
  const deletingRef = useRef(false);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<ClipImageEntry[]>("list_clip_images");
      setImages(list);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  const handleUndo = useCallback(async () => {
    try {
      await invoke("undo_last_image_delete");
      showToast(t("clipCleaner.restored"));
      setPreviewIndex(null);
      await loadImages();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [loadImages, showToast, t]);

  const deleteCurrent = useCallback(async () => {
    if (deletingRef.current) return;
    const current = imagesRef.current;
    if (previewIndex == null) return;
    const item = current[previewIndex];
    if (!item) return;

    deletingRef.current = true;
    try {
      await invoke("delete_clip_image", { imagePath: item.path });
      const remaining = current.filter((im) => im.path !== item.path);
      setImages(remaining);
      if (remaining.length === 0) {
        setPreviewIndex(null);
      } else {
        setPreviewIndex(Math.min(previewIndex, remaining.length - 1));
      }
      showToast(
        `${t("clipCleaner.deleted")} ${item.name} (${formatBytes(item.size)})`,
        false,
        {
          action: { label: t("clipCleaner.undo"), onClick: handleUndo },
          autoClose: 5000,
        },
      );
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      deletingRef.current = false;
    }
  }, [handleUndo, previewIndex, showToast, t]);

  const prev = useCallback(() => {
    setPreviewIndex((idx) => (idx == null || idx <= 0 ? 0 : idx - 1));
  }, []);

  const next = useCallback(() => {
    setPreviewIndex((idx) => {
      if (idx == null) return 0;
      return Math.min(idx + 1, imagesRef.current.length - 1);
    });
  }, []);

  const closePreview = useCallback(() => setPreviewIndex(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewIndex != null) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          prev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          next();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          void deleteCurrent();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closePreview();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closePreview, deleteCurrent, next, onClose, prev, previewIndex]);

  const previewItem = previewIndex != null ? images[previewIndex] : null;
  const previewSrc = useImageDataUrl(previewItem?.path ?? null);

  const totalSize = images.reduce((sum, im) => sum + im.size, 0);

  return (
    <div className="gm-clip-cleaner">
      {previewItem ? (
        <div className="gm-clip-cleaner-preview">
          <div className="gm-clip-cleaner-preview-top">
            <button type="button" className="gm-clip-cleaner-icon-btn" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
              <X size={18} />
            </button>
            <div className="gm-clip-cleaner-preview-meta">
              <span className="gm-clip-cleaner-preview-name">{previewItem.name}</span>
              <span className="gm-clip-cleaner-preview-size">
                {formatBytes(previewItem.size)} · {previewIndex! + 1}/{images.length}
              </span>
            </div>
            <button
              type="button"
              className="gm-clip-cleaner-icon-btn gm-clip-cleaner-danger"
              onClick={() => void deleteCurrent()}
              title={t("clipCleaner.deleteHint")}
              aria-label={t("clipCleaner.deleteHint")}
            >
              <Trash2 size={18} />
            </button>
          </div>

          <button
            type="button"
            className="gm-clip-cleaner-nav gm-clip-cleaner-nav-prev"
            onClick={prev}
            disabled={previewIndex === 0}
            title={t("clipCleaner.prev")}
            aria-label={t("clipCleaner.prev")}
          >
            <ChevronLeft size={28} />
          </button>

          <div className="gm-clip-cleaner-preview-stage">
            {previewSrc ? (
              <img src={previewSrc} alt={previewItem.name} className="gm-clip-cleaner-preview-img" draggable={false} />
            ) : (
              <Loader2 size={28} className="animate-spin text-white/50" />
            )}
          </div>

          <button
            type="button"
            className="gm-clip-cleaner-nav gm-clip-cleaner-nav-next"
            onClick={next}
            disabled={previewIndex === images.length - 1}
            title={t("clipCleaner.next")}
            aria-label={t("clipCleaner.next")}
          >
            <ChevronRight size={28} />
          </button>

          <div className="gm-clip-cleaner-preview-hint">
            <span>← → {t("clipCleaner.navigate")}</span>
            <span>Delete {t("clipCleaner.delete")}</span>
            <span>Esc {t("clipCleaner.exit")}</span>
          </div>
        </div>
      ) : (
        <div className="gm-clip-cleaner-grid-view">
          <header className="gm-clip-cleaner-header">
            <div className="gm-clip-cleaner-header-title">
              <Images size={18} />
              <h2>{t("clipCleaner.title")}</h2>
            </div>
            <div className="gm-clip-cleaner-header-info">
              <span>{t("clipCleaner.count", images.length)}</span>
              <span>{t("clipCleaner.total", formatBytes(totalSize))}</span>
            </div>
            <button type="button" className="gm-clip-cleaner-icon-btn" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
              <X size={18} />
            </button>
          </header>

          {loading ? (
            <div className="gm-clip-cleaner-loading">
              <Loader2 size={24} className="animate-spin text-white/50" />
            </div>
          ) : images.length === 0 ? (
            <div className="gm-clip-cleaner-loading">
              <span className="text-white/50">{t("clipCleaner.empty")}</span>
            </div>
          ) : (
            <div className="gm-clip-cleaner-grid">
              {images.map((im, index) => (
                <button
                  key={im.path}
                  type="button"
                  className="gm-clip-cleaner-cell"
                  onClick={() => setPreviewIndex(index)}
                >
                  <CleanerThumb path={im.path} className="gm-clip-cleaner-cell-img" />
                  <div className="gm-clip-cleaner-cell-meta">
                    <span className="gm-clip-cleaner-cell-name">{im.name}</span>
                    <span className="gm-clip-cleaner-cell-size">{formatBytes(im.size)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <footer className="gm-clip-cleaner-footer">
            <span>{t("clipCleaner.hintClick")}</span>
            <span>Esc {t("clipCleaner.exit")}</span>
          </footer>
        </div>
      )}
    </div>
  );
}
