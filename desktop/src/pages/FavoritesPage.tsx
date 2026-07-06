import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Star, FileText, MessageSquare, Clipboard, Lightbulb, Download, Settings, FileSymlink } from "lucide-react";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { EmptyState } from "../components/base/EmptyState";
import { shouldActivateMobileEditorChrome } from "../components/domain/app/appChromeLogic";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { DetailPane, ListPane, ListPaneBody } from "../components/layout/Pane";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import {
  areFavoriteEntriesEquivalent,
  canEditFavoriteContent,
  getFavoriteDetailPath,
  getFavoriteDetailTitle,
  getFavoriteEditablePath,
  getFavoritesPaneState,
  getNextSelectedFavoriteTargetId,
  getSelectedFavoriteEntry,
  shouldSaveFavoriteAsExternalFile,
  sourceLabelKey,
  supportsFavoriteSplitPreview,
} from "../components/domain/favorites/favoritesLogic";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useMobileEditorChrome } from "../hooks/useMobileEditorChrome";
import { useListKeyboardNavigation, useListNavigation } from "../hooks/useListNavigation";
import { relativeTime } from "../utils/time";
import type { FavoriteContent, FavoriteEntry } from "../types/favorites";

interface FilesChangedEvent {
  folder?: string;
}

const sourceIcon = {
  conversation: MessageSquare,
  note: FileText,
  clip: Clipboard,
  plan: Lightbulb,
  import: Download,
  config: Settings,
  external: FileSymlink,
  unknown: FileText,
};

