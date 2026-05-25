import { useEffect, useMemo } from "react";
import { Lightbulb, MessageSquare } from "lucide-react";
import ConversationsPage from "./ConversationsPage";
import PlansPage from "./PlansPage";
import { useAppStore, type AiRecordsTab } from "../hooks/useAppStore";
import { useI18n } from "../hooks/useI18n";
import { usePlatform } from "../hooks/usePlatform";

const tabs: { id: AiRecordsTab; labelKey: string; icon: typeof MessageSquare }[] = [
  { id: "conversations", labelKey: "nav.conversations", icon: MessageSquare },
  { id: "plans", labelKey: "nav.plans", icon: Lightbulb },
];

export default function AiRecordsPage({
  onFocusSidebar,
  enterTrigger,
  sidebarFocused,
  registerMobileBackHandler,
}: {
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  sidebarFocused?: boolean;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const { t } = useI18n();
  const isMobile = usePlatform() === "mobile";
  const { aiRecordsTab: activeTab, setAiRecordsTab, pendingOpenPath } = useAppStore();

  useEffect(() => {
    if (pendingOpenPath?.startsWith("conversations/")) setAiRecordsTab("conversations");
    if (pendingOpenPath?.startsWith("plans/")) setAiRecordsTab("plans");
  }, [pendingOpenPath, setAiRecordsTab]);

  const tabBar = useMemo(() => (
    <div style={{
      display: "flex",
      alignItems: "center",
      borderBottom: "1px solid var(--border)",
      padding: isMobile ? "0 10px" : "0 8px",
      flexShrink: 0,
    }}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setAiRecordsTab(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: isMobile ? "13px 4px" : "12px 4px",
              fontSize: isMobile ? 12 : 11,
              cursor: "pointer",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              background: "none",
              border: "none",
              borderBottomStyle: "solid",
              borderBottomWidth: 2,
              borderBottomColor: active ? "var(--accent)" : "transparent",
            }}
          >
            <Icon size={isMobile ? 15 : 12} />
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  ), [activeTab, isMobile, setAiRecordsTab, t]);

  if (activeTab === "plans") {
    return (
      <PlansPage
        onFocusSidebar={onFocusSidebar}
        enterTrigger={enterTrigger}
        listHeaderPrefix={tabBar}
        registerMobileBackHandler={registerMobileBackHandler}
      />
    );
  }

  return (
    <ConversationsPage
      onFocusSidebar={onFocusSidebar}
      enterTrigger={enterTrigger}
      sidebarFocused={sidebarFocused}
      listHeaderPrefix={tabBar}
      registerMobileBackHandler={registerMobileBackHandler}
    />
  );
}
