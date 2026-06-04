import { Loader2 } from "lucide-react";
import { AppIcon } from "./base/AppIcon";

interface LoadingProps {
  /** Text shown below the spinner */
  text?: string;
  /** Compact mode for inline/list contexts (smaller, left-aligned) */
  compact?: boolean;
}

export function Loading({ text, compact }: LoadingProps) {
  if (compact) {
    return (
      <div className="gm-loading gm-loading-compact">
        <AppIcon icon={Loader2} size="xs" tone="accent" spin />
        {text && <span>{text}</span>}
      </div>
    );
  }

  return (
    <div className="gm-loading gm-loading-full">
      <AppIcon icon={Loader2} size="xl" tone="accent" spin />
      {text && <p className="gm-loading-text">{text}</p>}
    </div>
  );
}
