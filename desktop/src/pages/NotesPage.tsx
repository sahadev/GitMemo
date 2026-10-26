import { useState, useEffect, useRef, useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Plus, FileText, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneHeader } from "../components/AppHeaders";
import { Badge } from "../components/base/Badge";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { shouldActivateMobileEditorChrome } from "../components/domain/app/appChromeLogic";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import type { EditorHandle, EditorPasteEvent } from "../components/domain/editor/editorTypes";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import {
  getFileWorkspacePaneState,
  getDocumentTitleForPath,
  getNoteListItemTitle,
  isPendingPathForFolder,
} from "../components/domain/files/fileWorkspaceLogic";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { NoteComposer } from "../components/domain/notes/NoteComposer";
import {
  canPressNoteCreateButton,
  canNavigateListFromEmptyComposer,
  shouldShowNoteComposerHelper,
} from "../components/domain/notes/notesLogic";
import { DetailPane, ListPane } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore } from "../hooks/useAppStore";
import { useFileDetailState } from "../hooks/useFileDetailState";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { type FileEntry, type FilePage } from "../types/files";
import { type NoteResult, type SavedAttachment } from "../types/notes";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useListKeyboardNavigation } from "../hooks/useListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { useMobileEditorChrome } from "../hooks/useMobileEditorChrome";
import { formatShortcut, withDefaultShortcuts } from "../utils/shortcuts";

/** 便笺与文档已合并：列表读整个 notes 目录，新建一律写成文档（notes/manual） */
const NOTES_FOLDER = "notes";

