import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { EditorView } from "@codemirror/view";
import { MarkdownContent } from "./MarkdownView";
import { CodeMirrorEditor } from "./domain/editor/CodeMirrorEditor";
import type { EditorHandle, EditorPasteHandler } from "./domain/editor/editorTypes";

interface MarkdownSplitEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  onPaste?: EditorPasteHandler;
  filePath?: string;
  mobile?: boolean;
  minHeight?: boolean;
}

function scrollRatio(node: HTMLElement) {
  const max = node.scrollHeight - node.clientHeight;
  return max > 0 ? node.scrollTop / max : 0;
}

function applyScrollRatio(node: HTMLElement, ratio: number) {
  const max = node.scrollHeight - node.clientHeight;
  node.scrollTop = max > 0 ? max * ratio : 0;
}

export const MarkdownSplitEditor = forwardRef<EditorHandle, MarkdownSplitEditorProps>(function MarkdownSplitEditor({
  value,
  onChange,
  onSave,
  onCancel,
  onPaste,
  filePath,
  mobile = false,
  minHeight = false,
}, ref) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
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

  useEffect(() => {
    const source = editorView?.scrollDOM;
    const preview = previewRef.current;
    if (!source || !preview) return;

    const handleScroll = () => syncScroll(source, preview);
    source.addEventListener("scroll", handleScroll, { passive: true });
    return () => source.removeEventListener("scroll", handleScroll);
  }, [editorView, syncScroll]);

  useEffect(() => {
    const source = editorView?.scrollDOM;
    const preview = previewRef.current;
    if (!source || !preview) return;

    const frame = window.requestAnimationFrame(() => {
      markProgrammaticScroll(preview);
      applyScrollRatio(preview, scrollRatio(source));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorView, markProgrammaticScroll, value]);

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
        <CodeMirrorEditor
          ref={ref}
          value={value}
          onChange={onChange}
          onSave={onSave}
          onCancel={onCancel}
          onPaste={onPaste}
          onViewReady={(view) => {
            setEditorView(view);
          }}
          filePath={filePath}
          mobile={mobile}
          minHeight={minHeight}
          className="gm-markdown-split-editor-host"
        />
      </div>
      <div className="gm-markdown-split-divider" aria-hidden="true" />
      <div
        ref={previewRef}
        className="gm-markdown-split-pane gm-markdown-split-preview markdown-body"
        onScroll={(e) => {
          const source = editorView?.scrollDOM;
          if (source) syncScroll(e.currentTarget, source);
        }}
      >
        <MarkdownContent content={value} filePath={filePath} />
      </div>
    </div>
  );
});
