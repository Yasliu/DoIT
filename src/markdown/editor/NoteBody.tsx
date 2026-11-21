import { useCallback, useEffect, useState } from "react";
import { fontStack } from "./fonts";
import { useFigureMounts } from "../figures";
import { RawEditor } from "./RawEditor";
import {
  clearTableResizeHover,
  closeFigureSource,
  closeFigureSourcesAwayFromCaret,
  editFigure,
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
} from "../../lib/format";
import { getMarkdownShortcuts, matchesCombo } from "../../lib/shortcuts";
import { cx } from "../../lib/text";
import type { NoteEditor } from "../../editor/useNoteEditor";

/** Type sizes and minimum heights: the canvas sheet reads roomier than the compact dock panel. */
const VARIANTS = {
  sheet: {
    wrapper: undefined,
    rawMinHeight: 300,
    raw: "text-[13.5px]",
    rich: (maximized: boolean) =>
      cx(
        "w-full min-h-[300px] whitespace-pre-wrap break-words bg-transparent text-foreground caret-[var(--graph-accent)] outline-none select-text",
        maximized ? "text-[15px] leading-[1.8]" : "text-[14px] leading-[1.75]",
      ),
    richBox: "min-h-[220px]",
  },
  dock: {
    wrapper: "min-h-[180px] pb-6",
    rawMinHeight: 180,
    raw: "text-[11.5px]",
    rich: () => "w-full min-h-[180px] whitespace-pre-wrap break-words bg-transparent text-[12.5px] leading-[1.7] text-foreground caret-[var(--graph-accent)] outline-none select-text",
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
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      editor.attachBody(node);
      setBody(node);
    },
    [editor.attachBody],
  );
  useFigureMounts(body);

  // A figure opened for editing is drawn again once the caret leaves its source.
  useEffect(() => {
    if (!body) return;
    const onSelection = () => {
      if (body.querySelector("pre[data-figure-src]")) closeFigureSourcesAwayFromCaret(body);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [body]);

  if (!note) return null;
  const look = VARIANTS[variant];
  const fixCaret = () => {
    editor.refreshFormatting();
    if (editor.bodyRef.current) fixCheckboxCaret(editor.bodyRef.current);
  };

  const rich = (
    <div
      ref={attach}
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
        if ((e.target as HTMLElement).closest(".md-figure")) {
          e.preventDefault();
          return;
        }
        if ((e.target as HTMLElement).closest(".md-cb")) {
          e.preventDefault();
          return;
        }
        if (editor.bodyRef.current) {
          handleTableMouseDown(e, editor.bodyRef.current, editor.input);
        }
      }}
      onClick={(e) => {
        const figure = (e.target as HTMLElement).closest(".md-figure") as HTMLElement | null;
        if (figure && editor.bodyRef.current?.contains(figure)) {
          e.preventDefault();
          editFigure(figure);
          return;
        }
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
        // Escape in a figure's source draws it again; it does not close the note.
        const anchor = e.key === "Escape" ? window.getSelection()?.anchorNode : null;
        const source = anchor ? ((anchor instanceof Element ? anchor : anchor.parentElement)?.closest("pre[data-figure-src]") as HTMLElement | null) : null;
        if (source) {
          e.preventDefault();
          e.stopPropagation();
          const after = source.nextElementSibling as HTMLElement | null;
          closeFigureSource(source);
          if (after) window.getSelection()?.collapse(after, 0);
          return;
        }
        if (e.key === "ArrowUp" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && body && isCaretAtEditorStart(body)) {
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
