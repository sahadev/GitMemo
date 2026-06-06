import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  type Ref,
} from "react";
import { CodeTextarea } from "./base/CodeTextarea";
import { MarkdownContent } from "./MarkdownView";

interface MarkdownSplitEditorProps {
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  filePath?: string;
  mobile?: boolean;
  minHeight?: boolean;
}

function assignRef(ref: Ref<HTMLTextAreaElement>, node: HTMLTextAreaElement | null) {
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  if (ref) {
    ref.current = node;
  }
}

function scrollRatio(node: HTMLElement) {
  const max = node.scrollHeight - node.clientHeight;
  return max > 0 ? node.scrollTop / max : 0;
}

function applyScrollRatio(node: HTMLElement, ratio: number) {
  const max = node.scrollHeight - node.clientHeight;
  node.scrollTop = max > 0 ? max * ratio : 0;
}

export const MarkdownSplitEditor = forwardRef<HTMLTextAreaElement, MarkdownSplitEditorProps>(function MarkdownSplitEditor({
  value,
  onChange,
  onKeyDown,
  onPaste,
  filePath,
  mobile = false,
  minHeight = false,
}, ref) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const pendingSyncRef = useRef<{ source: HTMLElement; target: HTMLElement } | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef<HTMLElement | null>(null);
  const releaseProgrammaticScrollFrameRef = useRef<number | null>(null);

  const markProgrammaticScroll = useCallback((target: HTMLElement) => {
    if (releaseProgrammaticScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(releaseProgrammaticScrollFrameRef.current);
    }
    programmaticScrollRef.current = target;
    releaseProgrammaticScrollFrameRef.current = window.requestAnimationFrame(() => {
      programmaticScrollRef.current = null;
      releaseProgrammaticScrollFrameRef.current = null;
    });
  }, []);

  const syncScroll = useCallback((source: HTMLElement, target: HTMLElement) => {
    if (programmaticScrollRef.current === source) return;

    pendingSyncRef.current = { source, target };
    if (syncFrameRef.current !== null) return;

    syncFrameRef.current = window.requestAnimationFrame(() => {
      syncFrameRef.current = null;
      const pending = pendingSyncRef.current;
      pendingSyncRef.current = null;
      if (!pending) return;

      markProgrammaticScroll(pending.target);
      applyScrollRatio(pending.target, scrollRatio(pending.source));
    });
  }, [markProgrammaticScroll]);

  const setTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    assignRef(ref, node);
  }, [ref]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;

    const frame = window.requestAnimationFrame(() => {
      markProgrammaticScroll(preview);
      applyScrollRatio(preview, scrollRatio(textarea));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [markProgrammaticScroll, value]);

  useEffect(() => () => {
    if (syncFrameRef.current !== null) {
      window.cancelAnimationFrame(syncFrameRef.current);
    }
    if (releaseProgrammaticScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(releaseProgrammaticScrollFrameRef.current);
    }
  }, []);

  return (
    <div className="gm-markdown-split-editor" data-mobile={mobile ? "true" : "false"}>
      <div className="gm-markdown-split-pane gm-markdown-split-source">
        <CodeTextarea
          ref={setTextareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onScroll={(e) => {
            const preview = previewRef.current;
            if (preview) syncScroll(e.currentTarget, preview);
          }}
          className="gm-markdown-split-textarea"
          mobile={mobile}
          minHeight={minHeight}
        />
      </div>
      <div className="gm-markdown-split-divider" aria-hidden="true" />
      <div
        ref={previewRef}
        className="gm-markdown-split-pane gm-markdown-split-preview markdown-body"
        onScroll={(e) => {
          const textarea = textareaRef.current;
          if (textarea) syncScroll(e.currentTarget, textarea);
        }}
      >
        <MarkdownContent content={value} filePath={filePath} />
      </div>
    </div>
  );
});
