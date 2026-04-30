import type { CSSProperties, ReactNode } from "react";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { usePlatform } from "../hooks/usePlatform";

const desktopPaneStyle: CSSProperties = {
  display: "flex",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  flex: 1,
};

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
    return <>{left}{right}</>;
  }

  return (
    <div style={desktopPaneStyle}>
      <div style={{ width: panel.width, display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 0, minHeight: 0 }}>
        {left}
      </div>
      <div onMouseDown={panel.onMouseDown} style={panel.handleStyle}>
        <div style={panel.handleHoverStyle} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {right}
      </div>
    </div>
  );
}
