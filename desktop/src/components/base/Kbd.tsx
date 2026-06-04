import type { ReactNode } from "react";

interface KbdProps {
  children: ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return <kbd className="gm-kbd">{children}</kbd>;
}
