import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Brain, Wrench, FileText, ScrollText, BookOpen, RefreshCw } from "lucide-react";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Badge } from "../components/base/Badge";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { type FileEntry } from "../types/files";

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
          (a, b) => (b.modifiedTs ?? 0) - (a.modifiedTs ?? 0),
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
          (a, b) => (b.modifiedTs ?? 0) - (a.modifiedTs ?? 0),
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

  const openFile = useCallback(async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  }, []);

  const handleRefresh = useCallback(() => {
    void loadFiles(activeTab);
    if (selectedFile) void openFile(selectedFile);
  }, [loadFiles, activeTab, openFile, selectedFile]);

  const { navPrev, navNext } = useFileListNavigation({
    files,
    selectedPath: selectedFile,
    openFile,
  });

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
    <FileWorkspace
        panelKey="claude-config"
        left={(
      <ListPane>
        <PaneHeader
          icon={Brain}
          title={t("nav.claudeConfig")}
          actions={(
            <>
              <Button
                variant="toolbar"
                onClick={handleRefresh}
                title={t("common.refresh")}
                icon={RefreshCw}
              />
              <Badge>{files.length}</Badge>
            </>
          )}
        />

        {/* Editor selector */}
        <div className="gm-segment-row">
          {(["claude", "cursor"] as Editor[]).map((e) => (
            <button
              key={e}
              onClick={() => setEditor(e)}
              className="gm-segment-button"
              data-active={editor === e ? "true" : "false"}
            >
              {e === "claude" ? "Claude" : "Cursor"}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="gm-compact-tab-row">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="gm-compact-tab-button"
                data-active={active ? "true" : "false"}
              >
                <AppIcon icon={Icon} size="2xs" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* File list */}
        <ListPaneBody>
          {loading ? (
            <Loading compact text="Loading..." />
          ) : files.length === 0 ? (
            <EmptyState icon={TabIcon} title={t("claudeConfig.empty")} description={t("claudeConfig.emptyHint")} />
          ) : (
            files.map((f) => {
              const selected = selectedFile === f.path;
              return (
                <FileListItem
                  key={f.path}
                  ref={(el) => { if (el) itemRefs.current.set(f.path, el); else itemRefs.current.delete(f.path); }}
                  onClick={() => openFile(f.path)}
                  active={selected}
                  title={f.name}
                  subtitle={relativeTime(f.modified, t)}
                  preview={f.preview || f.path}
                />
              );
            })
          )}
        </ListPaneBody>
      </ListPane>
      )}

        right={(
      <DetailPane>
        {!selectedFile ? (
          <EmptyState icon={Brain} iconSize="empty-lg" title={t("claudeConfig.selectToView")} full />
        ) : (
          <>
            <FileDetailToolbar
              title={selectedFile}
              titleText={selectedFile}
              onBack={() => { setSelectedFile(null); setFileContent(""); }}
              onRefresh={handleRefresh}
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
            <DetailScroll selectable>
              <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
            </DetailScroll>
          </>
        )}
      </DetailPane>
      )}
      showList
      showDetail
    />
  );
}
