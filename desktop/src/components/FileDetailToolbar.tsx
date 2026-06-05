import { useCallback, type MouseEventHandler, type ReactNode } from "react";
import { ChevronLeft, Pencil, RefreshCw, Save, SquareSplitHorizontal, X } from "lucide-react";
import { DetailIconButton } from "./DetailIconButton";
import { AppIcon, type AppIconSize } from "./base/AppIcon";
import { useTimedIconSpin } from "./base/useTimedIconSpin";
import { useI18n } from "../hooks/useI18n";
import { usePlatform } from "../hooks/usePlatform";
import { formatTitleWithShortcut } from "../utils/shortcuts";

type DetailToolbarTone = "default" | "accent" | "success" | "danger";

export interface FileDetailToolbarAction {
  key: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: DetailToolbarTone;
  disabled?: boolean;
  hidden?: boolean;
  shortcut?: string;
}

interface FileDetailToolbarProps {
  title: ReactNode;
  titleText?: string;
  onBack?: () => void;
  onTitleClick?: () => void;
  titleClickLabel?: string;
  titleEmphasis?: boolean;
  metadata?: ReactNode;
  onRefresh?: () => void;
  refreshTitle?: string;
  refreshShortcut?: string;
  refreshDisabled?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  editTitle?: string;
  editShortcut?: string;
  saveTitle?: string;
  saveShortcut?: string;
  cancelTitle?: string;
  cancelShortcut?: string;
  cancelIcon?: ReactNode;
  splitPreview?: boolean;
  onToggleSplitPreview?: () => void;
  splitPreviewDisabled?: boolean;
  splitPreviewTitle?: string;
  splitPreviewActiveTitle?: string;
  splitPreviewShortcut?: string;
  editDisabled?: boolean;
  saveDisabled?: boolean;
  saveTone?: DetailToolbarTone;
  actionsBeforeEdit?: FileDetailToolbarAction[];
  actionsAfterEdit?: FileDetailToolbarAction[];
  more?: ReactNode;
  density?: "default" | "compact";
}

function ToolbarActionButton({ action }: { action: FileDetailToolbarAction }) {
  if (action.hidden) return null;
  return (
    <DetailIconButton
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={formatTitleWithShortcut(action.title, action.shortcut)}
      tone={action.tone}
    >
      {action.icon}
    </DetailIconButton>
  );
}

export function FileDetailToolbar({
  title,
  titleText,
  onBack,
  onTitleClick,
  titleClickLabel,
  titleEmphasis = false,
  metadata,
  onRefresh,
  refreshTitle,
  refreshShortcut,
  refreshDisabled,
  editing = false,
  onEdit,
  onSave,
  onCancel,
  editTitle,
  editShortcut,
  saveTitle,
  saveShortcut,
  cancelTitle,
  cancelShortcut,
  cancelIcon,
  splitPreview = false,
  onToggleSplitPreview,
  splitPreviewDisabled,
  splitPreviewTitle,
  splitPreviewActiveTitle,
  splitPreviewShortcut,
  editDisabled,
  saveDisabled,
  saveTone = "success",
  actionsBeforeEdit = [],
  actionsAfterEdit = [],
  more,
  density = "default",
}: FileDetailToolbarProps) {
  const { t } = useI18n();
  const isMobile = usePlatform() === "mobile";
  const iconSize: AppIconSize = isMobile ? "sm" : "xs";
  const hasEditFlow = Boolean(onEdit || onSave || onCancel);
  const handleRefreshClick = useCallback<MouseEventHandler<HTMLButtonElement>>(() => {
    onRefresh?.();
  }, [onRefresh]);
  const refreshSpin = useTimedIconSpin<HTMLButtonElement>(handleRefreshClick, Boolean(onRefresh));

  return (
    <div className="gm-file-detail-toolbar" data-density={density} data-mobile={isMobile ? "true" : "false"}>
      {onBack ? (
        <DetailIconButton type="button" onClick={onBack} title={t("common.back")}>
          <AppIcon icon={ChevronLeft} size={isMobile ? "lg" : "sm"} />
        </DetailIconButton>
      ) : null}
      <span
        onClick={onTitleClick}
        title={titleClickLabel ?? titleText}
        className="gm-file-detail-title"
        data-clickable={onTitleClick ? "true" : "false"}
        data-emphasis={titleEmphasis ? "true" : "false"}
        data-mobile={isMobile ? "true" : "false"}
      >
        {title}
      </span>
      {onRefresh && !editing ? (
        <DetailIconButton
          type="button"
          onClick={refreshSpin.handleClick}
          disabled={refreshDisabled}
          title={formatTitleWithShortcut(refreshTitle ?? t("common.refresh"), refreshShortcut)}
        >
          <AppIcon icon={RefreshCw} size={iconSize} spin={refreshSpin.spinning} />
        </DetailIconButton>
      ) : null}
      {metadata}
      {actionsBeforeEdit.filter((action) => !action.hidden).map((action) => (
        <ToolbarActionButton key={action.key} action={action} />
      ))}
      {onToggleSplitPreview && !isMobile ? (
        <DetailIconButton
          type="button"
          onClick={onToggleSplitPreview}
          disabled={splitPreviewDisabled}
          title={formatTitleWithShortcut(
            splitPreview ? splitPreviewActiveTitle ?? t("common.hideSplitPreview") : splitPreviewTitle ?? t("common.splitPreview"),
            splitPreviewShortcut,
          )}
          tone={splitPreview ? "accent" : "default"}
          aria-pressed={splitPreview ? "true" : "false"}
        >
          <AppIcon icon={SquareSplitHorizontal} size={iconSize} />
        </DetailIconButton>
      ) : null}
      {hasEditFlow ? (
        editing ? (
          <>
            {onCancel ? (
              <DetailIconButton
                type="button"
                onClick={onCancel}
                title={formatTitleWithShortcut(cancelTitle ?? t("common.cancel"), cancelShortcut)}
              >
                {cancelIcon ?? <AppIcon icon={X} size={iconSize} />}
              </DetailIconButton>
            ) : null}
            {onSave ? (
              <DetailIconButton
                type="button"
                onClick={onSave}
                disabled={saveDisabled}
                title={formatTitleWithShortcut(saveTitle ?? t("common.save"), saveShortcut)}
                tone={saveTone}
              >
                <AppIcon icon={Save} size={iconSize} />
              </DetailIconButton>
            ) : null}
          </>
        ) : onEdit ? (
          <DetailIconButton
            type="button"
            onClick={onEdit}
            disabled={editDisabled}
            title={formatTitleWithShortcut(editTitle ?? t("common.edit"), editShortcut)}
          >
            <AppIcon icon={Pencil} size={iconSize} />
          </DetailIconButton>
        ) : null
      ) : null}
      {actionsAfterEdit.filter((action) => !action.hidden).map((action) => (
        <ToolbarActionButton key={action.key} action={action} />
      ))}
      {more}
    </div>
  );
}
