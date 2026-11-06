import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Check,
  ChevronDown,
  CornerDownLeft,
  Italic,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Smile,
  Trash,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { NoteItem } from "../api/tauriBridge";
import { NOTE_FONTS, fontStack, tauriApi } from "../api/tauriBridge";
import { useUndoStack } from "../hooks/useUndoStack";
import { HeadingSelect } from "./HeadingSelect";
import { EmojiAutocomplete } from "./EmojiAutocomplete";
import { EmojiPickerModal } from "./EmojiPickerModal";
import { EditImageModal } from "./EditImageModal";
import { ImageContextMenu } from "./ImageContextMenu";
import { ImageLightbox } from "./ImageLightbox";
import { InsertMenu } from "./InsertMenu";
import { ModeToggle } from "./ModeToggle";
import { RawEditor } from "./RawEditor";
import { TableMenu } from "./TableMenu";
import { getMarkdownShortcuts, matchesCombo } from "../lib/shortcuts";
import {
  contentToMarkdown,
  markdownToContent,
  handleCheckboxClick,
  applyTask,
  handleRichEditorKeyDown,
  htmlToMarkdown,
  isRichBoldActive,
  isRichItalicActive,
  markdownToHtml,
  handleMarkdownPaste,
  normalizeEditor,
  applyHeading,
  insertTableAtCaret,
  insertCodeBlockAtCaret,
  applyOrderedList,
  applyBlockquote,
  applyDefinitionList,
  applyInlineCode,
  applyLink,
  applyFootnote,
  applyStrikethrough,
  applyHighlight,
  applySubscript,
  applySuperscript,
  insertEmojiAtCaret,
  insertInlineImageAtCaret,
  insertInlineImageInMarkdown,
  isCaretAtEditorStart,
  placeCaretAtEditorStart,
  fixCheckboxCaret,
  openExternalUrl,
} from "../lib/format";
import { accentFor, cleanText, cx, fullStamp, uid } from "../lib/text";

interface NoteSheetProps {
  note: NoteItem;
  origin: DOMRect;
  canvas: HTMLElement | null;
  shelves: string[];
  onCommit: (note: NoteItem) => void;
  onClose: () => void;
  onDelete: (note: NoteItem) => void;
  /** true when switching notes while the drawer is already open (skip the slide-in) */
  instant?: boolean;
  /** fired the moment the exit slide starts so the dashboard can reclaim the space */
  onClosing?: () => void;
  /** fired on the exact frame the entry slide begins, so the dashboard can start easing in lockstep */
  onOpening?: () => void;
  width?: number;
  onResizeWidth?: (w: number) => void;
  onResizeStateChange?: (resizing: boolean) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  isBottomMode?: boolean;
}

