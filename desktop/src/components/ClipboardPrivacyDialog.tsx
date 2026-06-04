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
          padding: "28px 24px",
          borderRadius: "var(--gm-radius-lg)",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--gm-shadow-modal)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--gm-radius-md)",
            background: "color-mix(in srgb, var(--accent) 14%, var(--bg-card))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={24} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--gm-font-md)", fontWeight: 700, marginBottom: 2 }}>
              {t("privacy.title")}
            </h3>
            <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
              {t("privacy.subtitle")}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              marginLeft: "auto", padding: 4, borderRadius: "var(--gm-radius-sm)",
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Points */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 12,
          marginBottom: 24, padding: "16px",
          borderRadius: "var(--gm-radius-md)", background: "var(--bg-hover)",
        }}>
          {["privacy.point1", "privacy.point2", "privacy.point3", "privacy.point4"].map(key => (
            <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Check size={14} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: "var(--gm-font-sm)", color: "var(--text)", lineHeight: 1.4 }}>
                {t(key)}
              </span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: "var(--gm-radius-md)",
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
              flex: 1, padding: "10px 16px", borderRadius: "var(--gm-radius-md)",
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
