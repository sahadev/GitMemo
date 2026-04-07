import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import { useSync } from "../hooks/useSync";
import { ClipboardPrivacyDialog, useClipboardPrivacy } from "./ClipboardPrivacyDialog";
import {
  Check, StickyNote, Clipboard, Cloud, Code2, X, ChevronRight, PartyPopper,
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
  onWriteNote,
  hasNotes,
  clipboardActive,
  editorConfigured,
}: {
  onNavigate: (page: Page) => void;
  onWriteNote: () => void;
  hasNotes: boolean;
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
    if (hasNotes && !completed.has("note")) {
      completed.add("note");
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
  }, [hasNotes, clipboardActive, gitStatus, editorConfigured]);

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

  if (state.dismissed) return null;

  const allItems = ["install", "note", "clipboard", "remote", "editor"];
  const completedCount = allItems.filter(id => state.completed.includes(id)).length;
  const allDone = completedCount === allItems.length;

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

  const items: ChecklistItem[] = [
    {
      id: "install",
      icon: Check,
      iconColor: "var(--green)",
      labelKey: "onboarding.installDone",
      descKey: "onboarding.installDoneDesc",
    },
    {
      id: "note",
      icon: StickyNote,
      iconColor: "#c084fc",
      labelKey: "onboarding.writeNote",
      descKey: "onboarding.writeNoteDesc",
      action: onWriteNote,
      actionLabelKey: "onboarding.writeNow",
    },
    {
      id: "clipboard",
      icon: Clipboard,
      iconColor: "#f472b6",
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
      padding: "20px",
      borderRadius: 12,
      border: `1px solid ${allDone ? "var(--green)30" : "var(--accent)30"}`,
      background: allDone ? "var(--green)08" : "var(--accent)08",
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: allDone ? 0 : 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {allDone && <PartyPopper size={18} style={{ color: "var(--green)" }} />}
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
            {allDone ? t("onboarding.allDone") : t("onboarding.title")}
          </h3>
          {!allDone && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {completedCount}/{allItems.length}
            </span>
          )}
        </div>
        <button
          onClick={dismiss}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6,
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
          }}
        >
          <X size={12} /> {t("onboarding.dismiss")}
        </button>
      </div>

      {!allDone && (
        <>
        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: 2, background: "var(--border)",
          marginBottom: 16, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${(completedCount / allItems.length) * 100}%`,
            background: "var(--accent)",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => {
            const done = state.completed.includes(item.id);
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: done ? "transparent" : "var(--bg-card)",
                  border: done ? "none" : "1px solid var(--border)",
                  opacity: done ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `2px solid ${done ? "var(--green)" : "var(--border)"}`,
                  background: done ? "var(--green)15" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {done && <Check size={12} style={{ color: "var(--green)" }} />}
                </div>

                {/* Icon + text */}
                <Icon size={16} style={{ color: item.iconColor, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    textDecoration: done ? "line-through" : "none",
                    color: done ? "var(--text-secondary)" : "var(--text)",
                  }}>
                    {t(item.labelKey)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
                    {t(item.descKey)}
                  </div>
                </div>

                {/* Action button */}
                {!done && item.action && (
                  <button
                    onClick={item.action}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "6px 12px", borderRadius: 6,
                      border: "none", background: "var(--accent)",
                      color: "#fff", fontSize: 11, fontWeight: 600,
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
