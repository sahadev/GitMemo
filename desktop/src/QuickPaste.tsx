import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Search,
  TerminalSquare,
  FileSearch,
  MessageSquare,
  StickyNote,
  Clipboard,
  FileText,
  Settings,
  RefreshCw,
  PanelLeft,
} from "lucide-react";
import { useToast } from "./hooks/useToast";

interface SearchResultItem {
  source_type: string;
  title: string;
  file_path: string;
  snippet: string;
  date: string;
}

type Mode = "search" | "command" | "file";

type CommandId = "sync" | "search" | "clipboard" | "settings";

interface CommandItem {
  id: CommandId;
  title: string;
  subtitle: string;
}

const COMMANDS: CommandItem[] = [
  { id: "sync", title: "sync", subtitle: "Sync GitMemo to Git" },
  { id: "search", title: "search", subtitle: "Open main search page" },
  { id: "clipboard", title: "clipboard", subtitle: "Open clipboard page" },
  { id: "settings", title: "settings", subtitle: "Open settings page" },
];

function stripFrontmatter(content: string) {
  return content.replace(/^---[\s\S]*?---\s*/, "").trim();
}

function getMode(query: string): Mode {
  if (query.startsWith(">")) return "command";
  if (query.startsWith("@")) return "file";
  return "search";
}

function getQueryValue(query: string, mode: Mode) {
  if (mode === "search") return query.trim();
  return query.slice(1).trim();
}

function sourceIcon(sourceType: string) {
  switch (sourceType) {
    case "conversation":
      return <MessageSquare size={14} style={{ color: "var(--accent)" }} />;
    case "clip":
      return <Clipboard size={14} style={{ color: "var(--green)" }} />;
    case "plan":
      return <FileText size={14} style={{ color: "var(--yellow)" }} />;
    case "config":
      return <Settings size={14} style={{ color: "var(--text-secondary)" }} />;
    default:
      return <StickyNote size={14} style={{ color: "var(--green)" }} />;
  }
}

