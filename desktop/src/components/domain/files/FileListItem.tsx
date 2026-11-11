import type { ReactNode } from "react";
import { forwardRef } from "react";
import { cx } from "../../base/classNames";
import { UnreadDot } from "../../base/UnreadDot";

interface FileListItemProps {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  preview?: ReactNode;
  active?: boolean;
  mobile?: boolean;
  icon?: ReactNode;
  /** 有新内容未读时在标题行尾部显示小红点；不参与行高与点击行为。 */
  unread?: boolean;
  onClick: () => void;
  className?: string;
}

export const FileListItem = forwardRef<HTMLButtonElement, FileListItemProps>(function FileListItem({
  title,
  subtitle,
  meta,
  preview,
  active = false,
  mobile = false,
  icon,
  unread = false,
  onClick,
  className,
}, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx("gm-file-list-item", className)}
      data-active={active ? "true" : "false"}
      data-mobile={mobile ? "true" : "false"}
      onClick={onClick}
    >
      <div className="gm-file-list-title-row">
        {icon ? <span className="gm-file-list-icon">{icon}</span> : null}
        <p className="gm-file-list-title">{title}</p>
        {unread ? <UnreadDot /> : null}
      </div>
      {subtitle || meta ? (
        <div className="gm-file-list-meta-row">
          {subtitle ? <span className="gm-file-list-meta gm-file-list-subtitle">{subtitle}</span> : null}
          {meta}
        </div>
      ) : null}
      {preview ? <p className="gm-file-list-preview">{preview}</p> : null}
    </button>
  );
});
