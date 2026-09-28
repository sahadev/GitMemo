import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import { SettingsCard, SettingsDivider, SettingsNavRow, SettingsStack } from "./SettingsComponents";

export interface SettingsSectionEntry<Id extends string = string> {
  id: Id;
  icon: LucideIcon;
  title: string;
  description: string;
}

interface SettingsNavListProps<Id extends string> {
  entries: SettingsSectionEntry<Id>[];
  onSelect: (id: Id) => void;
}

/** Top-level settings index: one row per sub-page. */
export function SettingsNavList<Id extends string>({ entries, onSelect }: SettingsNavListProps<Id>) {
  return (
    <SettingsCard>
      <SettingsStack>
        {entries.map((entry, index) => (
          <Fragment key={entry.id}>
            {index > 0 ? <SettingsDivider /> : null}
            <SettingsNavRow
              icon={entry.icon}
              title={entry.title}
              description={entry.description}
              onClick={() => onSelect(entry.id)}
            />
          </Fragment>
        ))}
      </SettingsStack>
    </SettingsCard>
  );
}
