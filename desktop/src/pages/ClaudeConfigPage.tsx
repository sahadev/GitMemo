import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Brain, Wrench, FileText, ChevronLeft } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
}

type Tab = "memory" | "skills" | "config";

const tabs: { id: Tab; labelKey: string; folder: string; icon: typeof Brain }[] = [
  { id: "memory", labelKey: "claudeConfig.memory", folder: "claude-config/memory", icon: Brain },
  { id: "skills", labelKey: "claudeConfig.skills", folder: "claude-config/skills", icon: Wrench },
  { id: "config", labelKey: "claudeConfig.config", folder: "claude-config", icon: FileText },
];

export default function ClaudeConfigPage({ onFocusSidebar: _onFocusSidebar, enterTrigger: _enterTrigger }: { onFocusSidebar?: () => void; enterTrigger?: number } = {}) {
  const { t } = useI18n();
  const panel = useResizablePanel("claude-config", 300);
  const [activeTab, setActiveTab] = useState<Tab>("memory");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const loadFiles = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      const tabDef = tabs.find((t) => t.id === tab)!;
      let allFiles = await invoke<FileEntry[]>("list_files", { folder: tabDef.folder });
      // For "config" tab, only show root-level files (CLAUDE.md etc), exclude memory/skills subdirs
      if (tab === "config") {
        allFiles = allFiles.filter((f) =>
          !f.path.includes("claude-config/memory/") &&
          !f.path.includes("claude-config/skills/") &&
          !f.path.includes("claude-config/projects/")
        );
      }
      setFiles(allFiles);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setSelectedFile(null);
    setFileContent("");
    loadFiles(activeTab);
  }, [activeTab, loadFiles]);

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setTimeout(() => itemRefs.current.get(path)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { console.error(e); }
  };

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navPrev, navNext]);

  const TabIcon = tabs.find((t) => t.id === activeTab)!.icon;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left Panel */}
      <div style={{
        width: panel.width, borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}>
          <Brain size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{t("nav.claudeConfig")}</span>
          <span style={{
            fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-hover)",
            padding: "2px 8px", borderRadius: 10,
          }}>
            {files.length}
          </span>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: "1px solid var(--border)",
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
                  padding: "8px 4px", fontSize: 11, fontWeight: active ? 600 : 400,
                  background: "none", border: "none",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
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
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--text-secondary)" }}>Loading...</p>
          ) : files.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <TabIcon size={36} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("claudeConfig.empty")}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
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
                    background: selected ? "var(--accent)" : "transparent",
                    border: "none", borderBottom: "1px solid var(--border)",
                    color: selected ? "#fff" : "var(--text)", transition: "background 0.15s",
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </p>
                  <p style={{
                    fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: selected ? "rgba(255,255,255,0.7)" : "var(--text-secondary)",
                  }}>
                    {f.preview || f.path}
                  </p>
                  <p style={{ fontSize: 10, marginTop: 2, color: selected ? "rgba(255,255,255,0.5)" : "var(--text-secondary)", opacity: 0.7 }}>
                    {relativeTime(f.modified, t)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div onMouseDown={panel.onMouseDown} style={panel.handleStyle}>
        <div style={panel.handleHoverStyle} />
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Brain size={40} style={{ color: "var(--border)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("claudeConfig.selectToView")}</p>
            </div>
          </div>
        ) : (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 20px", borderBottom: "1px solid var(--border)",
            }}>
              <button
                onClick={() => { setSelectedFile(null); setFileContent(""); }}
                style={{ padding: 4, borderRadius: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedFile}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", userSelect: "text" }}>
              <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
