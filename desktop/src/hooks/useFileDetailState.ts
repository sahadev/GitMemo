import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface OpenFileMeta {
  fromCrossPage: boolean;
  force: boolean;
}

interface OpenedFileMeta extends OpenFileMeta {
  path: string;
  rawContent: string;
  content: string;
}

interface UseFileDetailStateOptions {
  deriveContent?: (rawContent: string, path: string) => string;
  canOpen?: (path: string, meta: OpenFileMeta) => boolean;
  resetEditor?: (content?: string) => void;
  resetEditorContent?: (content: string, rawContent: string, path: string) => string | undefined;
  onOpened?: (meta: OpenedFileMeta) => void;
  onClosed?: () => void;
  onOpenError?: (error: unknown, path: string) => void;
}

export function useFileDetailState({
  deriveContent = (rawContent) => rawContent,
  canOpen,
  resetEditor,
  resetEditorContent,
  onOpened,
  onClosed,
  onOpenError = (error) => console.error(error),
}: UseFileDetailStateOptions = {}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rawFileContent, setRawFileContent] = useState("");
  const [fileContent, setFileContent] = useState("");
  const openGenerationRef = useRef(0);
  const optionsRef = useRef({
    deriveContent,
    canOpen,
    resetEditor,
    resetEditorContent,
    onOpened,
    onClosed,
    onOpenError,
  });

  optionsRef.current = {
    deriveContent,
    canOpen,
    resetEditor,
    resetEditorContent,
    onOpened,
    onClosed,
    onOpenError,
  };

  const openFile = useCallback(async (path: string, fromCrossPage = false, force = false) => {
    const options = optionsRef.current;
    const meta = { fromCrossPage, force };
    if (options.canOpen && !options.canOpen(path, meta)) return;
    const openGeneration = openGenerationRef.current + 1;
    openGenerationRef.current = openGeneration;

    try {
      const rawContent = await invoke<string>("read_file", { filePath: path });
      if (openGenerationRef.current !== openGeneration) return;
      const content = options.deriveContent(rawContent, path);
      setSelectedFile(path);
      setRawFileContent(rawContent);
      setFileContent(content);
      options.resetEditor?.(options.resetEditorContent?.(content, rawContent, path));
      options.onOpened?.({ path, rawContent, content, fromCrossPage, force });
    } catch (error) {
      if (openGenerationRef.current !== openGeneration) return;
      options.onOpenError(error, path);
    }
  }, []);

  const clearDetail = useCallback(() => {
    const options = optionsRef.current;
    openGenerationRef.current += 1;
    setSelectedFile(null);
    setRawFileContent("");
    setFileContent("");
    options.resetEditor?.();
    options.onClosed?.();
  }, []);

  return {
    selectedFile,
    rawFileContent,
    fileContent,
    setSelectedFile,
    setRawFileContent,
    setFileContent,
    openFile,
    clearDetail,
  };
}
