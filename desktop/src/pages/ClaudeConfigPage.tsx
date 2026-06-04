import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Brain, Wrench, FileText, ScrollText, BookOpen, RefreshCw } from "lucide-react";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
  modified_ts?: number;
}

type Tab = "memory" | "knowledge" | "skills" | "config" | "rules";
type Editor = "claude" | "cursor";

const claudeTabs: { id: Tab; labelKey: string; folder: string; icon: typeof Brain }[] = [
  { id: "memory", labelKey: "claudeConfig.memory", folder: "claude-config/memory", icon: Brain },
  { id: "knowledge", labelKey: "claudeConfig.knowledge", folder: "claude-config/root-docs", icon: BookOpen },
  { id: "skills", labelKey: "claudeConfig.skills", folder: "claude-config/skills", icon: Wrench },
  { id: "config", labelKey: "claudeConfig.config", folder: "claude-config", icon: FileText },
];

const cursorTabs: { id: Tab; labelKey: string; folder: string; icon: typeof Brain }[] = [
  { id: "rules", labelKey: "claudeConfig.rules", folder: "cursor-config/rules", icon: ScrollText },
  { id: "knowledge", labelKey: "claudeConfig.knowledge", folder: "cursor-config/root-docs", icon: BookOpen },
  { id: "skills", labelKey: "claudeConfig.skills", folder: "cursor-config/skills", icon: Wrench },
  { id: "config", labelKey: "claudeConfig.config", folder: "cursor-config", icon: FileText },
];

