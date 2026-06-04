import type { ClipboardEvent, CompositionEvent, KeyboardEvent, Ref } from "react";
import { Send } from "lucide-react";
import { AppIcon } from "../../base/AppIcon";

interface NoteComposerProps {
  showTitle: boolean;
  title: string;
  onTitleChange: (value: string) => void;
  titlePlaceholder: string;
  note: string;
  onNoteChange: (value: string) => void;
  notePlaceholder: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
  rows: number;
  mobile: boolean;
  saving: boolean;
  disabled: boolean;
  helperText?: string;
  showHelper: boolean;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart?: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onCompositionEnd?: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
}

export function NoteComposer({
  showTitle,
  title,
  onTitleChange,
  titlePlaceholder,
  note,
  onNoteChange,
  notePlaceholder,
  textareaRef,
  rows,
  mobile,
  saving,
  disabled,
  helperText,
  showHelper,
  onPaste,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onSubmit,
}: NoteComposerProps) {
  const hasNote = Boolean(note.trim());

  return (
    <section className="gm-note-composer" data-mobile={mobile ? "true" : "false"}>
      {showTitle ? (
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={titlePlaceholder}
          className="gm-note-title-input"
        />
      ) : null}
      <div className="gm-note-input-wrap">
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder={notePlaceholder}
          rows={rows}
          className="gm-note-textarea"
          data-mobile={mobile ? "true" : "false"}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="gm-note-send-button"
          data-active={hasNote ? "true" : "false"}
          data-mobile={mobile ? "true" : "false"}
          data-saving={saving ? "true" : "false"}
        >
          <AppIcon icon={Send} size={mobile ? "sm" : "xs"} spin={saving} />
        </button>
      </div>
      {showHelper && helperText ? (
        <p className="gm-note-composer-helper" data-saving={saving ? "true" : "false"}>
          {helperText}
        </p>
      ) : null}
    </section>
  );
}