export default function QuickPaste() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [fileResults, setFileResults] = useState<SearchResultItem[]>([]);
  const [commandResults, setCommandResults] = useState<CommandItem[]>(COMMANDS);
  const inputRef = useRef<HTMLInputElement>(null);
  const windowRef = useRef(getCurrentWindow());
  const mainWindowRef = useRef<Window | null>(null);

  const mode = useMemo(() => getMode(query), [query]);
  const modeQuery = useMemo(() => getQueryValue(query, mode), [query, mode]);

  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const resetState = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setSearchResults([]);
    setFileResults([]);
    setCommandResults(COMMANDS);
    setLoading(false);
    focusInput();
  }, [focusInput]);

  const hideWindow = useCallback(async () => {
    await windowRef.current.hide();
  }, []);

  const ensureMainWindow = useCallback(async () => {
    if (mainWindowRef.current) return mainWindowRef.current;
    const main = await Window.getByLabel("main");
    mainWindowRef.current = main;
    return main;
  }, []);

  useEffect(() => {
    focusInput();
    const unlistenShow = listen("quick-paste-show", () => resetState());
    return () => {
      unlistenShow.then((fn) => fn());
    };
  }, [focusInput, resetState]);

  useEffect(() => {
    if (mode === "command") {
      const next = COMMANDS.filter((item) => item.title.includes(modeQuery.toLowerCase()));
      setCommandResults(next);
      setSelectedIndex(0);
      return;
    }

    if (!modeQuery) {
      if (mode === "search") setSearchResults([]);
      if (mode === "file") setFileResults([]);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        if (mode === "search") {
          const results = await invoke<SearchResultItem[]>("search_all", {
            query: modeQuery,
            typeFilter: null,
            limit: 8,
          });
          if (!cancelled) {
            setSearchResults(results);
            setSelectedIndex(0);
          }
        } else if (mode === "file") {
          const results = await invoke<SearchResultItem[]>("fuzzy_search_files", {
            query: modeQuery,
            limit: 10,
          });
          if (!cancelled) {
            setFileResults(results);
            setSelectedIndex(0);
          }
        }
      } catch (e) {
        if (!cancelled) {
          if (mode === "search") setSearchResults([]);
          if (mode === "file") setFileResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, modeQuery]);

  const visibleItems = useMemo(() => {
    if (mode === "command") return commandResults;
    if (mode === "file") return fileResults;
    return searchResults;
  }, [mode, commandResults, fileResults, searchResults]);

  const executeCommand = useCallback(async (command: CommandItem) => {
    try {
      if (command.id === "sync") {
        setLoading(true);
        const result = await invoke<string>("sync_to_git");
        showToast(result);
        await hideWindow();
        return;
      }

      const main = await ensureMainWindow();
      if (main) {
        await main.show();
        await main.setFocus();
        await main.emit("quick-paste-open-page", { page: command.id });
      }
      await hideWindow();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setLoading(false);
    }
  }, [ensureMainWindow, hideWindow, showToast]);

  const executeSearchResult = useCallback(async (item: SearchResultItem) => {
    try {
      const content = await invoke<string>("read_file", { filePath: item.file_path });
      await writeText(stripFrontmatter(content));
      showToast("Copied to clipboard");
      await hideWindow();
    } catch (e) {
      showToast(`Copy failed: ${e}`, true);
    }
  }, [hideWindow, showToast]);

  const executeFileResult = useCallback(async (item: SearchResultItem) => {
    try {
      const main = await ensureMainWindow();
      if (main) {
        await main.show();
        await main.setFocus();
        await main.emit("quick-paste-open-file", { filePath: item.file_path });
      }
      await hideWindow();
    } catch (e) {
      showToast(`Open failed: ${e}`, true);
    }
  }, [ensureMainWindow, hideWindow, showToast]);

  const executeSelected = useCallback(async () => {
    const item = visibleItems[selectedIndex];
    if (!item) return;

    if (mode === "command") return executeCommand(item as CommandItem);
    if (mode === "file") return executeFileResult(item as SearchResultItem);
    return executeSearchResult(item as SearchResultItem);
  }, [executeCommand, executeFileResult, executeSearchResult, mode, selectedIndex, visibleItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hideWindow();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((n) => Math.min(n + 1, Math.max(visibleItems.length - 1, 0)));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((n) => Math.max(n - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executeSelected, hideWindow, visibleItems.length]);

  const modeMeta = {
    search: {
      icon: <Search size={16} style={{ color: "var(--accent)" }} />,
      label: "Search",
      hint: "Search notes, conversations, clips",
    },
    command: {
      icon: <TerminalSquare size={16} style={{ color: "var(--yellow)" }} />,
      label: "Command",
      hint: "Run sync or jump to a page",
    },
    file: {
      icon: <FileSearch size={16} style={{ color: "var(--green)" }} />,
      label: "Files",
      hint: "Open a file in the main window",
    },
  }[mode];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.12)",
        padding: 20,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hideWindow();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          background: "rgba(10, 10, 10, 0.94)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          boxShadow: "0 20px 70px rgba(0,0,0,0.45)",
          backdropFilter: "blur(18px)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            {modeMeta.icon}
            <span style={{ fontSize: 12, fontWeight: 700, color: "#d4d4d4", letterSpacing: 0.4 }}>
              {modeMeta.label}
            </span>
            <span style={{ fontSize: 11, color: "#7b7b7b" }}>{modeMeta.hint}</span>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…  >command  @file"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              color: "#f3f3f3",
              fontSize: 20,
              lineHeight: 1.4,
              padding: "4px 0",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          />
        </div>

        <div style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
          {loading ? (
            <div style={{ padding: "18px 14px", color: "#8a8a8a", fontSize: 13 }}>Loading…</div>
          ) : visibleItems.length === 0 ? (
            <div style={{ padding: "18px 14px", color: "#8a8a8a", fontSize: 13 }}>
              {modeQuery ? "No results" : "Start typing to search"}
            </div>
          ) : mode === "command" ? (
            (visibleItems as CommandItem[]).map((item, index) => {
              const selected = index === selectedIndex;
              const icon =
                item.id === "sync" ? <RefreshCw size={14} style={{ color: "var(--accent)" }} /> :
                item.id === "settings" ? <Settings size={14} style={{ color: "var(--text-secondary)" }} /> :
                <PanelLeft size={14} style={{ color: "var(--green)" }} />;

              return (
                <button
                  key={item.id}
                  onClick={() => executeCommand(item)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    background: selected ? "rgba(79,156,247,0.18)" : "transparent",
                    color: "#f0f0f0",
                  }}
                >
                  {icon}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "#8a8a8a", marginTop: 2 }}>{item.subtitle}</div>
                  </div>
                </button>
              );
            })
          ) : (
            (visibleItems as SearchResultItem[]).map((item, index) => {
              const selected = index === selectedIndex;
              return (
                <button
                  key={`${item.file_path}-${index}`}
                  onClick={() => (mode === "file" ? executeFileResult(item) : executeSearchResult(item))}
                  style={{
                    width: "100%",
                    display: "block",
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    background: selected ? "rgba(79,156,247,0.18)" : "transparent",
                    color: "#f0f0f0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    {sourceIcon(item.source_type)}
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{item.title}</span>
                    <span style={{ fontSize: 10, color: "#8a8a8a" }}>{item.date}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#8a8a8a", lineHeight: 1.45 }}>
                    {mode === "file" ? item.file_path : item.snippet || item.file_path}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px 12px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "#777",
            fontSize: 11,
          }}
        >
          <span>↑↓ Select</span>
          <span>Enter Execute</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