export default function ClaudeConfigPage({ active = true, onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { active?: boolean; onFocusSidebar?: () => void; enterTrigger?: number } = {}) {
  const { t } = useI18n();
  useRelativeTimeTick();
  const [editor, setEditor] = useState<Editor>("claude");
  const [activeTab, setActiveTab] = useState<Tab>("memory");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const tabs = editor === "claude" ? claudeTabs : cursorTabs;

  const loadFiles = useCallback(async (tab: Tab) => {
    const tabDef = (editor === "claude" ? claudeTabs : cursorTabs).find((t) => t.id === tab);
    if (!tabDef) return;
    setLoading(true);
    try {
      let allFiles: FileEntry[];
      // Claude global memory + per-project memory (synced to claude-config/projects/*/memory/)
      if (editor === "claude" && tab === "memory") {
        const [globalMem, projectsTree] = await Promise.all([
          invoke<FileEntry[]>("list_files", { folder: "claude-config/memory" }),
          invoke<FileEntry[]>("list_files", { folder: "claude-config/projects" }),
        ]);
        const projectMemory = projectsTree.filter(
          (f) => f.path.includes("/memory/") && f.path.endsWith(".md"),
        );
        allFiles = [...globalMem, ...projectMemory].sort(
          (a, b) => (b.modified_ts ?? 0) - (a.modified_ts ?? 0),
        );
      } else if (tab === "knowledge") {
        const base = editor === "claude" ? "claude-config" : "cursor-config";
        const [rootDocs, projectsTree] = await Promise.all([
          invoke<FileEntry[]>("list_files", { folder: `${base}/root-docs` }),
          invoke<FileEntry[]>("list_files", { folder: `${base}/projects` }),
        ]);
        const projectKnowledge = projectsTree.filter((f) =>
          (f.path.includes("/docs/") || f.path.includes("/references/") || f.path.includes("/specs/")) &&
          f.path.endsWith(".md"),
        );
        allFiles = [...rootDocs, ...projectKnowledge].sort(
          (a, b) => (b.modified_ts ?? 0) - (a.modified_ts ?? 0),
        );
      } else {
        allFiles = await invoke<FileEntry[]>("list_files", { folder: tabDef.folder });
      }
      // For "config" tab, only show root-level files, exclude subdirs
      if (tab === "config") {
        if (editor === "claude") {
          allFiles = allFiles.filter((f) =>
            !f.path.includes("claude-config/memory/") &&
            !f.path.includes("claude-config/root-docs/") &&
            !f.path.includes("claude-config/skills/") &&
            !f.path.includes("claude-config/projects/")
          );
        } else {
          allFiles = allFiles.filter((f) =>
            !f.path.includes("cursor-config/root-docs/") &&
            !f.path.includes("cursor-config/rules/") &&
            !f.path.includes("cursor-config/skills/")
          );
        }
      }
      setFiles(allFiles);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [editor]);

  useEffect(() => {
    setSelectedFile(null);
    setFileContent("");
    loadFiles(activeTab);
  }, [activeTab, editor, loadFiles]);

  // Reset tab when switching editors
  useEffect(() => {
    const firstTab = editor === "claude" ? "memory" : "rules";
    setActiveTab(firstTab);
    setSelectedFile(null);
    setFileContent("");
  }, [editor]);

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  };

  const handleRefresh = useCallback(() => {
    void loadFiles(activeTab);
    if (selectedFile) void openFile(selectedFile);
  }, [loadFiles, activeTab, selectedFile]);

  const navPrev = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx > 0) openFile(files[idx - 1].path);
  }, [selectedFile, files]);

  const navNext = useCallback(() => {
    if (!selectedFile || files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedFile);
    if (idx < files.length - 1) openFile(files[idx + 1].path);
  }, [selectedFile, files]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, navPrev, navNext]);

  const TabIcon = tabs.find((t) => t.id === activeTab)?.icon ?? Brain;

  return (
    <div className="gm-page" style={{ display: "flex", height: "100%", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <DesktopSplitPane
        panelKey="claude-config"
        defaultWidth={300}
        left={(
      <div style={{
        display: "flex", flexDirection: "column", flexShrink: 0,
        background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
        height: "100%", minHeight: 0, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}>
          <Brain size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "var(--gm-font-md)", fontWeight: 700, flex: 1 }}>{t("nav.claudeConfig")}</span>
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            className="gm-toolbar-button"
            style={{ padding: 4, display: "flex", alignItems: "center", minWidth: 28, minHeight: 28 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <RefreshCw size={14} />
          </button>
          <span style={{
            fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", background: "var(--bg-hover)",
            padding: "2px 8px", borderRadius: "var(--gm-radius-pill)",
          }}>
            {files.length}
          </span>
        </div>

        {/* Editor selector */}
        <div style={{
          display: "flex", gap: 4, padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}>
          {(["claude", "cursor"] as Editor[]).map((e) => (
            <button
              key={e}
              onClick={() => setEditor(e)}
              style={{
                padding: "6px 12px", borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", fontWeight: editor === e ? 700 : 500,
                background: editor === e ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "var(--bg)",
                color: editor === e ? "var(--text)" : "var(--text-secondary)",
                border: `1px solid ${editor === e ? "color-mix(in srgb, var(--accent) 38%, var(--border))" : "var(--border)"}`, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {e === "claude" ? "Claude" : "Cursor"}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 6, padding: "8px", borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  padding: "var(--gm-space-4) var(--gm-space-3)", fontSize: "var(--gm-font-xs)", fontWeight: active ? 700 : 500,
                  background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                  border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 38%, var(--border))" : "transparent"}`,
                  borderRadius: "var(--gm-radius-md)",
                  color: active ? "var(--text)" : "var(--text-secondary)",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <Icon size={12} />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* File list */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {loading ? (
            <Loading compact text="Loading..." />
          ) : files.length === 0 ? (
            <div className="gm-empty-state" style={{ padding: 32 }}>
              <TabIcon size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("claudeConfig.empty")}</p>
              <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", marginTop: 6 }}>
                {t("claudeConfig.emptyHint")}
              </p>
            </div>
          ) : (
            files.map((f) => {
              const selected = selectedFile === f.path;
              return (
                <button
                  key={f.path}
                  ref={(el) => { if (el) itemRefs.current.set(f.path, el); else itemRefs.current.delete(f.path); }}
                  onClick={() => openFile(f.path)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 16px", cursor: "pointer",
                    background: selected ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                    border: "none",
                    borderLeft: selected ? "3px solid var(--accent)" : "3px solid transparent",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text)", transition: "background 0.15s",
                  }}
                >
                  <p style={{ fontSize: "var(--gm-font-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </p>
                  <p style={{
                    fontSize: "var(--gm-font-xs)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: "var(--text-secondary)",
                  }}>
                    {f.preview || f.path}
                  </p>
                  <p style={{ fontSize: "var(--gm-font-2xs)", marginTop: 2, color: "var(--text-secondary)", opacity: 0.7 }}>
                    {relativeTime(f.modified, t)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

        right={(
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {!selectedFile ? (
          <div className="gm-empty-state" style={{ flex: 1 }}>
            <div style={{ textAlign: "center" }}>
              <Brain size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>{t("claudeConfig.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            <FileDetailToolbar
              title={selectedFile}
              titleText={selectedFile}
              onBack={() => { setSelectedFile(null); setFileContent(""); }}
              metadata={selectedFile ? (
                <FavoriteButton
                  relPath={selectedFile}
                  title={selectedFile.split("/").pop()}
                  sourceType="config"
                />
              ) : null}
              more={selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  exportContent={fileContent}
                  exportTitle={selectedFile.split("/").pop()}
                />
              ) : null}
            />
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 28px", userSelect: "text" }}>
              <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
            </div>
          </>
        )}
      </div>
      )}
      />
    </div>
  );
}
