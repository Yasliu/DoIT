import { useCallback, useEffect, useRef, useState } from "react";
import { tauriApi, type ContentItem, type NoteItem } from "../api/tauriBridge";
import { useUndoStack } from "../hooks/useUndoStack";
import {
  contentToMarkdown,
  extractClipboardHtmlImage,
  insertEmojiAtCaret,
  insertInlineImageAtCaret,
  insertInlineImageInMarkdown,
  insertSavedImageAtCaret,
  insertSavedImageInMarkdown,
  isRichBoldActive,
  isRichItalicActive,
  markdownToContent,
  markdownToHtml,
  rememberImageSrc,
  scrollCaretIntoView,
  settleImageBlocks,
} from "../lib/format";
import { createBodyReader, type BodyReader } from "./bodyReader";
import { uid } from "../lib/text";
import { listenZoomWheel } from "../lib/zoomWheel";

const NO_CONTENT: ContentItem[] = [];

const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

function imageMimeOf(file: File): string | null {
  const rawType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (rawType.startsWith("image/")) return rawType;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT_MIME[ext] ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(""));
}

async function readImageFile(file: File): Promise<{ buffer: ArrayBuffer; dataUrl: string; mime: string } | null> {
  const mime = imageMimeOf(file);
  if (!mime) return null;
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > 0) {
      return { buffer, mime, dataUrl: `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}` };
    }
  } catch {
    /* fall through to FileReader */
  }
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return null;
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = base64 ? atob(base64) : "";
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { buffer: bytes.buffer, mime, dataUrl };
}

