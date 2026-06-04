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

interface ChecklistItem {
  id: string;
  icon: typeof Check;
  iconTone: "success" | "accent" | "pink" | "yellow";
  labelKey: string;
  descKey: string;
  action?: () => void;
  actionLabelKey?: string;
}

const STORAGE_KEY = "gitmemo-onboarding-state";

interface OnboardingState {
  dismissed: boolean;
  completed: string[];
}

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { dismissed: false, completed: ["install"] };
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
    const completed = new Set(state.completed);
    let changed = false;

    if (!completed.has("install")) {
      completed.add("install");
      changed = true;
    }
    if (hasConversations && !completed.has("save")) {
      completed.add("save");
      changed = true;
    }
    if (clipboardActive && !completed.has("clipboard")) {
      completed.add("clipboard");
      changed = true;
    }
    if (gitStatus?.git_remote && !completed.has("remote")) {
      completed.add("remote");
      changed = true;
    }
    if (editorConfigured && !completed.has("editor")) {
      completed.add("editor");
      changed = true;
    }

    if (changed) {
      const newState = { ...state, completed: Array.from(completed) };
      setState(newState);
      saveState(newState);
    }
  }, [hasConversations, clipboardActive, gitStatus, editorConfigured]);

  const markCompleted = useCallback((id: string) => {
    setState(prev => {
      const newState = {
        ...prev,
        completed: prev.completed.includes(id) ? prev.completed : [...prev.completed, id],
      };
      saveState(newState);
      return newState;
    });
  }, []);

  const dismiss = useCallback(() => {
    const newState = { ...state, dismissed: true };
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

  const allItems = ["install", "save", "clipboard", "remote", "editor"];
  const completedCount = allItems.filter(id => state.completed.includes(id)).length;
  const allDone = completedCount === allItems.length;

  // Auto-dismiss countdown when all done
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!allDone || state.dismissed) {
      setCountdown(null);
      return;
    }
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // Auto-dismiss
          const newState = { ...state, dismissed: true };
          setState(newState);
          saveState(newState);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [allDone]);

  if (state.dismissed) return null;

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
      descKey: editorConfigured ? "onboarding.firstSaveDesc" : "onboarding.firstSaveNeedEditorDesc",
      action: editorConfigured ? undefined : () => onNavigate("settings"),
      actionLabelKey: editorConfigured ? undefined : "onboarding.goToSettings",
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
          title={allDone ? t("onboarding.allDone") : t("onboarding.title")}
          count={`${completedCount}/${allItems.length}`}
        />
        <OnboardingDismissButton onClick={dismiss}>
          {allDone && countdown !== null ? `${countdown}s` : t("onboarding.dismiss")}
        </OnboardingDismissButton>
      </OnboardingHeader>

      {!allDone && (
        <>
        <OnboardingProgress value={(completedCount / allItems.length) * 100} />

        <OnboardingList>
          {items.map(item => {
            const done = state.completed.includes(item.id);
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

                {!done && item.action && (
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
