import { useCallback, useState, type RefObject } from "react";

interface UseFileEditorStateOptions {
  sourceContent?: string;
  mobile?: boolean;
  focusRef?: RefObject<HTMLTextAreaElement | null>;
  focusDelayMs?: number;
  clearContentOnCancel?: boolean;
  clearContentOnComplete?: boolean;
}

interface StartEditOptions {
  content?: string;
  splitPreview?: boolean;
  focus?: boolean;
  focusDelayMs?: number;
  enabled?: boolean;
}

interface ToggleSplitPreviewOptions {
  content?: string;
  enabled?: boolean;
  focus?: boolean;
  focusDelayMs?: number;
}

export function useFileEditorState({
  sourceContent = "",
  focusRef,
  focusDelayMs = 0,
  clearContentOnCancel = false,
  clearContentOnComplete = false,
}: UseFileEditorStateOptions = {}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [splitPreview, setSplitPreview] = useState(false);

  const focusEditor = useCallback((delayMs = focusDelayMs) => {
    if (!focusRef) return;
    window.setTimeout(() => focusRef.current?.focus(), delayMs);
  }, [focusDelayMs, focusRef]);

  const startEdit = useCallback((options: StartEditOptions = {}) => {
    if (options.enabled === false) return;
    setEditContent(options.content ?? sourceContent);
    setEditing(true);
    setSplitPreview(Boolean(options.splitPreview));
    if (options.focus !== false) {
      focusEditor(options.focusDelayMs);
    }
  }, [focusEditor, sourceContent]);

  const cancelEdit = useCallback((content?: string) => {
    setEditing(false);
    setSplitPreview(false);
    if (content !== undefined) {
      setEditContent(content);
    } else if (clearContentOnCancel) {
      setEditContent("");
    }
  }, [clearContentOnCancel]);

  const completeEdit = useCallback((content?: string) => {
    setEditing(false);
    setSplitPreview(false);
    if (content !== undefined) {
      setEditContent(content);
    } else if (clearContentOnComplete) {
      setEditContent("");
    }
  }, [clearContentOnComplete]);

  const resetEditor = useCallback((content = "") => {
    setEditing(false);
    setEditContent(content);
    setSplitPreview(false);
  }, []);

  const toggleSplitPreview = useCallback((options: ToggleSplitPreviewOptions = {}) => {
    if (options.enabled === false) return;
    if (!editing) {
      startEdit({
        content: options.content ?? sourceContent,
        splitPreview: true,
        focus: options.focus,
        focusDelayMs: options.focusDelayMs,
      });
      return;
    }
    setSplitPreview((value) => !value);
  }, [editing, sourceContent, startEdit]);

  return {
    editing,
    editContent,
    splitPreview,
    setEditContent,
    startEdit,
    cancelEdit,
    completeEdit,
    resetEditor,
    toggleSplitPreview,
  };
}
