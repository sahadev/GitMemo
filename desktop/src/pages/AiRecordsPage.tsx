import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Lightbulb, MessageSquare } from "lucide-react";
import ConversationsPage from "./ConversationsPage";
import PlansPage from "./PlansPage";
import { useAppStore, type AiRecordsTab } from "../hooks/useAppStore";
import { useI18n } from "../hooks/useI18n";
import { usePlatform } from "../hooks/usePlatform";
import { PaneTabHeader } from "../components/AppHeaders";

const tabs: { id: AiRecordsTab; labelKey: string; icon: typeof MessageSquare }[] = [
  { id: "conversations", labelKey: "nav.conversations", icon: MessageSquare },
  { id: "plans", labelKey: "nav.plans", icon: Lightbulb },
];

export default function AiRecordsPage({
  active = true,
  onFocusSidebar,
  enterTrigger,
  registerMobileBackHandler,
}: {
  active?: boolean;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const { t } = useI18n();
  const isMobile = usePlatform() === "mobile";
  const { aiRecordsTab: activeTab, setAiRecordsTab, pendingOpenPath } = useAppStore();
  const tabItems = useMemo(
    () => tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey), icon: tab.icon })),
    [t],
  );

  useEffect(() => {
    if (pendingOpenPath?.startsWith("conversations/")) setAiRecordsTab("conversations");
    if (pendingOpenPath?.startsWith("plans/")) setAiRecordsTab("plans");
  }, [pendingOpenPath, setAiRecordsTab]);

  const renderListHeader = useCallback((actions?: ReactNode) => (
    <PaneTabHeader
      tabs={tabItems}
      activeId={activeTab}
      onChange={setAiRecordsTab}
      actions={actions}
      isMobile={isMobile}
    />
  ), [activeTab, isMobile, setAiRecordsTab, tabItems]);

  const renderNoListHeader = useCallback(() => null, []);

  return (
    <div className="gm-ai-records-page">
      <div className="gm-ai-records-pane-mount" data-active={activeTab === "conversations" ? "true" : "false"}>
        <ConversationsPage
          active={active && activeTab === "conversations"}
          onFocusSidebar={onFocusSidebar}
          enterTrigger={enterTrigger}
          renderListHeader={activeTab === "conversations" ? renderListHeader : renderNoListHeader}
          registerMobileBackHandler={active && activeTab === "conversations" ? registerMobileBackHandler : undefined}
        />
      </div>
      <div className="gm-ai-records-pane-mount" data-active={activeTab === "plans" ? "true" : "false"}>
        <PlansPage
          active={active && activeTab === "plans"}
          onFocusSidebar={onFocusSidebar}
          enterTrigger={enterTrigger}
          renderListHeader={activeTab === "plans" ? renderListHeader : renderNoListHeader}
          registerMobileBackHandler={active && activeTab === "plans" ? registerMobileBackHandler : undefined}
        />
      </div>
    </div>
  );
}
