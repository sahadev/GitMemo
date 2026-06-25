import type { NotesTab } from "../../../hooks/useAppStore";

export function getNotesTabForPath(path: string): NotesTab {
  return path.startsWith("notes/manual/") ? "manual" : "scratch";
}

export function isManualNotesTab(tab: NotesTab) {
  return tab === "manual";
}

export interface NoteComposerDrafts {
  scratch: string;
  manual: string;
}

export function getNoteComposerDraft(tab: NotesTab, drafts: NoteComposerDrafts) {
  return isManualNotesTab(tab) ? drafts.manual : drafts.scratch;
}

export type NoteCreateBlockReason = "saving" | "empty-content" | "missing-title";

export function getNoteCreateBlockReason(tab: NotesTab, note: string, manualTitle: string, saving: boolean): NoteCreateBlockReason | null {
  if (saving) return "saving";
  if (!note.trim()) return "empty-content";
  if (isManualNotesTab(tab) && !manualTitle.trim()) return "missing-title";
  return null;
}

export function canCreateNote(tab: NotesTab, note: string, manualTitle: string, saving: boolean) {
  return getNoteCreateBlockReason(tab, note, manualTitle, saving) === null;
}

export function canPressNoteCreateButton(note: string, saving: boolean) {
  return !saving && Boolean(note.trim());
}

export function getNoteCreateBlockToastKey(reason: NoteCreateBlockReason) {
  if (reason === "missing-title") return "notes.titleRequired";
  if (reason === "empty-content") return "notes.contentRequired";
  return "notes.saving";
}

export function getNotePlaceholderKey(tab: NotesTab) {
  return isManualNotesTab(tab) ? "notes.placeholderManual" : "notes.placeholderScratch";
}

export function getEmptyNotesDescriptionKey(tab: NotesTab) {
  return isManualNotesTab(tab) ? "notes.docsHint" : "notes.useInputAbove";
}

export function shouldShowNoteComposerHelper(isMobile: boolean, saving: boolean) {
  return !isMobile || saving;
}

export function canNavigateListFromEmptyComposer(note: string) {
  return !note.trim();
}
