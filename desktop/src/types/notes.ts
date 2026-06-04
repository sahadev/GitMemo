export interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

export interface SavedAttachment {
  path: string;
  markdown: string;
  message: string;
}
