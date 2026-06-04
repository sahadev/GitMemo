import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "./classNames";

interface CodeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mobile?: boolean;
  boxed?: boolean;
  minHeight?: boolean;
}

export const CodeTextarea = forwardRef<HTMLTextAreaElement, CodeTextareaProps>(function CodeTextarea({
  className,
  mobile = false,
  boxed = false,
  minHeight = false,
  ...props
}, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "gm-code-editor",
        "gm-code-textarea",
        boxed && "gm-code-editor-box",
        minHeight && "gm-code-editor-min",
        className,
      )}
      data-mobile={mobile ? "true" : "false"}
      {...props}
    />
  );
});
