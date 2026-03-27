import {
  LayoutDashboard,
  StickyNote,
  Clipboard,
  Search,
  GitBranch,
  RefreshCw,
  Sun,
  Moon,
} from "lucide-react";
import type { Page } from "../App";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  syncing: boolean;
  syncMsg: string;
  onSync: () => void;
}

const navItems: { id: Page; icon: typeof LayoutDashboard; label: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "notes", icon: StickyNote, label: "Notes" },
  { id: "clipboard", icon: Clipboard, label: "Clipboard" },
  { id: "search", icon: Search, label: "Search" },
];

export default function Sidebar({ currentPage, onNavigate, theme, onToggleTheme, syncing, syncMsg, onSync }: SidebarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 200,
        borderRight: "1px solid var(--border)",
        height: "100%",
        background: "var(--bg-card)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GitBranch size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>GitMemo</span>
        </div>
        <button
          onClick={onToggleTheme}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            color: "var(--text-secondary)",
          }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                fontSize: 13,
                background: active ? "var(--bg-hover)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s",
              }}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Sync button + version */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "8px 0",
            borderRadius: 6,
            fontSize: 12,
            background: syncing ? "var(--bg-hover)" : "var(--bg)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            cursor: syncing ? "default" : "pointer",
          }}
        >
          <RefreshCw size={13} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
          {syncing ? "Syncing..." : "Sync to Git"}
        </button>
        {syncMsg && (
          <p style={{ fontSize: 11, marginTop: 6, textAlign: "center", color: "var(--text-secondary)" }}>
            {syncMsg}
          </p>
        )}
        <p style={{ fontSize: 10, textAlign: "center", marginTop: 8, color: "var(--text-secondary)", opacity: 0.6 }}>
          GitMemo Desktop v0.2.0
        </p>
      </div>
    </div>
  );
}
