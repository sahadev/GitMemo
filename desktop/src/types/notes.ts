export interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

/** Payload of the `git-sync-end` event and of manual sync commands. */
export interface GitSyncEvent {
  ok: boolean;
  message: string;
}

export interface SavedAttachment {
  path: string;
  markdown: string;
  message: string;
}
