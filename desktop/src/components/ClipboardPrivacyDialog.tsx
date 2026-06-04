import { useState, useCallback } from "react";
import { useI18n } from "../hooks/useI18n";
import { Shield, X, Check } from "lucide-react";
import { AppIcon } from "./base/AppIcon";
import { Button } from "./base/Button";

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
      className="gm-privacy-backdrop"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="gm-privacy-dialog"
      >
        <div className="gm-privacy-header">
          <div className="gm-privacy-icon">
            <AppIcon icon={Shield} size="xl" />
          </div>
          <div className="gm-privacy-copy">
            <h3 className="gm-privacy-title">
              {t("privacy.title")}
            </h3>
            <p className="gm-privacy-subtitle">
              {t("privacy.subtitle")}
            </p>
          </div>
          <Button
            variant="icon"
            onClick={onCancel}
            className="gm-privacy-close"
            icon={X}
            iconSize="sm"
          />
        </div>

        <div className="gm-privacy-points">
          {["privacy.point1", "privacy.point2", "privacy.point3", "privacy.point4"].map(key => (
            <div key={key} className="gm-privacy-point">
              <AppIcon icon={Check} size="xs" tone="success" />
              <span className="gm-privacy-point-text">
                {t(key)}
              </span>
            </div>
          ))}
        </div>

        <div className="gm-privacy-actions">
          <Button
            variant="secondary"
            onClick={onCancel}
          >
            {t("privacy.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
          >
            {t("privacy.enable")}
          </Button>
        </div>
      </div>
    </div>
  );
}
