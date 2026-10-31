import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "motion/react";
import { Mark } from "./Mark";
import { TaskLineInput } from "./TaskLineInput";
import {
  AlignLeft,
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Italic,
  ListTodo,
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
import {
  convertContentMode,
  handleRichEditorKeyDown,
  htmlToMarkdown,
  isRichBoldActive,
  isRichItalicActive,
  markdownToHtml,
} from "../lib/format";
import { accentFor, cleanText, cx, relativeShort, uid } from "../lib/text";

const NO_CONTENT: ContentItem[] = [];

export function TrayCompanion() {
  const { notes, categories, patch, create, remove } = useWorkspace();
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const suppressCollapseRef = useRef(false);
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
  const [shelfOpen, setShelfOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const isPanningImage = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
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

  // Static 380x480 window; open/close is a pure opacity fade, then native hide().
  const hideNow = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    if (suppressCollapseRef.current) {
      suppressCollapseRef.current = false;
      return;
    }
    if (!shownRef.current) void tauriApi.collapseTrayToPill();
  }, []);

  const openTray = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    suppressCollapseRef.current = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        shownRef.current = true;
        setShown(true);
      }),
    );
  }, []);

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

  // Synchronize with external Tauri expansion events
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    getCurrentWindow()
      .listen<boolean>("set-expanded", (event) => {
        if (event.payload) {
          openTray();
        } else {
          // Canvas took over: fade out silently, never spawn the pill
          if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
          suppressCollapseRef.current = true;
          shownRef.current = false;
          setShown(false);
        }
      })
      .then((unlisten) => {
        unlistenFn = unlisten;
      });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [openTray]);

  // Load theme mode for tray window
  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      if (s.theme_mode) {
        document.documentElement.dataset.theme = s.theme_mode;
      }
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

  // Safety: a fresh webview whose window is already visible should still fade in once
  useEffect(() => {
    void getCurrentWindow().isVisible().then((v) => {
      if (v) openTray();
    });
  }, [openTray]);

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
    if (editorRef.current && !content.some((c) => c.is_todo)) {
      editorRef.current.innerHTML = markdownToHtml(content.map((c) => c.text).join("\n"));
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
        const md = activeNote.content.map((c) => c.text).join("\n");
        node.innerHTML = markdownToHtml(md);
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
        const md = activeNote.content.map((c) => c.text).join("\n");
        editorRef.current.innerHTML = markdownToHtml(md);
      }
    }
  }, [activeNote]);

  const handleEditorInput = () => {
    if (!editorRef.current || !activeNote) return;
    const md = htmlToMarkdown(editorRef.current);
    const lines = md.split("\n");
    const content: ContentItem[] = lines.map((line, idx) => ({
      id: activeNote.content[idx]?.id ?? uid("line"),
      text: line,
      is_todo: false,
      completed: false,
    }));
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

  const isTasksMode = useMemo(() => {
    if (!activeNote) return false;
    return activeNote.content.some((c) => c.is_todo);
  }, [activeNote]);

  const toggleMode = () => {
    if (!activeNote) return;
    const nextIsTodo = !isTasksMode;
    let source: ContentItem[] = activeNote.content;
    if (!isTasksMode && editorRef.current) {
      // Read the live editor DOM so nothing typed since the last sync is lost or merged
      source = htmlToMarkdown(editorRef.current)
        .split("\n")
        .map((text, idx) => ({
          id: activeNote.content[idx]?.id ?? uid("line"),
          text,
          is_todo: false,
          completed: false,
        }));
    }
    editActive({ content: convertContentMode(source, nextIsTodo, activeNote.id) });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void tauriApi.showTrayContextMenu();
  };

  // Image Lightbox Holding & Dragging Pan Handlers
  const handleImagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Left mouse click
    e.preventDefault();
    e.stopPropagation();
    isPanningImage.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: imagePan.x,
      panY: imagePan.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleImagePointerMove = (e: React.PointerEvent) => {
    if (!isPanningImage.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      panStartRef.current.moved = true;
    }
    setImagePan({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  };

  const handleImagePointerUp = (e: React.PointerEvent) => {
    if (!isPanningImage.current) return;
    isPanningImage.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
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

  // ---- RENDER DESK TRAY WORKSPACE WITH 2D SPRING MORPHING ----
  return (
    <div
      className="flex h-screen w-screen items-end justify-end p-0 m-0 overflow-hidden bg-transparent select-none"
      style={{ background: "transparent", backgroundColor: "transparent" }}
    >
      <div
        ref={panelRef}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "opacity" && !shownRef.current) {
            hideNow();
          }
        }}
        onPaste={handlePaste}
        onKeyDownCapture={handleUndoKeys}
        onContextMenu={handleContextMenu}
        className="box-border flex h-full w-full flex-col overflow-hidden whitespace-nowrap text-ink-1 rounded-2xl border border-white/10 select-none p-2.5 shadow-none scale-100 transition-opacity duration-200 ease-out"
        style={{
          opacity: shown ? 1 : 0,
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
        <div className="pt-2 flex flex-1 flex-col overflow-hidden min-h-0 scale-100">
              <AnimatePresence mode="wait" initial={false}>
                {activeNote ? (
          /* ---- IN-TRAY PROPER NOTE EDITOR ---- */
          <motion.div
            key={`editor-${activeNote.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col overflow-hidden px-1 scale-100"
          >
            {/* Note Toolbar: Type, Bold, Italic, Tasks/Text Mode, Image, Delete */}
            <div className="flex items-center justify-between gap-1 pb-2 border-b border-white/[0.07]">
            {/* Shelf/Category selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
                className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-3 hover:bg-white/[0.08] hover:text-ink-1 transition-colors"
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
                  <div className="absolute left-0 top-7 z-50 w-[170px] rounded-xl bg-[#14151a] border border-white/20 p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
                    {shelves.map((shelf) => (
                      <button
                        key={shelf}
                        type="button"
                        onClick={() => {
                          editActive({ category: shelf });
                          setShelfOpen(false);
                        }}
                        className="flex h-6 w-full items-center justify-between rounded px-2 text-[11px] text-ink-2 hover:bg-white/10 hover:text-white"
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
              {/* Typeface selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFontOpen((v) => !v)}
                  className="icon-btn !size-6"
                  title="Typeface"
                >
                  <Type size={11.5} />
                </button>
                {fontOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onPointerDown={() => setFontOpen(false)} />
                    <div className="absolute right-0 top-7 z-50 w-[180px] rounded-xl bg-[#14151a] border border-white/20 p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
                      {NOTE_FONTS.map((font) => (
                        <button
                          key={font.name}
                          type="button"
                          onClick={() => {
                            editActive({ font_family: font.name });
                            setFontOpen(false);
                          }}
                          className="flex h-6 w-full items-center justify-between rounded px-2 text-[11px] text-ink-2 hover:bg-white/10 hover:text-white"
                          style={{ fontFamily: font.stack }}
                        >
                          <span className="truncate">{font.label}</span>
                          {font.name === activeNote.font_family && <Check size={10} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Tasks vs Text mode switch */}
              <button
                type="button"
                onClick={toggleMode}
                className="icon-btn !size-6"
                title={isTasksMode ? "Switch to Basic Text Note" : "Switch to Checklist Mode"}
              >
                {isTasksMode ? <ListTodo size={11.5} className="text-white" /> : <AlignLeft size={11.5} className="text-white" />}
              </button>

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
                onClick={() => {
                  remove(activeNote.id);
                  handleBack();
                }}
                className="icon-btn !size-6 hover:!text-red-400"
                title="Delete note"
              >
                <Trash size={11.5} />
              </button>
            </div>
          </div>

          {/* Title Input */}
          <input
            type="text"
            value={activeNote.title ?? ""}
            onChange={(e) => editActive({ title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
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
                        setZoomLevel(1);
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
            {!isTasksMode ? (
              <div
                key="rich-editor"
                ref={initEditor}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyDown={(e) => {
                  const meta = e.ctrlKey || e.metaKey;
                  if (meta && e.key.toLowerCase() === "b") {
                    e.preventDefault();
                    handleToolbarFormat("bold");
                    return;
                  }
                  if (meta && e.key.toLowerCase() === "i") {
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
            ) : (
              <div key="task-list" className="space-y-1">
                {activeNote.content.map((item, index) => {
                  const cleanItemText = item.text.replace(/^\s*[-*â€¢]\s+/, "");
                  return (
                    <div key={item.id} className="flex items-start gap-3 w-full py-1 group">
                      <button
                        type="button"
                        onClick={() => {
                          const content = activeNote.content.map((c) =>
                            c.id === item.id ? { ...c, completed: !c.completed } : c,
                          );
                          editActive({ content });
                        }}
                        className={cx(
                          "border rounded-md w-4 h-4 mt-[2px] bg-transparent cursor-pointer check-indicator-layer flex items-center justify-center shrink-0 transition-all duration-200 outline-none select-none",
                          item.completed
                            ? "border-white bg-white text-black"
                            : "border-white/20 hover:border-white/50 text-transparent",
                        )}
                      >
                        <Check size={11} strokeWidth={3.5} className={cx(item.completed ? "opacity-100" : "opacity-0")} />
                      </button>
                      <TaskLineInput
                        value={cleanItemText}
                        onChange={(text) => {
                          const content = activeNote.content.map((c) =>
                            c.id === item.id ? { ...c, text: text.replace(/^\s*[-*â€¢]\s+/, "") } : c,
                          );
                          editActive({ content });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const updated = [...activeNote.content];
                            updated.splice(index + 1, 0, {
                              id: uid("line"),
                              text: "",
                              is_todo: true,
                              completed: false,
                            });
                            editActive({ content: updated });
                          }
                          if (e.key === "Backspace" && cleanItemText === "" && activeNote.content.length > 1) {
                            e.preventDefault();
                            const updated = activeNote.content.filter((c) => c.id !== item.id);
                            editActive({ content: updated });
                          }
                        }}
                        placeholder="Task item..."
                        className={cx(
                          "flex-1 bg-transparent text-[12.5px] leading-[1.5] transition-all duration-150",
                          item.completed ? "line-through text-ink-4 opacity-50" : "text-ink-1 opacity-90",
                        )}
                        style={{
                          fontFamily: fontStack(activeNote.font_family),
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = activeNote.content.filter((c) => c.id !== item.id);
                          editActive({ content: updated });
                        }}
                        className="grid size-4 shrink-0 place-items-center rounded text-white/30 opacity-0 group-hover:opacity-100 hover:text-white"
                      >
                        <X size={10} strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    editActive({
                      content: [
                        ...activeNote.content,
                        { id: uid("line"), text: "", is_todo: true, completed: false },
                      ],
                    });
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-ink-4 hover:text-ink-2 pt-1 font-mono"
                >
                  <Plus size={11} />
                  <span>Add item</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        /* ---- DESK TRAY MAIN MENU (SCREENSHOT 3: CLEAN, UNCLUTTERED, OPEN PROFILE) ---- */
        <motion.div
          key="main-menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-1 flex-col overflow-hidden px-1 space-y-2 scale-100"
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
          <AnimatePresence initial={false}>
            {drawerOpen && (
              <motion.div
                key="category-drawer-content"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
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
              </motion.div>
            )}
          </AnimatePresence>

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
        </motion.div>
      )}
      </AnimatePresence>
      </div>

      {/* Lightbox Preview Modal with Full Interactive Zoom */}
      {previewImage && (
        <div
          onClick={() => {
            setPreviewImage(null);
            setZoomLevel(1);
          }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-2 select-none"
        >
          {/* Zoom & Action Controls Bar */}
          <div
            className="flex items-center gap-2 mb-2 z-20 bg-black/80 px-3 py-1.5 rounded-full border border-white/20 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
              className="grid size-6 place-items-center rounded text-white/70 hover:text-white hover:bg-white/10 text-[14px] font-bold cursor-pointer"
              title="Zoom out"
            >
              -
            </button>
            <span className="font-mono text-[10px] text-white/90 min-w-[36px] text-center font-semibold">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
              className="grid size-6 place-items-center rounded text-white/70 hover:text-white hover:bg-white/10 text-[14px] font-bold cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomLevel(1);
                setImagePan({ x: 0, y: 0 });
              }}
              className="ml-1 text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 cursor-pointer"
              title="Reset Zoom (100%)"
            >
              1:1
            </button>
            <span className="mx-0.5 h-3 w-px bg-white/20" />
            <button
              type="button"
              onClick={() => {
                setPreviewImage(null);
                setZoomLevel(1);
                setImagePan({ x: 0, y: 0 });
              }}
              className="grid size-6 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              title="Close preview"
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>

          {/* Interactive Zoomable & Pannable Viewport */}
          <div
            className="relative flex-1 w-full overflow-hidden flex items-center justify-center p-2 cursor-grab active:cursor-grabbing select-none"
            onClick={(e) => {
              e.stopPropagation();
              if (panStartRef.current.moved) return;
              const img = e.currentTarget.querySelector("img");
              const r = img?.getBoundingClientRect();
              const onImage = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
              if (onImage) return;
              setPreviewImage(null);
              setZoomLevel(1);
              setImagePan({ x: 0, y: 0 });
            }}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
            onWheel={(e) => {
              e.preventDefault();
              if (e.deltaY < 0) {
                setZoomLevel((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
              } else {
                setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
              }
            }}
          >
            <img
              src={previewImage}
              alt="Preview"
              draggable={false}
              style={{
                transform: `translate3d(${imagePan.x}px, ${imagePan.y}px, 0) scale(${zoomLevel})`,
                transformOrigin: "center center",
                transition: isPanningImage.current ? "none" : "transform 0.1s ease-out",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!panStartRef.current.moved) {
                  setZoomLevel((z) => {
                    if (z === 1) return 2;
                    setImagePan({ x: 0, y: 0 });
                    return 1;
                  });
                }
              }}
              className="max-w-[90vw] max-h-[75vh] object-contain rounded-xl border border-white/20 shadow-2xl select-none"
              title="Hold and drag to move | Click to toggle 2x zoom | Scroll to zoom"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
