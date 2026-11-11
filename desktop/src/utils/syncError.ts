/**
 * 同步失败信息的拆分与压缩。
 *
 * 后端把「一句话结论」和「Git 原始输出」拼成一条字符串（`结论 Details: 原始输出`），
 * 后者动辄十几行、还带远端返回的链接。侧栏只有一行宽度，直接铺进去会把整个底部撑爆，
 * 所以这里把它拆开：结论用于提示，原始输出单独进弹窗。
 */

const DETAILS_MARKER = "Details: ";
const TOAST_MAX_LENGTH = 160;

export interface SyncFailureParts {
  /** 结论，通常是「推送被拒 / 认证失败」这类可行动的一句话 */
  summary: string;
  /** Git 原始输出，可能很长，也可能为空 */
  details: string;
}

export function splitSyncFailure(message: string): SyncFailureParts {
  const text = (message ?? "").trim();
  if (!text) return { summary: "", details: "" };
  const index = text.indexOf(DETAILS_MARKER);
  if (index === -1) return { summary: text, details: "" };
  return {
    summary: text.slice(0, index).trim(),
    details: text.slice(index + DETAILS_MARKER.length).trim(),
  };
}

/**
 * 远端仓库体积超配额。这类失败换客户端也没用，得先去远端清理仓库体积。
 */
export function isRemoteQuotaFailure(message: string): boolean {
  const lower = (message ?? "").toLowerCase();
  return (
    lower.includes("exceeds quota") ||
    lower.includes("size exceeds limit") ||
    lower.includes("repo size")
  );
}

/**
 * 系统通知只放一句话：整段远端输出塞进通知里既看不完也读不懂。
 */
export function summarizeSyncFailure(message: string): string {
  const { summary, details } = splitSyncFailure(message);
  const base = (summary || details).replace(/\s+/g, " ").trim();
  if (!base) return "";
  return base.length > TOAST_MAX_LENGTH ? `${base.slice(0, TOAST_MAX_LENGTH - 1)}…` : base;
}
