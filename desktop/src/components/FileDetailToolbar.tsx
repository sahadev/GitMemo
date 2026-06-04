import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft, Pencil, Save, X } from "lucide-react";
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
      background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
      flexShrink: 0,
      gap: 8,
      minWidth: 0,
      padding: isMobile ? "8px 12px" : "10px 20px",
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
