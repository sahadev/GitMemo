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

export function canCreateNote(tab: NotesTab, note: string, manualTitle: string, saving: boolean) {
  if (saving) return false;
  if (!note.trim()) return false;
  return !isManualNotesTab(tab) || Boolean(manualTitle.trim());
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
