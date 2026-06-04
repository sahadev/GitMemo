import { useState, useCallback } from "react";
import { useI18n } from "../hooks/useI18n";
import { Shield, X, Check } from "lucide-react";

const PRIVACY_CONFIRMED_KEY = "gitmemo-clipboard-privacy-confirmed";

export function useClipboardPrivacy() {
  const confirmed = localStorage.getItem(PRIVACY_CONFIRMED_KEY) === "true";
  return {
    isConfirmed: confirmed,
    confirm: () => localStorage.setItem(PRIVACY_CONFIRMED_KEY, "true"),
  };
}

export function ClipboardPrivacyDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--gm-overlay-soft)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "var(--gm-space-14) var(--gm-space-12)",
          borderRadius: "var(--gm-radius-lg)",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--gm-shadow-modal)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-space-6)", marginBottom: "var(--gm-space-10)" }}>
          <div style={{
            width: "var(--gm-icon-empty-lg)", height: "var(--gm-icon-empty-lg)", borderRadius: "var(--gm-radius-md)",
            background: "color-mix(in srgb, var(--accent) 14%, var(--bg-card))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size="var(--gm-icon-xl)" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--gm-font-md)", fontWeight: 700, marginBottom: "var(--gm-space-1)" }}>
              {t("privacy.title")}
            </h3>
            <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
              {t("privacy.subtitle")}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="gm-icon-button"
            style={{
              marginLeft: "auto",
              minHeight: "var(--gm-control-height-xs)",
              minWidth: "var(--gm-control-height-xs)",
            }}
          >
            <X size="var(--gm-icon-sm)" />
          </button>
        </div>

        {/* Points */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "var(--gm-space-6)",
          marginBottom: "var(--gm-space-12)", padding: "var(--gm-space-8)",
          borderRadius: "var(--gm-radius-md)", background: "var(--bg-hover)",
        }}>
          {["privacy.point1", "privacy.point2", "privacy.point3", "privacy.point4"].map(key => (
            <div key={key} style={{ display: "flex", gap: "var(--gm-space-5)", alignItems: "flex-start" }}>
              <Check size="var(--gm-icon-xs)" style={{ color: "var(--green)", flexShrink: 0, marginTop: "var(--gm-space-1)" }} />
              <span style={{ fontSize: "var(--gm-font-sm)", color: "var(--text)", lineHeight: "var(--gm-leading-normal)" }}>
                {t(key)}
              </span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "var(--gm-space-5)" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "var(--gm-space-5) var(--gm-space-8)", borderRadius: "var(--gm-radius-md)",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text)", fontSize: "var(--gm-font-sm)", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("privacy.cancel")}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: "var(--gm-space-5) var(--gm-space-8)", borderRadius: "var(--gm-radius-md)",
              border: "none", background: "var(--accent)",
              color: "var(--gm-color-on-accent)", fontSize: "var(--gm-font-sm)", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("privacy.enable")}
          </button>
        </div>
      </div>
    </div>
  );
}
