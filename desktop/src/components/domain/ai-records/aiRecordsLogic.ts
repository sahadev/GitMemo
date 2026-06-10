import type { AiRecordsTab } from "../../../hooks/useAppStore";

export function getAiRecordsTabForPendingPath(path: string | null | undefined): AiRecordsTab | null {
  if (path?.startsWith("conversations/")) return "conversations";
  if (path?.startsWith("plans/")) return "plans";
  return null;
}

export function isAiRecordsTabActive(activeTab: AiRecordsTab, tab: AiRecordsTab) {
  return activeTab === tab;
}

export function shouldRegisterAiRecordsMobileBackHandler(active: boolean, activeTab: AiRecordsTab, tab: AiRecordsTab) {
  return active && isAiRecordsTabActive(activeTab, tab);
}
