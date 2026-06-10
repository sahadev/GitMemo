import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LoaderCircle, Star } from "lucide-react";
import { DetailIconButton } from "./DetailIconButton";
import { AppIcon } from "./base/AppIcon";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useAppStore } from "../hooks/useAppStore";
import { formatTitleWithShortcut, isShortcutEditableTarget, shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import {
  canToggleFavoriteTarget,
  getFavoriteTitleKey,
  getNextFavoriteState,
  hasActionFilePath,
  isFavoriteButtonDisabled,
  shouldEnableFavoriteShortcut,
  shouldRefreshForFavoritesFolder,
} from "./domain/files/fileActionsLogic";

interface FavoriteButtonProps {
  relPath?: string | null;
  absolutePath?: string | null;
  title?: string | null;
  sourceType?: string | null;
  disabled?: boolean;
  shortcut?: string;
  active?: boolean;
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
  active = true,
}: FavoriteButtonProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  const isMobile = usePlatform() === "mobile";
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const hasTarget = hasActionFilePath(relPath, absolutePath);

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
      setFavorited((current) => current === next ? current : next);
    } catch {
      setFavorited(false);
    }
  }, [absolutePath, hasTarget, relPath]);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, 120);
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const unlistenFavorites = listen("favorites-changed", () => {
      scheduleRefresh();
    });
    const unlistenFiles = listen<FilesChangedEvent>("files-changed", ({ payload }) => {
      if (shouldRefreshForFavoritesFolder(payload?.folder)) scheduleRefresh();
    });
    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      unlistenFavorites.then((fn) => fn());
      unlistenFiles.then((fn) => fn());
    };
  }, [active, scheduleRefresh]);

  const toggle = useCallback(async () => {
    if (!canToggleFavoriteTarget(hasTarget, loading)) return;
    setLoading(true);
    try {
      const next = getNextFavoriteState(favorited);
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
    if (!shouldEnableFavoriteShortcut({ active, isMobile, disabled, hasTarget, loading })) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutEditableTarget(event.target)) return;
      if (!shortcutMatches(event, shortcut ?? shortcuts.favorite_selected)) return;
      event.preventDefault();
      void toggle();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, disabled, hasTarget, isMobile, loading, shortcut, shortcuts.favorite_selected, toggle]);

  return (
    <DetailIconButton
      type="button"
      onClick={() => void toggle()}
      disabled={isFavoriteButtonDisabled(disabled, hasTarget, loading)}
      title={formatTitleWithShortcut(t(getFavoriteTitleKey(favorited)), shortcut ?? shortcuts.favorite_selected)}
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
