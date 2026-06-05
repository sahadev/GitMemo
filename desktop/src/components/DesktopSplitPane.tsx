import type { CSSProperties, ReactNode } from "react";
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
}: {
  panelKey: string;
  left: ReactNode;
  right: ReactNode;
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
    <div className="gm-split-pane" data-panel-key={panelKey} style={splitStyle}>
      <div className="gm-split-pane-left">
        {left}
      </div>
      <div onMouseDown={panel.onMouseDown} className="gm-split-resizer">
        <div className="gm-split-resizer-line" />
        <div className="gm-split-resizer-hit" />
      </div>
      <div className="gm-split-pane-right">
        {right}
      </div>
    </div>
  );
}
