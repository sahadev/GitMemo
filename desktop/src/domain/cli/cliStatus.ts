import type { CliStatus } from "../../hooks/useAppStore";
import type { AppIconTone } from "../../components/base/AppIcon";

export type CliStatusKind = "checking" | "missing" | "installed" | "updateAvailable";

export function isCliStatusKnown(cliStatus: CliStatus | null) {
  return cliStatus !== null;
}

export function isCliInstalled(cliStatus: CliStatus | null) {
  return cliStatus?.installed === true;
}

export function hasCliUpdateAvailable(cliStatus: CliStatus | null) {
  return isCliInstalled(cliStatus) && cliStatus?.update_available === true;
}

export function getCliStatusKind(cliStatus: CliStatus | null): CliStatusKind {
  if (!isCliStatusKnown(cliStatus)) return "checking";
  if (!isCliInstalled(cliStatus)) return "missing";
  if (hasCliUpdateAvailable(cliStatus)) return "updateAvailable";
  return "installed";
}

export function needsCliAttention(cliStatus: CliStatus | null) {
  return !isCliInstalled(cliStatus) || hasCliUpdateAvailable(cliStatus);
}

export function getCliStatusTone(cliStatus: CliStatus | null): Extract<AppIconTone, "success" | "warning" | "muted"> {
  const kind = getCliStatusKind(cliStatus);
  if (kind === "installed") return "success";
  if (kind === "checking") return "muted";
  return "warning";
}
