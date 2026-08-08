export interface EditorHandle {
  focus: () => void;
}

/**
 * The small event surface shared by native CodeMirror events and React's
 * clipboard events. Keeping this structural avoids coupling the editor to a
 * particular DOM event implementation.
 */
export interface EditorPasteEvent {
  clipboardData: DataTransfer;
  preventDefault: () => void;
}

export type EditorPasteHandler = (event: EditorPasteEvent) => void | Promise<void>;
