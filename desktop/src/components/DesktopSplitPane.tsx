import type { ReactNode } from "react";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { usePlatform } from "../hooks/usePlatform";

export function DesktopSplitPane({
  panelKey,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  left,
  right,
}: {
  panelKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  left: ReactNode;
  right: ReactNode;
}) {
  const isMobile = usePlatform() === "mobile";
  const panel = useResizablePanel(panelKey, defaultWidth, minWidth, maxWidth);

  if (isMobile) {
    return (
      <div className="gm-split-pane gm-split-pane-mobile">
        {left}
        {right}
      </div>
    );
  }

  return (
    <div className="gm-split-pane">
      <div className="gm-split-pane-left" style={{ width: panel.width }}>
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
