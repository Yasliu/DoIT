import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Mark } from "./Mark";
import { initCategoryIcons } from "../lib/categoryIcons";
import { HeadingSelect } from "./HeadingSelect";
import { ImageLightbox } from "./ImageLightbox";
import { InsertMenu } from "./InsertMenu";
import { ModeToggle } from "./ModeToggle";
import { TrayPill } from "./TrayPill";
import { RawEditor } from "./RawEditor";
import { TableMenu } from "./TableMenu";
import { EmojiAutocomplete } from "./EmojiAutocomplete";
import { EmojiPickerModal } from "./EmojiPickerModal";
import { EditImageModal } from "./EditImageModal";
import { ImageContextMenu } from "./ImageContextMenu";
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  Italic,
  Minus,
  SquarePen,
  Plus,
  Search,
  Smile,
  Trash,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ContentItem,
  NOTE_FONTS,
  NoteItem,
  fontStack,
  tauriApi,
} from "../api/tauriBridge";
import { useWorkspace } from "../hooks/useWorkspace";
import { useUndoStack } from "../hooks/useUndoStack";
import { applyShortcutSettings, getMarkdownShortcuts, matchesCombo } from "../lib/shortcuts";
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
  setMarkdownBaseDir,
  isCaretAtEditorStart,
  placeCaretAtEditorStart,
  fixCheckboxCaret,
  openExternalUrl,
} from "../lib/format";
import { applyThemeSettings, isLinux, pick } from "../platform";
import { LinuxDockHome } from "../platform/linux/LinuxDockHome";
import { accentFor, cleanText, cx, relativeShort, uid } from "../lib/text";

const NO_CONTENT: ContentItem[] = [];

