import type { ReactNode } from "react";
import { DesktopSplitPane } from "../../DesktopSplitPane";
import { PageFrame } from "../../layout/PageFrame";

interface FileWorkspaceProps {
  panelKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  showList: boolean;
  showDetail: boolean;
  left: ReactNode;
  right: ReactNode;
}

export function FileWorkspace({
  panelKey,
  defaultWidth,
  minWidth,
  maxWidth,
  showList,
  showDetail,
  left,
  right,
}: FileWorkspaceProps) {
  return (
    <PageFrame>
      <DesktopSplitPane
        panelKey={panelKey}
        defaultWidth={defaultWidth}
        minWidth={minWidth}
        maxWidth={maxWidth}
        left={showList ? left : null}
        right={showDetail ? right : null}
      />
    </PageFrame>
  );
}
