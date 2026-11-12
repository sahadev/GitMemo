import type { CliStatus } from "../../hooks/useAppStore";
import type { AppIconTone } from "../../components/base/AppIcon";

export type CliStatusKind = "checking" | "missing" | "outdated" | "installed" | "updateAvailable";

export function isCliStatusKnown(cliStatus: CliStatus | null) {
  return cliStatus !== null;
}

export function isCliInstalled(cliStatus: CliStatus | null) {
  return cliStatus?.installed === true;
}

export function hasCliUpdateAvailable(cliStatus: CliStatus | null) {
  return isCliInstalled(cliStatus) && cliStatus?.update_available === true;
}

/**
 * True when the installed CLI is older than the capture-filter baseline. Such a
 * build commits every clipboard screenshot it finds, so it must not write the
 * repository until it is upgraded.
 */
export function isCliBelowMinimum(cliStatus: CliStatus | null) {
  return isCliInstalled(cliStatus) && cliStatus?.below_minimum === true;
}

export function getCliStatusKind(cliStatus: CliStatus | null): CliStatusKind {
  if (!isCliStatusKnown(cliStatus)) return "checking";
  if (!isCliInstalled(cliStatus)) return "missing";
  if (isCliBelowMinimum(cliStatus)) return "outdated";
  if (hasCliUpdateAvailable(cliStatus)) return "updateAvailable";
  return "installed";
}

export function needsCliAttention(cliStatus: CliStatus | null) {
  return (
    !isCliInstalled(cliStatus) ||
    isCliBelowMinimum(cliStatus) ||
    hasCliUpdateAvailable(cliStatus)
  );
}

export function getCliStatusTone(cliStatus: CliStatus | null): Extract<AppIconTone, "success" | "danger" | "warning" | "muted"> {
  const kind = getCliStatusKind(cliStatus);
  if (kind === "installed") return "success";
  if (kind === "outdated") return "danger";
  if (kind === "checking") return "muted";
  return "warning";
}
