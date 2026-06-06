import { useState, useEffect, useRef, useCallback, useMemo, type ClipboardEvent, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Plus, FileText, BookOpen, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneTabHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { EmptyState } from "../components/base/EmptyState";
import { FileEditorSurface } from "../components/domain/files/FileEditorSurface";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { NoteComposer } from "../components/domain/notes/NoteComposer";
import { DetailPane, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore, type NotesTab } from "../hooks/useAppStore";
import { useFileDetailState } from "../hooks/useFileDetailState";
import { useFileEditorState } from "../hooks/useFileEditorState";
import { type FileEntry, type FilePage } from "../types/files";
import { type NoteResult, type SavedAttachment } from "../types/notes";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { formatShortcut, withDefaultShortcuts } from "../utils/shortcuts";

const tabs: { id: NotesTab; labelKey: string; icon: typeof FileText; folder: string }[] = [
  { id: "scratch", labelKey: "notes.scratch", icon: FileText, folder: "notes/scratch" },
  { id: "manual", labelKey: "notes.manual", icon: BookOpen, folder: "notes/manual" },
];

function notesTabForPath(path: string): NotesTab {
  return path.startsWith("notes/manual/") ? "manual" : "scratch";
}

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
  const { notesTab: activeTab, setNotesTab, pendingOpenPath, consumePendingOpenPath, settings } = useAppStore();
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);
  useRelativeTimeTick();
  const isMobile = usePlatform() === "mobile";
  const [newNote, setNewNote] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
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
    completeEdit,
    resetEditor,
    toggleSplitPreview,
  } = useFileEditorState({
    sourceContent: fileContent,
    mobile: isMobile,
    focusRef: editRef,
    focusDelayMs: 50,
  });
  /** True while IME composition is active (more reliable than keydown.isComposing alone in some WebViews). */
  const imeComposingRef = useRef(false);

  const loadNotesPage = useCallback((offset: number, limit: number) => {
    const folder = tabs.find((tb) => tb.id === activeTab)!.folder;
    return invoke<FilePage>("list_files_page", { folder, offset, limit });
  }, [activeTab]);
  const {
    files,
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
    e: ClipboardEvent<HTMLTextAreaElement>,
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
  }, [activeTab, clearDetail, loadFiles]);

  useEffect(() => {
    if (focusTrigger && textareaRef.current) textareaRef.current.focus();
  }, [focusTrigger]);

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [loadFiles, openFile, selectedFile]);
  useFileWatcher(["notes"], loadFiles, { active });

  useEffect(() => {
    if (!pendingOpenPath?.startsWith("notes/")) return;
    const targetTab = notesTabForPath(pendingOpenPath);
    if (activeTab !== targetTab) {
      setNotesTab(targetTab);
      return;
    }
    void openFile(pendingOpenPath, true);
    consumePendingOpenPath();
  }, [activeTab, pendingOpenPath, setNotesTab, openFile, consumePendingOpenPath]);

  const { navPrev, navNext } = useFileListNavigation({
    files,
    selectedPath: selectedFile,
    openFile,
    hasMore,
    loadingMore,
    loadMore,
    selectFromEmpty: true,
  });

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    if (activeTab === "manual" && !manualTitle.trim()) return;
    setSaving(true);
    try {
      let result: NoteResult;
      if (activeTab === "manual") {
        result = await invoke<NoteResult>("create_manual", { title: manualTitle, content: newNote, append: false });
      } else {
        result = await invoke<NoteResult>("create_note", { content: newNote });
      }
      showToast(result.message);
      setNewNote("");
      setManualTitle("");
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    try {
      const result = await invoke<NoteResult>("update_note", { filePath: selectedFile, content: editContent });
      setFileContent(editContent);
      completeEdit();
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

  useEffect(() => {
    if (!active || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const isArrowNavigation = e.key === "ArrowUp" || e.key === "ArrowDown";
      const target = e.target;
      const isQuickNoteTextarea = target === textareaRef.current;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        if (!isArrowNavigation || !isQuickNoteTextarea || newNote.trim()) return;
      }
      if (e.key === "ArrowUp") { e.preventDefault(); navPrev(); }
      if (e.key === "ArrowDown") { e.preventDefault(); navNext(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    isMobile,
    navPrev,
    navNext,
    newNote,
  ]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const selectedFileName = selectedFile?.split("/").pop() ?? "";
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

  return (
    <FileWorkspace
        panelKey="notes"
        left={showList && (
      <ListPane>
        <PaneTabHeader
          tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey), icon: tab.icon }))}
          activeId={activeTab}
          onChange={setNotesTab}
          isMobile={isMobile}
          actions={(
            <Button
              variant="toolbar"
              onClick={handleRefresh}
              title={t("common.refresh")}
              icon={RefreshCw}
              iconSize={isMobile ? "sm" : "xs"}
              mobile={isMobile}
            />
          )}
        />

        {/* Quick note input */}
        <NoteComposer
          showTitle={activeTab === "manual"}
          title={manualTitle}
          onTitleChange={setManualTitle}
          titlePlaceholder={t("notes.placeholderTitle")}
          note={newNote}
          onNoteChange={setNewNote}
          notePlaceholder={activeTab === "manual" ? t("notes.placeholderManual") : t("notes.placeholderScratch")}
          textareaRef={textareaRef}
          rows={isMobile ? 4 : 3}
          mobile={isMobile}
          saving={saving}
          disabled={!newNote.trim() || saving || (activeTab === "manual" && !manualTitle.trim())}
          helperText={saving ? t("notes.saving") : t("notes.enterToSave")}
          showHelper={!isMobile || saving}
          onPaste={(e) => void handlePasteAttachments(e, setNewNote)}
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
        <ListPaneBody mobileBottomPadding={isMobile}>
          {loading ? (
            <Loading compact text={t("notes.loading")} />
          ) : files.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t("notes.noNotes", t(`notes.${activeTab}`))}
              description={activeTab === "manual" ? t("notes.docsHint") : t("notes.useInputAbove")}
            />
          ) : (
            <>
            {files.map((file) => {
              const isDateName = /^\d{4}-\d{2}-\d{2}/.test(file.name);
              const title = isDateName && file.preview ? file.preview : file.name;
              const selected = selectedFile === file.path;
              return (
              <FileListItem
                key={file.path}
                ref={(el) => registerItemRef(file.path, el)}
                onClick={() => openFile(file.path)}
                active={selected}
                mobile={isMobile}
                title={title}
                subtitle={relativeTime(file.modified, t)}
              />
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
        </ListPaneBody>
      </ListPane>
      )}

        right={showDetail && (
      <DetailPane>
        {selectedFile ? (
          <>
            <FileDetailToolbar
              title={isMobile ? selectedFileName : selectedFile}
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
                  title={selectedFileName}
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
                  exportTitle={selectedFileName}
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
        ) : (
          <EmptyState
            icon={Plus}
            title={t("notes.selectOrCreate")}
            description={t("notes.cmdN", formatShortcut(shortcuts.quick_note))}
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
