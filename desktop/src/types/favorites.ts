export interface FavoriteEntry {
  target_id: string;
  rel_path?: string | null;
  absolute_path?: string | null;
  title: string;
  source_type: string;
  favorited_at: string;
  modified: string;
  preview: string;
  exists: boolean;
  is_external: boolean;
}

export interface FavoriteContent {
  target_id: string;
  title: string;
  content: string;
  rel_path?: string | null;
  absolute_path?: string | null;
  source_type: string;
  exists: boolean;
}