export function TrayCompanion() {
  const { notes, categories, patch, create, remove } = useWorkspace();
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const collapsingRef = useRef(false);
  const modeRef = useRef<"switching" | "panel" | "pill">("switching");
  const [mode, setMode] = useState<"switching" | "panel" | "pill">("switching");
  const changeMode = useCallback((next: "switching" | "panel" | "pill") => {
    modeRef.current = next;
    setMode(next);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(pick(true, false));
  const [filter, setFilter] = useState("");
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const visibilityLockRef = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Navigation helpers with proper history stack
  const openNoteById = (id: string) => {
    setActiveNoteId((current) => {
      if (current && current !== id) {
        setHistoryStack((prev) => [...prev, current]);
      }
      return id;
    });
  };

  const handleBack = () => {
    if (historyStack.length === 0) {
      setActiveNoteId(null);
      return;
    }
    const nextStack = [...historyStack];
    const previousId = nextStack.pop() ?? null;
    setHistoryStack(nextStack);
    setActiveNoteId(previousId);
  };

  // If active note no longer exists, step back or clear it
  useEffect(() => {
    if (activeNoteId && notes.length > 0) {
      if (!notes.some((n) => n.id === activeNoteId)) {
        handleBack();
      }
    }
  }, [notes, activeNoteId]);

  // Transition debouncing lock
  const isTransitioning = useRef(false);

  // Formatting popovers
  const [fontOpen, setFontOpen] = useState(false);
  const fontTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [fontMenuStyle, setFontMenuStyle] = useState<React.CSSProperties>({});
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (fontOpen && fontTriggerRef.current) {
      const rect = fontTriggerRef.current.getBoundingClientRect();
      // portaled to <body>: viewport coordinates, clamped inside the window on every side
      const w = 240;
      const left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8));
      const top = rect.bottom + 6;
      const maxHeight = Math.max(220, Math.min(460, window.innerHeight - top - 12));
      setFontMenuStyle({ position: "fixed", left, top, maxHeight, width: `${w}px` });
    }
  }, [fontOpen]);

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontSearch, setFontSearch] = useState("");
  const filteredSystemFonts = useMemo(() => {
    if (!fontSearch.trim()) return systemFonts;
    const q = fontSearch.toLowerCase();
    return systemFonts.filter((f) => f.toLowerCase().includes(q));
  }, [systemFonts, fontSearch]);

  useEffect(() => {
    void tauriApi.getSystemFonts().then((fonts) => {
      if (fonts && fonts.length > 0) {
        setSystemFonts(fonts);
      }
    });
  }, []);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const grabScrollRef = useRef<HTMLDivElement | null>(null);
  const dragScrollState = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

  // Rich text formatting state
  const editorRef = useRef<HTMLDivElement | null>(null);
  const rawTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isBoldActive, setIsBoldActive] = useState<boolean>(false);
  const [isItalicActive, setIsItalicActive] = useState<boolean>(false);
  const lastActiveNoteIdRef = useRef<string | null>(null);

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

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  );

  const shelves = useMemo(() => {
    const list = categories.map((c) => c.name);
    return list.sort((a, b) => {
      const aUn = a.toLowerCase() === "uncategorized";
      const bUn = b.toLowerCase() === "uncategorized";
      if (aUn && !bUn) return 1;
      if (!aUn && bUn) return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [categories]);
  const rawMode = activeNote?.format === "txt";
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; cell: HTMLElement } | null>(null);

  // Dock mode note zoom level (60% - 200%)
  const [dockZoom, setDockZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("doit:dock-zoom");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 60 && val <= 200) return val;
      }
    } catch {}
    return 100;
  });

  const adjustDockZoom = useCallback((delta: number) => {
    setDockZoom((prev) => {
      const next = Math.max(60, Math.min(200, Math.round((prev + delta) / 10) * 10));
      try {
        localStorage.setItem("doit:dock-zoom", next.toString());
      } catch {}
      return next;
    });
  }, []);

  const resetDockZoom = useCallback(() => {
    setDockZoom(100);
    try {
      localStorage.setItem("doit:dock-zoom", "100");
    } catch {}
  }, []);

  // ONE tray frame for both shapes. Fade the panel out, resize the native frame while nothing is drawn
  // (blank transparent content), then fade the floating bar in - and the reverse on expand.
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const collapseToPill = useCallback(async () => {
    if (collapsingRef.current) return;
    collapsingRef.current = true;
    changeMode("switching");
    await tauriApi.setTrayMode("pill");
    await wait(45);
    changeMode("pill");
    collapsingRef.current = false;
  }, [changeMode]);

  const hideNow = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    if (!shownRef.current) void collapseToPill();
  }, [collapseToPill]);

  const openTray = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        shownRef.current = true;
        setShown(true);
      }),
    );
  }, []);

  const [quadrant, setQuadrant] = useState<{ grow_x: "right" | "left" | "center"; grow_y: "down" | "up" }>({
    grow_x: "left",
    grow_y: "up",
  });

  const expandFromPill = useCallback(async () => {
    shownRef.current = false;
    setShown(false);
    changeMode("switching");
    const q = await tauriApi.setTrayMode("panel");
    if (q) setQuadrant(q);
    await wait(45);
    changeMode("panel");
    openTray();
  }, [changeMode, openTray]);

  const closeTray = useCallback(() => {
    if (!shownRef.current) return;
    shownRef.current = false;
    setShown(false);
    // Fallback in case transitionend never fires
    hideTimerRef.current = window.setTimeout(hideNow, 260);
  }, [hideNow]);

  const toggleMinimize = useCallback(() => {
    if (Date.now() < visibilityLockRef.current) return;
    visibilityLockRef.current = Date.now() + 350;
    closeTray();
  }, [closeTray]);

  // The page just mounted inside a hidden, pre-positioned frame: reveal it and fade the panel in
  useEffect(() => {
    void tauriApi.trayReady().then((start) => {
      if (start === "pill") {
        changeMode("pill");
      } else {
        changeMode("panel");
        openTray();
      }
    });
  }, [changeMode, openTray]);

  // Tray menu asked for the panel while the frame already exists
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let unlistenNote: (() => void) | null = null;
    let disposed = false;

    getCurrentWindow()
      .listen<boolean>("set-expanded", (event) => {
        if (!event.payload) return;
        if (modeRef.current === "pill") void expandFromPill();
        else openTray();
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenFn = unlisten;
      });

    getCurrentWindow()
      .listen<string>("open-note", (event) => {
        if (event.payload) {
          setActiveNoteId(event.payload);
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenNote = unlisten;
      });

    return () => {
      disposed = true;
      if (unlistenFn) unlistenFn();
      if (unlistenNote) unlistenNote();
    };
  }, [expandFromPill, openTray]);
  // Load theme mode for tray window
  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      applyThemeSettings(s);
      if (s.theme_mode) {
        document.documentElement.dataset.theme = s.theme_mode;
      }
      if (s.category_icons) {
        initCategoryIcons(s.category_icons);
      }
      setMarkdownBaseDir(s.storage_path);
      applyShortcutSettings(s);
    });
  }, []);


  // Global key navigation (Escape to toggle-minimize/step-back, Cmd/Ctrl+J to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && activeNoteId && !e.altKey) {
        if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd" || e.code === "Equal") {
          e.preventDefault();
          e.stopPropagation();
          adjustDockZoom(10);
          return;
        }
        if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" || e.code === "Minus") {
          e.preventDefault();
          e.stopPropagation();
          adjustDockZoom(-10);
          return;
        }
        if (e.key === "0" || e.code === "Numpad0" || e.code === "Digit0") {
          e.preventDefault();
          e.stopPropagation();
          resetDockZoom();
          return;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (previewImage) {
          setPreviewImage(null);
        } else if (activeNoteId) {
          handleBack();
        } else {
          toggleMinimize();
        }
      }
      if (meta && e.key.toLowerCase() === "j" && !isTransitioning.current) {
        e.preventDefault();
        toggleMinimize();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNoteId, previewImage, toggleMinimize, adjustDockZoom, resetDockZoom]);



  const filteredNotes = useMemo(() => {
    let list = [...notes].sort((a, b) => b.last_edited - a.last_edited);
    if (selectedShelf) {
      list = list.filter((n) => n.category.toLowerCase() === selectedShelf.toLowerCase());
    }
    if (filter.trim()) {
      const q = filter.toLowerCase().trim();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.some((c) => c.text.toLowerCase().includes(q)) ||
          n.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [notes, selectedShelf, filter]);

  const handleCreate = () => {
    const newNote = create(selectedShelf ?? "Uncategorized", false);
    openNoteById(newNote.id);
  };

  const editActive = (patchData: Partial<NoteItem>) => {
    if (!activeNote) return;
    const next: NoteItem = { ...activeNote, ...patchData, last_edited: Date.now() };
    patch(next);
  };

  const syncEditorDom = (content: ContentItem[]) => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(contentToMarkdown(content));
    }
  };

  const titleHistory = useUndoStack<string>(activeNote?.id ?? null, activeNote?.title ?? "", (title) =>
    editActive({ title }),
  );
  const bodyHistory = useUndoStack<ContentItem[]>(activeNote?.id ?? null, activeNote?.content ?? NO_CONTENT, (content) => {
    editActive({ content });
    syncEditorDom(content);
  });

  // Title and body keep separate undo/redo stacks; the focused field decides which one runs.
  const handleUndoKeys = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !activeNote) return;
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

  const appendActiveImages = (newUrls: string[]) => {
    if (!activeNote) return;
    const existing = (activeNote.media_urls && activeNote.media_urls.length > 0)
      ? activeNote.media_urls
      : (activeNote.media_url ? [activeNote.media_url] : []);
    const merged = [...existing, ...newUrls];
    editActive({ media_urls: merged, media_url: merged[0] });
  };

  const removeActiveImageAt = (index: number) => {
    if (!activeNote) return;
    const existing = (activeNote.media_urls && activeNote.media_urls.length > 0)
      ? activeNote.media_urls
      : (activeNote.media_url ? [activeNote.media_url] : []);
    const next = existing.filter((_, i) => i !== index);
    editActive({ media_urls: next, media_url: next[0] || undefined });
  };

  // Grabbable horizontal category scroll (No scrollbar!)
  const onPointerDownGrab = (e: React.PointerEvent) => {
    if (!grabScrollRef.current || e.button !== 0) return;
    dragScrollState.current = {
      isDown: true,
      startX: e.pageX - grabScrollRef.current.offsetLeft,
      scrollLeft: grabScrollRef.current.scrollLeft,
      moved: false,
    };
    grabScrollRef.current.style.cursor = "grabbing";
  };

  const onPointerMoveGrab = (e: React.PointerEvent) => {
    if (!dragScrollState.current.isDown || !grabScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - grabScrollRef.current.offsetLeft;
    const walk = (x - dragScrollState.current.startX) * 1.6;
    if (Math.abs(walk) > 3) dragScrollState.current.moved = true;
    grabScrollRef.current.scrollLeft = dragScrollState.current.scrollLeft - walk;
  };

  const onPointerUpGrab = () => {
    if (!grabScrollRef.current) return;
    dragScrollState.current.isDown = false;
    grabScrollRef.current.style.cursor = "grab";
  };

  // Clipboard paste for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target?.result as string;
        if (!dataUrl || !activeNote) return;
        const altText = file.name ? file.name.replace(/\.[^.]+$/, "") : "Pasted Image";
        if (rawMode) {
          const ed = rawTextareaRef.current;
          const pos = ed?.selectionStart ?? activeNote.content.length;
          const { text, newCaret } = insertInlineImageInMarkdown(contentToMarkdown(activeNote.content), dataUrl, pos, altText);
          editActive({ content: markdownToContent(text, activeNote.content, () => uid("line")) });
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

  // Synchronize HTML into contenteditable when opening or switching notes
  const initEditor = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    if (node && activeNote) {
      if (lastActiveNoteIdRef.current !== activeNote.id || !node.innerHTML || node.innerHTML === "<div><br></div>") {
        lastActiveNoteIdRef.current = activeNote.id;
        node.innerHTML = markdownToHtml(contentToMarkdown(activeNote.content));
      }
    }
  }, [activeNote]);

  useEffect(() => {
    if (!activeNote) {
      lastActiveNoteIdRef.current = null;
      return;
    }
    if (lastActiveNoteIdRef.current !== activeNote.id) {
      lastActiveNoteIdRef.current = activeNote.id;
      if (editorRef.current) {
        editorRef.current.innerHTML = markdownToHtml(contentToMarkdown(activeNote.content));
      }
    }
  }, [activeNote]);

  const handleEditorInput = () => {
    if (!editorRef.current || !activeNote) return;
    normalizeEditor(editorRef.current);
    const content = markdownToContent(htmlToMarkdown(editorRef.current), activeNote.content, () => uid("line"));
    editActive({ content });
    updateActiveFormatting();
  };

  const handleToolbarFormat = (style: "bold" | "italic") => {
    const activeEl = document.activeElement;

    if (activeEl instanceof HTMLInputElement) {
      const start = activeEl.selectionStart ?? 0;
      const end = activeEl.selectionEnd ?? 0;
      if (start !== end) {
        const val = activeEl.value;
        const selected = val.slice(start, end);
        const marker = style === "bold" ? "**" : "*";

        let nextVal: string;
        let newStart: number;
        let newEnd: number;

        if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
          const unwrapped = selected.slice(marker.length, selected.length - marker.length);
          nextVal = val.slice(0, start) + unwrapped + val.slice(end);
          newStart = start;
          newEnd = start + unwrapped.length;
        } else {
          const wrapped = `${marker}${selected}${marker}`;
          nextVal = val.slice(0, start) + wrapped + val.slice(end);
          newStart = start;
          newEnd = start + wrapped.length;
        }

        activeEl.value = nextVal;
        activeEl.dispatchEvent(new Event("input", { bubbles: true }));
        requestAnimationFrame(() => {
          activeEl.setSelectionRange(newStart, newEnd);
        });
        return;
      }
    }

    if (activeEl instanceof HTMLElement && activeEl.dataset.taskLine) {
      document.execCommand(style, false);
      updateActiveFormatting();
      return;
    }

    if (editorRef.current) {
      const sel = window.getSelection();
      const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && editorRef.current.contains(sel.anchorNode);

      if (hasSelection) {
        document.execCommand(style, false);
        handleEditorInput();
        updateActiveFormatting();
      } else {
        if (!editorRef.current.contains(document.activeElement)) {
          editorRef.current.focus();
        }
        document.execCommand(style, false);
        updateActiveFormatting();
      }
    }
  };

  const runEditorCommand = (fn: (editor: HTMLElement) => void) => {
    const ed = editorRef.current;
    if (!ed) return;
    fn(ed);
    handleEditorInput();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void tauriApi.showTrayContextMenu();
  };

  // Top bar dragging and minimize handling for desk tray: decoupled 4px threshold
  const handleTopBarPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (Date.now() < visibilityLockRef.current) return;
    const startX = e.screenX;
    const startY = e.screenY;
    const grabX = e.clientX;
    const grabY = e.clientY;
    let isDragging = false;

    const onPointerMove = (moveEv: PointerEvent) => {
      if (isDragging) return;
      const dx = moveEv.screenX - startX;
      const dy = moveEv.screenY - startY;
      if (Math.hypot(dx, dy) > 4) {
        isDragging = true;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        void tauriApi.dragDockWindow(grabX, grabY).then(() => {
          void tauriApi.saveTrayPosition();
        });
      }
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (!isDragging) {
        const dist = Math.hypot(upEv.screenX - startX, upEv.screenY - startY);
        if (dist <= 4) {
          toggleMinimize();
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Floating bar / resize-in-progress share the same frame as the panel
  if (mode !== "panel") {
    return (
      <div className="h-screen w-screen bg-transparent" style={{ background: "transparent" }}>
        {mode === "pill" && <TrayPill onOpen={() => void expandFromPill()} />}
      </div>
    );
  }

  // ---- RENDER DESK TRAY WORKSPACE ----
  return (
    <div
      className="flex h-screen w-screen items-end justify-end p-0 m-0 overflow-hidden bg-transparent select-none"
      style={{ background: "transparent", backgroundColor: "transparent" }}
    >
      <motion.div
        ref={panelRef}
        data-slot="dock-panel"
        initial={{
          x: quadrant.grow_x === "right" ? -24 : quadrant.grow_x === "left" ? 24 : 0,
          y: quadrant.grow_y === "down" ? -24 : 24,
          opacity: 0,
        }}
        animate={{
          x: 0,
          y: 0,
          opacity: shown ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        onAnimationComplete={() => {
          if (!shown && !shownRef.current) {
            hideNow();
          }
        }}
        onPaste={handlePaste}
        onKeyDownCapture={handleUndoKeys}
        onContextMenu={handleContextMenu}
        className="box-border flex h-full w-full flex-col overflow-hidden whitespace-nowrap text-ink-1 rounded-2xl border border-white/10 select-none p-2.5 shadow-none scale-100"
        style={{
          pointerEvents: shown ? "auto" : "none",
          backgroundColor: "var(--theme-tray-bg)",
          backdropFilter: "var(--theme-tray-blur)",
          WebkitBackdropFilter: "var(--theme-tray-blur)",
          boxShadow: "inset 0 0 0 1px var(--theme-tray-border)",
        }}
      >
        {/* 1. Fluid permanent top bar: Hold and drag to move, click to toggle minimize */}
        <div
          onPointerDown={handleTopBarPointerDown}
          title="Tap to toggle minimize | Hold and drag to move"
          className="flex h-6 w-full shrink-0 items-center justify-between px-1 select-none cursor-pointer group/topbar scale-100 overflow-hidden"
        >
          <div className="flex items-center gap-2 pointer-events-none min-w-0 overflow-hidden h-full whitespace-nowrap">
            {activeNote ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBack();
                }}
                className="flex items-center gap-1 h-5 rounded px-1 -ml-1 text-[10px] font-mono text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer pointer-events-auto shrink-0 whitespace-nowrap"
                title="Back to notes list"
              >
                <ArrowLeft size={11} className="shrink-0" />
                <span className="whitespace-nowrap overflow-hidden text-ellipsis truncate">Back</span>
              </button>
            ) : (
              <div className="flex items-center justify-center shrink-0 size-3.5">
                <Mark size={13} className="shrink-0 block" />
              </div>
            )}
            <span
              className={cx(
                "font-semibold text-white/70 group-hover/topbar:text-white/95 transition-colors whitespace-nowrap overflow-hidden text-ellipsis truncate select-none leading-none flex items-center",
                activeNote ? "font-mono text-[9.5px] uppercase tracking-[0.14em]" : "text-[13px] tracking-[0.02em]",
              )}
            >
              {activeNote ? pick("EDIT NOTE", "") : "DoIT"}
            </span>
          </div>

          <div
            className="flex items-center gap-1 shrink-0 z-20 h-full"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {isLinux && !activeNote && (
              <button type="button" onClick={handleCreate} className="lx-icon-button size-7!" title="New note" aria-label="New note">
                <SquarePen size={15} />
              </button>
            )}
            {isLinux && (
              <button type="button" onClick={() => toggleMinimize()} className="lx-icon-button size-7!" title="Minimize to the pill" aria-label="Minimize">
                <Minus size={15} />
              </button>
            )}
            {(
              <button
                type="button"
                data-slot="dock-canvas"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void tauriApi.openCanvasMode();
                }}
                className="grid size-5 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                title="Open Canvas"
                aria-label="Open Canvas"
              >
                <ArrowUpRight size={12} strokeWidth={1.8} />
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              data-slot="dock-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTray();
              }}
              className="grid size-5 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Hide to System Tray (✕)"
              aria-label="Hide to System Tray"
            >
              <X size={12} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Lower note collection container: smooth fade with 100% scale */}
        <div className="pt-2 flex flex-1 flex-col overflow-hidden min-h-0 scale-100">
                {activeNote ? (
          /* ---- IN-TRAY PROPER NOTE EDITOR ---- */
          <div
            key={`editor-${activeNote.id}`}
            className="flex flex-1 flex-col overflow-hidden min-h-0 px-1 scale-100 animate-in fade-in duration-150"
          >
            {/* Note Toolbar: Type, Bold, Italic, Tasks/Text Mode, Image, Delete */}
            <div data-slot="dock-toolbar" className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1 pb-2 border-b border-white/[0.07] overflow-visible pointer-events-auto shrink-0">
            {/* Shelf/Category selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
                data-slot="shelf-picker"
                className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-3 hover:bg-white/[0.08] hover:text-ink-1 transition-colors pointer-events-auto"
              >
                <span
                  className="size-[4px] rounded-full"
                  style={{ backgroundColor: accentFor(activeNote.category, shelves) }}
                />
                <span className="max-w-[70px] truncate">{activeNote.category}</span>
                <ChevronDown size={9} />
              </button>
              {shelfOpen && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={() => setShelfOpen(false)} />
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute left-0 top-7 z-50 w-[170px] max-h-[260px] overflow-y-auto scrollbar-thin rounded-xl bg-[#14151a] border border-white/20 p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] pointer-events-auto"
                  >
                    {shelves.map((shelf) => (
                      <button
                        key={shelf}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          editActive({ category: shelf });
                          setShelfOpen(false);
                        }}
                        className="flex h-6 w-full items-center justify-between rounded px-2 text-[11px] text-ink-2 hover:bg-white/10 hover:text-white cursor-pointer pointer-events-auto"
                      >
                        <span className="truncate">{shelf}</span>
                        {shelf === activeNote.category && <Check size={10} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              {!rawMode && (
              <>
              {/* Typeface selector */}
              <div className="relative">
                <button
                  type="button"
                  ref={fontTriggerRef}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFontOpen((v) => !v);
                  }}
                  className="icon-btn !size-6 cursor-pointer pointer-events-auto"
                  title="Typeface"
                >
                  <Type size={11.5} />
                </button>
                {fontOpen && createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onPointerDown={() => setFontOpen(false)}
                      onClick={() => setFontOpen(false)}
                    />
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={fontMenuStyle}
                      className="z-[120] w-[210px] max-h-[380px] overflow-y-auto scrollbar-thin rounded-xl bg-[#14151a] border border-white/20 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.95)] pointer-events-auto overscroll-contain flex flex-col"
                    >
                      <div className="shrink-0">
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-4 px-1.5 py-0.5 select-none">
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
                              editActive({ font_family: font.name });
                              if (editorRef.current) {
                                editorRef.current.style.fontFamily = font.stack;
                                editorRef.current.focus();
                              }
                              setFontOpen(false);
                            }}
                            className="flex h-6 w-full items-center justify-between rounded px-2 text-[11px] text-ink-2 hover:bg-white/10 hover:text-white cursor-pointer pointer-events-auto"
                            style={{ fontFamily: font.stack }}
                          >
                            <span className="truncate">{font.label}</span>
                            {font.name === activeNote.font_family && <Check size={10} />}
                          </button>
                        ))}
                        <div className="my-1.5 h-px bg-white/10" />
                      </div>

                      <div className="flex flex-col flex-1">
                        <div className="px-1 pt-1 pb-0.5 select-none">
                          <span className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-4">
                            System Fonts ({filteredSystemFonts.length})
                          </span>
                        </div>
                        <div className="sticky -top-2 bg-[#14151a]/95 backdrop-blur-md z-10 pb-1 px-1 border-b border-white/10 select-none shadow-sm -mx-1">
                          <div className="px-0.5 pt-0.5 pb-0.5">
                            <input
                              type="text"
                              value={fontSearch}
                              onChange={(e) => setFontSearch(e.target.value)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Search installed fonts..."
                              className="w-full h-6 rounded bg-white/[0.05] border border-white/15 px-1.5 text-[10.5px] text-ink-1 placeholder:text-ink-4 outline-none focus:border-white/30 pointer-events-auto"
                            />
                          </div>
                        </div>

                        <div className="pt-1.5 px-0.5 space-y-0.5">
                          {filteredSystemFonts.length === 0 ? (
                            <div className="px-2 py-2 text-center text-[10px] text-ink-4">
                              {systemFonts.length === 0 ? "Loading fonts..." : "No matching fonts"}
                            </div>
                          ) : (
                            filteredSystemFonts.map((fontName) => {
                              const isCurrent = (activeNote.font_family || "").toLowerCase() === fontName.toLowerCase();
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
                                    editActive({ font_family: fontName });
                                    if (editorRef.current) {
                                      editorRef.current.style.fontFamily = fontStack(fontName);
                                      editorRef.current.focus();
                                    }
                                    setFontOpen(false);
                                  }}
                                  className={cx(
                                    "flex h-6 w-full items-center justify-between rounded px-2 text-[11px] cursor-pointer pointer-events-auto",
                                    isCurrent ? "bg-white/[0.08] text-white" : "text-ink-2 hover:bg-white/[0.06] hover:text-white",
                                  )}
                                  style={{ fontFamily: fontStack(fontName) }}
                                >
                                  <span className="truncate">{fontName}</span>
                                  {isCurrent && <Check size={10} className="shrink-0 ml-1.5" />}
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
              </>
              )}

              {!rawMode && (
              <>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleToolbarFormat("bold")}
                className={cx("icon-btn !size-6 cursor-pointer", isBoldActive && "!bg-white/20 !text-white")}
                title="Toggle Bold (Ctrl+B)"
              >
                <Bold size={11.5} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleToolbarFormat("italic")}
                className={cx("icon-btn !size-6 cursor-pointer", isItalicActive && "!bg-white/20 !text-white")}
                title="Toggle Italic (Ctrl+I)"
              >
                <Italic size={11.5} strokeWidth={2.4} />
              </button>

              <span className="mx-0.5 h-3 w-px bg-white/10" />
              <HeadingSelect
                editorRef={editorRef}
                compact
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
                hasMedia={Boolean((activeNote.media_urls && activeNote.media_urls.length > 0) || activeNote.media_url)}
                compact
              />

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setEmojiAnchor(rect);
                  setShowEmojiPicker((v) => !v);
                }}
                className={cx("icon-btn !size-6 cursor-pointer shrink-0", showEmojiPicker && "!bg-white/20 !text-white")}
                title="Insert Emoji (:name:)"
              >
                <Smile size={12} strokeWidth={2.2} />
              </button>

              <span className="mx-0.5 h-3 w-px bg-white/10 shrink-0" />

              {/* Compact Dock Zoom Stepper */}
              <div
                className="flex items-center rounded-md bg-white/[0.04] border border-white/10 shrink-0 h-6 gap-0.5 px-0.5 select-none"
                title="Dock note zoom: Ctrl+ to zoom in, Ctrl- to zoom out, Ctrl 0 to reset"
                data-slot="zoom"
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => adjustDockZoom(-10)}
                  aria-label="Zoom out"
                  title="Zoom out (Ctrl -)"
                  className="size-4.5 grid place-items-center rounded text-ink-4 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <ZoomOut size={9.5} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={resetDockZoom}
                  aria-label="Reset zoom"
                  title="Reset zoom to 100% (Ctrl 0)"
                  className="font-mono tabular-nums text-[9px] text-ink-3 hover:text-white px-0.5 transition-colors cursor-pointer"
                >
                  {dockZoom}%
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => adjustDockZoom(10)}
                  aria-label="Zoom in"
                  title="Zoom in (Ctrl +)"
                  className="size-4.5 grid place-items-center rounded text-ink-4 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <ZoomIn size={9.5} strokeWidth={2} />
                </button>
              </div>

              <span className="mx-0.5 h-3 w-px bg-white/10" />
              </>
              )}

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
                  const loaded: string[] = [];
                  let pending = imageFiles.length;
                  imageFiles.forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = (loadEvt) => {
                      const dataUrl = loadEvt.target?.result as string;
                      if (dataUrl) loaded.push(dataUrl);
                      pending -= 1;
                      if (pending === 0 && loaded.length > 0) {
                        appendActiveImages(loaded);
                      }
                    };
                    reader.readAsDataURL(file);
                  });
                  e.target.value = "";
                }}
              />

              <span className="mx-0.5 h-3 w-px bg-white/10" />

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="icon-btn !size-6 hover:!text-red-400 hover:!bg-red-500/10 cursor-pointer"
                title="Delete note"
              >
                <Trash size={11.5} />
              </button>
            </div>
          </div>

          {/* Scrollable Note Document: ModeToggle, Title, Images, Body */}
          <div
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                adjustDockZoom(e.deltaY < 0 ? 10 : -10);
              }
            }}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1.5 pt-2 pb-6 space-y-2 select-text"
          >
            <div
              style={dockZoom !== 100 ? { zoom: `${dockZoom}%` } : undefined}
              className="w-full space-y-2 transition-[zoom] duration-150 origin-top"
            >
              <div className="flex shrink-0">
                <ModeToggle
                  compact
                  rawMode={rawMode}
                  onChange={(raw) => editActive({ format: raw ? "txt" : "md" })}
                />
              </div>
              {/* Title Input */}
            <input
              ref={titleRef}
              type="text"
              value={activeNote.title ?? ""}
              onChange={(e) => editActive({ title: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "ArrowDown") {
                  if (rawMode) {
                    const textarea = document.querySelector(".tray-note-scroll textarea") as HTMLTextAreaElement | null;
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
              data-slot="dock-note-title"
              className="w-full bg-transparent text-[16px] font-semibold text-ink-1 outline-none placeholder:text-ink-4/60 shrink-0"
              style={{
                fontFamily: fontStack(activeNote.font_family),
                fontWeight: 560,
              }}
            />

            {/* Media preview if present */}
            {(() => {
              const rawImages = (activeNote.media_urls && activeNote.media_urls.length > 0)
                ? activeNote.media_urls
                : (activeNote.media_url ? [activeNote.media_url] : []);
              const images = rawImages.filter((img) => img && typeof img === "string" && img.trim().length > 0);
              if (images.length === 0) return null;
              return (
                <div className="shrink-0">
                  <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto scrollbar-thin pr-1">
                    {images.map((imgUrl, idx) => (
                      <div
                        key={`tray-img-${idx}`}
                        onClick={() => {
                          setPreviewImage(imgUrl);
                        }}
                        className="relative group aspect-video min-h-[80px] rounded-lg overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center cursor-pointer hover:border-white/30 transition-all"
                        title="Click to zoom & inspect full image"
                      >
                        <img
                          src={imgUrl}
                          alt=""
                          className="w-full h-full object-contain rounded opacity-95 transition-transform duration-200 group-hover:scale-105"
                          onError={(e) => {
                            const parent = e.currentTarget.parentElement;
                            if (parent) parent.style.display = "none";
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeActiveImageAt(idx);
                          }}
                          className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-black/80 text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 z-10"
                          title="Remove image"
                        >
                          <X size={10} strokeWidth={2.2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Editor: Basic Note freeform writing vs Tasks mode */}
            <div data-undo="body" className="min-h-[180px] pb-6">
              {rawMode ? (
                <RawEditor
                  content={activeNote.content}
                  textareaRef={rawTextareaRef}
                  minHeight={180}
                  className="text-[11.5px]"
                  onChange={(content) => editActive({ content })}
                  onArrowUpAtStart={() => {
                    if (titleRef.current) {
                      titleRef.current.focus();
                      const len = titleRef.current.value.length;
                      titleRef.current.setSelectionRange(len, len);
                    }
                  }}
                />
              ) : (
              <div
                ref={initEditor}
                onPaste={(e) => {
                  if (handleMarkdownPaste(e)) handleEditorInput();
                }}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
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
                className="w-full min-h-[180px] whitespace-pre-wrap break-words bg-transparent text-[12.5px] leading-relaxed text-ink-2 outline-none select-text"
                style={{
                  fontFamily: fontStack(activeNote.font_family),
                }}
              />
              )}
            </div>
            </div>
          </div>
        </div>
      ) : isLinux ? (
        <LinuxDockHome
          notes={filteredNotes}
          shelves={shelves}
          filter={filter}
          onFilter={setFilter}
          shelf={selectedShelf}
          onShelf={setSelectedShelf}
          shelvesOpen={drawerOpen}
          onToggleShelves={() => setDrawerOpen((v) => !v)}
          onOpen={openNoteById}
        />
      ) : (
        /* ---- DESK TRAY MAIN MENU (SCREENSHOT 3: CLEAN, UNCLUTTERED, OPEN PROFILE) ---- */
        <div
          key="main-menu"
          className="flex flex-1 flex-col overflow-hidden px-1 space-y-2 scale-100 animate-in fade-in duration-150"
        >
          {/* + New note button matching Screenshot 3 */}
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-11 w-full items-center gap-2.5 rounded-[14px] bg-white/[0.07] px-3.5 text-[13px] font-medium text-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-all hover:bg-white/[0.12] active:scale-[0.99] scale-100 cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis truncate"
          >
            <span className="inline-flex shrink-0">
              <Plus size={15} strokeWidth={2} className="text-white/80 shrink-0" />
            </span>
            <span className="whitespace-nowrap overflow-hidden text-ellipsis truncate">New note</span>
          </button>

          {/* Pull up an old note input matching Screenshot 3 */}
          <div
            className="relative flex items-center h-11 w-full rounded-[14px] bg-white/[0.035] px-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-all focus-within:bg-white/[0.06] focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] scale-100 whitespace-nowrap overflow-hidden"
          >
            <Search size={14} className="text-white/35 mr-2.5 pointer-events-none shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Pull up an old note"
              className="flex-1 bg-transparent text-[13px] text-white/90 placeholder:text-white/30 outline-none min-w-0 whitespace-nowrap overflow-hidden text-ellipsis truncate"
            />
            {filter ? (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="text-white/40 hover:text-white p-1 shrink-0"
              >
                <X size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDrawerOpen((prev) => !prev)}
                className={cx(
                  "ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider transition-colors border scale-100 cursor-pointer shrink-0 whitespace-nowrap",
                  drawerOpen || selectedShelf
                    ? "bg-white/15 text-white border-white/25"
                    : "bg-white/[0.04] text-white/40 border-white/[0.06] hover:text-white/70 hover:bg-white/[0.08]",
                )}
                title="Toggle Category Filter Drawer"
              >
                <span className="whitespace-nowrap overflow-hidden text-ellipsis truncate">{selectedShelf ? selectedShelf : "FIND"}</span>
                <span
                  className="inline-flex transition-transform duration-200 shrink-0"
                  style={{ transform: drawerOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  <ChevronDown size={10} />
                </span>
              </button>
            )}
          </div>

          {/* Category Filter Drawer Container */}
            {drawerOpen && (
              <div
                key="category-drawer-content"
                className="overflow-hidden py-1 scale-100"
              >
                <div
                  ref={grabScrollRef}
                  onPointerDown={onPointerDownGrab}
                  onPointerMove={onPointerMoveGrab}
                  onPointerUp={onPointerUpGrab}
                  onPointerLeave={onPointerUpGrab}
                  className="flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar cursor-grab active:cursor-grabbing select-none"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!dragScrollState.current.moved) setSelectedShelf(null);
                    }}
                    className={cx(
                      "shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis truncate",
                      selectedShelf === null
                        ? "bg-white/20 text-white font-medium border border-white/25 shadow-sm"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80 border border-white/[0.06]",
                    )}
                  >
                    All
                  </button>
                  {shelves.map((shelf) => {
                    const accent = accentFor(shelf, shelves);
                    const active = selectedShelf?.toLowerCase() === shelf.toLowerCase();
                    return (
                      <button
                        key={shelf}
                        type="button"
                        onClick={() => {
                          if (!dragScrollState.current.moved) {
                            setSelectedShelf(active ? null : shelf);
                          }
                        }}
                        className={cx(
                          "shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis truncate",
                          active
                            ? "bg-white/20 text-white font-medium border border-white/25 shadow-sm"
                            : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80 border border-white/[0.06]",
                        )}
                      >
                        <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis truncate">{shelf}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {/* RECENT Label matching Screenshot 3 */}
          <div className="pt-1.5 px-1 scale-100 whitespace-nowrap overflow-hidden">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/30 whitespace-nowrap overflow-hidden text-ellipsis truncate">
              RECENT
            </span>
          </div>

          {/* Recent Notes List matching Screenshot 3 */}
          <div className="flex-1 overflow-y-auto space-y-0.5 scroll pr-0.5 scale-100">
            {filteredNotes.length === 0 ? (
              <p className="py-6 text-center text-[11.5px] text-white/35 whitespace-nowrap overflow-hidden text-ellipsis truncate">
                No matching notes found.
              </p>
            ) : (
              filteredNotes.slice(0, 5).map((note) => {
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openNoteById(note.id)}
                    className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/[0.05] group scale-100 cursor-pointer whitespace-nowrap overflow-hidden"
                  >
                    <span
                      className="h-7 w-[2px] shrink-0 rounded-full bg-white/70 group-hover:bg-white transition-colors"
                    />
                    <div className="min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis truncate">
                      <span className="block text-[13px] font-medium text-white/90 whitespace-nowrap overflow-hidden text-ellipsis truncate">
                        {cleanText(note.title) || "Untitled"}
                      </span>
                      <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/35 whitespace-nowrap overflow-hidden text-ellipsis truncate">
                        {cleanText(note.category)}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/35 whitespace-nowrap">
                      {relativeShort(note.last_edited)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Action Footer: Minimize to Pill and Open Canvas */}
          <div className="pt-1.5 border-t border-white/[0.08] flex items-center justify-between px-2 scale-100 whitespace-nowrap overflow-hidden">
            <button
              type="button"
              onClick={() => {
                toggleMinimize();
              }}
              className="flex items-center gap-1.5 text-[11.5px] font-mono text-white/50 hover:text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              title="Minimize tray"
            >
              <Minus size={12} strokeWidth={2.4} className="shrink-0" />
              <span className="whitespace-nowrap overflow-hidden text-ellipsis truncate">Minimize</span>
            </button>

            <button
              type="button"
              onClick={() => void tauriApi.openCanvasMode()}
              className="flex items-center gap-1 text-[11.5px] font-mono text-white/50 hover:text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              title="Maximize back to full canvas"
            >
              <span className="whitespace-nowrap overflow-hidden text-ellipsis truncate">Canvas</span>
              <ArrowUpRight size={12} strokeWidth={2} className="shrink-0" />
            </button>
          </div>
        </div>
      )}
      </div>

      <EmojiAutocomplete editorRef={editorRef} onEmojiInserted={handleEditorInput} />

      <EmojiPickerModal
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        anchorRect={emojiAnchor}
        onSelect={(emoji) => {
          if (rawMode && activeNote) {
            const ed = rawTextareaRef.current;
            if (ed) {
              const start = ed.selectionStart;
              const end = ed.selectionEnd;
              const val = ed.value;
              const next = val.slice(0, start) + emoji + val.slice(end);
              editActive({ content: markdownToContent(next, activeNote.content, () => uid("line")) });
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
          onChanged={handleEditorInput}
        />
      )}

      {previewImage && <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />}

      {/* Theme-matched delete confirmation popover modal */}
      {showDeleteConfirm && activeNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-[90%] max-w-[320px] rounded-2xl border border-white/15 bg-[#14151a] p-4 sm:p-5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] text-center whitespace-normal select-text animate-in zoom-in-95 duration-150"
          >
            <div className="mx-auto mb-2.5 grid size-9 place-items-center rounded-xl bg-red-500/10 text-red-400">
              <Trash size={16} strokeWidth={2} />
            </div>
            <h3 className="text-[13.5px] font-semibold text-white tracking-tight whitespace-normal">
              Delete this note?
            </h3>
            <p className="mt-2 text-[12px] text-ink-3 leading-relaxed whitespace-normal break-words text-center px-1">
              Are you sure you want to delete this note?
              <span className="block mt-0.5 text-ink-4">This action cannot be undone.</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
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
                  remove(activeNote.id);
                  handleBack();
                }}
                className="h-8 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-[12px] font-medium text-red-200 transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </motion.div>
    </div>
  );
}
