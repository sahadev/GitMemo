import { useEffect, useState } from "react";
import { Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import { useAppStore } from "../../../hooks/useAppStore";
import {
  SettingsActionButton,
  SettingsLogEntry,
  SettingsModal,
  SettingsModalBody,
  SettingsModalHeader,
  SettingsSubStack,
} from "../settings/SettingsComponents";
import { writeTextWithClipboardWatchPaused } from "../../../utils/clipboard";
import { isRemoteQuotaFailure, splitSyncFailure } from "../../../utils/syncError";

interface SyncFailureDialogProps {
  open: boolean;
  /** 上一次失败的完整信息，未失败时为空 */
  message: string;
  syncing: boolean;
  onClose: () => void;
  onRetry: () => void;
}

/**
 * 同步失败的详情弹窗。
 *
 * 侧栏只有一行宽度，塞不进远端返回的一屏日志，所以侧栏只留短状态，
 * 完整信息在这里展示：结论一句、必要时补一条可操作提示、原始输出可滚动可复制。
 */
export function SyncFailureDialog({ open, message, syncing, onClose, onRetry }: SyncFailureDialogProps) {
  const { t } = useI18n();
  const clipboardStatus = useAppStore((s) => s.clipboardStatus);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const { summary, details } = splitSyncFailure(message);
  const quotaFailure = isRemoteQuotaFailure(message);

  const copyDetails = async () => {
    try {
      // 复制整段报错不该顺手变成一条剪贴板记录，复制期间暂停监听。
      await writeTextWithClipboardWatchPaused(message, clipboardStatus?.watching);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SettingsModal onBackdropClick={onClose} width="lg">
      <SettingsModalHeader icon={TriangleAlert} title={t("syncError.title")} onClose={onClose}>
        <SettingsActionButton variant="ghost" icon={Copy} onClick={() => void copyDetails()}>
          {copied ? t("common.copied") : t("syncError.copy")}
        </SettingsActionButton>
        <SettingsActionButton variant="primary" icon={RefreshCw} iconSpin={syncing} disabled={syncing} onClick={onRetry}>
          {t("common.retry")}
        </SettingsActionButton>
      </SettingsModalHeader>
      <SettingsModalBody>
        <SettingsSubStack>
          {summary ? <p className="gm-sync-error-summary">{summary}</p> : null}
          {quotaFailure ? <p className="gm-sync-error-hint">{t("syncError.quotaHint")}</p> : null}
          {details ? (
            <SettingsLogEntry filename={t("syncError.detailsLabel")} content={details} />
          ) : null}
        </SettingsSubStack>
      </SettingsModalBody>
    </SettingsModal>
  );
}
