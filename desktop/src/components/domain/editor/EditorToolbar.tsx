import {
  Bold,
  Code2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Search,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { openSearchPanel } from "@codemirror/search";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { DetailIconButton } from "../../DetailIconButton";
import { AppIcon } from "../../base/AppIcon";
import { useI18n } from "../../../hooks/useI18n";
import type { MarkdownCommandId } from "./editorLogic";

interface EditorToolbarProps {
  view: EditorView | null;
  mobile?: boolean;
  onMarkdownCommand: (command: MarkdownCommandId) => void;
}

const markdownActions: Array<{ command: MarkdownCommandId; labelKey: string; icon: typeof Bold }> = [
  { command: "heading", labelKey: "editorToolbar.heading", icon: Heading2 },
  { command: "bold", labelKey: "editorToolbar.bold", icon: Bold },
  { command: "italic", labelKey: "editorToolbar.italic", icon: Italic },
  { command: "strike", labelKey: "editorToolbar.strike", icon: Strikethrough },
  { command: "inlineCode", labelKey: "editorToolbar.inlineCode", icon: Code2 },
  { command: "link", labelKey: "editorToolbar.link", icon: Link2 },
  { command: "quote", labelKey: "editorToolbar.quote", icon: Quote },
  { command: "bulletList", labelKey: "editorToolbar.bulletList", icon: List },
  { command: "orderedList", labelKey: "editorToolbar.orderedList", icon: ListOrdered },
  { command: "codeBlock", labelKey: "editorToolbar.codeBlock", icon: Code2 },
];

export function EditorToolbar({ view, mobile = false, onMarkdownCommand }: EditorToolbarProps) {
  const { t } = useI18n();
  const canUndo = Boolean(view && undoDepth(view.state) > 0);
  const canRedo = Boolean(view && redoDepth(view.state) > 0);

  return (
    <div className="gm-editor-toolbar" data-mobile={mobile ? "true" : "false"}>
      <div className="gm-editor-toolbar-group">
        {markdownActions.map(({ command, labelKey, icon }) => {
          const title = t(labelKey);
          return (
            <DetailIconButton
              key={command}
              type="button"
              title={title}
              aria-label={title}
              disabled={!view}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onMarkdownCommand(command)}
            >
              <AppIcon icon={icon} size={mobile ? "sm" : "xs"} />
            </DetailIconButton>
          );
        })}
      </div>
      <div className="gm-editor-toolbar-group gm-editor-toolbar-group-end">
        <DetailIconButton
          type="button"
          title={t("editorToolbar.find")}
          aria-label={t("editorToolbar.find")}
          disabled={!view}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (view) openSearchPanel(view);
          }}
        >
          <AppIcon icon={Search} size={mobile ? "sm" : "xs"} />
        </DetailIconButton>
        <DetailIconButton
          type="button"
          title={t("editorToolbar.undo")}
          aria-label={t("editorToolbar.undo")}
          disabled={!canUndo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (view) undo(view);
          }}
        >
          <AppIcon icon={Undo2} size={mobile ? "sm" : "xs"} />
        </DetailIconButton>
        <DetailIconButton
          type="button"
          title={t("editorToolbar.redo")}
          aria-label={t("editorToolbar.redo")}
          disabled={!canRedo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (view) redo(view);
          }}
        >
          <AppIcon icon={Redo2} size={mobile ? "sm" : "xs"} />
        </DetailIconButton>
      </div>
    </div>
  );
}
