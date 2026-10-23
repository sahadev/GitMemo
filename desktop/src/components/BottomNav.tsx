import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  StickyNote,
  Settings,
  Clipboard,
  MessageSquare,
  Download,
  KeyRound,
  Brain,
  FileSymlink,
  MoreHorizontal,
  Search,
} from "lucide-react";
import type { Page } from "../App";
import { useI18n } from "../hooks/useI18n";
import { AppIcon } from "./base/AppIcon";

type NavItem = { id: Page; icon: typeof LayoutDashboard; labelKey: string };

/** 底部固定位只放每天点得最多的五个；其余进「更多」。 */
const primaryItems: NavItem[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { id: "notes", icon: StickyNote, labelKey: "nav.notes" },
  { id: "ai-records", icon: MessageSquare, labelKey: "nav.aiRecords" },
  { id: "clipboard", icon: Clipboard, labelKey: "nav.clipboard" },
];

/** 与侧边栏「更多」同一组入口，避免移动端另起一套概念。 */
const moreItems: NavItem[] = [
  { id: "search", icon: Search, labelKey: "nav.search" },
  { id: "vault", icon: KeyRound, labelKey: "nav.vault" },
  { id: "imports", icon: Download, labelKey: "nav.imports" },
  { id: "claude-config", icon: Brain, labelKey: "nav.claudeConfig" },
  { id: "external-files", icon: FileSymlink, labelKey: "nav.externalFiles" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

interface BottomNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [moreOpen]);

  const moreActive = moreItems.some((item) => item.id === currentPage);

  return (
    <nav className="gm-bottom-nav">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="gm-bottom-nav-item"
            data-active={currentPage === item.id ? "true" : "false"}
          >
            <AppIcon icon={Icon} size="md" />
            <span className="gm-bottom-nav-label">{t(item.labelKey)}</span>
          </button>
        );
      })}

      <div className="gm-bottom-nav-more" ref={moreRef}>
        <button
          type="button"
          className="gm-bottom-nav-item"
          data-active={moreActive ? "true" : "false"}
          aria-haspopup="menu"
          aria-expanded={moreOpen ? "true" : "false"}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <AppIcon icon={MoreHorizontal} size="md" />
          <span className="gm-bottom-nav-label">{t("nav.more")}</span>
        </button>
        {moreOpen ? (
          <div className="gm-menu-popover gm-bottom-nav-sheet" role="menu">
            {moreItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="gm-menu-item"
                  data-active={currentPage === item.id ? "true" : "false"}
                  onClick={() => {
                    setMoreOpen(false);
                    onNavigate(item.id);
                  }}
                >
                  <AppIcon icon={Icon} size="sm" />
                  <span>{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
