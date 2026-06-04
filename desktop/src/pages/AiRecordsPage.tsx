import { useCallback, useEffect, type ReactNode } from "react";
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

  useEffect(() => {
    if (pendingOpenPath?.startsWith("conversations/")) setAiRecordsTab("conversations");
    if (pendingOpenPath?.startsWith("plans/")) setAiRecordsTab("plans");
  }, [pendingOpenPath, setAiRecordsTab]);

  const renderListHeader = useCallback((actions?: ReactNode) => (
    <PaneTabHeader
      tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey), icon: tab.icon }))}
      activeId={activeTab}
      onChange={setAiRecordsTab}
      actions={actions}
      isMobile={isMobile}
    />
  ), [activeTab, isMobile, setAiRecordsTab, t]);

  if (activeTab === "plans") {
    return (
      <PlansPage
        active={active}
        onFocusSidebar={onFocusSidebar}
        enterTrigger={enterTrigger}
        renderListHeader={renderListHeader}
        registerMobileBackHandler={registerMobileBackHandler}
      />
    );
  }

  return (
    <ConversationsPage
      active={active}
      onFocusSidebar={onFocusSidebar}
      enterTrigger={enterTrigger}
      renderListHeader={renderListHeader}
      registerMobileBackHandler={registerMobileBackHandler}
    />
  );
}
