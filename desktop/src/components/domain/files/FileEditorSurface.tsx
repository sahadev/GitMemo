import { forwardRef, type ReactNode } from "react";
import { cx } from "../../base/classNames";
import { DetailScroll } from "../../layout/Pane";
import { CodeMirrorEditor } from "../editor/CodeMirrorEditor";
import type { EditorHandle, EditorPasteHandler } from "../editor/editorTypes";
import { MarkdownSplitEditor } from "../../MarkdownSplitEditor";

interface FileEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  onPaste?: EditorPasteHandler;
  filePath?: string;
  mobile?: boolean;
  minHeight?: boolean;
  boxed?: boolean;
  splitPreview?: boolean;
  supportsSplitPreview?: boolean;
  cancelOnEscape?: boolean;
  className?: string;
}

interface FileEditorSurfaceProps extends FileEditorProps {
  editing: boolean;
  children?: ReactNode;
  mobileBottomPadding?: boolean;
  selectable?: boolean;
  scrollClassName?: string;
}

export const FileEditor = forwardRef<EditorHandle, FileEditorProps>(function FileEditor({
  value,
  onChange,
  onSave,
  onCancel,
  onPaste,
  filePath,
  mobile = false,
  minHeight = false,
  boxed = false,
  splitPreview = false,
  supportsSplitPreview = false,
  cancelOnEscape = true,
  className,
}, ref) {
  if (supportsSplitPreview && splitPreview) {
    return (
      <MarkdownSplitEditor
        ref={ref}
        value={value}
        onChange={onChange}
        onSave={onSave}
        onCancel={cancelOnEscape ? onCancel : undefined}
        onPaste={onPaste}
        filePath={filePath}
        mobile={mobile}
        minHeight={minHeight}
      />
    );
  }

  return (
    <CodeMirrorEditor
      ref={ref}
      value={value}
      onChange={onChange}
      onSave={onSave}
      onCancel={cancelOnEscape ? onCancel : undefined}
      onPaste={onPaste}
      filePath={filePath}
      mobile={mobile}
      minHeight={minHeight}
      className={cx(className, boxed && "gm-code-mirror-box")}
    />
  );
});

export const FileEditorSurface = forwardRef<EditorHandle, FileEditorSurfaceProps>(function FileEditorSurface({
  editing,
  children,
  mobileBottomPadding = false,
  selectable = false,
  scrollClassName,
  splitPreview = false,
  supportsSplitPreview = false,
  mobile = false,
  ...editorProps
}, ref) {
  const splitActive = editing && supportsSplitPreview && splitPreview;

  return (
    <DetailScroll
      mobileBottomPadding={mobileBottomPadding}
      selectable={selectable}
      className={cx(
        scrollClassName,
        editing && !splitActive && "gm-detail-scroll-editor",
        splitActive && "gm-detail-scroll-split",
      )}
    >
      {editing ? (
        <FileEditor
          ref={ref}
          splitPreview={splitPreview}
          supportsSplitPreview={supportsSplitPreview}
          mobile={mobile}
          {...editorProps}
        />
      ) : children}
    </DetailScroll>
  );
});
