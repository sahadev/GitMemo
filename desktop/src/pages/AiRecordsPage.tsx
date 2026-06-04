import { useCallback, useEffect, type ReactNode } from "react";
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
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderBottom: "1px solid var(--border)",
      padding: isMobile ? "8px 10px" : "8px",
      flexShrink: 0,
      background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
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
              minHeight: isMobile ? 36 : 32,
              padding: isMobile ? "8px 8px" : "7px 8px",
              fontSize: "var(--gm-font-xs)",
              cursor: "pointer",
              color: active ? "var(--text)" : "var(--text-secondary)",
              background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
              border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 38%, var(--border))" : "transparent"}`,
              borderRadius: "var(--gm-radius-md)",
              fontWeight: active ? 700 : 500,
            }}
          >
            <Icon size={isMobile ? 16 : 12} style={{ color: active ? "var(--accent)" : "currentColor" }} />
            {t(tab.labelKey)}
          </button>
        );
      })}
      {actions ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {actions}
        </div>
      ) : null}
    </div>
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
