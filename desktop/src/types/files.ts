export interface FileEntry {
  /** Canonical display title returned by the backend. */
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
  modifiedTs?: number;
  preview_image?: string | null;
  title?: string | null;
  model?: string | null;
  messages?: string | null;
}

export interface FilePage {
  entries: FileEntry[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface ClipImageEntry {
  /** Image path relative to the sync dir, e.g. `clips/2026-04-17/x.png`. */
  path: string;
  name: string;
  size: number;
  /** Companion `.md` clip path when the image belongs to a clipboard-image clip. */
  paired_md?: string | null;
}

export const FILE_PAGE_SIZE = 10;
