import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Star, FileText, MessageSquare, Clipboard, Lightbulb, Download, Settings, FileSymlink } from "lucide-react";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { MOBILE_BOTTOM_CONTENT_PADDING } from "../utils/mobileLayout";
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

  useEffect(() => {
    if (!isMobile || !registerMobileBackHandler) return;
    registerMobileBackHandler(() => {
      if (!selectedTargetId) return false;
      closeDetail();
      return true;
    });
    return () => registerMobileBackHandler(null);
  }, [closeDetail, isMobile, registerMobileBackHandler, selectedTargetId]);

  const list = (
    <div className="gm-page" style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
      background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: isMobile ? "9px 12px" : "12px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--bg-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Star size={isMobile ? 18 : 16} style={{ color: "var(--accent)", flexShrink: 0 }} fill="currentColor" />
          <span style={{ fontSize: isMobile ? "var(--gm-font-md)" : "var(--gm-font-sm)", fontWeight: 700 }}>{t("favorites.title")}</span>
        </div>
        <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("favorites.count", favorites.length)}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: isMobile ? MOBILE_BOTTOM_CONTENT_PADDING : 0 }}>
        {loading ? (
          <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loading compact text={t("common.loading")} />
          </div>
        ) : favorites.length === 0 ? (
          <div className="gm-empty-state" style={{ minHeight: "100%", padding: 24 }}>
            <div>
              <Star size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("favorites.empty")}</p>
            </div>
          </div>
        ) : favorites.map((item) => {
          const active = selectedTargetId === item.target_id;
          const Icon = sourceIcon[item.source_type as keyof typeof sourceIcon] ?? sourceIcon.unknown;
          return (
            <button
              key={item.target_id}
              type="button"
              onClick={() => void openFavorite(item.target_id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: isMobile ? "14px 16px 10px" : "12px 16px 8px",
                border: "none",
                borderBottom: "1px solid var(--border)",
                background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                color: "var(--text)",
                borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Icon size={14} style={{ color: active ? "var(--accent)" : "var(--text-secondary)", flexShrink: 0 }} />
                <p style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "var(--gm-font-sm)",
                  fontWeight: 650,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {item.title}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minWidth: 0 }}>
                <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                  {t(sourceLabelKey(item.source_type))}
                </span>
                <span style={{ fontSize: "var(--gm-font-2xs)", color: "var(--text-secondary)" }}>
                  {relativeTime(item.favorited_at, t)}
                </span>
                {!item.exists ? (
                  <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--red)" }}>
                    {t("favorites.missing")}
                  </span>
                ) : null}
              </div>
              {item.preview ? (
                <p style={{
                  marginTop: 7,
                  fontSize: "var(--gm-font-xs)",
                  lineHeight: 1.4,
                  color: "var(--text-secondary)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                }}>
                  {item.preview}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const detailTitle = content?.title || selectedEntry?.title || t("favorites.title");
  const detailPath = content?.rel_path || content?.absolute_path || selectedEntry?.rel_path || selectedEntry?.absolute_path || "";

  const detail = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      {!selectedTargetId ? (
        <div className="gm-empty-state" style={{ flex: 1 }}>
          <div>
            <Star size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("favorites.selectToView")}</p>
          </div>
        </div>
      ) : (
        <>
          <FileDetailToolbar
            title={isMobile ? detailTitle : detailPath || detailTitle}
            titleText={detailPath || detailTitle}
            onBack={isMobile ? closeDetail : undefined}
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
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? `16px 16px ${MOBILE_BOTTOM_CONTENT_PADDING}` : "20px 28px", userSelect: "text" }}>
            {contentLoading ? (
              <Loading compact text={t("common.loading")} />
            ) : selectedEntry && !selectedEntry.exists ? (
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("favorites.missingHint")}</p>
            ) : content ? (
              <MarkdownView content={content.content} filePath={content.rel_path ?? undefined} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="gm-page" style={{ display: "flex", width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="favorites"
        defaultWidth={340}
        left={showList ? list : null}
        right={showDetail ? detail : null}
      />
    </div>
  );
}
