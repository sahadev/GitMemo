export function imageMimeFromPath(path: string) {
  const ext = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase() || "png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  return `image/${ext}`;
}

export function localImageDataUrl(path: string, base64: string) {
  return `data:${imageMimeFromPath(path)};base64,${base64}`;
}

const localImageDataUrlCache = new Map<string, string>();
const LOCAL_IMAGE_CACHE_LIMIT = 160;

export function getCachedLocalImageDataUrl(path: string) {
  return localImageDataUrlCache.get(path) ?? null;
}

export function cacheLocalImageDataUrl(path: string, base64: string) {
  const dataUrl = localImageDataUrl(path, base64);
  if (localImageDataUrlCache.has(path)) localImageDataUrlCache.delete(path);
  localImageDataUrlCache.set(path, dataUrl);

  while (localImageDataUrlCache.size > LOCAL_IMAGE_CACHE_LIMIT) {
    const oldestKey = localImageDataUrlCache.keys().next().value;
    if (!oldestKey) break;
    localImageDataUrlCache.delete(oldestKey);
  }

  return dataUrl;
}
