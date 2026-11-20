import { fontStack } from "../api/tauriBridge";
import { RawEditor } from "../components/RawEditor";
import {
  clearTableResizeHover,
  fixCheckboxCaret,
  handleCheckboxClick,
  handleLinkPaste,
  handleMarkdownPaste,
  handleRichEditorKeyDown,
  handleTableMouseDown,
  handleTableMouseMove,
  isCaretAtEditorStart,
  openExternalUrl,
  scrollCaretIntoView,
} from "../lib/format";
import { getMarkdownShortcuts, matchesCombo } from "../lib/shortcuts";
import { cx } from "../lib/text";
import type { NoteEditor } from "./useNoteEditor";

/** Type sizes and minimum heights: the canvas sheet reads roomier than the compact dock panel. */
const VARIANTS = {
  sheet: {
    wrapper: undefined,
    rawMinHeight: 300,
    raw: "text-[13px]",
    rich: (maximized: boolean) =>
      cx(
        "w-full min-h-[300px] whitespace-pre-wrap break-words bg-transparent text-ink-2 outline-none scroll select-text transition-all",
        maximized ? "text-[16.5px] leading-[1.8]" : "text-[15.5px] leading-relaxed",
      ),
    richBox: "min-h-[220px]",
  },
  dock: {
    wrapper: "min-h-[180px] pb-6",
    rawMinHeight: 180,
    raw: "text-[11.5px]",
    rich: () => "w-full min-h-[180px] whitespace-pre-wrap break-words bg-transparent text-[12.5px] leading-relaxed text-ink-2 outline-none select-text",
    richBox: undefined,
  },
} as const;

function focusTitleEnd(title: HTMLInputElement | null) {
  if (!title) return;
  title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
}

/** The note's body: rich Markdown editing, or a plain textarea for text-mode notes. */
export function NoteBody({ editor, variant, maximized = false }: { editor: NoteEditor; variant: keyof typeof VARIANTS; maximized?: boolean }) {
  const { note } = editor;
  if (!note) return null;
  const look = VARIANTS[variant];
  const fixCaret = () => {
    editor.refreshFormatting();
    if (editor.bodyRef.current) fixCheckboxCaret(editor.bodyRef.current);
  };

  const rich = (
    <div
      ref={editor.attachBody}
      onPaste={(e) => {
        const body = editor.bodyRef.current;
        if ((body && handleLinkPaste(e, body)) || handleMarkdownPaste(e)) editor.input();
      }}
      contentEditable
      suppressContentEditableWarning
      onInput={() => {
        editor.input();
        requestAnimationFrame(() => scrollCaretIntoView(editor.bodyRef.current));
      }}
      onContextMenu={(e) => {
        const img = (e.target as HTMLElement).closest("img.md-img") as HTMLImageElement | null;
        if (img) {
          e.preventDefault();
          e.stopPropagation();
          editor.setImageMenu({ element: img, x: e.clientX, y: e.clientY });
          return;
        }
        const cell = (e.target as HTMLElement).closest("td,th") as HTMLElement | null;
        if (cell && editor.bodyRef.current?.contains(cell)) {
          e.preventDefault();
          e.stopPropagation();
          editor.setTableMenu({ x: e.clientX, y: e.clientY, cell });
        }
      }}
      onMouseMove={(e) => {
        if (editor.bodyRef.current) handleTableMouseMove(e, editor.bodyRef.current);
      }}
      onMouseLeave={() => clearTableResizeHover(editor.bodyRef.current)}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest(".md-cb")) {
          e.preventDefault();
          return;
        }
        if (editor.bodyRef.current) {
          handleTableMouseDown(e, editor.bodyRef.current, editor.input);
        }
      }}
      onClick={(e) => {
        const img = (e.target as HTMLElement).closest("img.md-img") as HTMLImageElement | null;
        if (img) {
          e.preventDefault();
          editor.setPreviewImage(img.src);
          return;
        }
        const link = (e.target as HTMLElement).closest("a.md-link") as HTMLAnchorElement | null;
        if (link && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const href = link.getAttribute("href");
          if (href) openExternalUrl(href);
          return;
        }
        if (handleCheckboxClick(e, editor.bodyRef.current)) editor.input();
        if (editor.bodyRef.current) fixCheckboxCaret(editor.bodyRef.current);
      }}
      onKeyDown={(e) => {
        const body = editor.bodyRef.current;
        if (e.key === "ArrowUp" && body && isCaretAtEditorStart(body)) {
          e.preventDefault();
          focusTitleEnd(editor.titleRef.current);
          return;
        }
        const shortcuts = getMarkdownShortcuts();
        if (matchesCombo(e, shortcuts.bold) || matchesCombo(e, shortcuts.italic)) {
          e.preventDefault();
          editor.format(matchesCombo(e, shortcuts.bold) ? "bold" : "italic");
          return;
        }
        if (body) handleRichEditorKeyDown(e, body, editor.input);
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab" || e.key === "Backspace") {
          requestAnimationFrame(() => scrollCaretIntoView(editor.bodyRef.current));
        }
      }}
      onKeyUp={fixCaret}
      onMouseUp={fixCaret}
      className={look.rich(maximized)}
      style={{ fontFamily: fontStack(note.font_family) }}
    />
  );

  return (
    <div data-undo="body" className={look.wrapper}>
      {editor.rawMode ? (
        <RawEditor
          content={note.content}
          textareaRef={editor.rawRef}
          minHeight={look.rawMinHeight}
          className={look.raw}
          onChange={(content) => editor.change({ content })}
          onArrowUpAtStart={() => focusTitleEnd(editor.titleRef.current)}
        />
      ) : look.richBox ? (
        <div className={look.richBox}>{rich}</div>
      ) : (
        rich
      )}
    </div>
  );
}
