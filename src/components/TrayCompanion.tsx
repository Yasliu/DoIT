import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Mark } from "./Mark";
import { HeadingSelect } from "./HeadingSelect";
import { ImageLightbox } from "./ImageLightbox";
import { ModeToggle } from "./ModeToggle";
import { TrayPill } from "./TrayPill";
import { RawEditor } from "./RawEditor";
import { TableMenu } from "./TableMenu";
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  ListChecks,
  Table as TableIcon,
  Image as ImageIcon,
  Italic,
  Minus,
  Plus,
  Search,
  Trash,
  Type,
  X,
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
  setMarkdownBaseDir,
} from "../lib/format";
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
  const [drawerOpen, setDrawerOpen] = useState(true);
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

  useEffect(() => {
    if (fontOpen && fontTriggerRef.current) {
      const rect = fontTriggerRef.current.getBoundingClientRect();
      // portaled to <body>: viewport coordinates, clamped inside the window on every side
      const w = 210;
      const left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8));
      const top = rect.bottom + 6;
      const maxHeight = Math.max(120, Math.min(320, window.innerHeight - top - 12));
      setFontMenuStyle({ position: "fixed", left, top, maxHeight });
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
  const [isBoldActive, setIsBoldActive] = useState<boolean>(false);
  const [isItalicActive, setIsItalicActive] = useState<boolean>(false);
  const lastActiveNoteIdRef = useRef<string | null>(null);

  const updateActiveFormatting = () => {
    setIsBoldActive(isRichBoldActive());
    setIsItalicActive(isRichItalicActive());
  };

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  );

  const shelves = useMemo(() => categories.map((c) => c.name), [categories]);
  const rawMode = activeNote?.format === "txt";
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; cell: HTMLElement } | null>(null);

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

    return () => {
      disposed = true;
      if (unlistenFn) unlistenFn();
    };
  }, [expandFromPill, openTray]);
  // Load theme mode for tray window
  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      if (s.theme_mode) {
        document.documentElement.dataset.theme = s.theme_mode;
      }
      setMarkdownBaseDir(s.storage_path);
      applyShortcutSettings(s);
    });
  }, []);


  // Global key navigation (Escape to toggle-minimize/step-back, Cmd/Ctrl+J to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "j" && !isTransitioning.current) {
        e.preventDefault();
        toggleMinimize();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNoteId, previewImage, toggleMinimize]);



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
    const loaded: string[] = [];
    let pending = files.length;
    files.forEach((file) => {
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
    let isDragging = false;

    const onPointerMove = (moveEv: PointerEvent) => {
      if (isDragging) return;
      const dx = moveEv.screenX - startX;
      const dy = moveEv.screenY - startY;
      if (Math.hypot(dx, dy) > 4) {
        isDragging = true;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        void tauriApi.beginDrag().then(() => {
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
              {activeNote ? "EDIT NOTE" : "DoIT"}
            </span>
          </div>

          <div
            className="flex items-center gap-1 shrink-0 z-20 h-full"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {(
              <button
                type="button"
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
              onClick={(e) => {
                e.stopPropagation();
                closeTray();
              }}
              className="grid size-5 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Hide to System Tray (âœ•)"
              aria-label="Hide to System Tray"
            >
              <X size={12} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Lower note collection container: smooth fade with 100% scale */}
        <div className="pt-2 flex flex-1 flex-col overflow-visible min-h-0 scale-100">
                {activeNote ? (
          /* ---- IN-TRAY PROPER NOTE EDITOR ---- */
          <div
            key={`editor-${activeNote.id}`}
            className="flex flex-1 flex-col overflow-visible px-1 scale-100 animate-in fade-in duration-150"
          >
            {/* Note Toolbar: Type, Bold, Italic, Tasks/Text Mode, Image, Delete */}
            <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1 pb-2 border-b border-white/[0.07] overflow-visible pointer-events-auto">
            {/* Shelf/Category selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
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
                      className="z-[120] w-[210px] max-h-[260px] md:max-h-[320px] overflow-y-auto no-scrollbar rounded-xl bg-[#14151a] border border-white/20 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.95)] pointer-events-auto overscroll-contain"
                    >
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
                      <div>
                        <div className="flex items-center justify-between px-1 py-0.5 select-none">
                          <span className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-4">
                            System Fonts ({filteredSystemFonts.length})
                          </span>
                        </div>
                        <div className="px-0.5 pb-1">
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
                        <div className="max-h-[140px] overflow-y-auto scrollbar-thin px-0.5 space-y-0.5">
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
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runEditorCommand((ed) => insertTableAtCaret(ed))}
                className="icon-btn !size-6 cursor-pointer"
                title="Insert table (Ctrl+T)"
              >
                <TableIcon size={12} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runEditorCommand((ed) => applyTask(ed))}
                className="icon-btn !size-6 cursor-pointer"
                title="Task checkbox (- [ ])"
              >
                <ListChecks size={12.5} strokeWidth={1.9} />
              </button>
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="icon-btn !size-6"
                data-active={(activeNote.media_urls && activeNote.media_urls.length > 0) || !!activeNote.media_url || undefined}
                title="Attach Image (or Ctrl+V paste)"
              >
                <ImageIcon size={11.5} />
              </button>

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

          <div className="mt-2 flex">
            <ModeToggle
              compact
              rawMode={rawMode}
              onChange={(raw) => editActive({ format: raw ? "txt" : "md" })}
            />
          </div>
          {/* Title Input */}
          <input
            type="text"
            value={activeNote.title ?? ""}
            onChange={(e) => editActive({ title: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              handleUndoKeys(e);
            }}
            data-undo="title"
            placeholder="Untitled"
            className="w-full mt-2.5 bg-transparent text-[16px] font-semibold text-ink-1 outline-none placeholder:text-ink-4/60"
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
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto scroll pr-1">
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
          <div data-undo="body" className="flex-1 min-h-0 mt-2 overflow-y-auto scroll">
            {rawMode ? (
              <RawEditor
                content={activeNote.content}
                minHeight={180}
                className="text-[11.5px]"
                onChange={(content) => editActive({ content })}
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
                if (handleCheckboxClick(e, editorRef.current)) handleEditorInput();
              }}
              onKeyDown={(e) => {
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
              onKeyUp={updateActiveFormatting}
              onMouseUp={updateActiveFormatting}
              className="w-full h-full min-h-[180px] whitespace-pre-wrap break-words bg-transparent text-[12.5px] leading-relaxed text-ink-2 outline-none scroll select-text"
              style={{
                fontFamily: fontStack(activeNote.font_family),
              }}
            />
            )}
          </div>
        </div>
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
            <span className="ml-auto shrink-0 whitespace-nowrap rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/40 border border-white/[0.08]">
              âŒ˜N
            </span>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-in fade-in duration-150"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[280px] rounded-2xl border border-white/15 bg-[#14151a] p-4 shadow-[0_25px_60px_rgba(0,0,0,0.95)] text-center animate-in zoom-in-95 duration-150"
          >
            <div className="mx-auto mb-2.5 grid size-9 place-items-center rounded-xl bg-red-500/10 text-red-400">
              <Trash size={16} strokeWidth={2} />
            </div>
            <h3 className="text-[13px] font-semibold text-white">
              Delete this note?
            </h3>
            <p className="mt-1 text-[11px] text-ink-3 leading-relaxed">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-7 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-[11.5px] font-medium text-ink-1 transition-colors cursor-pointer"
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
                className="h-7 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-[11.5px] font-medium text-red-200 transition-colors cursor-pointer"
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
