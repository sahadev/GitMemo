import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
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

function sourceLabelKey(sourceType: string) {
  switch (sourceType) {
    case "conversation": return "favorites.sourceConversation";
    case "note": return "favorites.sourceNote";
    case "clip": return "favorites.sourceClip";
    case "plan": return "favorites.sourcePlan";
    case "import": return "favorites.sourceImport";
    case "config": return "favorites.sourceConfig";
    case "external": return "favorites.sourceExternal";
    default: return "favorites.sourceUnknown";
  }
}

export default function FavoritesPage({
  registerMobileBackHandler,
}: {
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

  const selectedEntry = useMemo(
    () => favorites.find((item) => item.target_id === selectedTargetId) ?? null,
    [favorites, selectedTargetId],
  );

  const showList = !isMobile || !selectedTargetId;
  const showDetail = !isMobile || !!selectedTargetId;

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const next = await invoke<FavoriteEntry[]>("list_favorites");
      setFavorites(next);
      setSelectedTargetId((current) => current && next.some((item) => item.target_id === current) ? current : null);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    const unlistenFavorites = listen("favorites-changed", () => {
      void loadFavorites();
    });
    const unlistenFiles = listen<FilesChangedEvent>("files-changed", ({ payload }) => {
      if (payload?.folder === "favorites") void loadFavorites();
    });
    const unlistenSync = listen("git-sync-end", () => {
      void loadFavorites();
    });
    return () => {
      unlistenFavorites.then((fn) => fn());
      unlistenFiles.then((fn) => fn());
      unlistenSync.then((fn) => fn());
    };
  }, [loadFavorites]);

  const openFavorite = useCallback(async (targetId: string) => {
    setSelectedTargetId(targetId);
    setContentLoading(true);
    try {
      const next = await invoke<FavoriteContent>("read_favorite_content", { targetId });
      setContent(next);
    } catch (e) {
      setContent(null);
      showToast(`Error: ${e}`, true);
    } finally {
      setContentLoading(false);
    }
  }, [showToast]);

  const closeDetail = useCallback(() => {
    setSelectedTargetId(null);
    setContent(null);
    setContentLoading(false);
  }, []);

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

  const detailTitle = content?.title || selectedEntry?.title || t("favorites.title");
  const detailPath = content?.rel_path || content?.absolute_path || selectedEntry?.rel_path || selectedEntry?.absolute_path || "";

  const detail = (
    <DetailPane>
      {!selectedTargetId ? (
        <EmptyState icon={Star} iconSize="empty-lg" title={t("favorites.selectToView")} full />
      ) : (
        <>
          <FileDetailToolbar
            title={isMobile ? detailTitle : detailPath || detailTitle}
            titleText={detailPath || detailTitle}
            onBack={isMobile ? closeDetail : undefined}
            onRefresh={() => {
              void loadFavorites();
              if (selectedTargetId) void openFavorite(selectedTargetId);
            }}
            refreshDisabled={contentLoading}
            metadata={selectedEntry ? (
              <FavoriteButton
                relPath={selectedEntry.rel_path}
                absolutePath={selectedEntry.absolute_path}
                title={selectedEntry.title}
                sourceType={selectedEntry.source_type}
              />
            ) : null}
            more={selectedEntry && content ? (
              <FileMoreActionsMenu
                relPath={content.rel_path ?? undefined}
                absolutePath={content.absolute_path ?? undefined}
                exportContent={content.content}
                exportTitle={detailTitle}
              />
            ) : null}
          />
          <DetailScroll mobileBottomPadding={isMobile} selectable>
            {contentLoading ? (
              <Loading compact text={t("common.loading")} />
            ) : selectedEntry && !selectedEntry.exists ? (
              <p className="gm-muted-text">{t("favorites.missingHint")}</p>
            ) : content ? (
              <MarkdownView content={content.content} filePath={content.rel_path ?? undefined} />
            ) : null}
          </DetailScroll>
        </>
      )}
    </DetailPane>
  );

  return (
    <FileWorkspace
      panelKey="favorites"
      defaultWidth={340}
      showList={showList}
      showDetail={showDetail}
      left={list}
      right={detail}
    />
  );
}
