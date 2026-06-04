import type { ReactNode } from "react";

interface ConversationMessageCardProps {
  role: "user" | "assistant";
  roleLabel: ReactNode;
  timestamp?: ReactNode;
  children: ReactNode;
}

export function ConversationMessageCard({
  role,
  roleLabel,
  timestamp,
  children,
}: ConversationMessageCardProps) {
  return (
    <article className="gm-conversation-message" data-role={role}>
      <div className="gm-conversation-message-head">
        <span className="gm-conversation-message-role">{roleLabel}</span>
        {timestamp ? <span className="gm-conversation-message-time">{timestamp}</span> : null}
      </div>
      {children}
    </article>
  );
}
