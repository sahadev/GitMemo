import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, FileText, Calendar, BookOpen, Send, ChevronLeft, Pencil, Save, Trash2, X } from "lucide-react";
import MarkdownView from "../components/MarkdownView";

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
}

interface NoteResult {
  success: boolean;
  path: string;
  message: string;
}

type NoteTab = "scratch" | "daily" | "manual" | "conversations";

const tabs: { id: NoteTab; label: string; icon: typeof FileText; folder: string }[] = [
  { id: "scratch", label: "Scratch", icon: FileText, folder: "notes/scratch" },
  { id: "daily", label: "Daily", icon: Calendar, folder: "notes/daily" },
  { id: "manual", label: "Manual", icon: BookOpen, folder: "notes/manual" },
  { id: "conversations", label: "Conversations", icon: FileText, folder: "conversations" },
];

export default function NotesPage({ focusTrigger }: { focusTrigger?: number }) {
  const [activeTab, setActiveTab] = useState<NoteTab>("scratch");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadFiles();
    setSelectedFile(null);
    setFileContent("");
    setEditing(false);
  }, [activeTab]);

  useEffect(() => {
    if (focusTrigger && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focusTrigger]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const folder = tabs.find((t) => t.id === activeTab)!.folder;
      const result = await invoke<FileEntry[]>("list_files", { folder });
      setFiles(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setSelectedFile(path);
      setFileContent(content);
      setEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    try {
      let result: NoteResult;
      if (activeTab === "daily") {
        result = await invoke<NoteResult>("append_daily", { content: newNote });
      } else {
        result = await invoke<NoteResult>("create_note", { content: newNote });
      }
      setToast(result.message);
      setNewNote("");
      loadFiles();
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      setToast(`Error: ${e}`);
      setTimeout(() => setToast(""), 3000);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    try {
      const result = await invoke<NoteResult>("update_note", {
        filePath: selectedFile,
        content: editContent,
      });
      setFileContent(editContent);
      setEditing(false);
      setToast(result.message);
      loadFiles();
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      setToast(`Error: ${e}`);
      setTimeout(() => setToast(""), 3000);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    try {
      await invoke<NoteResult>("delete_note", { filePath: selectedFile });
      setSelectedFile(null);
      setFileContent("");
      setEditing(false);
      setToast("Note deleted");
      loadFiles();
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      setToast(`Error: ${e}`);
      setTimeout(() => setToast(""), 3000);
    }
  };

  const startEdit = () => {
    setEditContent(fileContent);
    setEditing(true);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleCreateNote();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      setEditing(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* File List */}
      <div className="w-[280px] border-r flex flex-col h-full" style={{ borderColor: "var(--border)" }}>
        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] transition-colors border-b-2"
                style={{
                  borderColor: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Quick note input */}
        {(activeTab === "scratch" || activeTab === "daily") && (
          <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeTab === "daily" ? "Add to today's note..." : "Quick note..."}
                rows={2}
                className="w-full px-3 py-2 rounded-md text-[13px] resize-none"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
              <button
                onClick={handleCreateNote}
                disabled={!newNote.trim()}
                className="absolute bottom-2 right-2 p-1 rounded"
                style={{
                  color: newNote.trim() ? "var(--accent)" : "var(--text-secondary)",
                  opacity: newNote.trim() ? 1 : 0.4,
                }}
              >
                <Send size={14} />
              </button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Cmd+Enter to save
            </p>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-[12px]" style={{ color: "var(--text-secondary)" }}>Loading...</p>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <FileText size={32} style={{ color: "var(--border)" }} className="mb-3" />
              <p className="text-[13px] mb-1" style={{ color: "var(--text-secondary)" }}>
                No {activeTab} notes yet
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {activeTab === "scratch" || activeTab === "daily"
                  ? "Use the input above to create one"
                  : activeTab === "manual"
                  ? "Create manuals via CLI: gitmemo manual"
                  : "Conversations are saved automatically"}
              </p>
            </div>
          ) : (
            files.map((file) => (
              <button
                key={file.path}
                onClick={() => openFile(file.path)}
                className="w-full text-left px-3 py-2.5 border-b transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: selectedFile === file.path ? "var(--bg-hover)" : "transparent",
                }}
              >
                <p className="text-[13px] font-medium truncate">{file.name}</p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                  {file.preview}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {file.modified}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            className="mx-3 mb-3 px-3 py-2 rounded-md text-[12px]"
            style={{
              background: toast.startsWith("Error") ? "#2d1515" : "#152d15",
              color: toast.startsWith("Error") ? "var(--red)" : "var(--green)",
            }}
          >
            {toast}
          </div>
        )}
      </div>

      {/* Content Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedFile ? (
          <>
            <div
              className="flex items-center gap-2 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                onClick={() => { setSelectedFile(null); setFileContent(""); setEditing(false); }}
                className="p-1 rounded hover:bg-[var(--bg-hover)]"
              >
                <ChevronLeft size={16} style={{ color: "var(--text-secondary)" }} />
              </button>
              <span className="text-[13px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>
                {selectedFile}
              </span>
              {editing ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px]"
                    style={{ background: "#0f2d0f", color: "var(--green)" }}
                  >
                    <Save size={12} /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="p-1 rounded hover:bg-[var(--bg-hover)]"
                  >
                    <X size={14} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={startEdit}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-1 rounded hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--red)" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editing ? (
                <textarea
                  ref={editRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="w-full h-full resize-none text-[13px] leading-6 p-0"
                  style={{
                    background: "transparent",
                    color: "var(--text)",
                    border: "none",
                    outline: "none",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                />
              ) : (
                <MarkdownView content={fileContent} />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Plus size={32} style={{ color: "var(--border)" }} className="mx-auto mb-3" />
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Select a file or create a new note
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                Cmd+N to quick create
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
