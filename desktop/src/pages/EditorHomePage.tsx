import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ChevronLeft, File, Folder, RefreshCw, Pencil, Save, Trash2, X, FilePlus2, FolderPlus } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { Loading } from "../components/Loading";
import MarkdownView from "../components/MarkdownView";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { DesktopSplitPane } from "../components/DesktopSplitPane";

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
    <div style={{ display: "flex", height: "100%", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <FolderOpen size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t("editorHome.title")}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
            {t("editorHome.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          title={t("common.refresh")}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6,
            color: "var(--text-secondary)", display: "flex", alignItems: "center",
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <DesktopSplitPane
        panelKey="editor-home"
        defaultWidth={320}
        left={(
          <div style={{
            display: "flex", flexDirection: "column", flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
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
                      flex: 1, padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: root === r ? 600 : 400,
                      border: "none", cursor: exists ? "pointer" : "not-allowed", opacity: exists ? 1 : 0.45,
                      background: root === r ? "var(--accent)" : "var(--bg-hover)",
                      color: root === r ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    {r === "claude" ? t("editorHome.claude") : r === "cursor" ? t("editorHome.cursor") : r === "codex" ? t("editorHome.codex") : t("editorHome.anonymous")}
                  </button>
                );
              })}
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
              fontSize: 11, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)",
            }}>
              {rel ? (
                <button
                  type="button"
                  onClick={() => { setRel(parentRel(rel)); clearSelection(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "2px 6px",
                    borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-hover)",
                    cursor: "pointer", color: "var(--text-secondary)", fontSize: 11,
                  }}
                >
                  <ChevronLeft size={14} />
                  {t("editorHome.up")}
                </button>
              ) : null}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={rootPath || rel || "."}>
                {rel || rootPath || "~"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => void handleCreateFile()}
                disabled={!rootOk || creating}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-hover)",
                  color: "var(--text-secondary)", cursor: rootOk ? "pointer" : "not-allowed", fontSize: 11,
                }}
              >
                <FilePlus2 size={13} />
                {t("editorHome.newFile")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
                disabled={!rootOk || creatingDir}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-hover)",
                  color: "var(--text-secondary)", cursor: rootOk ? "pointer" : "not-allowed", fontSize: 11,
                }}
              >
                <FolderPlus size={13} />
                {t("editorHome.newFolder")}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {!rootOk ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>
                  {rootPath}
                  <p style={{ marginTop: 8 }}>{t("editorHome.missingDir")}</p>
                </div>
              ) : listLoading ? (
                <Loading compact text={t("dashboard.loading")} />
              ) : listError ? (
                <p style={{ padding: 16, fontSize: 12, color: "var(--red)" }}>{listError}</p>
              ) : entries.length === 0 ? (
                <p style={{ padding: 16, fontSize: 12, color: "var(--text-secondary)" }}>{leftEmptyText}</p>
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
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "10px 14px", textAlign: "left", border: "none", borderBottom: "1px solid var(--border)",
                        background: sel ? "var(--accent)" : "transparent",
                        color: sel ? "#fff" : "var(--text)", cursor: "pointer", fontSize: 13,
                      }}
                    >
                      {entry.is_dir ? <Folder size={14} style={{ flexShrink: 0, opacity: 0.85 }} /> : <File size={14} style={{ flexShrink: 0, opacity: 0.85 }} />}
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
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {root === "anonymous" ? t("editorHome.selectOrCreate") : t("editorHome.selectFile")}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{t("editorHome.editableWarning")}</p>
              </div>
            ) : (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                  borderBottom: "1px solid var(--border)", flexShrink: 0,
                }}>
                  <span style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fileAbs || selectedFileRel}>
                    {selectedFileRel}
                  </span>
                  {!editing && selectedFileRel ? (
                    <FileMoreActionsMenu
                      absolutePath={fileAbs || undefined}
                      canExportPdf={isProbablyMarkdown(selectedFileRel)}
                      exportContent={fileContent}
                      exportTitle={selectedFileRel.split("/").pop()}
                    />
                  ) : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {editing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditing(false); setEditContent(fileContent); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                            borderRadius: 6, fontSize: 12, cursor: "pointer",
                            background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                          }}
                        >
                          <X size={12} />
                          {t("editorHome.cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSave()}
                          disabled={saving}
                          style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                            borderRadius: 6, fontSize: 12, cursor: "pointer",
                            background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)",
                          }}
                        >
                          <Save size={12} />
                          {t("editorHome.save")}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditContent(fileContent); setEditing(true); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                          borderRadius: 6, fontSize: 12, cursor: "pointer",
                          background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                        }}
                      >
                        <Pencil size={12} />
                        {t("editorHome.edit")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      style={{
                        padding: 6, borderRadius: 4, background: "none", border: "none",
                        cursor: "pointer", color: "var(--text-secondary)",
                      }}
                      title={t("common.delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
                  {fileLoading ? <Loading compact text={t("dashboard.loading")} /> : null}
                  {!fileLoading && fileError ? (
                    <p style={{ fontSize: 12, color: "var(--red)" }}>{fileError}</p>
                  ) : null}
                  {!fileLoading && !fileError && selectedFileRel ? (
                    editing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: "100%", height: "100%", resize: "none", padding: 0,
                          background: "transparent", border: "none", color: "var(--text)",
                          fontSize: 13, fontFamily: "ui-monospace, monospace", lineHeight: 1.7,
                          outline: "none", minHeight: 420,
                        }}
                      />
                    ) : isProbablyMarkdown(selectedFileRel) ? (
                      <MarkdownView content={fileContent} />
                    ) : (
                      <pre style={{
                        margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
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