export function NoteSheet({
  note,
  origin: _origin,
  canvas: _canvas,
  shelves,
  onCommit,
  onClose,
  onDelete,
  instant = false,
  onClosing,
  onOpening,
  width,
  onResizeWidth,
  onResizeStateChange,
  isMaximized = false,
  onToggleMaximize,
  isBottomMode = false,
}: NoteSheetProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<"pre" | "in" | "settled" | "out">(instant ? "settled" : "pre");
  const phaseTimer = useRef(0);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; cell: HTMLElement } | null>(null);
  const closing = useRef(false);
  const deleted = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const [draft, setDraft] = useState<NoteItem>(note);
  const draftRef = useRef(draft);
  const saveTimer = useRef(0);
  const [fontOpen, setFontOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontSearch, setFontSearch] = useState("");
  const filteredSystemFonts = useMemo(() => {
    if (!fontSearch.trim()) return systemFonts;
    const q = fontSearch.toLowerCase();
    return systemFonts.filter((f) => f.toLowerCase().includes(q));
  }, [systemFonts, fontSearch]);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontWrapRef = useRef<HTMLDivElement>(null);
  const [fontMenuStyle, setFontMenuStyle] = useState<React.CSSProperties>({});
  const shelfMenuRef = useRef<HTMLDivElement>(null);
  const [shelfMenuStyle, setShelfMenuStyle] = useState<React.CSSProperties>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newShelf, setNewShelf] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<() => void>(() => {});
  const closeCancel = useRef<() => void>(() => {});

  // Note zoom level (scoped strictly to note view: 60% - 200%)
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("doit:note-zoom");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 60 && val <= 200) return val;
      }
    } catch {}
    return 100;
  });

  const adjustZoom = useCallback((delta: number) => {
    setZoom((prev) => {
      const next = Math.max(60, Math.min(200, Math.round((prev + delta) / 10) * 10));
      try {
        localStorage.setItem("doit:note-zoom", next.toString());
      } catch {}
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(100);
    try {
      localStorage.setItem("doit:note-zoom", "100");
    } catch {}
  }, []);

  // Measure actual toolbar rendered width dynamically for fluid responsive scaling
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState<number>(() => (width && width > 0 ? width : 580));

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setToolbarWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveWidth = isMaximized ? 1200 : (toolbarWidth || width || 580);
  const isTight = !isMaximized && effectiveWidth < 680;
  const isVeryTight = !isMaximized && effectiveWidth < 520;

  // Load system fonts deferred to not block initial slide-in
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void tauriApi.getSystemFonts().then((fonts) => {
        if (fonts && fonts.length > 0) {
          setSystemFonts(fonts);
        }
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  // Viewport detection hooks to ensure dropdowns never get clipped by window/panel boundaries
  // The toolbar scrolls horizontally (overflow clips absolute children), so the menu is anchored to the
  // trigger with fixed coordinates relative to the docked panel and capped to the panel's bottom edge.
  useLayoutEffect(() => {
    if (!fontOpen || !fontWrapRef.current) return;
    // viewport coordinates (the menu is portaled to <body>, so no clipping / containing-block surprises)
    const r = fontWrapRef.current.getBoundingClientRect();
    const w = 260;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const top = r.bottom + 6;
    const maxHeight = Math.max(260, Math.min(520, window.innerHeight - top - 16));
    setFontMenuStyle({ position: "fixed", left, top, right: "auto", maxHeight, width: `${w}px` });
  }, [fontOpen]);

  useLayoutEffect(() => {
    if (shelfOpen && shelfMenuRef.current) {
      const rect = shelfMenuRef.current.getBoundingClientRect();
      const style: React.CSSProperties = {};
      if (rect.left < 8) {
        style.left = 0;
        style.right = "auto";
      } else if (rect.right > window.innerWidth - 8) {
        style.right = 0;
        style.left = "auto";
      }
      setShelfMenuStyle(style);
    }
  }, [shelfOpen]);

  // Screen-Adaptive Minimum Threshold: 360px on compact screens, 420px on standard/high-res displays
  const getAdaptiveMinW = () => (window.innerWidth <= 1280 ? 360 : 420);

  // Interactive Resizable Right Panel
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width || 520);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    onResizeStateChange?.(true);
    startX.current = e.clientX;
    startWidth.current = width || frame.current?.offsetWidth || 520;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = startX.current - moveEvent.clientX;
      const minW = getAdaptiveMinW();
      const rawW = startWidth.current + deltaX;

      // Dragged past threshold snaps straight into maximize mode
      if (rawW >= window.innerWidth * 0.70 || rawW >= window.innerWidth - 300) {
        isResizing.current = false;
        onResizeStateChange?.(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        onToggleMaximize?.();
        return;
      }

      // Preserve canvas breathing room so dashboard cards never get crushed
      const maxW = Math.max(minW, window.innerWidth - 64 - 480);
      const nextW = Math.round(Math.min(Math.max(rawW, minW), maxW));
      onResizeWidth?.(nextW);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      if (!isResizing.current) return;
      isResizing.current = false;
      onResizeStateChange?.(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const deltaX = startX.current - upEvent.clientX;
      const minW = getAdaptiveMinW();
      const maxW = Math.max(minW, window.innerWidth - 64 - 480);
      const finalW = Math.round(Math.min(Math.max(startWidth.current + deltaX, minW), maxW));
      onResizeWidth?.(finalW);
      try {
        localStorage.setItem("doit.drawer_width", String(finalW));
      } catch {
        /* storage full or blocked */
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Rich text formatting state
  const editorRef = useRef<HTMLDivElement | null>(null);
  const rawTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isItalicActive, setIsItalicActive] = useState(false);
  const lastNoteIdRef = useRef<string | null>(null);

  // Dedicated Emoji Picker Modal
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<DOMRect | null>(null);

  // Image context menu & edit modal
  const [contextMenuImg, setContextMenuImg] = useState<{
    element: HTMLImageElement;
    x: number;
    y: number;
  } | null>(null);
  const [editImgModal, setEditImgModal] = useState<{
    element: HTMLImageElement;
    alt: string;
    src: string;
    refKey?: string;
  } | null>(null);

  const updateActiveFormatting = () => {
    setIsBoldActive(isRichBoldActive());
    setIsItalicActive(isRichItalicActive());
  };

  const initEditor = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    if (node) {
      if (lastNoteIdRef.current !== draft.id || !node.innerHTML || node.innerHTML === "<div><br></div>") {
        lastNoteIdRef.current = draft.id;
        node.innerHTML = markdownToHtml(contentToMarkdown(draft.content));
      }
    }
  }, [draft.id, draft.content]);

  useEffect(() => {
    if (lastNoteIdRef.current !== draft.id) {
      lastNoteIdRef.current = draft.id;
      if (editorRef.current) {
        editorRef.current.innerHTML = markdownToHtml(contentToMarkdown(draft.content));
      }
    }
  }, [draft.id, draft.content]);

  const handleEditorInput = (immediate = false) => {
    if (!editorRef.current) return;
    normalizeEditor(editorRef.current);
    const content = markdownToContent(htmlToMarkdown(editorRef.current), draftRef.current.content, () => uid("line"));
    commit({ ...draftRef.current, content, last_edited: Date.now() }, immediate);
    updateActiveFormatting();
  };

  const handleToolbarFormat = (style: "bold" | "italic") => {
    // 2. Contenteditable freeform editor selection formatting
    if (editorRef.current) {
      const sel = window.getSelection();
      const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && editorRef.current.contains(sel.anchorNode);

      if (hasSelection) {
        // Text is highlighted: apply formatting strictly to that exact text slice
        document.execCommand(style, false);
        handleEditorInput();
        updateActiveFormatting();
      } else {
        // No text selected: toggle formatting state for subsequent typed characters forward
        if (!editorRef.current.contains(document.activeElement)) {
          editorRef.current.focus();
        }
        document.execCommand(style, false);
        updateActiveFormatting();
      }
    }
  };

  const removeImageAt = (index: number) => {
    const existing = (draftRef.current.media_urls && draftRef.current.media_urls.length > 0)
      ? draftRef.current.media_urls
      : (draftRef.current.media_url ? [draftRef.current.media_url] : []);
    const next = existing.filter((_, i) => i !== index);
    edit({ media_urls: next, media_url: next[0] || undefined });
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    event.preventDefault();
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target?.result as string;
        if (!dataUrl) return;
        const altText = file.name ? file.name.replace(/\.[^.]+$/, "") : "Pasted Image";
        if (rawMode) {
          const ed = rawTextareaRef.current;
          const pos = ed?.selectionStart ?? draftRef.current.content.length;
          const currentMd = contentToMarkdown(draftRef.current.content);
          const { text, newCaret } = insertInlineImageInMarkdown(currentMd, dataUrl, pos, altText);
          edit({ content: markdownToContent(text, draftRef.current.content, () => uid("line")) });
          if (ed) {
            requestAnimationFrame(() => {
              ed.selectionStart = newCaret;
              ed.selectionEnd = newCaret;
            });
          }
        } else {
          const ed = editorRef.current;
          if (ed) {
            insertInlineImageAtCaret(ed, dataUrl, altText);
            handleEditorInput();
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target?.result as string;
        if (!dataUrl) return;
        const altText = file.name ? file.name.replace(/\.[^.]+$/, "") : "Dropped Image";
        if (rawMode) {
          const ed = rawTextareaRef.current;
          const pos = ed?.selectionStart ?? draftRef.current.content.length;
          const currentMd = contentToMarkdown(draftRef.current.content);
          const { text, newCaret } = insertInlineImageInMarkdown(currentMd, dataUrl, pos, altText);
          edit({ content: markdownToContent(text, draftRef.current.content, () => uid("line")) });
          if (ed) {
            requestAnimationFrame(() => {
              ed.selectionStart = newCaret;
              ed.selectionEnd = newCaret;
            });
          }
        } else {
          const ed = editorRef.current;
          if (ed) {
            insertInlineImageAtCaret(ed, dataUrl, altText);
            handleEditorInput();
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const runEditorCommand = (fn: (editor: HTMLElement) => void) => {
    const ed = editorRef.current;
    if (!ed) return;
    fn(ed);
    handleEditorInput(true);
  };

  const accent = accentFor(draft.category, shelves);

  const commit = (next: NoteItem, immediate = false) => {
    draftRef.current = next;
    setDraft(next);
    window.clearTimeout(saveTimer.current);
    if (next.source_path) {
      // External file opened in place: autosave is OFF, only the Save button writes to disk
      dirtyRef.current = true;
      setDirty(true);
      void tauriApi.setExternalDirty(true);
      setSavedFlash(false);
      return;
    }
    if (immediate) {
      commitRef.current(next);
      return;
    }
    saveTimer.current = window.setTimeout(() => commitRef.current(draftRef.current), 240);
  };

  const edit = (patch: Partial<NoteItem>, immediate = false) => {
    commit({ ...draftRef.current, ...patch, last_edited: Date.now() }, immediate);
  };

  const external = !!draft.source_path;
  const rawMode = draft.format === "txt";

  const saveExternal = async () => {
    const cur = draftRef.current;
    if (!cur.source_path) return;
    try {
      const saved = await tauriApi.saveExternalFile(cur);
      draftRef.current = { ...cur, source_path: saved.source_path };
      setDraft(draftRef.current);
      dirtyRef.current = false;
      setDirty(false);
      void tauriApi.setExternalDirty(false);
      setSaveError(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (err: any) {
      setSaveError(typeof err === "string" ? err : err?.message || "Could not save the file.");
    }
  };

  // MD Mode <-> Text Mode also flips the file extension (.md <-> .txt) on the next write
  const setMode = (raw: boolean) => {
    if (raw === (draftRef.current.format === "txt")) return;
    commit({ ...draftRef.current, format: raw ? "txt" : "md", last_edited: Date.now() }, true);
  };

  const titleHistory = useUndoStack<string>(draft.id, draft.title ?? "", (title) => edit({ title }));
  const bodyHistory = useUndoStack<NoteItem["content"]>(draft.id, draft.content, (content) => {
    edit({ content });
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(contentToMarkdown(content));
    }
  });

  // Title and body keep separate undo/redo stacks; the focused field decides which one runs.
  const handleUndoKeys = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (draftRef.current.source_path) void saveExternal();
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    const isUndo = k === "z" && !e.shiftKey;
    const isRedo = k === "y" || (k === "z" && e.shiftKey);
    if (!isUndo && !isRedo) return;
    const zone = (e.target as HTMLElement).closest("[data-undo]")?.getAttribute("data-undo");
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    const history = zone === "title" ? titleHistory : bodyHistory;
    if (isUndo) history.undo();
    else history.redo();
  };

  // ---- Right-side drawer slide-in: single spring-like curve, transform only ----
  useLayoutEffect(() => {
    if (instant) return;
    const id = requestAnimationFrame(() => {
      setPhase("in");
      onOpening?.();
    });
    return () => cancelAnimationFrame(id);
  }, [instant]);
  useEffect(() => {
    const el = frame.current;
    el?.focus({ preventScroll: true });
    if (!note.title) {
      requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    }
    // run once on mount only: a later save must never pull focus off a line
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (event.key === "=" || event.key === "+" || event.code === "NumpadAdd" || event.code === "Equal") {
          event.preventDefault();
          event.stopPropagation();
          adjustZoom(10);
          return;
        }
        if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract" || event.code === "Minus") {
          event.preventDefault();
          event.stopPropagation();
          adjustZoom(-10);
          return;
        }
        if (event.key === "0" || event.code === "Numpad0" || event.code === "Digit0") {
          event.preventDefault();
          event.stopPropagation();
          resetZoom();
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (fontOpen || shelfOpen) {
          setFontOpen(false);
          setShelfOpen(false);
          return;
        }
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fontOpen, shelfOpen, adjustZoom, resetZoom]);

  // The backend asks for a final flush right before it blanks the canvas (tray mode)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("flush-pending", () => {
          if (draftRef.current.source_path) return;
          window.clearTimeout(saveTimer.current);
          commitRef.current(draftRef.current);
        }).then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        }),
      )
      .catch(() => undefined);
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (draftRef.current.source_path) void tauriApi.setExternalDirty(false);
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(phaseTimer.current);
      closeCancel.current();
      if (!deleted.current && !draftRef.current.source_path) {
        commitRef.current(draftRef.current);
      }
    };
  }, []);

  const close = () => {
    if (closing.current) return;
    if (draftRef.current.source_path && dirtyRef.current && !window.confirm("Discard unsaved changes to this file?")) return;
    closing.current = true;
    window.clearTimeout(saveTimer.current);

    // Drop trailing empty lines only; blank lines between paragraphs are real content
    const cur = draftRef.current;
    let prunedContent = [...cur.content];
    while (prunedContent.length > 1 && prunedContent[prunedContent.length - 1].text.trim() === "") {
      prunedContent.pop();
    }
    if (prunedContent.length === 0) {
      prunedContent = [{ id: uid("line"), text: "", is_todo: cur.content[0]?.is_todo ?? false, completed: false }];
    }
    const cleanFinal = { ...cur, content: prunedContent };
    draftRef.current = cleanFinal;
    if (!cleanFinal.source_path) commitRef.current(cleanFinal);

    onClosing?.();
    if (frame.current) frame.current.style.pointerEvents = "none";
    // settled -> in (re-enable transition) -> out (slide away), then unmount
    setPhase("in");
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase("out")));
    phaseTimer.current = window.setTimeout(() => onClose(), 290);
  };
  closeRef.current = close;

  const addShelf = () => {
    const name = newShelf.trim().slice(0, 24);
    if (!name) return;
    edit({ category: name });
    setNewShelf("");
    setShelfOpen(false);
  };

  const body = draft.content;

  return (
    <>
      <div
        ref={frame}
        role="complementary"
        aria-label={cleanText(draft.title) || "Untitled note"}
        tabIndex={-1}
        onKeyDownCapture={handleUndoKeys}
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "transform" && phase === "in") setPhase("settled");
        }}
        style={{
          width: "100%",
          height: "100%",
          transform:
            phase === "out"
              ? isBottomMode
                ? "translate3d(0,106%,0)"
                : "translate3d(106%,0,0)"
              : phase === "settled" || isMaximized
                ? "none"
                : phase === "in"
                  ? "translate3d(0,0,0)"
                  : isBottomMode
                    ? "translate3d(0,106%,0)"
                    : "translate3d(106%,0,0)",
          opacity: phase === "pre" ? 0 : 1,
          transition:
            phase === "out"
              ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out"
              : phase === "in"
                ? "transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out"
                : "none",
          willChange: phase === "settled" ? "auto" : "transform",
        }}
        className="relative z-30 flex flex-col h-full w-full overflow-visible rounded-[22px] glass-sheet outline-none border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
      >
        {/* Interactive Resizable Handle Rail */}
        {!isMaximized && !isBottomMode && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="w-1 hover:w-1.5 cursor-col-resize bg-white/10 hover:bg-white/30 transition-all absolute top-0 left-0 h-full z-40 select-none group/resize"
            title="Drag to resize editor panel"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-white/20 group-hover/resize:bg-white/50 transition-colors" />
          </div>
        )}
        <div
          className="h-[2px] shrink-0 origin-left"
          style={{ backgroundColor: accent, animation: "strip-in 620ms cubic-bezier(0.22,1,0.36,1) both" }}
        />

        {/* Row 1: Context & Window Controls */}
        <div className={cx(
          "flex w-full shrink-0 items-center justify-between gap-x-2 pt-2 pb-1 overflow-visible pointer-events-auto",
          isMaximized ? "min-h-[52px] px-6" : "min-h-[46px] px-3.5 sm:px-4",
        )}>
          <div className="flex min-w-0 max-w-[260px] shrink items-center gap-2">
            {external ? (
              <span
                title={draft.source_path}
                className={cx(
                  "flex items-center gap-1.5 truncate rounded-md font-mono tracking-[0.06em] text-ink-3",
                  isMaximized ? "h-7.5 max-w-[280px] px-2 text-[11px]" : "h-6 max-w-[220px] px-1.5 text-[9.5px]",
                )}
              >
                <span className="size-[4px] shrink-0 rounded-full bg-white/60" />
                <span className="truncate">{(draft.source_path || "").split(/[\\/]/).pop()}</span>
              </span>
            ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg font-mono uppercase tracking-[0.11em] text-ink-3 transition-colors hover:bg-white/[0.08] hover:text-ink-1 shrink-0 bg-white/[0.04] cursor-pointer",
                  isMaximized ? "h-8 px-3 text-[11px]" : "h-6.5 px-2 text-[9.5px]",
                )}
              >
                <span className={cx("shrink-0 rounded-full", isMaximized ? "size-[6px]" : "size-[5px]")} style={{ backgroundColor: accent }} />
                <span className={cx("fade-end overflow-hidden whitespace-nowrap", isMaximized ? "max-w-[200px]" : "max-w-[120px]")}>{cleanText(draft.category)}</span>
                <ChevronDown size={isMaximized ? 12 : 10} strokeWidth={2} />
              </button>

              {shelfOpen && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={() => setShelfOpen(false)} />
                  <div
                    ref={shelfMenuRef}
                    style={shelfMenuStyle}
                    className="absolute left-0 top-8 z-50 w-[220px] rounded-[14px] bg-[#14151a] border border-white/20 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.95)]"
                  >
                    <div className="micro px-2 pb-1.5 pt-1">Move to shelf</div>
                    {shelves.map((shelf) => (
                      <button
                        key={shelf}
                        type="button"
                        onClick={() => {
                          edit({ category: shelf });
                          setShelfOpen(false);
                        }}
                        className={cx(
                          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px]",
                          shelf === draft.category
                            ? "bg-white/[0.08] text-ink-1"
                            : "text-ink-3 hover:bg-white/[0.06] hover:text-ink-1",
                        )}
                      >
                        <span className="truncate">{shelf}</span>
                        {shelf === draft.category && <Check size={11} className="ml-auto" />}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-white/[0.07]" />
                    <div className="flex items-center gap-1 px-1 pb-1">
                      <input
                        value={newShelf}
                        onChange={(event) => setNewShelf(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addShelf();
                        }}
                        placeholder="New shelf"
                        className="h-7 min-w-0 flex-1 rounded-md bg-white/[0.05] px-2 text-[11.5px] text-ink-1 outline-none placeholder:text-ink-4"
                      />
                      <button
                        type="button"
                        onClick={addShelf}
                        aria-label="Create shelf"
                        className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-white/[0.08] hover:text-ink-1"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            )}
          </div>

          {/* Right: Window Controls (Trash, Maximize, Close) */}
          <div className="flex shrink-0 items-center gap-1.5 pointer-events-auto">
            {!external && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label="Delete note"
                className={cx(
                  "icon-btn hover:!text-red-400 hover:!bg-red-500/10 cursor-pointer",
                  isMaximized ? "!size-8.5" : "!size-7",
                )}
                title="Delete note"
              >
                <Trash size={isMaximized ? 15 : 12.5} strokeWidth={1.7} />
              </button>
            )}
            {onToggleMaximize && (
              <button
                type="button"
                onClick={onToggleMaximize}
                aria-label={isMaximized ? "Restore panel size" : "Maximize note"}
                className={cx("icon-btn cursor-pointer", isMaximized ? "!size-8.5" : "!size-7")}
                title={isMaximized ? "Restore panel size" : "Maximize note"}
              >
                {isMaximized ? <Minimize2 size={15} strokeWidth={1.7} /> : <Maximize2 size={12.5} strokeWidth={1.7} />}
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close note"
              className={cx("icon-btn cursor-pointer", isMaximized ? "!size-8.5" : "!size-7")}
            >
              <X size={isMaximized ? 15.5 : 13} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Row 2: Mode Toggle & Formatting Tools */}
        <div
          ref={toolbarRef}
          className={cx(
            "flex w-full shrink-0 items-center justify-between pb-2 pt-1 overflow-x-auto scrollbar-none pointer-events-auto border-b border-white/[0.06] transition-all duration-150",
            isMaximized ? "px-6 gap-2" : (isVeryTight ? "px-2.5 gap-1" : "px-3 sm:px-4 gap-1.5"),
          )}
        >
          <div className="flex items-center gap-1 shrink-0">
            <ModeToggle rawMode={rawMode} onChange={setMode} compact={isTight} large={isMaximized} />
            {external && (
              <div className="flex min-w-0 items-center gap-1.5">
                {saveError && (
                  <span className="max-w-[140px] truncate text-[10px] text-red-400" title={saveError}>
                    {saveError}
                  </span>
                )}
                {dirty && !savedFlash && <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">Unsaved</span>}
                <button
                  type="button"
                  onClick={() => void saveExternal()}
                  title="Save to the original file (Ctrl+S)"
                  className={cx(
                    "flex items-center gap-1.5 rounded-[6px] border font-medium transition-colors duration-150",
                    isMaximized ? "h-7.5 px-2.5 text-[11.5px]" : "h-6.5 px-2 text-[10.5px]",
                    dirty
                      ? "border-white bg-white text-black hover:bg-white/90"
                      : "border-white/[0.14] text-ink-3 hover:border-white/30 hover:text-ink-1",
                  )}
                >
                  <Save size={isMaximized ? 13 : 11.5} strokeWidth={2} />
                  {savedFlash ? "Saved" : "Save"}
                </button>
              </div>
            )}
          </div>

          {!rawMode && (
          <div
            className={cx(
              "flex shrink-0 items-center overflow-visible pointer-events-auto transition-all duration-150",
              isVeryTight ? "gap-0.5" : "gap-1",
            )}
          >
            <div ref={fontWrapRef} className="relative pointer-events-auto">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setFontOpen((v) => !v);
                }}
                className={cx(
                  "flex items-center gap-1 rounded-md text-ink-3 transition-all duration-150 ease-out hover:bg-white/[0.06] hover:text-ink-1 cursor-pointer pointer-events-auto shrink-0",
                  isMaximized ? "h-8.5 px-2.5 text-[12px]" : (isVeryTight ? "h-6.5 px-1 text-[10.5px]" : "h-7 px-1.5 text-[11px]"),
                )}
                title={`Note typeface: ${cleanText(draft.font_family) || "Instrument Sans"}`}
              >
                <Type size={isMaximized ? 14.5 : (isVeryTight ? 11.5 : 12.5)} strokeWidth={1.8} className="shrink-0" />
                <span
                  className={cx(
                    "truncate transition-all duration-150 ease-out overflow-hidden inline-block",
                    isMaximized
                      ? "max-w-[140px] opacity-100 ml-1.5"
                      : (!isTight && effectiveWidth >= 640 ? "max-w-[85px] opacity-100 hidden sm:inline-block ml-1" : "hidden"),
                  )}
                >
                  {cleanText(draft.font_family) || "Instrument Sans"}
                </span>
              </button>

              {fontOpen && createPortal(
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setFontOpen(false);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFontOpen(false);
                    }}
                  />
                  <div
                    ref={fontMenuRef}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={fontMenuStyle}
                    className="z-50 w-[240px] max-h-[380px] sm:max-h-[440px] overflow-y-auto scrollbar-thin rounded-[14px] bg-[#14151a] border border-white/20 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.95)] pointer-events-auto overscroll-contain flex flex-col"
                  >
                    <div className="shrink-0">
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-4 px-2 py-1 select-none">
                        Font Presets
                      </div>
                      {NOTE_FONTS.map((font) => (
                        <button
                          key={font.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            edit({ font_family: font.name }, true);
                            if (editorRef.current) {
                              editorRef.current.style.fontFamily = font.stack;
                              editorRef.current.focus();
                            }
                            setFontOpen(false);
                          }}
                          className={cx(
                            "flex h-7.5 w-full items-center justify-between rounded-md px-2 text-left text-[12.5px] cursor-pointer pointer-events-auto",
                            font.name === draft.font_family
                              ? "bg-white/[0.08] text-white"
                              : "text-ink-2 hover:bg-white/[0.06] hover:text-white",
                          )}
                          style={{ fontFamily: font.stack }}
                        >
                          <span className="truncate">{font.label}</span>
                          {font.name === draft.font_family && <Check size={11} />}
                        </button>
                      ))}
                      <div className="my-1.5 h-px bg-white/10" />
                    </div>

                    <div className="flex flex-col flex-1">
                      <div className="sticky -top-2 bg-[#14151a]/95 backdrop-blur-md z-10 pt-1 pb-1 px-1 border-b border-white/10 select-none shadow-sm -mx-1">
                        <div className="flex items-center justify-between px-1 pb-1 select-none">
                          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-4">
                            System Fonts ({filteredSystemFonts.length})
                          </span>
                        </div>
                        <div className="px-1 pb-1">
                          <input
                            type="text"
                            value={fontSearch}
                            onChange={(e) => setFontSearch(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Search installed fonts..."
                            className="w-full h-7 rounded-lg bg-white/[0.05] border border-white/15 px-2 text-[11px] text-ink-1 placeholder:text-ink-4 outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <div className="pt-1.5 px-0.5 space-y-0.5">
                        {filteredSystemFonts.length === 0 ? (
                          <div className="px-2 py-3 text-center text-[11px] text-ink-4">
                            {systemFonts.length === 0 ? "Loading system fonts..." : "No matching fonts found"}
                          </div>
                        ) : (
                          filteredSystemFonts.map((fontName) => {
                            const isCurrent = (draft.font_family || "").toLowerCase() === fontName.toLowerCase();
                            return (
                              <button
                                key={fontName}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  edit({ font_family: fontName }, true);
                                  if (editorRef.current) {
                                    editorRef.current.style.fontFamily = fontStack(fontName);
                                    editorRef.current.focus();
                                  }
                                  setFontOpen(false);
                                }}
                                className={cx(
                                  "flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-[12px] cursor-pointer pointer-events-auto",
                                  isCurrent
                                    ? "bg-white/[0.08] text-white"
                                    : "text-ink-2 hover:bg-white/[0.06] hover:text-white",
                                )}
                                style={{ fontFamily: fontStack(fontName) }}
                              >
                                <span className="truncate">{fontName}</span>
                                {isCurrent && <Check size={11} className="shrink-0 ml-1.5" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </>,
 document.body,
 )}
            </div>

            <span className={cx("h-3.5 w-px bg-white/[0.08] shrink-0", isVeryTight ? "mx-0" : "mx-0.5")} />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToolbarFormat("bold")}
              aria-label="Toggle Bold"
              title="Bold text (Ctrl+B)"
              data-active={isBoldActive || undefined}
              className={cx(
                "icon-btn cursor-pointer shrink-0 transition-all duration-150 ease-out",
                isMaximized ? "!size-8.5" : (isVeryTight ? "!size-6.5" : "!size-7"),
                isBoldActive && "!bg-white/20 !text-white",
              )}
            >
              <Bold size={isMaximized ? 14.5 : (isVeryTight ? 11.5 : 12.5)} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToolbarFormat("italic")}
              aria-label="Toggle Italic"
              title="Italic text (Ctrl+I)"
              data-active={isItalicActive || undefined}
              className={cx(
                "icon-btn cursor-pointer shrink-0 transition-all duration-150 ease-out",
                isMaximized ? "!size-8.5" : (isVeryTight ? "!size-6.5" : "!size-7"),
                isItalicActive && "!bg-white/20 !text-white",
              )}
            >
              <Italic size={isMaximized ? 14.5 : (isVeryTight ? 11.5 : 12.5)} strokeWidth={2.4} />
            </button>

            <span className={cx("h-3.5 w-px bg-white/[0.08] shrink-0", isVeryTight ? "mx-0" : "mx-0.5")} />
            <HeadingSelect
              compact={isTight}
              large={isMaximized}
              editorRef={editorRef}
              onSelect={(level) => runEditorCommand((ed) => applyHeading(ed, level))}
            />

            <InsertMenu
              editorRef={editorRef}
              onInsertTable={() => runEditorCommand((ed) => insertTableAtCaret(ed))}
              onInsertTask={() => runEditorCommand((ed) => applyTask(ed))}
              onInsertOrderedList={() => runEditorCommand((ed) => applyOrderedList(ed))}
              onInsertBlockquote={() => runEditorCommand((ed) => applyBlockquote(ed))}
              onInsertCode={() => runEditorCommand((ed) => insertCodeBlockAtCaret(ed))}
              onInsertDefinitionList={() => runEditorCommand((ed) => applyDefinitionList(ed))}
              onAttachImage={() => fileInputRef.current?.click()}
              onInsertInlineCode={() => runEditorCommand((ed) => applyInlineCode(ed))}
              onInsertLink={() => runEditorCommand((ed) => applyLink(ed))}
              onInsertFootnote={() => runEditorCommand((ed) => applyFootnote(ed))}
              onInsertStrikethrough={() => runEditorCommand((ed) => applyStrikethrough(ed))}
              onInsertHighlight={() => runEditorCommand((ed) => applyHighlight(ed))}
              onInsertSubscript={() => runEditorCommand((ed) => applySubscript(ed))}
              onInsertSuperscript={() => runEditorCommand((ed) => applySuperscript(ed))}
              hasMedia={Boolean((draft.media_urls && draft.media_urls.length > 0) || draft.media_url)}
              large={isMaximized}
              compact={isVeryTight}
            />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setEmojiAnchor(rect);
                setShowEmojiPicker((v) => !v);
              }}
              aria-label="Emoji Picker"
              title="Insert Emoji (:name:)"
              data-active={showEmojiPicker || undefined}
              className={cx(
                "icon-btn cursor-pointer shrink-0 transition-all duration-150 ease-out",
                isMaximized ? "!size-8.5" : (isVeryTight ? "!size-6.5" : "!size-7"),
                showEmojiPicker && "!bg-white/20 !text-white",
              )}
            >
              <Smile size={isMaximized ? 14.5 : (isVeryTight ? 11.5 : 12.5)} strokeWidth={2.2} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                const imageFiles = Array.from(files);
                imageFiles.forEach((file) => {
                  const reader = new FileReader();
                  reader.onload = (loadEvt) => {
                    const dataUrl = loadEvt.target?.result as string;
                    if (!dataUrl) return;
                    const altText = file.name ? file.name.replace(/\.[^.]+$/, "") : "Attached Image";
                    if (rawMode) {
                      const ed = rawTextareaRef.current;
                      const pos = ed?.selectionStart ?? draftRef.current.content.length;
                      const currentMd = contentToMarkdown(draftRef.current.content);
                      const { text, newCaret } = insertInlineImageInMarkdown(currentMd, dataUrl, pos, altText);
                      edit({ content: markdownToContent(text, draftRef.current.content, () => uid("line")) });
                      if (ed) {
                        requestAnimationFrame(() => {
                          ed.selectionStart = newCaret;
                          ed.selectionEnd = newCaret;
                        });
                      }
                    } else {
                      const ed = editorRef.current;
                      if (ed) {
                        insertInlineImageAtCaret(ed, dataUrl, altText);
                        handleEditorInput();
                      }
                    }
                  };
                  reader.readAsDataURL(file);
                });
                e.target.value = "";
              }}
            />

            <span className={cx("h-3.5 w-px bg-white/[0.08] shrink-0", isVeryTight ? "mx-0" : "mx-0.5")} />
            <div
              className={cx(
                "flex items-center rounded-lg bg-white/[0.04] border border-white/10 shrink-0 transition-all duration-150 select-none",
                isMaximized ? "h-8.5 gap-1 px-1.5" : (isVeryTight ? "h-6.5 gap-0.5 px-0.5" : "h-7 gap-0.5 px-1"),
              )}
              title="Note zoom: Ctrl+ to zoom in, Ctrl- to zoom out, Ctrl 0 to reset"
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => adjustZoom(-10)}
                aria-label="Zoom out"
                title="Zoom out (Ctrl -)"
                className={cx(
                  "grid place-items-center rounded text-ink-4 hover:text-white hover:bg-white/10 transition-colors cursor-pointer",
                  isMaximized ? "size-6.5" : (isVeryTight ? "size-4.5" : "size-5"),
                )}
              >
                <ZoomOut size={isMaximized ? 13 : (isVeryTight ? 9.5 : 11)} strokeWidth={2} />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={resetZoom}
                aria-label="Reset zoom"
                title="Reset zoom to 100% (Ctrl 0)"
                className={cx(
                  "font-mono tabular-nums text-ink-3 hover:text-white transition-colors cursor-pointer",
                  isMaximized ? "text-[11.5px] px-1" : (isVeryTight ? "text-[9px] px-0.5" : "text-[10px] px-1"),
                )}
              >
                {zoom}%
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => adjustZoom(10)}
                aria-label="Zoom in"
                title="Zoom in (Ctrl +)"
                className={cx(
                  "grid place-items-center rounded text-ink-4 hover:text-white hover:bg-white/10 transition-colors cursor-pointer",
                  isMaximized ? "size-6.5" : (isVeryTight ? "size-4.5" : "size-5"),
                )}
              >
                <ZoomIn size={isMaximized ? 13 : (isVeryTight ? 9.5 : 11)} strokeWidth={2} />
              </button>
            </div>

            </div>
          )}
        </div>

        <div
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              adjustZoom(e.deltaY < 0 ? 10 : -10);
            }
          }}
          className={cx("scroll min-h-0 flex-1 overflow-y-auto overflow-x-auto", isMaximized ? "px-8 md:px-12" : "px-6")}
        >
          <div
            className={cx("mx-auto w-full pb-8 pt-2 transition-[zoom] duration-150 origin-top", isMaximized ? "max-w-[960px] pt-4" : "max-w-[760px]")}
            style={zoom !== 100 ? { zoom: `${zoom}%` } : undefined}
          >
            <input
              ref={titleRef}
              value={draft.title ?? ""}
              onChange={(event) => edit({ title: event.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "ArrowDown") {
                  if (rawMode) {
                    const textarea = frame.current?.querySelector("textarea");
                    if (textarea) {
                      e.preventDefault();
                      textarea.focus();
                      textarea.setSelectionRange(0, 0);
                      return;
                    }
                  } else if (editorRef.current) {
                    e.preventDefault();
                    placeCaretAtEditorStart(editorRef.current);
                    return;
                  }
                }
                handleUndoKeys(e);
              }}
              data-undo="title"
              placeholder="Untitled"
              aria-label="Note title"
              className={cx(
                "w-full bg-transparent tracking-[-0.032em] text-ink-1 outline-none placeholder:text-ink-4/70 transition-all",
                isMaximized ? "text-[36px] leading-[1.16] py-2 mb-2" : "text-[27px] leading-[1.18]",
              )}
              style={{
                fontFamily: fontStack(draft.font_family),
                fontWeight: 560,
              }}
            />

            {(() => {
              const rawImages = (draft.media_urls && draft.media_urls.length > 0)
                ? draft.media_urls
                : (draft.media_url ? [draft.media_url] : []);
              const images = rawImages.filter((img) => img && typeof img === "string" && img.trim().length > 0);
              if (images.length === 0) return null;
              return (
                <div className="mt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[220px] overflow-y-auto p-1 scroll">
                    {images.map((imgUrl, idx) => (
                      <div
                        key={`img-${idx}`}
                        onClick={() => setPreviewImage(imgUrl)}
                        className="relative group aspect-video min-h-[100px] rounded-[10px] overflow-hidden bg-black/50 border border-white/10 shadow-sm cursor-pointer hover:border-white/30 transition-all flex items-center justify-center"
                        title="Click to preview full image"
                      >
                        <img
                          src={imgUrl}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          onError={(event) => {
                            const parent = event.currentTarget.parentElement;
                            if (parent) parent.style.display = "none";
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImageAt(idx);
                          }}
                          className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-black/80 text-ink-3 hover:bg-black hover:text-white opacity-0 group-hover:opacity-100 transition-opacity border border-white/15 z-10"
                          title="Remove image"
                          aria-label="Remove image"
                        >
                          <X size={11} strokeWidth={2.2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="rule my-5" />

            <div data-undo="body">
              {rawMode ? (
                <RawEditor
                  content={draft.content}
                  textareaRef={rawTextareaRef}
                  minHeight={300}
                  className="text-[13px]"
                  onChange={(content) => commit({ ...draftRef.current, content, last_edited: Date.now() })}
                  onArrowUpAtStart={() => {
                    if (titleRef.current) {
                      titleRef.current.focus();
                      const len = titleRef.current.value.length;
                      titleRef.current.setSelectionRange(len, len);
                    }
                  }}
                />
              ) : (
              <div className="min-h-[220px]">
                <div
                  ref={initEditor}
                  onPaste={(e) => {
                    if (handleMarkdownPaste(e)) handleEditorInput();
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => handleEditorInput()}
                  onContextMenu={(e) => {
                    const img = (e.target as HTMLElement).closest("img.md-img") as HTMLImageElement | null;
                    if (img) {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenuImg({
                        element: img,
                        x: e.clientX,
                        y: e.clientY,
                      });
                      return;
                    }
                    const cell = (e.target as HTMLElement).closest("td,th") as HTMLElement | null;
                    if (cell && editorRef.current?.contains(cell)) {
                      e.preventDefault();
                      e.stopPropagation();
                      setTableMenu({ x: e.clientX, y: e.clientY, cell });
                    }
                  }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest(".md-cb")) e.preventDefault();
                  }}
                  onClick={(e) => {
                    const img = (e.target as HTMLElement).closest("img.md-img") as HTMLImageElement | null;
                    if (img) {
                      e.preventDefault();
                      setPreviewImage(img.src);
                      return;
                    }
                    const link = (e.target as HTMLElement).closest("a.md-link") as HTMLAnchorElement | null;
                    if (link && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      const href = link.getAttribute("href");
                      if (href) openExternalUrl(href);
                      return;
                    }
                    if (handleCheckboxClick(e, editorRef.current)) handleEditorInput();
                    if (editorRef.current) fixCheckboxCaret(editorRef.current);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" && editorRef.current && isCaretAtEditorStart(editorRef.current)) {
                      e.preventDefault();
                      if (titleRef.current) {
                        titleRef.current.focus();
                        const len = titleRef.current.value.length;
                        titleRef.current.setSelectionRange(len, len);
                      }
                      return;
                    }
                    const sc = getMarkdownShortcuts();
                    if (matchesCombo(e, sc.bold)) {
                      e.preventDefault();
                      handleToolbarFormat("bold");
                      return;
                    }
                    if (matchesCombo(e, sc.italic)) {
                      e.preventDefault();
                      handleToolbarFormat("italic");
                      return;
                    }
                    if (editorRef.current && handleRichEditorKeyDown(e, editorRef.current, handleEditorInput)) {
                      return;
                    }
                  }}
                  onKeyUp={() => {
                    updateActiveFormatting();
                    if (editorRef.current) fixCheckboxCaret(editorRef.current);
                  }}
                  onMouseUp={() => {
                    updateActiveFormatting();
                    if (editorRef.current) fixCheckboxCaret(editorRef.current);
                  }}
                  className={cx(
                    "w-full min-h-[300px] whitespace-pre-wrap break-words bg-transparent text-ink-2 outline-none scroll select-text transition-all",
                    isMaximized ? "text-[16.5px] leading-[1.8]" : "text-[15.5px] leading-relaxed",
                  )}
                  style={{
                    fontFamily: fontStack(draft.font_family),
                  }}
                />
              </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between gap-6 px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">
            Last edited {fullStamp(draft.last_edited)}
          </span>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">
            {zoom !== 100 && (
              <>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="hover:text-white transition-colors cursor-pointer text-ink-3"
                  title="Click to reset zoom (Ctrl 0)"
                >
                  Zoom: {zoom}%
                </button>
                <span className="h-3 w-px bg-white/10" />
              </>
            )}
            <span>
              {body.filter((item) => item.is_todo).filter((item) => item.completed).length}/
              {body.filter((item) => item.is_todo).length} closed
            </span>
            <span className="mx-1 h-3 w-px bg-white/10" />
            <CornerDownLeft size={10} strokeWidth={1.8} />
            new line | esc
          </div>
        </div>
      </div>

      <EmojiAutocomplete editorRef={editorRef} onEmojiInserted={handleEditorInput} />

      <EmojiPickerModal
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        anchorRect={emojiAnchor}
        onSelect={(emoji) => {
          if (rawMode) {
            const ed = rawTextareaRef.current;
            if (ed) {
              const start = ed.selectionStart;
              const end = ed.selectionEnd;
              const val = ed.value;
              const next = val.slice(0, start) + emoji + val.slice(end);
              edit({ content: markdownToContent(next, draftRef.current.content, () => uid("line")) });
              requestAnimationFrame(() => {
                ed.selectionStart = start + emoji.length;
                ed.selectionEnd = start + emoji.length;
                ed.focus();
              });
            }
          } else {
            runEditorCommand((ed) => insertEmojiAtCaret(ed, emoji));
            handleEditorInput();
          }
        }}
      />

      {contextMenuImg && (
        <ImageContextMenu
          isOpen={Boolean(contextMenuImg)}
          x={contextMenuImg.x}
          y={contextMenuImg.y}
          imgElement={contextMenuImg.element}
          onClose={() => setContextMenuImg(null)}
          onZoom={() => {
            setPreviewImage(contextMenuImg.element.src);
            setContextMenuImg(null);
          }}
          onEdit={() => {
            setEditImgModal({
              element: contextMenuImg.element,
              alt: contextMenuImg.element.alt || "Image",
              src: contextMenuImg.element.src,
              refKey: contextMenuImg.element.getAttribute("data-ref") || undefined,
            });
            setContextMenuImg(null);
          }}
          onDelete={() => {
            contextMenuImg.element.remove();
            handleEditorInput();
            setContextMenuImg(null);
          }}
        />
      )}

      <EditImageModal
        isOpen={Boolean(editImgModal)}
        onClose={() => setEditImgModal(null)}
        alt={editImgModal?.alt ?? ""}
        src={editImgModal?.src ?? ""}
        refKey={editImgModal?.refKey}
        onSave={(newAlt) => {
          if (!editImgModal) return;
          editImgModal.element.alt = newAlt;
          const ref = editImgModal.element.getAttribute("data-ref");
          if (ref) {
            editImgModal.element.setAttribute("data-md", `![${newAlt}][${ref}]`);
          } else {
            editImgModal.element.setAttribute("data-md", `![${newAlt}](${editImgModal.element.src})`);
          }
          handleEditorInput();
          setEditImgModal(null);
        }}
      />

      {tableMenu && (
        <TableMenu
          x={tableMenu.x}
          y={tableMenu.y}
          cell={tableMenu.cell}
          onClose={() => setTableMenu(null)}
          onChanged={() => handleEditorInput()}
        />
      )}

      {previewImage && <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />}

      {/* Theme-matched destructive action confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-[calc(100%-32px)] max-w-[340px] min-w-[220px] rounded-2xl border border-white/15 bg-[#14151a] p-5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] text-center whitespace-normal break-words select-text animate-in zoom-in-95 duration-150"
          >
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-red-500/10 text-red-400">
              <Trash size={18} strokeWidth={2} />
            </div>
            <h3 className="text-[14px] font-semibold text-white tracking-tight whitespace-normal">
              Delete this note?
            </h3>
            <p className="mt-1.5 text-[12px] text-ink-3 leading-relaxed whitespace-normal break-words px-1">
              Are you sure you want to delete this note?
              <span className="block mt-0.5 text-ink-4">This action cannot be undone.</span>
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-8 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-[12px] font-medium text-ink-1 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  deleted.current = true;
                  onDelete(draftRef.current);
                }}
                className="h-8 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-[12px] font-medium text-red-200 transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
