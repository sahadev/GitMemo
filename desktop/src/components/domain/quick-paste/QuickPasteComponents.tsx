import type { MouseEventHandler, ReactNode } from "react";
import {
  Clipboard,
  FileSearch,
  FileText,
  FolderInput,
  MessageSquare,
  PanelLeft,
  RefreshCw,
  Search,
  Settings,
  StickyNote,
  TerminalSquare,
} from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";

type QuickPasteTone = "search" | "command" | "file";

const modeIcons = {
  search: { icon: Search, tone: "blue" },
  command: { icon: TerminalSquare, tone: "warning" },
  file: { icon: FileSearch, tone: "success" },
} satisfies Record<QuickPasteTone, { icon: typeof Search; tone: AppIconTone }>;

export function QuickPasteModeIcon({ mode }: { mode: QuickPasteTone }) {
  const meta = modeIcons[mode];
  return <AppIcon icon={meta.icon} tone={meta.tone} />;
}

export function QuickPasteLoadingIcon() {
  return <AppIcon icon={RefreshCw} size="xs" tone="secondary" spin />;
}

export function QuickPasteSourceIcon({ sourceType }: { sourceType: string }) {
  switch (sourceType) {
    case "conversation":
      return <AppIcon icon={MessageSquare} size="xs" tone="blue" />;
    case "clip":
      return <AppIcon icon={Clipboard} size="xs" tone="success" />;
    case "plan":
      return <AppIcon icon={FileText} size="xs" tone="warning" />;
    case "config":
      return <AppIcon icon={Settings} size="xs" tone="gray" />;
    case "import":
      return <AppIcon icon={FolderInput} size="xs" tone="teal" />;
    default:
      return <AppIcon icon={StickyNote} size="xs" tone="success" />;
  }
}

export function QuickPasteCommandIcon({ commandId }: { commandId: string }) {
  if (commandId === "sync") return <AppIcon icon={RefreshCw} size="xs" tone="blue" />;
  if (commandId === "settings") return <AppIcon icon={Settings} size="xs" tone="gray" />;
  return <AppIcon icon={PanelLeft} size="xs" tone="success" />;
}

interface QuickPasteResultButtonProps {
  selected: boolean;
  tone: QuickPasteTone;
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  meta?: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onMouseEnter: MouseEventHandler<HTMLButtonElement>;
}

export function QuickPasteResultButton({
  selected,
  tone,
  icon,
  title,
  subtitle,
  meta,
  onClick,
  onMouseEnter,
}: QuickPasteResultButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="gm-quick-paste-result"
      data-selected={selected ? "true" : "false"}
      data-tone={tone}
    >
      <div className="gm-quick-paste-icon">{icon}</div>
      <div className="gm-quick-paste-result-main">
        <div className="gm-quick-paste-result-title">{title}</div>
        <div className="gm-quick-paste-muted gm-quick-paste-result-subtitle">{subtitle}</div>
      </div>
      {meta ? <span className="gm-quick-paste-muted gm-quick-paste-result-meta">{meta}</span> : null}
    </button>
  );
}
