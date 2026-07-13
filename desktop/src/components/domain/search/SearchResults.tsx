import { useEffect, useRef } from "react";
import { Clipboard, FileText, FolderInput, MessageSquare, Search, Settings, StickyNote } from "lucide-react";
import { relativeTime } from "../../../utils/time";
import { useI18n } from "../../../hooks/useI18n";
import { EmptyState } from "../../base/EmptyState";
import type { AppIconTone } from "../../base/AppIcon";
import { ListPaneBody } from "../../layout/Pane";
import { SearchResultCard } from "./SearchResultCard";
import type { SearchResultItem } from "./searchLogic";

function sourceVisual(sourceType: string): { icon: typeof MessageSquare; tone: AppIconTone } {
  switch (sourceType) {
    case "conversation":
      return { icon: MessageSquare, tone: "accent" };
    case "clip":
      return { icon: Clipboard, tone: "success" };
    case "plan":
      return { icon: FileText, tone: "warning" };
    case "config":
      return { icon: Settings, tone: "secondary" };
    case "import":
      return { icon: FolderInput, tone: "teal" };
    default:
      return { icon: StickyNote, tone: "success" };
  }
}

interface SearchResultsProps {
  active: boolean;
  compact?: boolean;
  emptyDescription: string;
  loading: boolean;
  mobile: boolean;
  query: string;
  results: SearchResultItem[];
  searched: boolean;
  selectedFile: string | null;
  onOpen: (path: string) => void;
}

export function SearchResults({
  active,
  compact = false,
  emptyDescription,
  loading,
  mobile,
  query,
  results,
  searched,
  selectedFile,
  onOpen,
}: SearchResultsProps) {
  const { t } = useI18n();
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!active || !compact || !selectedFile) return;
    const frame = window.requestAnimationFrame(() => {
      const item = itemRefs.current.get(selectedFile);
      const activeElement = document.activeElement;
      const shouldMoveFocus = activeElement === document.body
        || (activeElement instanceof HTMLElement && activeElement.classList.contains("gm-search-result-card"));
      if (shouldMoveFocus) item?.focus({ preventScroll: true });
      item?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, compact, selectedFile]);

  const content = loading ? (
    <p className="gm-muted-text">{t("search.searching")}</p>
  ) : !searched ? (
    <EmptyState
      icon={Search}
      iconSize="empty-lg"
      title={mobile ? t("search.mobileEmptyTitle") : t("search.emptyTitle")}
      description={emptyDescription}
    />
  ) : results.length === 0 ? (
    <p className="gm-muted-text">{t("search.noResults", query)}</p>
  ) : (
    <>
      <p className="gm-search-result-count">{t("search.results", String(results.length))}</p>
      <div className="gm-search-result-stack">
        {results.map((result) => {
          const visual = sourceVisual(result.source_type);
          return (
            <SearchResultCard
              key={result.file_path}
              ref={(element) => {
                if (element) itemRefs.current.set(result.file_path, element);
                else itemRefs.current.delete(result.file_path);
              }}
              icon={visual.icon}
              iconTone={visual.tone}
              title={result.title}
              time={relativeTime(result.date, t)}
              snippet={result.snippet}
              active={selectedFile === result.file_path}
              onClick={() => onOpen(result.file_path)}
            />
          );
        })}
      </div>
    </>
  );

  if (compact) {
    return <ListPaneBody className="gm-search-review-results">{content}</ListPaneBody>;
  }

  return (
    <div className="gm-page-scroll gm-search-results" data-mobile={mobile ? "true" : "false"}>
      {content}
    </div>
  );
}
