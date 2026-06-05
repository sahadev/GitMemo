import type { ReactNode } from "react";
import { DesktopSplitPane } from "../../DesktopSplitPane";
import { PageFrame } from "../../layout/PageFrame";

interface FileWorkspaceProps {
  panelKey: string;
  showList: boolean;
  showDetail: boolean;
  left: ReactNode;
  right: ReactNode;
}

export function FileWorkspace({
  panelKey,
  showList,
  showDetail,
  left,
  right,
}: FileWorkspaceProps) {
  return (
    <PageFrame>
      <DesktopSplitPane
        panelKey={panelKey}
        left={showList ? left : null}
        right={showDetail ? right : null}
      />
    </PageFrame>
  );
}
