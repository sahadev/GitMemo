export interface FileEntry {
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

export const FILE_PAGE_SIZE = 10;
