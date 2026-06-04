import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ChevronLeft, File, Folder, RefreshCw, Trash2, FilePlus2, FolderPlus } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { DesktopSplitPane } from "../components/DesktopSplitPane";
import { PageHeader } from "../components/AppHeaders";

type EditorRoot = "claude" | "cursor" | "codex" | "anonymous";

interface EditorRootsStatus {
  claude_path: string;
  claude_exists: boolean;
  cursor_path: string;
  cursor_exists: boolean;
  codex_path: string;
  codex_exists: boolean;
  anonymous_path: string;
  anonymous_exists: boolean;
}

interface EditorDirEntry {
  name: string;
  rel_path: string;
  is_dir: boolean;
}

interface EditorWriteResult {
  success: boolean;
  rel_path: string;
  message: string;
}

interface EditorOpenTarget {
  root: EditorRoot;
  relPath: string;
}

function parentRel(rel: string): string {
  const t = rel.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!t) return "";
  const i = t.lastIndexOf("/");
  return i < 0 ? "" : t.slice(0, i);
}

function isProbablyMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".mdc");
}

function joinRel(base: string, name: string): string {
  return base ? `${base.replace(/\/+$/, "")}/${name}` : name;
}

export default function EditorHomePage({ openTarget, onOpenTargetConsumed }: { openTarget?: EditorOpenTarget | null; onOpenTargetConsumed?: () => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [roots, setRoots] = useState<EditorRootsStatus | null>(null);
  const [root, setRoot] = useState<EditorRoot>("claude");
  const [rel, setRel] = useState("");
  const [entries, setEntries] = useState<EditorDirEntry[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedFileRel, setSelectedFileRel] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [fileAbs, setFileAbs] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingDir, setCreatingDir] = useState(false);

  const loadRoots = useCallback(async () => {
    try {
      const r = await invoke<EditorRootsStatus>("get_editor_data_roots");
      setRoots(r);
      if (!r.claude_exists && r.cursor_exists) setRoot("cursor");
      if (!r.claude_exists && !r.cursor_exists && r.codex_exists) setRoot("codex");
      if (!r.claude_exists && !r.cursor_exists && !r.codex_exists) setRoot("anonymous");
    } catch {
      setRoots(null);
    }
  }, []);

  const loadDir = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const list = await invoke<EditorDirEntry[]>("list_editor_directory", { root, rel });
      setEntries(list);
    } catch (e) {
      setEntries([]);
      setListError(String(e));
    } finally {
      setListLoading(false);
    }
  }, [root, rel]);

  const clearSelection = useCallback(() => {
    setSelectedFileRel(null);
    setFileContent("");
    setEditContent("");
    setFileAbs("");
    setFileError("");
    setEditing(false);
  }, []);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots]);

  useEffect(() => {
    void loadDir();
  }, [loadDir]);

  const rootOk = useMemo(() => {
    if (!roots) return false;
    if (root === "claude") return roots.claude_exists;
    if (root === "cursor") return roots.cursor_exists;
    if (root === "codex") return roots.codex_exists;
    return roots.anonymous_exists;
  }, [root, roots]);

  const rootPath = useMemo(() => {
    if (!roots) return "";
    if (root === "claude") return roots.claude_path;
    if (root === "cursor") return roots.cursor_path;
    if (root === "codex") return roots.codex_path;
    return roots.anonymous_path;
  }, [root, roots]);

  const openFile = useCallback(async (fileRel: string) => {
    setSelectedFileRel(fileRel);
    setFileContent("");
    setEditContent("");
    setFileError("");
    setFileAbs("");
    setEditing(false);
    setFileLoading(true);
    try {
      const [text, abs] = await Promise.all([
        invoke<string>("read_editor_home_file", { root, rel: fileRel }),
        invoke<string>("resolve_editor_file_abs", { root, rel: fileRel }),
      ]);
      setFileContent(text);
      setFileAbs(abs);
    } catch (e) {
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }, [root]);

  const handleRefresh = useCallback(() => {
    void loadRoots();
    void loadDir();
    if (selectedFileRel) void openFile(selectedFileRel);
  }, [loadRoots, loadDir, selectedFileRel, openFile]);

  const handleSwitchRoot = useCallback((nextRoot: EditorRoot) => {
    setRoot(nextRoot);
    setRel("");
    clearSelection();
  }, [clearSelection]);

  const handleSave = useCallback(async () => {
    if (!selectedFileRel) return;
    setSaving(true);
    try {
      const result = await invoke<EditorWriteResult>("write_editor_file", {
        root,
        rel: selectedFileRel,
        content: editContent,
      });
      setFileContent(editContent);
      setEditing(false);
      showToast(result.message || t("editorHome.saved"));
      void loadDir();
      void openFile(result.rel_path);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setSaving(false);
    }
  }, [selectedFileRel, root, editContent, showToast, t, loadDir, openFile]);

  const handleDelete = useCallback(async () => {
    if (!selectedFileRel) return;
    const confirmed = await ask(t("editorHome.deleteConfirm"), {
      title: t("common.confirm"),
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      const result = await invoke<EditorWriteResult>("delete_editor_file", {
        root,
        rel: selectedFileRel,
      });
      clearSelection();
      showToast(result.message || t("editorHome.deleted"));
      void loadDir();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    }
  }, [selectedFileRel, root, t, clearSelection, showToast, loadDir]);

  const handleCreateFile = useCallback(async () => {
    setCreating(true);
    try {
      const relPath = root === "anonymous"
        ? null
        : joinRel(rel, `${t("editorHome.untitled")}.md`);
      const result = await invoke<EditorWriteResult>("create_editor_file", {
        root,
        rel: relPath,
        initialContent: "",
      });
      showToast(result.message || t("editorHome.created"));
      await loadDir();
      await openFile(result.rel_path);
      setEditContent("");
      setEditing(true);
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setCreating(false);
    }
  }, [root, rel, t, showToast, loadDir, openFile]);

  const handleCreateFolder = useCallback(async () => {
    const base = t("editorHome.newFolderName");
    const targetRel = joinRel(rel, base);
    setCreatingDir(true);
    try {
      const result = await invoke<EditorWriteResult>("create_editor_directory", {
        root,
        rel: targetRel,
      });
      showToast(result.message || t("editorHome.created"));
      await loadDir();
      setRel(result.rel_path);
      clearSelection();
    } catch (e) {
      showToast(`Error: ${e}`, true);
    } finally {
      setCreatingDir(false);
    }
  }, [root, rel, t, showToast, loadDir, clearSelection]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editing || !selectedFileRel) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, selectedFileRel, handleSave]);

  useEffect(() => {
    if (!openTarget) return;
    if (root !== openTarget.root) {
      setRoot(openTarget.root);
      setRel(parentRel(openTarget.relPath));
      clearSelection();
      return;
    }
    const nextRel = parentRel(openTarget.relPath);
    if (rel !== nextRel) {
      setRel(nextRel);
      clearSelection();
      return;
    }
    if (selectedFileRel === openTarget.relPath) {
      onOpenTargetConsumed?.();
      return;
    }
    void openFile(openTarget.relPath).finally(() => onOpenTargetConsumed?.());
  }, [openTarget, root, rel, selectedFileRel, openFile, clearSelection, onOpenTargetConsumed]);

  const leftEmptyText = root === "anonymous" ? t("editorHome.emptyAnonymous") : t("editorHome.emptyDir");

  return (
    <div className="gm-page" style={{ display: "flex", height: "100%", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <PageHeader
        icon={FolderOpen}
        title={t("editorHome.title")}
        subtitle={t("editorHome.subtitle")}
        actions={(
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            className="gm-toolbar-button"
            style={{ cursor: "pointer", padding: 0 }}
          >
            <RefreshCw size="var(--gm-icon-xs)" />
          </button>
        )}
      />

      <DesktopSplitPane
        panelKey="editor-home"
        defaultWidth={320}
        left={(
          <div style={{
            display: "flex", flexDirection: "column", flexShrink: 0,
            background: "color-mix(in srgb, var(--bg-card) 88%, var(--bg) 12%)",
          }}>
            <div style={{ display: "flex", gap: "var(--gm-space-2)", padding: "var(--gm-control-pad-y-lg) var(--gm-control-pad-x-lg)", borderBottom: "1px solid var(--border)" }}>
              {(["claude", "cursor", "codex", "anonymous"] as EditorRoot[]).map((r) => {
                const exists = r === "claude"
                  ? roots?.claude_exists
                  : r === "cursor"
                    ? roots?.cursor_exists
                    : r === "codex"
                      ? roots?.codex_exists
                      : roots?.anonymous_exists;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={!exists}
                    onClick={() => handleSwitchRoot(r)}
                    style={{
                      flex: 1, padding: "var(--gm-control-pad-y) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-md)", fontSize: "var(--gm-font-xs)", fontWeight: root === r ? 700 : 500,
                      border: "none", cursor: exists ? "pointer" : "not-allowed", opacity: exists ? 1 : 0.45,
                      background: root === r ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "var(--bg)",
                      color: root === r ? "var(--text)" : "var(--text-secondary)",
                    }}
                  >
                    {r === "claude" ? t("editorHome.claude") : r === "cursor" ? t("editorHome.cursor") : r === "codex" ? t("editorHome.codex") : t("editorHome.anonymous")}
                  </button>
                );
              })}
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: "var(--gm-control-gap)", padding: "var(--gm-control-pad-y-lg) var(--gm-control-pad-x-lg)",
              fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)",
            }}>
              {rel ? (
                <button
                  type="button"
                  onClick={() => { setRel(parentRel(rel)); clearSelection(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--gm-space-2)", padding: "var(--gm-space-1) var(--gm-space-3)",
                    borderRadius: "var(--gm-radius-sm)", border: "1px solid var(--border)", background: "var(--bg-hover)",
                    cursor: "pointer", color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)",
                  }}
                >
                  <ChevronLeft size="var(--gm-icon-xs)" />
                  {t("editorHome.up")}
                </button>
              ) : null}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={rootPath || rel || "."}>
                {rel || rootPath || "~"}
              </span>
            </div>

            <div style={{ display: "flex", gap: "var(--gm-control-gap)", padding: "var(--gm-control-pad-y-lg) var(--gm-control-pad-x-lg)", borderBottom: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => void handleCreateFile()}
                disabled={!rootOk || creating}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--gm-control-gap)",
                  padding: "var(--gm-control-pad-y) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-md)", border: "1px solid var(--border)", background: "var(--bg-hover)",
                  color: "var(--text-secondary)", cursor: rootOk ? "pointer" : "not-allowed", fontSize: "var(--gm-font-xs)",
                }}
              >
                <FilePlus2 size="var(--gm-icon-xs)" />
                {t("editorHome.newFile")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
                disabled={!rootOk || creatingDir}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--gm-control-gap)",
                  padding: "var(--gm-control-pad-y) var(--gm-row-pad-x)", borderRadius: "var(--gm-radius-md)", border: "1px solid var(--border)", background: "var(--bg-hover)",
                  color: "var(--text-secondary)", cursor: rootOk ? "pointer" : "not-allowed", fontSize: "var(--gm-font-xs)",
                }}
              >
                <FolderPlus size="var(--gm-icon-xs)" />
                {t("editorHome.newFolder")}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {!rootOk ? (
                <div style={{ padding: "var(--gm-space-12)", textAlign: "center", fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>
                  {rootPath}
                  <p style={{ marginTop: "var(--gm-space-4)" }}>{t("editorHome.missingDir")}</p>
                </div>
              ) : listLoading ? (
                <Loading compact text={t("dashboard.loading")} />
              ) : listError ? (
                <p style={{ padding: "var(--gm-list-row-pad-y) var(--gm-list-row-pad-x)", fontSize: "var(--gm-font-xs)", color: "var(--red)" }}>{listError}</p>
              ) : entries.length === 0 ? (
                <p style={{ padding: "var(--gm-list-row-pad-y) var(--gm-list-row-pad-x)", fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{leftEmptyText}</p>
              ) : (
                entries.map((entry) => {
                  const sel = selectedFileRel === entry.rel_path;
                  return (
                    <button
                      key={entry.rel_path}
                      type="button"
                      onClick={() => {
                        if (entry.is_dir) {
                          setRel(entry.rel_path);
                          clearSelection();
                        } else {
                          void openFile(entry.rel_path);
                        }
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--gm-row-gap)", width: "100%",
                        padding: "var(--gm-list-row-pad-y) var(--gm-list-row-pad-x)", textAlign: "left", border: "none", borderBottom: "1px solid var(--border)",
                        background: sel ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "transparent",
                        borderLeft: sel ? "3px solid var(--accent)" : "3px solid transparent",
                        color: "var(--text)", cursor: "pointer", fontSize: "var(--gm-font-sm)",
                      }}
                    >
                      {entry.is_dir ? <Folder size="var(--gm-icon-xs)" style={{ flexShrink: 0, opacity: 0.85 }} /> : <File size="var(--gm-icon-xs)" style={{ flexShrink: 0, opacity: 0.85 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
        right={(
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {!selectedFileRel ? (
              <div className="gm-empty-state" style={{ flex: 1, gap: "var(--gm-space-4)" }}>
                <p style={{ fontSize: "var(--gm-font-sm)", color: "var(--text-secondary)" }}>
                  {root === "anonymous" ? t("editorHome.selectOrCreate") : t("editorHome.selectFile")}
                </p>
                <p style={{ margin: 0, fontSize: "var(--gm-font-xs)", color: "var(--text-secondary)" }}>{t("editorHome.editableWarning")}</p>
              </div>
            ) : (
              <>
                <FileDetailToolbar
                  title={selectedFileRel}
                  titleText={fileAbs || selectedFileRel}
                  onBack={clearSelection}
                  onRefresh={handleRefresh}
                  editing={editing}
                  onEdit={() => { setEditContent(fileContent); setEditing(true); }}
                  onSave={() => void handleSave()}
                  onCancel={() => { setEditing(false); setEditContent(fileContent); }}
                  editTitle={t("editorHome.edit")}
                  saveTitle={t("editorHome.save")}
                  cancelTitle={t("editorHome.cancel")}
                  saveDisabled={saving}
                  saveTone="accent"
                  metadata={selectedFileRel ? (
                    <FavoriteButton
                      absolutePath={fileAbs || undefined}
                      title={selectedFileRel.split("/").pop()}
                      sourceType="external"
                    />
                  ) : null}
                  actionsAfterEdit={[
                    {
                      key: "delete",
                      title: t("common.delete"),
                      icon: <Trash2 size={14} />,
                      onClick: () => void handleDelete(),
                      tone: "danger",
                      hidden: editing,
                    },
                  ]}
                  more={!editing && selectedFileRel ? (
                    <FileMoreActionsMenu
                      absolutePath={fileAbs || undefined}
                      canExportPdf={isProbablyMarkdown(selectedFileRel)}
                      exportContent={fileContent}
                      exportTitle={selectedFileRel.split("/").pop()}
                    />
                  ) : null}
                  style={{ padding: "var(--gm-control-pad-y-lg) var(--gm-list-row-pad-x)" }}
                />
                <div style={{ flex: 1, overflow: "auto", padding: "var(--gm-detail-pad-y) var(--gm-detail-pad-x)" }}>
                  {fileLoading ? <Loading compact text={t("dashboard.loading")} /> : null}
                  {!fileLoading && fileError ? (
                    <p style={{ fontSize: "var(--gm-font-xs)", color: "var(--red)" }}>{fileError}</p>
                  ) : null}
                  {!fileLoading && !fileError && selectedFileRel ? (
                    editing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: "100%", height: "100%", resize: "none", padding: 0,
                          background: "transparent", border: "none", color: "var(--text)",
                          fontSize: "var(--gm-font-sm)", fontFamily: "ui-monospace, monospace", lineHeight: "var(--gm-leading-reading)",
                          outline: "none", minHeight: 420,
                        }}
                      />
                    ) : isProbablyMarkdown(selectedFileRel) ? (
                      <MarkdownView content={fileContent} />
                    ) : (
                      <pre style={{
                        margin: 0, fontSize: "var(--gm-font-xs)", lineHeight: "var(--gm-leading-normal)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                        fontFamily: "ui-monospace, monospace", color: "var(--text)",
                      }}>
                        {fileContent}
                      </pre>
                    )
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      />
    </div>
  );
}
