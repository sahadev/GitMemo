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
      return <MessageSquare size={14} style={{ color: "var(--gm-category-blue)" }} />;
    case "clip":
      return <Clipboard size={14} style={{ color: "var(--gm-category-green)" }} />;
    case "plan":
      return <FileText size={14} style={{ color: "var(--gm-category-yellow)" }} />;
    case "config":
      return <Settings size={14} style={{ color: "var(--gm-category-gray)" }} />;
    case "import":
      return <FolderInput size={14} style={{ color: "var(--gm-category-teal)" }} />;
    default:
      return <StickyNote size={14} style={{ color: "var(--gm-category-green)" }} />;
  }
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="gm-kbd">
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

  const modeColors = {
    search: "var(--gm-category-blue)",
    command: "var(--gm-category-yellow)",
    file: "var(--gm-category-green)",
  };
  const modeMeta = {
    search: { icon: <Search size={16} style={{ color: modeColors.search }} />, label: "Search" },
    command: { icon: <TerminalSquare size={16} style={{ color: modeColors.command }} />, label: "Command" },
    file: { icon: <FileSearch size={16} style={{ color: modeColors.file }} />, label: "Files" },
  }[mode];

  return (
    <div
      data-tauri-drag-region
      className="gm-quick-paste-shell"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hideWindow();
      }}
    >
      <div className="gm-quick-paste-panel">
        {/* Input area */}
        <div className="gm-quick-paste-input-row">
          {modeMeta.icon}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="gm-quick-paste-input"
            style={{
              caretColor: modeColors[mode],
            }}
          />
          {loading && (
            <RefreshCw size={14} style={{ color: "var(--text-secondary)", animation: "spin 1s linear infinite" }} />
          )}
        </div>

        {/* Divider */}
        <div className="gm-quick-paste-divider" />

        {/* Results */}
        <div ref={listRef} className="gm-quick-paste-list">
          {!loading && visibleItems.length === 0 ? (
            <div className="gm-quick-paste-empty">
              {modeQuery ? "No results" : (
                <div className="gm-quick-paste-empty-stack">
                  <span>Type to search</span>
                  <div className="gm-quick-paste-muted gm-quick-paste-empty-shortcuts">
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
                item.id === "sync" ? <RefreshCw size={14} style={{ color: "var(--gm-category-blue)" }} /> :
                item.id === "settings" ? <Settings size={14} style={{ color: "var(--gm-category-gray)" }} /> :
                <PanelLeft size={14} style={{ color: "var(--gm-category-green)" }} />;

              return (
                <button
                  key={item.id}
                  onClick={() => executeCommand(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`gm-quick-paste-result${selected ? " is-selected" : ""}`}
                  style={{
                    borderLeft: selected ? `2px solid ${modeColors.command}` : "2px solid transparent",
                  }}
                >
                  <div className="gm-quick-paste-icon">
                    {icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "var(--gm-font-sm)", fontWeight: 500 }}>{item.title}</div>
                    <div className="gm-quick-paste-muted" style={{ marginTop: "var(--gm-space-1)" }}>{item.subtitle}</div>
                  </div>
                  {selected && <span className="gm-quick-paste-muted">Enter</span>}
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
                  className={`gm-quick-paste-result${selected ? " is-selected" : ""}`}
                  style={{
                    borderLeft: selected ? `2px solid ${modeColors[mode]}` : "2px solid transparent",
                  }}
                >
                  <div className="gm-quick-paste-icon">
                    {sourceIcon(item.source_type)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: "var(--gm-font-sm)", fontWeight: 500,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      marginTop: "var(--gm-space-1)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} className="gm-quick-paste-muted">
                      {mode === "file" ? item.file_path : item.snippet || item.file_path}
                    </div>
                  </div>
                  <span className="gm-quick-paste-muted" style={{ flexShrink: 0 }}>{item.date}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="gm-quick-paste-footer">
          <span className="gm-quick-paste-footer-hint"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="gm-quick-paste-footer-hint"><Kbd>↵</Kbd> {mode === "search" ? "copy" : mode === "file" ? "open" : "run"}</span>
          <span className="gm-quick-paste-footer-hint gm-quick-paste-footer-hint-end"><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}
