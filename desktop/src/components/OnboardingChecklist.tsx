import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { ClipboardPrivacyDialog, useClipboardPrivacy } from "./ClipboardPrivacyDialog";
import {
  Check, MessageSquare, Clipboard, Cloud, Code2,
} from "lucide-react";
import type { Page } from "../App";
import {
  OnboardingActionButton,
  OnboardingCard,
  OnboardingCheck,
  OnboardingDismissButton,
  OnboardingHeader,
  OnboardingItemCopy,
  OnboardingItemIcon,
  OnboardingItemRow,
  OnboardingList,
  OnboardingProgress,
  OnboardingTitleRow,
} from "./domain/onboarding/OnboardingChecklistComponents";
import {
  DEFAULT_ONBOARDING_STATE,
  completeOnboardingItem,
  dismissOnboarding,
  getAutoCompletedOnboardingItems,
  getFirstSaveActionLabelKey,
  getFirstSaveDescriptionKey,
  getOnboardingCountLabel,
  getOnboardingProgressValue,
  getOnboardingTitleKey,
  hasOnboardingItemCompleted,
  hasOnboardingRemoteConfigured,
  isOnboardingDone,
  mergeOnboardingCompletion,
  shouldRenderOnboardingChecklist,
  shouldRunOnboardingAutoDismissCountdown,
  shouldShowOnboardingItemAction,
  type OnboardingItemId,
  type OnboardingState,
} from "./domain/onboarding/onboardingLogic";

interface ChecklistItem {
  id: OnboardingItemId;
  icon: typeof Check;
  iconTone: "success" | "accent" | "pink" | "yellow";
  labelKey: string;
  descKey: string;
  action?: () => void;
  actionLabelKey?: string;
}

const STORAGE_KEY = "gitmemo-onboarding-state";

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_ONBOARDING_STATE;
}

function saveState(state: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function OnboardingChecklist({
  onNavigate,
  hasConversations,
  clipboardActive,
  editorConfigured,
}: {
  onNavigate: (page: Page) => void;
  hasConversations: boolean;
  clipboardActive: boolean;
  editorConfigured: boolean;
}) {
  const { t } = useI18n();
  const { gitStatus } = useSync();
  const privacy = useClipboardPrivacy();
  const [state, setState] = useState<OnboardingState>(loadState);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);

  // Auto-check conditions
  useEffect(() => {
    const { changed, state: newState } = mergeOnboardingCompletion(
      state,
      getAutoCompletedOnboardingItems({
        hasConversations,
        clipboardActive,
        remoteConfigured: hasOnboardingRemoteConfigured(gitStatus?.git_remote),
        editorConfigured,
      }),
    );
    if (changed) {
      setState(newState);
      saveState(newState);
    }
  }, [hasConversations, clipboardActive, gitStatus?.git_remote, editorConfigured, state]);

  const markCompleted = useCallback((id: OnboardingItemId) => {
    setState(prev => {
      const newState = completeOnboardingItem(prev, id);
      if (newState !== prev) saveState(newState);
      return newState;
    });
  }, []);

  const dismiss = useCallback(() => {
    const newState = dismissOnboarding(state);
    setState(newState);
    saveState(newState);
  }, [state]);

  const doStartClipboard = useCallback(async () => {
    try {
      await invoke("start_clipboard_watch");
      markCompleted("clipboard");
    } catch { /* ignore */ }
  }, [markCompleted]);

  const startClipboard = useCallback(() => {
    if (!privacy.isConfirmed) {
      setShowPrivacyDialog(true);
      return;
    }
    void doStartClipboard();
  }, [privacy.isConfirmed, doStartClipboard]);

  const allDone = isOnboardingDone(state);

  // Auto-dismiss countdown when all done
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!shouldRunOnboardingAutoDismissCountdown(state)) {
      setCountdown(null);
      return;
    }
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // Auto-dismiss
          const newState = dismissOnboarding(state);
          setState(newState);
          saveState(newState);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  if (!shouldRenderOnboardingChecklist(state)) return null;

  const items: ChecklistItem[] = [
    {
      id: "install",
      icon: Check,
      iconTone: "success",
      labelKey: "onboarding.installDone",
      descKey: "onboarding.installDoneDesc",
    },
    {
      id: "save",
      icon: MessageSquare,
      iconTone: "accent",
      labelKey: "onboarding.firstSave",
      descKey: getFirstSaveDescriptionKey(editorConfigured),
      action: editorConfigured ? undefined : () => onNavigate("settings"),
      actionLabelKey: getFirstSaveActionLabelKey(editorConfigured),
    },
    {
      id: "clipboard",
      icon: Clipboard,
      iconTone: "pink",
      labelKey: "onboarding.enableClipboard",
      descKey: "onboarding.enableClipboardDesc",
      action: startClipboard,
      actionLabelKey: "onboarding.enable",
    },
    {
      id: "remote",
      icon: Cloud,
      iconTone: "accent",
      labelKey: "onboarding.connectRemote",
      descKey: "onboarding.connectRemoteDesc",
      action: () => onNavigate("settings"),
      actionLabelKey: "onboarding.goToSettings",
    },
    {
      id: "editor",
      icon: Code2,
      iconTone: "yellow",
      labelKey: "onboarding.configureEditor",
      descKey: "onboarding.configureEditorDesc",
      action: () => onNavigate("settings"),
      actionLabelKey: "onboarding.goToSettings",
    },
  ];

  return (
    <>
    <OnboardingCard done={allDone}>
      <OnboardingHeader done={allDone}>
        <OnboardingTitleRow
          done={allDone}
          title={t(getOnboardingTitleKey(state))}
          count={getOnboardingCountLabel(state)}
        />
        <OnboardingDismissButton onClick={dismiss}>
          {allDone && countdown !== null ? `${countdown}s` : t("onboarding.dismiss")}
        </OnboardingDismissButton>
      </OnboardingHeader>

      {!allDone && (
        <>
        <OnboardingProgress value={getOnboardingProgressValue(state)} />

        <OnboardingList>
          {items.map(item => {
            const done = hasOnboardingItemCompleted(state, item.id);
            const Icon = item.icon;
            return (
              <OnboardingItemRow
                key={item.id}
                done={done}
              >
                <OnboardingCheck done={done} />
                <OnboardingItemIcon icon={Icon} tone={item.iconTone} />
                <OnboardingItemCopy
                  done={done}
                  title={t(item.labelKey)}
                  description={t(item.descKey)}
                />

                {shouldShowOnboardingItemAction(done, Boolean(item.action)) && item.action && (
                  <OnboardingActionButton onClick={item.action}>
                    {t(item.actionLabelKey!)}
                  </OnboardingActionButton>
                )}
              </OnboardingItemRow>
            );
          })}
        </OnboardingList>
        </>
      )}
    </OnboardingCard>
    {showPrivacyDialog && (
      <ClipboardPrivacyDialog
        onConfirm={() => {
          privacy.confirm();
          setShowPrivacyDialog(false);
          void doStartClipboard();
        }}
        onCancel={() => setShowPrivacyDialog(false)}
      />
    )}
    </>
  );
}
