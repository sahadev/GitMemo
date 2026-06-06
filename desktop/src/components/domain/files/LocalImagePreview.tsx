import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLongPressImageSave } from "../../../hooks/useLongPressImageSave";
import { cacheLocalImageDataUrl, getCachedLocalImageDataUrl } from "../../../utils/localImages";
import { cx } from "../../base/classNames";

interface LocalImagePreviewProps {
  relPath: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  placeholderClassName?: string;
  placeholderStyle?: CSSProperties;
  selected?: boolean;
}

export function LocalImagePreview({
  relPath,
  alt = "",
  className,
  style,
  placeholderClassName,
  placeholderStyle,
  selected = false,
}: LocalImagePreviewProps) {
  const [src, setSrc] = useState<string | null>(() => getCachedLocalImageDataUrl(relPath));
  const imageSaveProps = useLongPressImageSave({
    src,
    filePath: relPath,
    fileName: relPath.split("/").pop() ?? null,
  });

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedLocalImageDataUrl(relPath);
    setSrc(cached);
    invoke<string>("read_file_base64", { filePath: relPath })
      .then((b64) => {
        if (!cancelled) setSrc(cacheLocalImageDataUrl(relPath, b64));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [relPath]);

  if (!src) {
    return <div className={placeholderClassName} style={placeholderStyle} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      {...imageSaveProps}
      className={cx(className)}
      data-selected={selected ? "true" : "false"}
      style={{ ...style, ...imageSaveProps.style }}
    />
  );
}
