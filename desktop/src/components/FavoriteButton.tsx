import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LoaderCircle, Star } from "lucide-react";
import { DetailIconButton } from "./DetailIconButton";
import { AppIcon } from "./base/AppIcon";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useAppStore } from "../hooks/useAppStore";
import { formatTitleWithShortcut, withDefaultShortcuts } from "../utils/shortcuts";

interface FavoriteButtonProps {
  relPath?: string | null;
  absolutePath?: string | null;
  title?: string | null;
  sourceType?: string | null;
  disabled?: boolean;
  shortcut?: string;
  toggleSignal?: number;
}

interface FilesChangedEvent {
  folder?: string;
}

export function FavoriteButton({
  relPath,
  absolutePath,
  title,
  sourceType,
  disabled,
  shortcut,
  toggleSignal,
}: FavoriteButtonProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { settings } = useAppStore();
  const shortcuts = withDefaultShortcuts(settings?.shortcuts);
  const isMobile = usePlatform() === "mobile";
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastToggleSignalRef = useRef(toggleSignal);
  const hasTarget = Boolean(relPath || absolutePath);

  const refresh = useCallback(async () => {
    if (!hasTarget) {
      setFavorited(false);
      return;
    }
    try {
      const next = await invoke<boolean>("get_favorite_status", {
        relPath: relPath ?? null,
        absolutePath: absolutePath ?? null,
      });
      setFavorited(next);
    } catch {
      setFavorited(false);
    }
  }, [absolutePath, hasTarget, relPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unlistenFavorites = listen("favorites-changed", () => {
      void refresh();
    });
    const unlistenFiles = listen<FilesChangedEvent>("files-changed", ({ payload }) => {
      if (payload?.folder === "favorites") void refresh();
    });
    const unlistenSync = listen("git-sync-end", () => {
      void refresh();
    });
    return () => {
      unlistenFavorites.then((fn) => fn());
      unlistenFiles.then((fn) => fn());
      unlistenSync.then((fn) => fn());
    };
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (!hasTarget || loading) return;
    setLoading(true);
    try {
      const next = !favorited;
      await invoke<boolean>("set_favorite", {
        relPath: relPath ?? null,
        absolutePath: absolutePath ?? null,
        title: title ?? null,
        sourceType: sourceType ?? null,
        favorited: next,
      });
      setFavorited(next);
      showToast(next ? t("favorites.added") : t("favorites.removed"));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [absolutePath, favorited, hasTarget, loading, relPath, showToast, sourceType, t, title]);

  useEffect(() => {
    if (!toggleSignal || toggleSignal === lastToggleSignalRef.current) return;
    lastToggleSignalRef.current = toggleSignal;
    void toggle();
  }, [toggle, toggleSignal]);

  return (
    <DetailIconButton
      type="button"
      onClick={() => void toggle()}
      disabled={disabled || !hasTarget || loading}
      title={formatTitleWithShortcut(favorited ? t("favorites.remove") : t("favorites.add"), shortcut ?? shortcuts.favorite_selected)}
      tone={favorited ? "accent" : "default"}
    >
      {loading ? (
        <AppIcon icon={LoaderCircle} size={isMobile ? "sm" : "xs"} spin />
      ) : (
        <AppIcon icon={Star} size={isMobile ? "sm" : "xs"} fill={favorited ? "currentColor" : "none"} />
      )}
    </DetailIconButton>
  );
}
