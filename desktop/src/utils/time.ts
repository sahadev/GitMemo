/**
 * Parse YAML/frontmatter dates: ISO with offset (`...T...+08:00`, `Z`) or legacy `YYYY-MM-DD HH:mm:ss`.
 */
export function parseGitMemoDate(dateStr: string): Date | null {
  const s = dateStr.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [year, month, day] = s.split("-").map(Number);
    const d = new Date(year, month - 1, day, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!s.includes("T") && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const [datePart, timePart] = s.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second = 0] = timePart.split(":").map(Number);
    const d = new Date(year, month - 1, day, hour, minute, second);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const candidate = s.endsWith(" UTC") ? `${s.slice(0, -4).replace(" ", "T")}Z` : s;
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatAbsoluteTime(dateStr: string, includeSeconds = false): string {
  const d = parseGitMemoDate(dateStr);
  if (!d) return dateStr;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(d);
}

export function formatDateOnly(dateStr: string): string {
  const d = parseGitMemoDate(dateStr);
  if (!d) return dateStr.slice(0, 10);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Format a date string as relative time.
 * Pass a translation function `t` for localized output.
 */
export function relativeTime(
  dateStr: string,
  t?: (key: string, ...args: (string | number)[]) => string
): string {
  try {
    const d = parseGitMemoDate(dateStr);
    if (!d) return dateStr;
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
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
    // 未来时间：小偏差（时钟漂移、frontmatter 手写）按「刚刚」处理，
    // 偏差超过一天才退回绝对日期——否则最近列表里会冒出一串日期。
    if (diff < 0) {
      return diff > -86400 ? tr("time.justNow") : formatAbsoluteTime(dateStr);
    }
    if (diff < 60) return tr("time.justNow");
    if (diff < 3600) return tr("time.minAgo", Math.floor(diff / 60));
    if (diff < 86400) return tr("time.hrAgo", Math.floor(diff / 3600));
    if (diff < 604800) return tr("time.dayAgo", Math.floor(diff / 86400));
    return formatAbsoluteTime(dateStr);
  } catch {
    return dateStr;
  }
}
