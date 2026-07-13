import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { usePlatform } from "../hooks/usePlatform";

const splitPanelStorageKey = "desktop-split";
const splitPanelDefaultWidthFallback = 320;
const splitPanelMinWidthFallback = 260;
const splitPanelMaxWidthFallback = 560;
const splitPanelMinRightWidthFallback = 232;
const splitPanelHandleWidthFallback = 4;

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
  narrowDetailThreshold,
}: {
  panelKey: string;
  left: ReactNode;
  right: ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  narrowDetailThreshold?: number;
}) {
  const isMobile = usePlatform() === "mobile";
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const defaultWidth = readRootPxToken("--gm-size-split-pane-left-default", splitPanelDefaultWidthFallback);
  const minWidth = readRootPxToken("--gm-size-split-pane-left-min", splitPanelMinWidthFallback);
  const maxWidth = readRootPxToken("--gm-size-split-pane-left-max", splitPanelMaxWidthFallback);
  const minRightWidth = readRootPxToken("--gm-size-split-pane-right-min", splitPanelMinRightWidthFallback);
  const handleWidth = readRootPxToken("--gm-size-split-handle-width", splitPanelHandleWidthFallback);
  const responsiveMaxWidth = containerWidth > 0
    ? Math.max(minWidth, Math.min(maxWidth, containerWidth - minRightWidth - handleWidth))
    : maxWidth;
  const panel = useResizablePanel(
    splitPanelStorageKey,
    defaultWidth,
    minWidth,
    responsiveMaxWidth,
  );
  const splitStyle = { "--gm-split-pane-left-width": `${panel.width}px` } as CSSProperties;
  const detailWidth = containerWidth - panel.width - handleWidth;
  const hasNarrowDetail = !collapsed
    && narrowDetailThreshold !== undefined
    && containerWidth > 0
    && detailWidth < narrowDetailThreshold;

  useLayoutEffect(() => {
    if (isMobile) return;
    const splitPane = splitPaneRef.current;
    if (!splitPane) return;
    setContainerWidth(Math.floor(splitPane.getBoundingClientRect().width));
  });

  useLayoutEffect(() => {
    if (isMobile) return;
    const splitPane = splitPaneRef.current;
    if (!splitPane) return;
    const updateContainerWidth = () => setContainerWidth(Math.floor(splitPane.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateContainerWidth);
      return () => window.removeEventListener("resize", updateContainerWidth);
    }
    const observer = new ResizeObserver(updateContainerWidth);
    observer.observe(splitPane);
    return () => observer.disconnect();
  }, [isMobile]);

  if (isMobile) {
    return (
      <div className="gm-split-pane gm-split-pane-mobile">
        {left}
        {right}
      </div>
    );
  }

  return (
    <div
      ref={splitPaneRef}
      className="gm-split-pane"
      data-panel-key={panelKey}
      data-collapsed={collapsed ? "true" : "false"}
      data-narrow-detail={hasNarrowDetail ? "true" : "false"}
      style={splitStyle}
    >
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
