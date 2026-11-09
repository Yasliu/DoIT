import { useCallback, useEffect, useRef, useState } from "react";
import { tauriApi, type ContentItem, type NoteItem } from "../api/tauriBridge";
import { useUndoStack } from "../hooks/useUndoStack";
import {
  contentToMarkdown,
  insertEmojiAtCaret,
  insertInlineImageAtCaret,
  insertInlineImageInMarkdown,
  insertSavedImageAtCaret,
  insertSavedImageInMarkdown,
  isRichBoldActive,
  isRichItalicActive,
  markdownToContent,
  markdownToHtml,
} from "../lib/format";
import { createBodyReader, type BodyReader } from "./bodyReader";
import { uid } from "../lib/text";

const NO_CONTENT: ContentItem[] = [];

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export interface NoteEditorOptions {
  /** The note being edited; `null` while none is open. */
  note: NoteItem | null;
  /** Applies a change to the note. `immediate` asks to save without the usual typing debounce. */
  edit: (patch: Partial<NoteItem>, immediate?: boolean) => void;
  /** The note's title field: ArrowUp at the very start of the body moves the caret there. */
  titleRef: React.RefObject<HTMLInputElement | null>;
  /** Ctrl+S inside the note (saving an externally opened file). */
  onSave?: () => void;
}

/**
 * The note editor shared by the canvas sheet and the dock panel: the rich body (or the plain-text
 * textarea), undo for title and body, pasted and dropped images, formatting commands and the
 * editor's popovers. The window around it only lays out its own chrome and toolbar.
 *
 * Render `<NoteBody editor={...} />` and `<EditorOverlays editor={...} />`, and put `onKeyDown`,
 * `onPaste` and `onDrop` on the element that contains the title and body.
 */
