import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  type ViewUpdate,
} from "@codemirror/view";
import { cx } from "../../base/classNames";
import { EditorToolbar } from "./EditorToolbar";
import { applyMarkdownCommand, getEditorMode, type MarkdownCommandId } from "./editorLogic";
import type { EditorHandle, EditorPasteHandler } from "./editorTypes";

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  onPaste?: EditorPasteHandler;
  filePath?: string;
  mobile?: boolean;
  minHeight?: boolean;
  className?: string;
  onViewReady?: (view: EditorView | null) => void;
}

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--text)",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    fontFamily: "var(--gm-font-mono)",
    fontSize: "var(--gm-font-sm)",
    lineHeight: "var(--gm-leading-reading)",
    minHeight: "100%",
    padding: "var(--gm-detail-pad-y) var(--gm-detail-pad-x)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "var(--gm-font-mono)",
    overflow: "auto",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent) 5%, transparent)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
  },
}, {dark: true});

function isDocumentChanged(update: ViewUpdate) {
  return update.docChanged;
}

export const CodeMirrorEditor = forwardRef<EditorHandle, CodeMirrorEditorProps>(function CodeMirrorEditor({
  value,
  onChange,
  onSave,
  onCancel,
  onPaste,
  filePath,
  mobile = false,
  minHeight = false,
  className,
  onViewReady,
}, ref: Ref<EditorHandle>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [view, setView] = useState<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);
  const onPasteRef = useRef(onPaste);
  const onViewReadyRef = useRef(onViewReady);
  const syncingValueRef = useRef(false);
  const mode = getEditorMode(filePath);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { onPasteRef.current = onPaste; }, [onPaste]);
  useEffect(() => { onViewReadyRef.current = onViewReady; }, [onViewReady]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
  }), []);

  useEffect(() => {
    const parent = rootRef.current;
    if (!parent) return;

    const saveKey = {
      key: "Mod-s",
      run: () => {
        const handler = onSaveRef.current;
        if (!handler) return false;
        void handler();
        return true;
      },
    };
    const cancelKey = {
      key: "Escape",
      run: () => {
        const handler = onCancelRef.current;
        if (!handler) return false;
        handler();
        return true;
      },
    };
    const extensions: Extension[] = [
      editorTheme,
      EditorView.lineWrapping,
      drawSelection(),
      history(),
      search(),
      highlightSelectionMatches(),
      autocompletion({ activateOnTyping: true }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        saveKey,
        cancelKey,
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (!isDocumentChanged(update) || syncingValueRef.current) return;
        onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        paste: (event) => {
          const handler = onPasteRef.current;
          if (!handler || !event.clipboardData) return false;
          handler({
            clipboardData: event.clipboardData,
            preventDefault: () => event.preventDefault(),
          });
          return event.defaultPrevented;
        },
      }),
      EditorView.contentAttributes.of({
        autocapitalize: "off",
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
      }),
    ];
    if (mode === "markdown") extensions.push(markdown({ base: markdownLanguage }));

    const nextView = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent,
    });
    viewRef.current = nextView;
    setView(nextView);
    onViewReadyRef.current?.(nextView);

    return () => {
      onViewReadyRef.current?.(null);
      setView(null);
      viewRef.current = null;
      nextView.destroy();
    };
    // A selected file remounts the editor; keeping this lifecycle stable avoids
    // resetting the CodeMirror history on every controlled value update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const currentView = viewRef.current;
    if (!currentView) return;
    const currentValue = currentView.state.doc.toString();
    if (currentValue === value) return;

    syncingValueRef.current = true;
    currentView.dispatch({
      changes: { from: 0, to: currentView.state.doc.length, insert: value },
    });
    syncingValueRef.current = false;
  }, [value]);

  const applyCommand = (command: MarkdownCommandId) => {
    const currentView = viewRef.current;
    if (!currentView) return;
    const selection = currentView.state.selection.main;
    const result = applyMarkdownCommand(
      currentView.state.doc.toString(),
      { from: selection.from, to: selection.to },
      command,
    );
    currentView.dispatch({
      changes: { from: result.from, to: result.to, insert: result.insert },
      selection: { anchor: result.selection.from, head: result.selection.to },
      userEvent: "input.format",
    });
    currentView.focus();
  };

  return (
    <div className="gm-code-mirror-shell" data-mobile={mobile ? "true" : "false"}>
      {mode === "markdown" ? (
        <EditorToolbar view={view} mobile={mobile} onMarkdownCommand={applyCommand} />
      ) : null}
      <div
        ref={rootRef}
        className={cx("gm-code-mirror-host", minHeight && "gm-code-mirror-min", className)}
        data-mobile={mobile ? "true" : "false"}
      />
    </div>
  );
});
