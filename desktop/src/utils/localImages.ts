export function imageMimeFromPath(path: string) {
  const ext = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase() || "png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  return `image/${ext}`;
}

export function localImageDataUrl(path: string, base64: string) {
  return `data:${imageMimeFromPath(path)};base64,${base64}`;
}
