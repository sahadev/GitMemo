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
      <div className="gm-loading" style={{ gap: 8, padding: "20px 16px", fontSize: "var(--gm-font-xs)", justifyContent: "flex-start" }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--accent)", flexShrink: 0 }} />
        {text && <span>{text}</span>}
      </div>
    );
  }

  return (
    <div className="gm-loading" style={{
      flex: 1,
      flexDirection: "column",
      gap: 12,
      width: "100%",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      boxSizing: "border-box",
    }}>
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
      {text && <p style={{ fontSize: "var(--gm-font-sm)" }}>{text}</p>}
    </div>
  );
}
