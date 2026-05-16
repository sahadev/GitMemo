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
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "20px 16px",
        color: "var(--text-secondary)",
        fontSize: 12,
      }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
        {text && <span>{text}</span>}
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      width: "100%",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      gap: 12,
      color: "var(--text-secondary)",
      boxSizing: "border-box",
    }}>
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
      {text && <p style={{ fontSize: 13 }}>{text}</p>}
    </div>
  );
}
