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
        background: "rgba(0,0,0,0.5)",
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
          borderRadius: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 6,
            background: "var(--accent)15",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
              {t("privacy.title")}
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {t("privacy.subtitle")}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              marginLeft: "auto", padding: 4, borderRadius: 4,
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
          borderRadius: 6, background: "var(--bg-hover)",
        }}>
          {["privacy.point1", "privacy.point2", "privacy.point3", "privacy.point4"].map(key => (
            <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Check size={14} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>
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
              flex: 1, padding: "10px 16px", borderRadius: 6,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text)", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("privacy.cancel")}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 6,
              border: "none", background: "var(--accent)",
              color: "#fff", fontSize: 13, fontWeight: 600,
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
