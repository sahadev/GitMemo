import { useState, useEffect, useRef, useCallback, useMemo, type ClipboardEvent, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loading } from "../components/Loading";
import { Plus, FileText, BookOpen, Trash2, RefreshCw } from "lucide-react";
import MarkdownView from "../components/MarkdownView";
import { MarkdownSplitEditor } from "../components/MarkdownSplitEditor";
import { FileDetailToolbar } from "../components/FileDetailToolbar";
import { FileMoreActionsMenu } from "../components/FileMoreActionsMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { PaneTabHeader } from "../components/AppHeaders";
import { AppIcon } from "../components/base/AppIcon";
import { Button } from "../components/base/Button";
import { CodeTextarea } from "../components/base/CodeTextarea";
import { EmptyState } from "../components/base/EmptyState";
import { FileListItem } from "../components/domain/files/FileListItem";
import { FileWorkspace } from "../components/domain/files/FileWorkspace";
import { LoadMoreRow } from "../components/domain/files/LoadMoreRow";
import { NoteComposer } from "../components/domain/notes/NoteComposer";
import { DetailPane, DetailScroll, ListPane, ListPaneBody } from "../components/layout/Pane";
import { useRelativeTimeTick } from "../hooks/useRelativeTimeTick";
import { usePlatform } from "../hooks/usePlatform";
import { relativeTime } from "../utils/time";
import { useI18n } from "../hooks/useI18n";
import { useToast } from "../hooks/useToast";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { useAppStore, type NotesTab } from "../hooks/useAppStore";
import { type FileEntry, type FilePage } from "../types/files";
import { type NoteResult, type SavedAttachment } from "../types/notes";
import { usePagedFileList } from "../hooks/usePagedFileList";
import { useFileListNavigation } from "../hooks/useFileListNavigation";
import { useMobileDetailBackHandler } from "../hooks/useMobileDetailBackHandler";
import { formatShortcut, shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";

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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [newNote, setNewNote] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [splitPreview, setSplitPreview] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [favoriteToggleSignal, setFavoriteToggleSignal] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const detailOpenedFromCrossPageRef = useRef(false);
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
    setSelectedFile(null);
    setFileContent("");
    setEditing(false);
    setSplitPreview(false);
  }, [activeTab, loadFiles]);

  useEffect(() => {
    if (focusTrigger && textareaRef.current) textareaRef.current.focus();
  }, [focusTrigger]);

  const openFile = useCallback(async (path: string, fromCrossPage = false) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setEditing(false);
      setSplitPreview(false);
      setMoreMenuOpen(false);
      detailOpenedFromCrossPageRef.current = isMobile && fromCrossPage;
      scrollItemIntoView(path);
    } catch (e) { console.error(e); }
  }, [isMobile, scrollItemIntoView]);

  const handleRefresh = useCallback(() => {
    void loadFiles();
    if (selectedFile) void openFile(selectedFile);
  }, [loadFiles, openFile, selectedFile]);
  useFileWatcher(["notes"], loadFiles);

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
      setEditing(false);
      setSplitPreview(false);
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
      setSelectedFile(null);
      setFileContent("");
      setEditing(false);
      setSplitPreview(false);
      setMoreMenuOpen(false);
      showToast(t("notes.noteDeleted"));
      loadFiles();
    } catch (e) { showToast(`Error: ${e}`, true); }
  };

  const startEdit = useCallback(() => {
    setEditContent(fileContent);
    setEditing(true);
    setSplitPreview(false);
    setMoreMenuOpen(false);
    setTimeout(() => editRef.current?.focus(), 50);
  }, [fileContent]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setSplitPreview(false);
  }, []);

  const toggleSplitPreview = useCallback(() => {
    if (isMobile || !selectedFile) return;
    if (!editing) {
      setEditContent(fileContent);
      setEditing(true);
      setSplitPreview(true);
      window.setTimeout(() => editRef.current?.focus(), 50);
      return;
    }
    setSplitPreview((value) => !value);
  }, [editing, fileContent, isMobile, selectedFile]);

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
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.edit_selected)) {
        e.preventDefault();
        startEdit();
      }
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.delete_selected)) {
        e.preventDefault();
        void handleDelete();
      }
      if (selectedFile && shortcutMatches(e, shortcuts.refresh_selected)) {
        e.preventDefault();
        handleRefresh();
      }
      if (selectedFile && shortcutMatches(e, shortcuts.favorite_selected)) {
        e.preventDefault();
        setFavoriteToggleSignal((value) => value + 1);
      }
      if (selectedFile && shortcutMatches(e, shortcuts.toggle_split_preview)) {
        e.preventDefault();
        toggleSplitPreview();
      }
      if (!editing && selectedFile && shortcutMatches(e, shortcuts.more_actions)) {
        e.preventDefault();
        setMoreMenuOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    isMobile,
    navPrev,
    navNext,
    newNote,
    editing,
    selectedFile,
    handleRefresh,
    handleDelete,
    startEdit,
    toggleSplitPreview,
    shortcuts.edit_selected,
    shortcuts.delete_selected,
    shortcuts.refresh_selected,
    shortcuts.favorite_selected,
    shortcuts.toggle_split_preview,
    shortcuts.more_actions,
  ]);

  const showList = !isMobile || !selectedFile;
  const showDetail = !isMobile || !!selectedFile;
  const selectedFileName = selectedFile?.split("/").pop() ?? "";
  const closeDetail = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setEditing(false);
    setSplitPreview(false);
    setMoreMenuOpen(false);
    detailOpenedFromCrossPageRef.current = false;
  }, []);

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
              onBack={closeDetail}
              onRefresh={handleRefresh}
              refreshShortcut={shortcuts.refresh_selected}
              editing={editing}
              onEdit={startEdit}
              onSave={() => void handleSaveEdit()}
              onCancel={cancelEdit}
              editTitle={t("notes.edit")}
              editShortcut={shortcuts.edit_selected}
              saveTitle={t("notes.save")}
              splitPreview={splitPreview}
              onToggleSplitPreview={toggleSplitPreview}
              splitPreviewShortcut={shortcuts.toggle_split_preview}
              metadata={selectedFile ? (
                <FavoriteButton
                  relPath={selectedFile}
                  title={selectedFileName}
                  sourceType="note"
                  shortcut={shortcuts.favorite_selected}
                  toggleSignal={favoriteToggleSignal}
                />
              ) : null}
              actionsAfterEdit={[
                {
                  key: "delete",
                  title: t("common.delete"),
                  shortcut: shortcuts.delete_selected,
                  icon: <AppIcon icon={Trash2} size={isMobile ? "sm" : "xs"} />,
                  onClick: () => void handleDelete(),
                  tone: "danger",
                  hidden: editing,
                },
              ]}
              more={!editing && selectedFile ? (
                <FileMoreActionsMenu
                  relPath={selectedFile}
                  exportContent={fileContent}
                  exportTitle={selectedFileName}
                  shortcut={shortcuts.more_actions}
                  open={moreMenuOpen}
                  onOpenChange={setMoreMenuOpen}
                />
              ) : null}
            />
            <DetailScroll mobileBottomPadding={isMobile} className={editing && splitPreview ? "gm-detail-scroll-split" : undefined}>
              {editing ? (
                splitPreview && !isMobile ? (
                  <MarkdownSplitEditor
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onPaste={(e) => void handlePasteAttachments(e, setEditContent)}
                    onKeyDown={(e) => {
                      if (e.key === "s" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveEdit(); }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    filePath={selectedFile ?? undefined}
                    mobile={isMobile}
                  />
                ) : (
                  <CodeTextarea
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onPaste={(e) => void handlePasteAttachments(e, setEditContent)}
                    onKeyDown={(e) => {
                      if (e.key === "s" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveEdit(); }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    mobile={isMobile}
                  />
                )
              ) : (
                <MarkdownView content={fileContent} filePath={selectedFile ?? undefined} />
              )}
            </DetailScroll>
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
