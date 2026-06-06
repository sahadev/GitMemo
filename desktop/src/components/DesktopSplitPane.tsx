import type { CSSProperties, ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { usePlatform } from "../hooks/usePlatform";

const splitPanelStorageKey = "desktop-split";
const splitPanelDefaultWidthFallback = 320;
const splitPanelMinWidthFallback = 260;
const splitPanelMaxWidthFallback = 560;

function readRootPxToken(token: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function DesktopSplitPane({
  panelKey,
  left,
  right,
  collapsed = false,
  onCollapsedChange,
}: {
  panelKey: string;
  left: ReactNode;
  right: ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const isMobile = usePlatform() === "mobile";
  const defaultWidth = readRootPxToken("--gm-size-split-pane-left-default", splitPanelDefaultWidthFallback);
  const minWidth = readRootPxToken("--gm-size-split-pane-left-min", splitPanelMinWidthFallback);
  const maxWidth = readRootPxToken("--gm-size-split-pane-left-max", splitPanelMaxWidthFallback);
  const panel = useResizablePanel(
    splitPanelStorageKey,
    defaultWidth,
    minWidth,
    maxWidth,
  );
  const splitStyle = { "--gm-split-pane-left-width": `${panel.width}px` } as CSSProperties;

  if (isMobile) {
    return (
      <div className="gm-split-pane gm-split-pane-mobile">
        {left}
        {right}
      </div>
    );
  }

  return (
    <div className="gm-split-pane" data-panel-key={panelKey} data-collapsed={collapsed ? "true" : "false"} style={splitStyle}>
      <div className="gm-split-pane-left" aria-hidden={collapsed ? "true" : undefined}>
        {!collapsed && left}
      </div>
      <div onMouseDown={collapsed ? undefined : panel.onMouseDown} className="gm-split-resizer" data-collapsed={collapsed ? "true" : "false"}>
        <div className="gm-split-resizer-line" />
        <div className="gm-split-resizer-hit" />
        {onCollapsedChange && (
          <button
            type="button"
            className="gm-layout-boundary-toggle gm-split-boundary-toggle"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCollapsedChange(!collapsed);
            }}
            title={collapsed ? "展开列表" : "收起列表"}
            aria-label={collapsed ? "展开列表" : "收起列表"}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        )}
      </div>
      <div className="gm-split-pane-right">
        {right}
      </div>
    </div>
  );
}