export function useNoteEditor({ note, edit, titleRef, onSave }: NoteEditorOptions) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const bodyReader = useRef<BodyReader | null>(null);
  const rawRef = useRef<HTMLTextAreaElement | null>(null);
  // The latest note, including edits made since the last render (async image reads need it).
  const noteRef = useRef(note);
  noteRef.current = note;
  const renderedId = useRef<string | null>(null);
  const rawMode = note?.format === "txt";
  const rawModeRef = useRef(rawMode);
  rawModeRef.current = rawMode;

  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<DOMRect | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageMenu, setImageMenu] = useState<{ element: HTMLImageElement; x: number; y: number } | null>(null);
  const [imageEdit, setImageEdit] = useState<{ element: HTMLImageElement; alt: string; src: string; refKey?: string } | null>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; cell: HTMLElement } | null>(null);

  const change = useCallback(
    (patch: Partial<NoteItem>, immediate = false) => {
      if (noteRef.current) noteRef.current = { ...noteRef.current, ...patch };
      edit(patch, immediate);
    },
    [edit],
  );

  const render = useCallback((content: ContentItem[]) => {
    if (bodyRef.current) bodyRef.current.innerHTML = markdownToHtml(contentToMarkdown(content));
  }, []);

  const refreshFormatting = useCallback(() => {
    setBold(isRichBoldActive());
    setItalic(isRichItalicActive());
  }, []);

  /** Reads the rich body back into the note after any change to its DOM. */
  const input = useCallback(
    (immediate = false) => {
      const body = bodyRef.current;
      const current = noteRef.current;
      if (!body || !current) return;
      const markdown = bodyReader.current?.read() ?? "";
      change({ content: markdownToContent(markdown, current.content, () => uid("line")) }, immediate);
      refreshFormatting();
    },
    [change, refreshFormatting],
  );

  // Fill the body when a note opens or another one replaces it (never while typing in it).
  const attachBody = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current = node;
      bodyReader.current?.disconnect();
      bodyReader.current = node ? createBodyReader(node) : null;
      const current = noteRef.current;
      if (node && current && (renderedId.current !== current.id || !node.innerHTML || node.innerHTML === "<div><br></div>")) {
        renderedId.current = current.id;
        node.innerHTML = markdownToHtml(contentToMarkdown(current.content));
      }
    },
    [],
  );
  useEffect(() => {
    if (!note) {
      renderedId.current = null;
      return;
    }
    if (renderedId.current !== note.id) {
      renderedId.current = note.id;
      render(note.content);
    }
  }, [note, render]);

  const titleHistory = useUndoStack<string>(note?.id ?? null, note?.title ?? "", (title) => change({ title }));
  const bodyHistory = useUndoStack<ContentItem[]>(note?.id ?? null, note?.content ?? NO_CONTENT, (content) => {
    change({ content });
    render(content);
  });

  /** Runs a formatting command on the rich body and saves the result right away. */
  const run = useCallback(
    (command: (body: HTMLElement) => void) => {
      if (!bodyRef.current) return;
      command(bodyRef.current);
      input(true);
    },
    [input],
  );

  /** Inserts text at the caret of the plain-text textarea, keeping the caret after it. */
  const insertRaw = useCallback(
    (insert: (markdown: string, caret: number) => { text: string; caret: number }) => {
      const current = noteRef.current;
      if (!current) return;
      const area = rawRef.current;
      const markdown = contentToMarkdown(current.content);
      const { text, caret } = insert(markdown, area?.selectionStart ?? markdown.length);
      change({ content: markdownToContent(text, current.content, () => uid("line")) });
      if (area) {
        requestAnimationFrame(() => {
          area.selectionStart = caret;
          area.selectionEnd = caret;
          area.focus();
        });
      }
    },
    [change],
  );

  /** Bold or italic: wraps a selection in the title, or toggles it in the body. */
  const format = useCallback(
    (style: "bold" | "italic") => {
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement) {
        const start = focused.selectionStart ?? 0;
        const end = focused.selectionEnd ?? 0;
        if (start !== end) {
          const value = focused.value;
          const selected = value.slice(start, end);
          const marker = style === "bold" ? "**" : "*";
          const wrapped =
            selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2
              ? selected.slice(marker.length, selected.length - marker.length)
              : `${marker}${selected}${marker}`;
          focused.value = value.slice(0, start) + wrapped + value.slice(end);
          focused.dispatchEvent(new Event("input", { bubbles: true }));
          requestAnimationFrame(() => focused.setSelectionRange(start, start + wrapped.length));
          return;
        }
      }
      if (focused instanceof HTMLElement && focused.dataset.taskLine) {
        document.execCommand(style, false);
        refreshFormatting();
        return;
      }
      const body = bodyRef.current;
      if (!body) return;
      const selection = window.getSelection();
      const hasSelection = selection && selection.rangeCount > 0 && !selection.isCollapsed && body.contains(selection.anchorNode);
      if (!hasSelection && !body.contains(document.activeElement)) body.focus();
      document.execCommand(style, false);
      if (hasSelection) input();
      refreshFormatting();
    },
    [input, refreshFormatting],
  );

  const placeSavedImage = useCallback(
    (path: string, alt: string) => {
      if (rawModeRef.current) {
        insertRaw((markdown, caret) => {
          const { text, newCaret } = insertSavedImageInMarkdown(markdown, path, caret, alt);
          return { text, caret: newCaret };
        });
      } else if (bodyRef.current) {
        insertSavedImageAtCaret(bodyRef.current, path, alt);
        input();
      }
    },
    [input, insertRaw],
  );

  const placeEmbeddedImage = useCallback(
    (src: string, alt: string) => {
      if (rawModeRef.current) {
        insertRaw((markdown, caret) => {
          const { text, newCaret } = insertInlineImageInMarkdown(markdown, src, caret, alt);
          return { text, caret: newCaret };
        });
      } else if (bodyRef.current) {
        insertInlineImageAtCaret(bodyRef.current, src, alt);
        input();
      }
    },
    [input, insertRaw],
  );

  /**
   * Adds image files at the caret. They are saved next to the notes and linked by path; a file
   * opened from elsewhere embeds them instead, so it still works outside DoIT.
   */
  const insertImages = useCallback(
    (files: File[], fallbackAlt: string) => {
      files
        .filter((file) => file.type.startsWith("image/"))
        .forEach(async (file) => {
          const alt = file.name ? file.name.replace(/\.[^.]+$/, "") : fallbackAlt;
          const path = noteRef.current?.source_path ? null : await tauriApi.saveAttachment(await file.arrayBuffer(), file.type);
          if (path) placeSavedImage(path, alt);
          else placeEmbeddedImage(await readDataUrl(file), alt);
        });
    },
    [placeEmbeddedImage, placeSavedImage],
  );

  const insertEmoji = useCallback(
    (emoji: string) => {
      if (rawModeRef.current) {
        const area = rawRef.current;
        if (!area) return;
        const [start, end] = [area.selectionStart, area.selectionEnd];
        insertRaw((markdown) => ({ text: markdown.slice(0, start) + emoji + markdown.slice(end), caret: start + emoji.length }));
      } else {
        run((body) => insertEmojiAtCaret(body, emoji));
      }
    },
    [insertRaw, run],
  );

  /** Undo and redo for the focused field (title and body keep separate histories), and Ctrl+S. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !noteRef.current) return;
    const key = e.key.toLowerCase();
    if (key === "s" && !e.shiftKey && onSave) {
      e.preventDefault();
      onSave();
      return;
    }
    const undo = key === "z" && !e.shiftKey;
    const redo = key === "y" || (key === "z" && e.shiftKey);
    if (!undo && !redo) return;
    const zone = (e.target as HTMLElement).closest("[data-undo]")?.getAttribute("data-undo");
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    const history = zone === "title" ? titleHistory : bodyHistory;
    if (undo) history.undo();
    else history.redo();
  };

  const imageFiles = (items: DataTransferItemList | FileList | undefined | null): File[] => {
    if (!items) return [];
    if (items instanceof FileList) return Array.from(items);
    return Array.from(items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = imageFiles(e.clipboardData?.items).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    insertImages(files, "Pasted Image");
  };

  const onDrop = (e: React.DragEvent) => {
    const files = imageFiles(e.dataTransfer?.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    insertImages(files, "Dropped Image");
  };

  return {
    note,
    rawMode,
    titleRef,
    bodyRef,
    rawRef,
    attachBody,
    bold,
    italic,
    refreshFormatting,
    input,
    change,
    run,
    format,
    insertImages,
    insertEmoji,
    onKeyDown,
    onPaste,
    onDrop,
    emojiAnchor,
    /** Opens the emoji picker under `anchor`, or closes it if open. */
    toggleEmojiPicker: (anchor: DOMRect) => setEmojiAnchor((open) => (open ? null : anchor)),
    closeEmojiPicker: () => setEmojiAnchor(null),
    previewImage,
    setPreviewImage,
    imageMenu,
    setImageMenu,
    imageEdit,
    setImageEdit,
    tableMenu,
    setTableMenu,
  };
}

export type NoteEditor = ReturnType<typeof useNoteEditor>;
