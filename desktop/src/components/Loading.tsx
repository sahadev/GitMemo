import { Loader2 } from "lucide-react";

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
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--accent)", flexShrink: 0 }} />
        {text && <span>{text}</span>}
      </div>
    );
  }

  return (
    <div className="gm-loading gm-loading-full">
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
      {text && <p className="gm-loading-text">{text}</p>}
    </div>
  );
}
