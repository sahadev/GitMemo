import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Eye, EyeOff, KeyRound, Lock, RefreshCw, ShieldCheck, Trash2, Unlock } from "lucide-react";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { Loading } from "../components/Loading";
import { useAppStore } from "../hooks/useAppStore";
import { useI18n } from "../hooks/useI18n";
import { useTimedCopy } from "../hooks/useTimedCopy";
import { useToast } from "../hooks/useToast";
import { relativeTime } from "../utils/time";

type VaultEntryKind = "password" | "api_key" | "token" | "jwt" | "private_key" | "keystore_password" | "secret";

interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
  entries_count: number;
}

interface VaultEntryMeta {
  id: string;
  title: string;
  kind: VaultEntryKind;
  source: string;
  tags: string[];
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

interface VaultEntryDetail {
  meta: VaultEntryMeta;
  secret: string;
  note: string;
}

function kindLabel(kind: VaultEntryKind) {
  return kind.replace(/_/g, " ");
}

export default function VaultPage({ active = true }: { active?: boolean } = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { copied, markCopied } = useTimedCopy<string>();
  const { settings, refreshSettings } = useAppStore();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntryMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VaultEntryDetail | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  const loadVault = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextEntries] = await Promise.all([
        invoke<VaultStatus>("get_vault_status"),
        invoke<VaultEntryMeta[]>("list_vault_entries"),
      ]);
      setStatus(nextStatus);
      setEntries(nextEntries);
      setSelectedId((current) => current && nextEntries.some((entry) => entry.id === current) ? current : nextEntries[0]?.id ?? null);
      if (!nextStatus.unlocked) setDetail(null);
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (active) void loadVault();
  }, [active, loadVault]);

  const enableVaultMode = async () => {
    setBusy(true);
    try {
      await invoke<string>("set_vault_enabled", { enabled: true });
      await refreshSettings();
      showToast(t("vault.enabled"));
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    const value = password.trim();
    if (!value) return;
    setBusy(true);
    try {
      const command = status?.initialized ? "unlock_vault" : "init_vault";
      const next = await invoke<VaultStatus>(command, { password: value });
      setStatus(next);
      setPassword("");
      if (!settings?.vault_enabled) {
        await invoke<string>("set_vault_enabled", { enabled: true });
        await refreshSettings();
      }
      await loadVault();
      showToast(status?.initialized ? t("vault.unlocked") : t("vault.created"));
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setBusy(false);
    }
  };

  const lockVault = async () => {
    setBusy(true);
    try {
      const next = await invoke<VaultStatus>("lock_vault");
      setStatus(next);
      setDetail(null);
      showToast(t("vault.locked"));
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setBusy(false);
    }
  };

  const revealEntry = async (entry: VaultEntryMeta) => {
    setRevealing(true);
    try {
      const next = await invoke<VaultEntryDetail>("reveal_vault_entry", { id: entry.id });
      setDetail(next);
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setRevealing(false);
    }
  };

  const copySecret = async () => {
    if (!detail?.secret) return;
    await writeText(detail.secret);
    markCopied(detail.meta.id);
    showToast(t("vault.copied"));
    const copiedSecret = detail.secret;
    window.setTimeout(() => {
      void readText().then((current) => {
        if (current === copiedSecret) void writeText("");
      }).catch(() => {});
    }, 30_000);
  };

  const deleteEntry = async (entry: VaultEntryMeta) => {
    const ok = await ask(t("vault.deleteConfirm"), { title: t("vault.delete"), kind: "warning" });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke<string>("delete_vault_entry", { id: entry.id });
      if (detail?.meta.id === entry.id) setDetail(null);
      await loadVault();
      showToast(t("vault.deleted"));
    } catch (e) {
      showToast(`${e}`, true);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  const vaultEnabled = settings?.vault_enabled ?? false;
  const unlocked = status?.unlocked ?? false;
  const initialized = status?.initialized ?? false;

  return (
    <div className="gm-page gm-vault-page">
      <section className="gm-vault-list-pane">
        <PaneHeader
          icon={KeyRound}
          title={t("vault.title")}
          actions={(
            <>
              <Button variant="toolbar" icon={RefreshCw} title={t("common.refresh")} onClick={() => void loadVault()} />
              {unlocked ? (
                <Button variant="toolbar" icon={Lock} title={t("vault.lock")} onClick={() => void lockVault()} />
              ) : null}
            </>
          )}
        />

        {!vaultEnabled ? (
          <div className="gm-vault-empty-wrap">
            <EmptyState icon={ShieldCheck} title={t("vault.disabled")} description={t("vault.disabledDesc")}>
              <Button variant="primary" icon={ShieldCheck} onClick={() => void enableVaultMode()} disabled={busy}>
                {t("vault.enable")}
              </Button>
            </EmptyState>
          </div>
        ) : !unlocked ? (
          <div className="gm-vault-unlock-panel">
            <AppIcon icon={initialized ? Lock : KeyRound} size="empty" tone="accent" />
            <div className="gm-vault-unlock-copy">
              <p className="gm-vault-unlock-title">{initialized ? t("vault.unlockTitle") : t("vault.createTitle")}</p>
              <p className="gm-vault-unlock-desc">{initialized ? t("vault.unlockDesc") : t("vault.createDesc")}</p>
            </div>
            <div className="gm-vault-unlock-form">
              <input
                className="gm-settings-input gm-vault-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void submitPassword();
                }}
                placeholder={t("vault.passwordPlaceholder")}
              />
              <Button variant="primary" icon={initialized ? Unlock : KeyRound} disabled={busy || !password.trim()} onClick={() => void submitPassword()}>
                {initialized ? t("vault.unlock") : t("vault.create")}
              </Button>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="gm-vault-empty-wrap">
            <EmptyState icon={KeyRound} title={t("vault.empty")} description={t("vault.emptyDesc")} />
          </div>
        ) : (
          <div className="gm-vault-list">
            {entries.map((entry) => {
              const activeEntry = selectedEntry?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="gm-vault-entry"
                  data-active={activeEntry ? "true" : "false"}
                  onClick={() => {
                    setSelectedId(entry.id);
                    setDetail(null);
                  }}
                >
                  <span className="gm-vault-entry-icon"><AppIcon icon={KeyRound} size="xs" /></span>
                  <span className="gm-vault-entry-main">
                    <span className="gm-vault-entry-title">{entry.title}</span>
                    <span className="gm-vault-entry-meta">{kindLabel(entry.kind)} · {relativeTime(entry.updated_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="gm-vault-detail-pane">
        {!selectedEntry ? (
          <EmptyState icon={KeyRound} title={t("vault.selectEntry")} full />
        ) : !unlocked ? (
          <EmptyState icon={Lock} title={t("vault.lockedState")} description={t("vault.lockedStateDesc")} full />
        ) : (
          <article className="gm-vault-detail">
            <header className="gm-vault-detail-header">
              <div>
                <p className="gm-vault-detail-kicker">{kindLabel(selectedEntry.kind)}</p>
                <h2 className="gm-vault-detail-title">{selectedEntry.title}</h2>
                <p className="gm-vault-detail-meta">{selectedEntry.source} · {relativeTime(selectedEntry.updated_at)}</p>
              </div>
              <div className="gm-vault-detail-actions">
                {detail ? (
                  <Button variant="toolbar" icon={EyeOff} title={t("vault.hide")} onClick={() => setDetail(null)} />
                ) : (
                  <Button variant="toolbar" icon={Eye} title={t("vault.reveal")} disabled={revealing} onClick={() => void revealEntry(selectedEntry)} />
                )}
                <Button variant="toolbar" icon={Trash2} tone="danger" title={t("vault.delete")} disabled={busy} onClick={() => void deleteEntry(selectedEntry)} />
              </div>
            </header>

            {detail ? (
              <>
                <pre className="gm-vault-secret">{detail.secret}</pre>
                <div className="gm-vault-detail-footer">
                  <Button variant="primary" icon={Copy} onClick={() => void copySecret()}>
                    {copied === detail.meta.id ? t("common.copied") : t("vault.copy")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="gm-vault-secret-placeholder">
                <AppIcon icon={Lock} size="empty" tone="empty" />
                <p>{t("vault.hidden")}</p>
              </div>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