// 详情栏窄于此宽度时工具栏改行（字号与按钮宽度叠加后 540 已开始溢出）
const NOTE_DETAIL_WRAP_WIDTH = 600;
export default function NotesPage({
  active = true,
  focusTrigger,
  onFocusSidebar: _onFocusSidebar,
  enterTrigger: _enterTrigger,
  registerMobileBackHandler,
}: {
  active?: boolean;
  focusTrigger?: number;
  onFocusSidebar?: () => void;
  enterTrigger?: number;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [noteDraft, setNoteDraft] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<EditorHandle | null>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
  /** Esc 关掉详情后记住刚才那一行，方向键从它继续走，而不是从列表头重来 */
  const lastClosedPathRef = useRef<string | null>(null);
  const {
    selectedFile,
    fileContent,
    setFileContent,
    openFile,
    clearDetail,
  } = useFileDetailState({
    onOpened: ({ path, fromCrossPage }) => {
      resetEditor();
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    },
    onClosed: () => {
      resetEditor();
      detailOpenedFromCrossPageRef.current = false;
    },
  });
  const {
    editing,
    editContent,
    splitPreview,
    setEditContent,
    startEdit,
    cancelEdit,
    resetEditor,
    toggleSplitPreview,
  } = useFileEditorState({
    sourceContent: fileContent,
    mobile: isMobile,
    focusRef: editRef,
    focusDelayMs: 50,
  });
  useMobileEditorChrome({ active: shouldActivateMobileEditorChrome({ pageActive: active, editing }), id: "notes" });
  /** True while IME composition is active (more reliable than keydown.isComposing alone in some WebViews). */
  const imeComposingRef = useRef(false);

  const loadNotesPage = useCallback((offset: number, limit: number) => {
    return invoke<FilePage>("list_files_page", { folder: NOTES_FOLDER, offset, limit });
  }, []);
  const {
    files,
    loadError,
    loading,
    loadingMore,
    hasMore,
    loadFiles,
    loadMore,
    sentinelRef,
    registerItemRef,
    scrollItemIntoView,
  } = usePagedFileList<FileEntry>({ loadPage: loadNotesPage });

  const appendAttachmentMarkdown = useCallback(
    (setter: Dispatch<SetStateAction<string>>, markdown: string) => {
      setter((prev) => {
        if (!prev.trim()) return markdown;
        const needsBreak = !prev.endsWith("\n");
        return `${prev}${needsBreak ? "\n" : ""}\n${markdown}`;
      });
    },
    [],
  );

  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, []);

  const saveAttachment = useCallback(async (file: File) => {
    const base64 = arrayBufferToBase64(await file.arrayBuffer());
    return invoke<SavedAttachment>("save_pasted_attachment", {
      base64Data: base64,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name || null,
    });
  }, [arrayBufferToBase64]);

  const handlePasteAttachments = useCallback(async (
    e: EditorPasteEvent,
    setter: Dispatch<SetStateAction<string>>,
  ) => {
    // Try clipboardData.items first (standard), then fall back to clipboardData.files
    // (Tauri WKWebView on macOS may only expose pasted images via .files)
    let pastedFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (pastedFiles.length === 0 && e.clipboardData.files.length > 0) {
      pastedFiles = Array.from(e.clipboardData.files);
    }

    if (pastedFiles.length === 0) return;

    e.preventDefault();
    try {
      for (const file of pastedFiles) {
        const saved = await saveAttachment(file);
        appendAttachmentMarkdown(setter, saved.markdown);
        showToast(saved.message);
      }
    } catch (err) {
      showToast(`Error: ${err}`, true);
    }
  }, [appendAttachmentMarkdown, saveAttachment, showToast]);

  useEffect(() => {
    void loadFiles();
    clearDetail();
    lastClosedPathRef.current = null;
  }, [clearDetail, loadFiles]);

  useEffect(() => {
    if (focusTrigger && textareaRef.current) textareaRef.current.focus();
  }, [focusTrigger]);

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [loadFiles, openFile, selectedFile]);
  useFileWatcher(["notes"], loadFiles, { active });

  useEffect(() => {
    if (!isPendingPathForFolder(pendingOpenPath, "notes/")) return;
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [pendingOpenPath, openFile, consumePendingOpenPath]);

  const { navPrev, navNext } = useFileListNavigation({
    files,
    selectedPath: selectedFile ?? lastClosedPathRef.current,
    openFile,
    hasMore,
    loadingMore,
    loadMore,
    selectFromEmpty: true,
  });
  const handleCreateNote = async () => {
    if (saving) return;
    if (!noteDraft.trim()) {
      showToast(t("notes.contentRequired"), true);
      return;
    }
    // 标题可选：留空时取正文第一行；再退到时间戳，避免写出空名文件
    const firstLine = noteDraft.trim().split("\n")[0].trim().slice(0, 60);
    const title = noteTitle.trim() || firstLine || new Date().toLocaleString();
    setSaving(true);
    try {
      const result = await invoke<NoteResult>("create_manual", { title, content: noteDraft, append: false });
      showToast(result.message);
      setNoteDraft("");
      setNoteTitle("");
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    try {
      const result = await invoke<NoteResult>("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      showToast(result.message);
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    const confirmed = await ask(t("notes.deleteConfirm"), { title: t("common.confirm"), kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      clearDetail();
      showToast(t("notes.noteDeleted"));
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  };

  useListKeyboardNavigation({
    active,
    disabled: isMobile,
    navPrev,
    navNext,
    allowFromEditable: (event) => event.target === textareaRef.current && canNavigateListFromEmptyComposer(noteDraft),
  });

  const { showList, showDetail } = getFileWorkspacePaneState(isMobile, selectedFile);
  const selectedFileEntry = files.find((file) => file.path === selectedFile) ?? null;
  const selectedFileTitle = getDocumentTitleForPath(selectedFile, selectedFileEntry);
  const closeDetail = useCallback(() => {
    clearDetail();
  }, [clearDetail]);

  useMobileDetailBackHandler({
    isMobile,
    registerMobileBackHandler,
    hasDetail: !!selectedFile,
    closeDetail,
    openedFromCrossPageRef: detailOpenedFromCrossPageRef,
    editing,
    cancelEdit,
  });

  // Esc 只关详情、不清“位置”：否则方向键会从列表头重新开始，把同一行又打开一次。
  useEffect(() => {
    if (!active || isMobile || !selectedFile || editing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // 用捕获阶段：正文区自己也会处理 Esc（退出某种展示态），
      // 这里要保证「先回到列表」这件主要的动作一定发生。
      event.preventDefault();
      lastClosedPathRef.current = selectedFile;
      closeDetail();
      // 焦点回到当前行：否则 Esc 之后焦点落在 body 上，方向键要重新 Tab 一圈才回来。
      window.requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>('[data-on="true"]');
        row?.focus();
      });
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [active, isMobile, selectedFile, editing, closeDetail]);

  return (
    <FileWorkspace
        panelKey="notes"
        narrowDetailThreshold={NOTE_DETAIL_WRAP_WIDTH}
        left={showList && (
      <ListPane>
        <PaneHeader
          icon={FileText}
          title={t("nav.notes")}
          actions={(
            <>
              <Button
                variant="toolbar"
                onClick={handleRefresh}
                title={t("common.refresh")}
                icon={RefreshCw}
                iconSize={isMobile ? "sm" : "xs"}
                mobile={isMobile}
              />
              <Badge>{files.length}</Badge>
            </>
          )}
        />

        {/* Quick note input */}
        <NoteComposer
          showTitle
          title={noteTitle}
          onTitleChange={setNoteTitle}
          titlePlaceholder={t("notes.placeholderTitleOptional")}
          sendLabel={t("notes.send")}
          note={noteDraft}
          onNoteChange={setNoteDraft}
          notePlaceholder={t("notes.placeholderUnified")}
          textareaRef={textareaRef}
          rows={isMobile ? 4 : 3}
          mobile={isMobile}
          saving={saving}
          disabled={!canPressNoteCreateButton(noteDraft, saving)}
          helperText={saving ? t("notes.saving") : t("notes.enterToSave")}
          showHelper={shouldShowNoteComposerHelper(isMobile, saving)}
          onPaste={(e) => void handlePasteAttachments(e, setNoteDraft)}
          onCompositionStart={() => { imeComposingRef.current = true; }}
          onCompositionEnd={() => { imeComposingRef.current = false; }}
          onKeyDown={(e) => {
            if (isMobile) return;
            if (e.key !== "Enter" || e.shiftKey) return;
            const ev = e.nativeEvent;
            if (imeComposingRef.current || ev.isComposing) return;
            if ("keyCode" in ev && (ev as KeyboardEvent).keyCode === 229) return;
            e.preventDefault();
            void handleCreateNote();
          }}
          onSubmit={() => void handleCreateNote()}
        />

        {/* File list */}
        <div className="gm-inst-list-rows gm-dash-list-rows">
          {loadError ? (
            <div className="gm-inst-list-error" role="alert">
              <span className="gm-inst-list-error-text">{t("notes.listLoadFailed", loadError)}</span>
              <button type="button" className="gm-toolbar-button" onClick={() => void loadFiles(true)}>
                {t("common.retry")}
              </button>
            </div>
          ) : loading ? (
            <div className="gm-inst-list-skeleton" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="gm-inst-list-row" data-skeleton="true">
                  <span className="gm-inst-list-title" />
                  <span className="gm-inst-list-time" data-col="time" />
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            isMobile ? (
              <EmptyState
                icon={FileText}
                title={t("notes.emptyTitle")}
                description={t("notes.emptyHint")}
                full
              />
            ) : null
          ) : (
            <>
            {files.map((file) => {
              const title = getNoteListItemTitle(file);
              const selected = selectedFile === file.path;
              return (
              <button
                key={file.path}
                ref={(el) => registerItemRef(file.path, el)}
                type="button"
                className="gm-inst-list-row"
                data-on={selected ? "true" : "false"}
                data-selected={selected ? "true" : "false"}
                onClick={() => openFile(file.path)}
                title={typeof title === "string" ? title : undefined}
              >
                <span className="gm-inst-list-title">{title}</span>
                <span className="gm-inst-list-time" data-col="time">{relativeTime(file.modified, t)}</span>
              </button>
              );
            })}
            {hasMore && (
              <div ref={sentinelRef}>
              <LoadMoreRow
                loading={loadingMore}
                loadingLabel={t("common.loading")}
                label={t("common.loadMore")}
                onClick={() => void loadMore()}
              />
              </div>
            )}
            </>
          )}
        </div>
      </ListPane>
      )}

        right={showDetail && (
      <DetailPane>
        {selectedFile ? (
          <>
            <FileDetailToolbar
              title={selectedFileTitle}
              titleText={selectedFile}
              active={active}
              onBack={closeDetail}
              onRefresh={handleRefresh}
              editing={editing}
              onEdit={startEdit}
              onSave={() => void handleSaveEdit()}
              onCancel={cancelEdit}
              editTitle={t("notes.edit")}
              saveTitle={t("notes.save")}
              splitPreview={splitPreview}
              onToggleSplitPreview={toggleSplitPreview}
              metadata={selectedFile ? (
                <FavoriteButton
                  relPath={selectedFile}
                  active={active}
                  title={selectedFileTitle}
                  sourceType="note"
                />
              ) : null}
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("common.delete"),
                  icon: <AppIcon icon={Trash2} size={isMobile ? "sm" : "xs"} />,
                  onClick: () => void handleDelete(),
                  tone: "danger",
                  hidden: editing,
                },
              ]}
              more={!editing && selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  active={active}
                  exportContent={fileContent}
                  exportTitle={selectedFileTitle}
                />
              ) : null}
            />
            <FileEditorSurface
              ref={editRef}
              editing={editing}
              value={editContent}
              onChange={setEditContent}
              onSave={handleSaveEdit}
              onCancel={cancelEdit}
              onPaste={(e) => void handlePasteAttachments(e, setEditContent)}
              filePath={selectedFile ?? undefined}
              mobile={isMobile}
              splitPreview={splitPreview}
              supportsSplitPreview
              mobileBottomPadding={isMobile}
            >
                <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
            </FileEditorSurface>
          </>
        ) : files.length > 0 ? (
          <EmptyState
            icon={Plus}
            title={t("notes.selectOrCreate")}
            description={t("notes.cmdN", formatShortcut(shortcuts.quick_note))}
            full
          />
        ) : (
          <EmptyState
            icon={FileText}
            title={t("notes.emptyTitle")}
            description={t("notes.emptyHint")}
            full
          />
        )}
      </DetailPane>
      )}
      showList={showList}
      showDetail={showDetail}
    />
  );
}
