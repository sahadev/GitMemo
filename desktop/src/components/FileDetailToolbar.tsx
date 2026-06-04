import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft, Pencil, RefreshCw, Save, X } from "lucide-react";
import { DetailIconButton } from "./DetailIconButton";
import { useI18n } from "../hooks/useI18n";
import { usePlatform } from "../hooks/usePlatform";

type DetailToolbarTone = "default" | "accent" | "success" | "danger";

export interface FileDetailToolbarAction {
  key: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: DetailToolbarTone;
  disabled?: boolean;
  hidden?: boolean;
}

interface FileDetailToolbarProps {
  title: ReactNode;
  titleText?: string;
  onBack?: () => void;
  onTitleClick?: () => void;
  titleClickLabel?: string;
  titleStyle?: CSSProperties;
  metadata?: ReactNode;
  onRefresh?: () => void;
  refreshTitle?: string;
  refreshDisabled?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  editTitle?: string;
  saveTitle?: string;
  cancelTitle?: string;
  cancelIcon?: ReactNode;
  editDisabled?: boolean;
  saveDisabled?: boolean;
  saveTone?: DetailToolbarTone;
  actionsBeforeEdit?: FileDetailToolbarAction[];
  actionsAfterEdit?: FileDetailToolbarAction[];
  more?: ReactNode;
  style?: CSSProperties;
}

function ToolbarActionButton({ action }: { action: FileDetailToolbarAction }) {
  if (action.hidden) return null;
  return (
    <DetailIconButton
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
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
  titleStyle,
  metadata,
  onRefresh,
  refreshTitle,
  refreshDisabled,
  editing = false,
  onEdit,
  onSave,
  onCancel,
  editTitle,
  saveTitle,
  cancelTitle,
  cancelIcon,
  editDisabled,
  saveDisabled,
  saveTone = "success",
  actionsBeforeEdit = [],
  actionsAfterEdit = [],
  more,
  style,
}: FileDetailToolbarProps) {
  const { t } = useI18n();
  const isMobile = usePlatform() === "mobile";
  const iconSize = isMobile ? 16 : 14;
  const hasEditFlow = Boolean(onEdit || onSave || onCancel);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      borderBottom: "1px solid var(--border)",
      background: "var(--gm-color-bg-surface)",
      flexShrink: 0,
      gap: "var(--gm-toolbar-gap)",
      minWidth: 0,
      padding: isMobile
        ? "var(--gm-space-4) var(--gm-space-6)"
        : "var(--gm-space-5) var(--gm-space-10)",
      ...style,
    }}>
      {onBack ? (
        <DetailIconButton type="button" onClick={onBack} title={t("common.back")}>
          <ChevronLeft size={isMobile ? 20 : 16} />
        </DetailIconButton>
      ) : null}
      <span
        onClick={onTitleClick}
        title={titleClickLabel ?? titleText}
        style={{
          color: "var(--text-secondary)",
          cursor: onTitleClick ? "pointer" : undefined,
          flex: 1,
          fontSize: isMobile ? "var(--gm-font-sm)" : "var(--gm-font-xs)",
          fontWeight: isMobile ? 600 : 400,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...titleStyle,
        }}
      >
        {title}
      </span>
      {onRefresh && !editing ? (
        <DetailIconButton
          type="button"
          onClick={onRefresh}
          disabled={refreshDisabled}
          title={refreshTitle ?? t("common.refresh")}
        >
          <RefreshCw size={iconSize} />
        </DetailIconButton>
      ) : null}
      {metadata}
      {actionsBeforeEdit.filter((action) => !action.hidden).map((action) => (
        <ToolbarActionButton key={action.key} action={action} />
      ))}
      {hasEditFlow ? (
        editing ? (
          <>
            {onCancel ? (
              <DetailIconButton
                type="button"
                onClick={onCancel}
                title={cancelTitle ?? t("common.cancel")}
              >
                {cancelIcon ?? <X size={iconSize} />}
              </DetailIconButton>
            ) : null}
            {onSave ? (
              <DetailIconButton
                type="button"
                onClick={onSave}
                disabled={saveDisabled}
                title={saveTitle ?? t("common.save")}
                tone={saveTone}
              >
                <Save size={iconSize} />
              </DetailIconButton>
            ) : null}
          </>
        ) : onEdit ? (
          <DetailIconButton
            type="button"
            onClick={onEdit}
            disabled={editDisabled}
            title={editTitle ?? t("common.edit")}
          >
            <Pencil size={iconSize} />
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
