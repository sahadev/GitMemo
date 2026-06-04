import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { ClipboardPrivacyDialog, useClipboardPrivacy } from "./ClipboardPrivacyDialog";
import {
  Check, MessageSquare, Clipboard, Cloud, Code2, X, ChevronRight, PartyPopper,
} from "lucide-react";
import type { Page } from "../App";

interface ChecklistItem {
  id: string;
  icon: typeof Check;
  iconColor: string;
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
      iconColor: "var(--green)",
      labelKey: "onboarding.installDone",
      descKey: "onboarding.installDoneDesc",
    },
    {
      id: "save",
      icon: MessageSquare,
      iconColor: "var(--accent)",
      labelKey: "onboarding.firstSave",
      descKey: editorConfigured ? "onboarding.firstSaveDesc" : "onboarding.firstSaveNeedEditorDesc",
      action: editorConfigured ? undefined : () => onNavigate("settings"),
      actionLabelKey: editorConfigured ? undefined : "onboarding.goToSettings",
    },
    {
      id: "clipboard",
      icon: Clipboard,
      iconColor: "var(--pink)",
      labelKey: "onboarding.enableClipboard",
      descKey: "onboarding.enableClipboardDesc",
      action: startClipboard,
      actionLabelKey: "onboarding.enable",
    },
    {
      id: "remote",
      icon: Cloud,
      iconColor: "var(--accent)",
      labelKey: "onboarding.connectRemote",
      descKey: "onboarding.connectRemoteDesc",
      action: () => onNavigate("settings"),
      actionLabelKey: "onboarding.goToSettings",
    },
    {
      id: "editor",
      icon: Code2,
      iconColor: "var(--yellow)",
      labelKey: "onboarding.configureEditor",
      descKey: "onboarding.configureEditorDesc",
      action: () => onNavigate("settings"),
      actionLabelKey: "onboarding.goToSettings",
    },
  ];

  return (
    <>
    <div style={{
      padding: "var(--gm-section-gap-lg)",
      borderRadius: "var(--gm-radius-md)",
      border: `1px solid ${allDone ? "color-mix(in srgb, var(--green) 34%, var(--border))" : "color-mix(in srgb, var(--accent) 34%, var(--border))"}`,
      background: allDone
        ? "color-mix(in srgb, var(--green) 8%, var(--bg-card))"
        : "color-mix(in srgb, var(--accent) 8%, var(--bg-card))",
      marginBottom: "var(--gm-section-gap)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: allDone ? 0 : "var(--gm-section-gap)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-nav-item-gap)" }}>
          {allDone && <PartyPopper size={18} style={{ color: "var(--green)" }} />}
          <h3 style={{ fontSize: "var(--gm-font-md)", fontWeight: 700, marginBottom: "var(--gm-space-1)" }}>
            {allDone ? t("onboarding.allDone") : t("onboarding.title")}
          </h3>
          {!allDone && (
            <span style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
              {completedCount}/{allItems.length}
            </span>
          )}
        </div>
        <button
          onClick={dismiss}
          style={{
            display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
            padding: "var(--gm-control-pad-y) var(--gm-control-pad-x)", borderRadius: "var(--gm-radius-md)",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)", cursor: "pointer",
          }}
        >
          <X size={12} /> {allDone && countdown !== null ? `${countdown}s` : t("onboarding.dismiss")}
        </button>
      </div>

      {!allDone && (
        <>
        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: "var(--gm-radius-xs)", background: "var(--border)",
          marginBottom: "var(--gm-section-gap)", overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${(completedCount / allItems.length) * 100}%`,
            background: "var(--accent)",
            borderRadius: "var(--gm-radius-xs)",
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gm-icon-text-gap)" }}>
          {items.map(item => {
            const done = state.completed.includes(item.id);
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--gm-card-header-gap)",
                  padding: "var(--gm-row-pad-y-comfort) var(--gm-card-pad-mobile)",
                  borderRadius: "var(--gm-radius-md)",
                  background: done ? "transparent" : "var(--bg-card)",
                  border: done ? "none" : "1px solid var(--border)",
                  opacity: done ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: "var(--gm-radius-md)",
                  border: `2px solid ${done ? "var(--green)" : "var(--border)"}`,
                  background: done ? "color-mix(in srgb, var(--green) 14%, var(--bg-card))" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {done && <Check size={12} style={{ color: "var(--green)" }} />}
                </div>

                {/* Icon + text */}
                <Icon size={16} style={{ color: item.iconColor, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "var(--gm-font-sm)", fontWeight: 600,
                    textDecoration: done ? "line-through" : "none",
                    color: done ? "var(--text-secondary)" : "var(--text)",
                  }}>
                    {t(item.labelKey)}
                  </div>
                  <div style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: "var(--gm-space-1)" }}>
                    {t(item.descKey)}
                  </div>
                </div>

                {/* Action button */}
                {!done && item.action && (
                  <button
                    onClick={item.action}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--gm-space-2)",
                      padding: "var(--gm-control-pad-y) var(--gm-control-pad-x-lg)", borderRadius: "var(--gm-radius-md)",
                      border: "none", background: "var(--accent)",
                      color: "var(--gm-color-on-accent)", fontSize: "var(--gm-font-xs)", fontWeight: 600,
                      cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                    }}
                  >
                    {t(item.actionLabelKey!)} <ChevronRight size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
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
