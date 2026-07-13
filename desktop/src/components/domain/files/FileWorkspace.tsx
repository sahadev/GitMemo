import type { ReactNode } from "react";
import { DesktopSplitPane } from "../../DesktopSplitPane";
import { PageFrame } from "../../layout/PageFrame";
import { useAppStore } from "../../../hooks/useAppStore";

interface FileWorkspaceProps {
  panelKey: string;
  showList: boolean;
  showDetail: boolean;
  left: ReactNode;
  right: ReactNode;
  narrowDetailThreshold?: number;
}

export function FileWorkspace({
  panelKey,
  showList,
  showDetail,
  left,
  right,
  narrowDetailThreshold,
}: FileWorkspaceProps) {
  const { collapsedPanels, setPanelCollapsed } = useAppStore();
  const collapsed = collapsedPanels[panelKey] ?? false;

  return (
    <PageFrame>
      <DesktopSplitPane
        panelKey={panelKey}
        left={showList ? left : null}
        right={showDetail ? right : null}
        collapsed={collapsed}
        onCollapsedChange={(nextCollapsed) => setPanelCollapsed(panelKey, nextCollapsed)}
        narrowDetailThreshold={narrowDetailThreshold}
      />
    </PageFrame>
  );
}