export default function FavoritesPage({
  active = true,
  registerMobileBackHandler,
}: {
  active?: boolean;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
} = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = usePlatform() === "mobile";
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [content, setContent] = useState<FavoriteContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const {
    editing,
    editContent,
    splitPreview,
    setEditContent,
    startEdit,
    cancelEdit,
    completeEdit,
    resetEditor,
    toggleSplitPreview,
  } = useFileEditorState({
    sourceContent: content?.content ?? "",
    mobile: isMobile,
    focusRef: editRef,
    clearContentOnCancel: true,
    clearContentOnComplete: true,
  });
  useMobileEditorChrome({ active: shouldActivateMobileEditorChrome({ pageActive: active, editing }), id: "favorites" });

  const selectedEntry = useMemo(
    () => getSelectedFavoriteEntry(favorites, selectedTargetId),
    [favorites, selectedTargetId],
  );

  const { showList, showDetail } = getFavoritesPaneState(isMobile, selectedTargetId);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const next = await invoke<FavoriteEntry[]>("list_favorites");
      setFavorites((current) => areFavoriteEntriesEquivalent(current, next) ? current : next);
      setSelectedTargetId((current) => getNextSelectedFavoriteTargetId(next, current));
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (active) void loadFavorites();
  }, [active, loadFavorites]);

  const scheduleLoadFavorites = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadFavorites();
    }, 120);
  }, [loadFavorites]);

  useEffect(() => {
    if (!active) return;
    const unlistenFavorites = listen("favorites-changed", () => {
      scheduleLoadFavorites();
    });
    const unlistenFiles = listen<FilesChangedEvent>("files-changed", ({ payload }) => {
      if (payload?.folder === "favorites") scheduleLoadFavorites();
    });
    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      unlistenFavorites.then((fn) => fn());
      unlistenFiles.then((fn) => fn());
    };
  }, [active, scheduleLoadFavorites]);

  const openFavorite = useCallback(async (targetId: string) => {
    setSelectedTargetId(targetId);
    setContentLoading(true);
    try {
      const next = await invoke<FavoriteContent>("read_favorite_content", { targetId });
      setContent(next);
      resetEditor(next.content);
    } catch (e) {
      setContent(null);
      resetEditor();
      showToast(`Error: ${e}`, true);
    } finally {
      setContentLoading(false);
    }
  }, [resetEditor, showToast]);

  const { navPrev, navNext } = useListNavigation({
    items: favorites,
    selectedKey: selectedTargetId,
    getKey: (item) => item.target_id,
    openItem: openFavorite,
  });

  useListKeyboardNavigation({
    active,
    disabled: isMobile,
    navPrev,
    navNext,
  });

  const closeDetail = useCallback(() => {
    setSelectedTargetId(null);
    setContent(null);
    setContentLoading(false);
    resetEditor();
  }, [resetEditor]);

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedTargetId,
    closeDetail,
  });

  const list = (
    <ListPane>
      <PaneHeader
        icon={Star}
        iconFill="currentColor"
        title={t("favorites.title")}
        actions={(
          <Badge>{t("favorites.count", favorites.length)}</Badge>
        )}
      />
      <ListPaneBody mobileBottomPadding={isMobile}>
        {loading ? (
          <Loading compact text={t("common.loading")} />
        ) : favorites.length === 0 ? (
          <EmptyState icon={Star} iconSize="empty-lg" title={t("favorites.empty")} full />
        ) : favorites.map((item) => {
          const active = selectedTargetId === item.target_id;
          const Icon = sourceIcon[item.source_type as keyof typeof sourceIcon] ?? sourceIcon.unknown;
          return (
            <FileListItem
              key={item.target_id}
              onClick={() => void openFavorite(item.target_id)}
              active={active}
              mobile={isMobile}
              icon={<AppIcon icon={Icon} size="xs" />}
              title={item.title}
              subtitle={t(sourceLabelKey(item.source_type))}
              meta={(
                <>
                  <span className="gm-file-list-meta">{relativeTime(item.favorited_at, t)}</span>
                  {!item.exists ? <Badge tone="danger">{t("favorites.missing")}</Badge> : null}
                </>
              )}
              preview={item.preview}
            />
          );
        })}
      </ListPaneBody>
    </ListPane>
  );

  const detailTitle = getFavoriteDetailTitle(content, selectedEntry, t("favorites.title"));
  const detailPath = getFavoriteDetailPath(content, selectedEntry);
  const canEditSelectedFavorite = canEditFavoriteContent(isMobile, content, selectedEntry);
  const favoriteEditablePath = getFavoriteEditablePath(content, selectedEntry);
  const favoriteSupportsSplitPreview = supportsFavoriteSplitPreview(content, selectedEntry);

  const handleSaveEdit = useCallback(async () => {
    if (!content || !canEditFavoriteContent(isMobile, content, selectedEntry)) return;
    const filePath = getFavoriteEditablePath(content, selectedEntry);
    if (!filePath) return;
    setSaving(true);
    try {
      if (shouldSaveFavoriteAsExternalFile(content, selectedEntry)) {
        await invoke("save_external_file", { filePath, content: editContent });
      } else {
        await invoke("update_note", { filePath, content: editContent });
      }
      const next = await invoke<FavoriteContent>("read_favorite_content", { targetId: content.target_id });
      setContent(next);
      completeEdit(next.content);
      showToast(t("favorites.saved"));
      void loadFavorites();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [completeEdit, content, editContent, isMobile, loadFavorites, selectedEntry, showToast, t]);

  const detail = (
    <DetailPane>
      {!selectedTargetId ? (
        <EmptyState icon={Star} iconSize="empty-lg" title={t("favorites.selectToView")} full />
      ) : (
        <>
          <FileDetailToolbar
            title={isMobile ? detailTitle : detailPath || detailTitle}
            titleText={detailPath || detailTitle}
            active={active}
            onBack={isMobile ? closeDetail : undefined}
            onRefresh={() => {
              void loadFavorites();
              if (selectedTargetId) void openFavorite(selectedTargetId);
            }}
            refreshDisabled={contentLoading}
            editing={editing}
            onEdit={canEditSelectedFavorite ? startEdit : undefined}
            onSave={canEditSelectedFavorite ? () => void handleSaveEdit() : undefined}
            onCancel={canEditSelectedFavorite ? cancelEdit : undefined}
            editTitle={t("common.edit")}
            saveTitle={t("common.save")}
            saveDisabled={saving}
            saveTone="accent"
            splitPreview={splitPreview}
            onToggleSplitPreview={canEditSelectedFavorite && favoriteSupportsSplitPreview ? toggleSplitPreview : undefined}
            metadata={selectedEntry ? (
              <FavoriteButton
                relPath={selectedEntry.rel_path}
                absolutePath={selectedEntry.absolute_path}
                active={active}
                title={selectedEntry.title}
                sourceType={selectedEntry.source_type}
              />
            ) : null}
            more={selectedEntry && content && !editing ? (
              <FileMoreActionsMenu
                relPath={content.rel_path ?? undefined}
                absolutePath={content.absolute_path ?? undefined}
                active={active}
                exportContent={content.content}
                exportTitle={detailTitle}
              />
            ) : null}
          />
          <FileEditorSurface
            ref={editRef}
            editing={editing}
            value={editContent}
            onChange={setEditContent}
            onSave={handleSaveEdit}
            onCancel={cancelEdit}
            filePath={favoriteEditablePath || undefined}
            mobile={isMobile}
            splitPreview={splitPreview}
            supportsSplitPreview={favoriteSupportsSplitPreview}
            mobileBottomPadding={isMobile}
            selectable
          >
            {contentLoading ? (
              <Loading compact text={t("common.loading")} />
            ) : selectedEntry && !selectedEntry.exists ? (
              <p className="gm-muted-text">{t("favorites.missingHint")}</p>
            ) : content ? (
              <MarkdownView content={content.content} filePath={favoriteEditablePath || undefined} />
            ) : null}
          </FileEditorSurface>
        </>
      )}
    </DetailPane>
  );

  return (
    <FileWorkspace
      panelKey="favorites"
      showList={showList}
      showDetail={showDetail}
      left={list}
      right={detail}
    />
  );
}
