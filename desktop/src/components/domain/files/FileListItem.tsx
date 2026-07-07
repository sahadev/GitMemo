import type { ReactNode } from "react";
import { forwardRef } from "react";
import { cx } from "../../base/classNames";

interface FileListItemProps {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  preview?: ReactNode;
  active?: boolean;
  mobile?: boolean;
  icon?: ReactNode;
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
