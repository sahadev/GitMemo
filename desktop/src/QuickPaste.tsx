import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Kbd } from "./components/base/Kbd";
import {
  QuickPasteCommandIcon,
  QuickPasteLoadingIcon,
  QuickPasteModeIcon,
  QuickPasteResultButton,
  QuickPasteSourceIcon,
} from "./components/domain/quick-paste/QuickPasteComponents";
import {
  QUICK_PASTE_COMMANDS,
  getFilteredQuickPasteCommands,
  getNextQuickPasteSelectedIndex,
  getPreviousQuickPasteSelectedIndex,
  getQuickPasteCommandPage,
  getQuickPasteEmptyState,
  getQuickPasteFooterActionLabel,
  getQuickPasteMode,
  getQuickPasteQueryValue,
  getQuickPasteVisibleItems,
  getSelectedQuickPasteItem,
  isQuickPasteCommandMode,
  isQuickPasteFileMode,
  isQuickPasteSearchMode,
  isQuickPasteSyncCommand,
  shouldClearQuickPasteResults,
  stripQuickPasteFrontmatter,
  type CommandItem,
  type SearchResultItem,
} from "./components/domain/quick-paste/quickPasteLogic";
import { useToast } from "./hooks/useToast";

export default function QuickPaste() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [fileResults, setFileResults] = useState<SearchResultItem[]>([]);
  const [commandResults, setCommandResults] = useState<CommandItem[]>([...QUICK_PASTE_COMMANDS]);
  const inputRef = useRef<HTMLInputElement>(null);
  const windowRef = useRef(getCurrentWindow());
  const mainWindowRef = useRef<Window | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mode = useMemo(() => getQuickPasteMode(query), [query]);
  const modeQuery = useMemo(() => getQuickPasteQueryValue(query, mode), [query, mode]);

  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const resetState = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setSearchResults([]);
    setFileResults([]);
    setCommandResults([...QUICK_PASTE_COMMANDS]);
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
    if (isQuickPasteCommandMode(mode)) {
      setCommandResults(getFilteredQuickPasteCommands(modeQuery));
      setSelectedIndex(0);
      return;
    }

    if (shouldClearQuickPasteResults(modeQuery)) {
      if (isQuickPasteSearchMode(mode)) setSearchResults([]);
      if (isQuickPasteFileMode(mode)) setFileResults([]);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        if (isQuickPasteSearchMode(mode)) {
          const results = await invoke<SearchResultItem[]>("search_all", {
            query: modeQuery,
            typeFilter: null,
            limit: 8,
          });
          if (!cancelled) {
            setSearchResults(results);
            setSelectedIndex(0);
          }
        } else if (isQuickPasteFileMode(mode)) {
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
          if (isQuickPasteSearchMode(mode)) setSearchResults([]);
          if (isQuickPasteFileMode(mode)) setFileResults([]);
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
    return getQuickPasteVisibleItems({ mode, commandResults, fileResults, searchResults });
  }, [mode, commandResults, fileResults, searchResults]);

  const executeCommand = useCallback(async (command: CommandItem) => {
    try {
      if (isQuickPasteSyncCommand(command)) {
        setLoading(true);
        const result = await invoke<string>("sync_to_git");
        showToast(result);
        await hideWindow();
        return;
      }

      const main = await ensureMainWindow();
      const page = getQuickPasteCommandPage(command);
      if (main) {
        await main.show();
        await main.setFocus();
        await main.emit("quick-paste-open-page", { page });
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
      await writeText(stripQuickPasteFrontmatter(content));
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
    const item = getSelectedQuickPasteItem(visibleItems, selectedIndex);
    if (!item) return;

    if (isQuickPasteCommandMode(mode)) return executeCommand(item as CommandItem);
    if (isQuickPasteFileMode(mode)) return executeFileResult(item as SearchResultItem);
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
        setSelectedIndex((n) => getNextQuickPasteSelectedIndex(n, visibleItems.length));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(getPreviousQuickPasteSelectedIndex);
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
          <QuickPasteModeIcon mode={mode} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="gm-quick-paste-input"
            data-mode={mode}
          />
          {loading && <QuickPasteLoadingIcon />}
        </div>

        {/* Divider */}
        <div className="gm-quick-paste-divider" />

        {/* Results */}
        <div ref={listRef} className="gm-quick-paste-list">
          {!loading && visibleItems.length === 0 ? (
            <div className="gm-quick-paste-empty">
              {getQuickPasteEmptyState(modeQuery) === "no-results" ? "No results" : (
                <div className="gm-quick-paste-empty-stack">
                  <span>Type to search</span>
                  <div className="gm-quick-paste-muted gm-quick-paste-empty-shortcuts">
                    <span><Kbd>&gt;</Kbd> commands</span>
                    <span><Kbd>@</Kbd> files</span>
                  </div>
                </div>
              )}
            </div>
          ) : isQuickPasteCommandMode(mode) ? (
            (visibleItems as CommandItem[]).map((item, index) => {
              const selected = index === selectedIndex;
              return (
                <QuickPasteResultButton
                  key={item.id}
                  selected={selected}
                  tone="command"
                  icon={<QuickPasteCommandIcon commandId={item.id} />}
                  title={item.title}
                  subtitle={item.subtitle}
                  meta={selected ? "Enter" : undefined}
                  onClick={() => executeCommand(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              );
            })
          ) : (
            (visibleItems as SearchResultItem[]).map((item, index) => {
              const selected = index === selectedIndex;
              return (
                <QuickPasteResultButton
                  key={`${item.file_path}-${index}`}
                  selected={selected}
                  tone={mode}
                  icon={<QuickPasteSourceIcon sourceType={item.source_type} />}
                  title={item.title}
                  subtitle={isQuickPasteFileMode(mode) ? item.file_path : item.snippet || item.file_path}
                  meta={item.date}
                  onClick={() => (isQuickPasteFileMode(mode) ? executeFileResult(item) : executeSearchResult(item))}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="gm-quick-paste-footer">
          <span className="gm-quick-paste-footer-hint"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="gm-quick-paste-footer-hint"><Kbd>↵</Kbd> {getQuickPasteFooterActionLabel(mode)}</span>
          <span className="gm-quick-paste-footer-hint gm-quick-paste-footer-hint-end"><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}
