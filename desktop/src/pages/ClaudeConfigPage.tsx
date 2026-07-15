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
import { getDocumentTitle, getDocumentTitleForPath } from "../components/domain/files/fileWorkspaceLogic";
import {
  getClaudeConfigTabs,
  getInitialClaudeConfigTab,
  loadClaudeConfigFiles,
  type ClaudeConfigEditor,
  type ClaudeConfigTab,
} from "../components/domain/claude-config/claudeConfigLogic";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useListKeyboardNavigation } from "../hooks/useListNavigation";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { type FileEntry } from "../types/files";

const tabIcons: Record<ClaudeConfigTab, typeof Brain> = {
  memory: Brain,
  knowledge: BookOpen,
  skills: Wrench,
  config: FileText,
  rules: ScrollText,
};

export default function ClaudeConfigPage({ active = true, onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { active?: boolean; onFocusSidebar?: () => void; enterTrigger?: number } = {}) {
  const { t } = useI18n();
  useRelativeTimeTick();
  const [editor, setEditor] = useState<ClaudeConfigEditor>("claude");
  const [activeTab, setActiveTab] = useState<ClaudeConfigTab>("memory");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const tabs = getClaudeConfigTabs(editor);

  const loadFiles = useCallback(async (tab: ClaudeConfigTab) => {
    setLoading(true);
    try {
      setFiles(await loadClaudeConfigFiles(editor, tab, (folder) => invoke<FileEntry[]>("list_files", { folder })));
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
    setActiveTab(getInitialClaudeConfigTab(editor));
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

  useListKeyboardNavigation({
    active,
    navPrev,
    navNext,
  });

  const TabIcon = tabIcons[activeTab] ?? Brain;
  const selectedFileEntry = files.find((file) => file.path === selectedFile) ?? null;
  const selectedFileTitle = getDocumentTitleForPath(selectedFile, selectedFileEntry);

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
          {(["claude", "cursor"] as ClaudeConfigEditor[]).map((e) => (
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
            const Icon = tabIcons[tab.id];
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
                  title={getDocumentTitle(f)}
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
              title={selectedFileTitle}
              titleText={selectedFile}
              active={active}
              onBack={() => { setSelectedFile(null); setFileContent(""); }}
              onRefresh={handleRefresh}
              metadata={selectedFile ? (
                <FavoriteButton
                  relPath={selectedFile}
                  active={active}
                  title={selectedFileTitle}
                  sourceType="config"
                />
              ) : null}
              more={selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  active={active}
                  exportContent={fileContent}
                  exportTitle={selectedFileTitle}
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
