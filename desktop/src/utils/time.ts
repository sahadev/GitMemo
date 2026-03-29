/**
 * Format a date string as relative time.
 * Pass a translation function `t` for localized output.
 */
export function relativeTime(
  dateStr: string,
  t?: (key: string, ...args: (string | number)[]) => string
): string {
  try {
    const d = new Date(dateStr.replace(" ", "T"));
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 0) return dateStr.slice(0, 16);
    const tr = t || ((key: string, ...args: (string | number)[]) => {
      // Fallback English
      const map: Record<string, string> = {
        "time.justNow": "Just now",
        "time.minAgo": "{0} min ago",
        "time.hrAgo": "{0} hr ago",
        "time.dayAgo": "{0} day ago",
      };
      let s = map[key] || key;
      args.forEach((a, i) => { s = s.replace(`{${i}}`, String(a)); });
      return s;
    });
    if (diff < 60) return tr("time.justNow");
    if (diff < 3600) return tr("time.minAgo", Math.floor(diff / 60));
    if (diff < 86400) return tr("time.hrAgo", Math.floor(diff / 3600));
    if (diff < 604800) return tr("time.dayAgo", Math.floor(diff / 86400));
    return dateStr.slice(0, 16);
  } catch {
    return dateStr;
  }
}
