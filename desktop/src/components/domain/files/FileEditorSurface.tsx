import {
  forwardRef,
  useCallback,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
import { CodeTextarea } from "../../base/CodeTextarea";
import { cx } from "../../base/classNames";
import { DetailScroll } from "../../layout/Pane";
import { MarkdownSplitEditor } from "../../MarkdownSplitEditor";

interface FileEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
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
  children: ReactNode;
  mobileBottomPadding?: boolean;
  selectable?: boolean;
  scrollClassName?: string;
}

export const FileEditor = forwardRef<HTMLTextAreaElement, FileEditorProps>(function FileEditor({
  value,
  onChange,
  onSave,
  onCancel,
  onPaste,
  onKeyDown,
  filePath,
  mobile = false,
  minHeight = false,
  boxed = false,
  splitPreview = false,
  supportsSplitPreview = false,
  cancelOnEscape = true,
  className,
}, ref) {
  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>((event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (onSave && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void onSave();
      return;
    }

    if (cancelOnEscape && onCancel && event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }, [cancelOnEscape, onCancel, onKeyDown, onSave]);

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>((event) => {
    onChange(event.target.value);
  }, [onChange]);

  if (supportsSplitPreview && splitPreview && !mobile) {
    return (
      <MarkdownSplitEditor
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        filePath={filePath}
        mobile={mobile}
        minHeight={minHeight}
      />
    );
  }

  return (
    <CodeTextarea
      ref={ref}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={onPaste}
      mobile={mobile}
      minHeight={minHeight}
      boxed={boxed}
      spellCheck={false}
      className={className}
    />
  );
});

export const FileEditorSurface = forwardRef<HTMLTextAreaElement, FileEditorSurfaceProps>(function FileEditorSurface({
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
  const splitActive = editing && supportsSplitPreview && splitPreview && !mobile;

  return (
    <DetailScroll
      mobileBottomPadding={mobileBottomPadding}
      selectable={selectable}
      className={cx(scrollClassName, splitActive && "gm-detail-scroll-split")}
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