function fileFromDataUrl(dataUrl: string, fallbackName = "pasted-image"): File | null {
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = Object.entries(IMAGE_EXT_MIME).find(([, v]) => v === mime)?.[0] ?? "png";
  try {
    const bin = atob(m[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], `${fallbackName}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

export interface NoteEditorOptions {
  /** The note being edited; `null` while none is open. */
  note: NoteItem | null;
  /** Applies a change to the note. */
  edit: (patch: Partial<NoteItem>) => void;
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
    (patch: Partial<NoteItem>) => {
      if (noteRef.current) noteRef.current = { ...noteRef.current, ...patch };
      edit(patch);
    },
    [edit],
  );

  const render = useCallback((content: ContentItem[]) => {
    const body = bodyRef.current;
    if (!body) return;
    body.innerHTML = markdownToHtml(contentToMarkdown(content));
    settleImageBlocks(body);
  }, []);

  const refreshFormatting = useCallback(() => {
    setBold(isRichBoldActive());
    setItalic(isRichItalicActive());
  }, []);

  /** Reads the rich body back into the note after any change to its DOM. */
  const input = useCallback(
    () => {
      const body = bodyRef.current;
      const current = noteRef.current;
      if (!body || !current) return;
      const markdown = bodyReader.current?.read() ?? "";
      change({ content: markdownToContent(markdown, current.content, () => uid("line")) });
      refreshFormatting();
      scrollCaretIntoView(body);
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
        settleImageBlocks(node);
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

  /** Runs a formatting command on the rich body and reads the result back into the note. */
  const run = useCallback(
    (command: (body: HTMLElement) => void) => {
      if (!bodyRef.current) return;
      command(bodyRef.current);
      input();
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
    (path: string, alt: string, previewSrc?: string) => {
      if (previewSrc) rememberImageSrc(path, previewSrc);
      if (rawModeRef.current) {
        insertRaw((markdown, caret) => {
          const { text, newCaret } = insertSavedImageInMarkdown(markdown, path, caret, alt);
          return { text, caret: newCaret };
        });
      } else if (bodyRef.current) {
        insertSavedImageAtCaret(bodyRef.current, path, alt, previewSrc);
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
      const targetNoteId = noteRef.current?.id;
      files
        .filter((file) => Boolean(imageMimeOf(file)))
        .forEach(async (file) => {
          const cleanName = !file.name || /^image\.[^.]+$/i.test(file.name) ? "" : file.name.replace(/\.[^.]+$/, "");
          const alt = cleanName || fallbackAlt;
          const data = await readImageFile(file);
          if (!data || !data.dataUrl) return;
          if (!targetNoteId || noteRef.current?.id !== targetNoteId) return;
          const path = noteRef.current?.source_path ? null : await tauriApi.saveAttachment(data.buffer, data.mime);
          if (!targetNoteId || noteRef.current?.id !== targetNoteId) return;
          if (path) placeSavedImage(path, alt, data.dataUrl);
          else placeEmbeddedImage(data.dataUrl, alt);
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

  const collectClipboardImageFiles = (cd: DataTransfer | null | undefined): File[] => {
    if (!cd) return [];
    const out: File[] = [];
    const seen = new Set<string>();
    const add = (file: File | null | undefined) => {
      if (!file || !imageMimeOf(file)) return;
      const sig = `${file.name}:${file.size}:${file.type}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push(file);
    };
    if (cd.items) {
      Array.from(cd.items).forEach((item) => {
        if (item.kind === "file" || item.type.startsWith("image/")) add(item.getAsFile());
      });
    }
    if (cd.files) {
      Array.from(cd.files).forEach((file) => add(file));
    }
    return out;
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = collectClipboardImageFiles(e.clipboardData);
    if (files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      insertImages(files, "Pasted Image");
      return;
    }
    const text = (e.clipboardData?.getData("text/plain") || "").trim();
    const html = e.clipboardData?.getData("text/html") || "";
    const htmlImg = /^(?:\[image\]|https?:\/\/\S+)?$/i.test(text) ? extractClipboardHtmlImage(html) : null;
    if (!htmlImg) return;
    e.preventDefault();
    e.stopPropagation();
    const alt = htmlImg.alt && !/^image$/i.test(htmlImg.alt) ? htmlImg.alt : "Pasted Image";
    if (htmlImg.src.startsWith("data:")) {
      const converted = fileFromDataUrl(htmlImg.src, "pasted-image");
      if (converted) insertImages([converted], alt);
      else placeEmbeddedImage(htmlImg.src, alt);
      return;
    }
    void fetch(htmlImg.src)
      .then(async (resp) => {
        if (!resp.ok) throw new Error("fetch failed");
        const blob = await resp.blob();
        if (!blob.type.startsWith("image/")) throw new Error("not image");
        const ext = Object.entries(IMAGE_EXT_MIME).find(([, v]) => v === blob.type.toLowerCase())?.[0] ?? "png";
        const file = new File([blob], `pasted-image.${ext}`, { type: blob.type });
        insertImages([file], alt);
      })
      .catch(() => {
        placeEmbeddedImage(htmlImg.src, alt);
      });
  };

  const onDrop = (e: React.DragEvent) => {
    const files = collectClipboardImageFiles(e.dataTransfer);
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
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

/**
 * Attaches non-passive wheel (Ctrl+scroll and Windows/Chromium touchpad pinch) and native pinch
 * (`doit:pinch-zoom` / Safari `gesture*`) listeners so two-finger zoom scales only the note text.
 */
export function useNoteZoomListeners(enabled: boolean, adjustZoom: (delta: number) => void) {
  const wheelAccumRef = useRef(0);
  const gestureScaleRef = useRef(1);

  useEffect(() => {
    if (!enabled) {
      wheelAccumRef.current = 0;
      return;
    }

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY === 0) return;

      if (Math.abs(e.deltaY) >= 40 || e.deltaMode !== 0) {
        wheelAccumRef.current = 0;
        adjustZoom(e.deltaY < 0 ? 10 : -10);
        return;
      }

      if (wheelAccumRef.current !== 0 && Math.sign(wheelAccumRef.current) !== Math.sign(e.deltaY)) {
        wheelAccumRef.current = 0;
      }
      wheelAccumRef.current += e.deltaY;
      if (Math.abs(wheelAccumRef.current) >= 15) {
        const step = wheelAccumRef.current < 0 ? 10 : -10;
        wheelAccumRef.current = 0;
        adjustZoom(step);
      }
    };

    const onPinchZoom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number" && detail !== 0) {
        adjustZoom(detail);
      }
    };

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureScaleRef.current = (e as unknown as { scale?: number }).scale || 1;
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as unknown as { scale?: number }).scale;
      if (!scale || scale <= 0) return;
      const ratio = scale / gestureScaleRef.current;
      if (ratio >= 1.08) {
        gestureScaleRef.current = scale;
        adjustZoom(10);
      } else if (ratio <= 1 / 1.08) {
        gestureScaleRef.current = scale;
        adjustZoom(-10);
      }
    };

    const stopWheel = listenZoomWheel(onWheel);
    window.addEventListener("doit:pinch-zoom", onPinchZoom);
    window.addEventListener("gesturestart", onGestureStart, { passive: false });
    window.addEventListener("gesturechange", onGestureChange, { passive: false });
    return () => {
      stopWheel();
      window.removeEventListener("doit:pinch-zoom", onPinchZoom);
      window.removeEventListener("gesturestart", onGestureStart);
      window.removeEventListener("gesturechange", onGestureChange);
    };
  }, [enabled, adjustZoom]);
}
