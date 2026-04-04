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
  FolderInput,
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
      return <MessageSquare size={13} style={{ color: "#6eb0f7" }} />;
    case "clip":
      return <Clipboard size={13} style={{ color: "#4ade80" }} />;
    case "plan":
      return <FileText size={13} style={{ color: "#facc15" }} />;
    case "config":
      return <Settings size={13} style={{ color: "#9ca3af" }} />;
    case "import":
      return <FolderInput size={13} style={{ color: "#14b8a6" }} />;
    default:
      return <StickyNote size={13} style={{ color: "#4ade80" }} />;
  }
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        padding: "1px 5px",
        fontSize: 10,
        fontFamily: "inherit",
        lineHeight: "16px",
        borderRadius: 4,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#888",
      }}
    >
      {children}
    </kbd>
  );
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
  const listRef = useRef<HTMLDivElement>(null);

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
      } catch {
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

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

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

      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        executeSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executeSelected, hideWindow, visibleItems.length]);

  const modeColors = { search: "#6eb0f7", command: "#facc15", file: "#4ade80" };
  const modeMeta = {
    search: { icon: <Search size={15} style={{ color: modeColors.search }} />, label: "Search" },
    command: { icon: <TerminalSquare size={15} style={{ color: modeColors.command }} />, label: "Command" },
    file: { icon: <FileSearch size={15} style={{ color: modeColors.file }} />, label: "Files" },
  }[mode];

  return (
    <div
      data-tauri-drag-region
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hideWindow();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "rgba(30, 30, 30, 0.96)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.06)",
          backdropFilter: "blur(40px) saturate(1.4)",
          overflow: "hidden",
        }}
      >
        {/* Input area */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
          {modeMeta.icon}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f0f0f0",
              fontSize: 16,
              lineHeight: 1.5,
              caretColor: modeColors[mode],
            }}
          />
          {loading && (
            <RefreshCw size={14} style={{ color: "#666", animation: "spin 1s linear infinite" }} />
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 340, overflowY: "auto", padding: "4px 6px" }}>
          {!loading && visibleItems.length === 0 ? (
            <div style={{ padding: "24px 10px", textAlign: "center", color: "#666", fontSize: 13 }}>
              {modeQuery ? "No results" : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <span>Type to search</span>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#555" }}>
                    <span><Kbd>&gt;</Kbd> commands</span>
                    <span><Kbd>@</Kbd> files</span>
                  </div>
                </div>
              )}
            </div>
          ) : mode === "command" ? (
            (visibleItems as CommandItem[]).map((item, index) => {
              const selected = index === selectedIndex;
              const icon =
                item.id === "sync" ? <RefreshCw size={14} style={{ color: "#6eb0f7" }} /> :
                item.id === "settings" ? <Settings size={14} style={{ color: "#9ca3af" }} /> :
                <PanelLeft size={14} style={{ color: "#4ade80" }} />;

              return (
                <button
                  key={item.id}
                  onClick={() => executeCommand(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    padding: "10px 10px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: selected ? "rgba(255,255,255,0.07)" : "transparent",
                    color: "#eee",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: "rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "#777", marginTop: 1 }}>{item.subtitle}</div>
                  </div>
                  {selected && <span style={{ fontSize: 10, color: "#555" }}>Enter</span>}
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
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    padding: "10px 10px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: selected ? "rgba(255,255,255,0.07)" : "transparent",
                    color: "#eee",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: "rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {sourceIcon(item.source_type)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      fontSize: 11, color: "#777", marginTop: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {mode === "file" ? item.file_path : item.snippet || item.file_path}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: "#555", flexShrink: 0 }}>{item.date}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            color: "#555",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Kbd>↵</Kbd> {mode === "search" ? "copy" : mode === "file" ? "open" : "run"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}
