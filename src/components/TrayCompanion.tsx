import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Mark } from "./Mark";
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
import { accentFor, cleanText, cx, relativeShort, uid } from "../lib/text";

export function TrayCompanion() {
  const { notes, categories, patch, create, remove } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);

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

  // Transition debouncing lock to eliminate click-through re-expansion loops
  const isTransitioning = useRef(false);

  // Formatting popovers
  const [fontOpen, setFontOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const grabScrollRef = useRef<HTMLDivElement | null>(null);
  const dragScrollState = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  );

  const shelves = useMemo(() => categories.map((c) => c.name), [categories]);

  // Synchronize window size with expanded state
  useEffect(() => {
    isTransitioning.current = true;
    void tauriApi.resizeTrayWindow(expanded);
    const timer = window.setTimeout(() => {
      isTransitioning.current = false;
    }, 320);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  // Synchronize with external Tauri expansion events (e.g. from open_tray_mode or window manager)
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    getCurrentWindow()
      .listen<boolean>("set-expanded", (event) => {
        setExpanded((prev) => {
          if (prev === event.payload) return prev;
          if (!event.payload) {
            setDrawerOpen(false);
          }
          return event.payload;
        });
      })
      .then((unlisten) => {
        unlistenFn = unlisten;
      });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Load theme mode for tray window
  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      if (s.theme_mode) {
        document.documentElement.dataset.theme = s.theme_mode;
      }
    });
  }, []);

  // Global key navigation (Escape to minimize/step-back, Cmd/Ctrl+J to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (drawerOpen) {
          setDrawerOpen(false);
        } else if (expanded && !isTransitioning.current) {
          isTransitioning.current = true;
          setExpanded(false);
        }
      }
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "j" && !isTransitioning.current) {
        e.preventDefault();
        isTransitioning.current = true;
        setExpanded((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded, activeNoteId, drawerOpen]);

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
    const newNote = create(selectedShelf ?? "Architecture", false);
    openNoteById(newNote.id);
  };

  const editActive = (patchData: Partial<NoteItem>) => {
    if (!activeNote) return;
    const next: NoteItem = { ...activeNote, ...patchData, last_edited: Date.now() };
    patch(next);
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

  // Convert between text area text and ContentItem[]
  const fullText = useMemo(() => {
    if (!activeNote) return "";
    return activeNote.content.map((c) => c.text).join("\n");
  }, [activeNote]);

  const handleTextChange = (text: string) => {
    if (!activeNote) return;
    const lines = text.split("\n");
    const content: ContentItem[] = lines.map((line, idx) => ({
      id: activeNote.content[idx]?.id ?? uid("line"),
      text: line,
      is_todo: false,
      completed: false,
    }));
    editActive({ content });
  };

  const isTasksMode = useMemo(() => {
    if (!activeNote) return false;
    return activeNote.content.some((c) => c.is_todo);
  }, [activeNote]);

  const toggleMode = () => {
    if (!activeNote) return;
    const nextIsTodo = !isTasksMode;
    const content = activeNote.content.map((c) => ({ ...c, is_todo: nextIsTodo }));
    editActive({ content });
  };

  // Pointer down handler for pill: click to expand, click & drag to move window anywhere on screen
  const pillDragRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    moved: false,
  });

  const handlePillPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isTransitioning.current) return;
    pillDragRef.current = {
      isDown: true,
      startX: e.screenX,
      startY: e.screenY,
      moved: false,
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!pillDragRef.current.isDown) return;
      const dx = ev.screenX - pillDragRef.current.startX;
      const dy = ev.screenY - pillDragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        pillDragRef.current.moved = true;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        void tauriApi.startDrag().then(() => {
          void tauriApi.saveTrayPosition();
        });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (pillDragRef.current.isDown && !pillDragRef.current.moved && !isTransitioning.current) {
        setExpanded(true);
      } else if (pillDragRef.current.moved) {
        void tauriApi.saveTrayPosition();
      }
      pillDragRef.current.isDown = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // ---- RENDER COLLAPSED PILL (CLEAN HORIZONTAL DESIGN) ----
  if (!expanded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent select-none p-2">
        <div
          onPointerDown={handlePillPointerDown}
          className={cx(
            "group/pill flex h-10 select-none items-center gap-2.5 rounded-full pl-3 pr-2.5",
            "cursor-pointer hover:border-white/40 transition-all shadow-2xl",
          )}
          style={{
            backgroundColor: "var(--theme-pill-bg)",
            backdropFilter: "var(--theme-pill-blur)",
            WebkitBackdropFilter: "var(--theme-pill-blur)",
            boxShadow:
              "inset 0 0 0 1px var(--theme-pill-border), inset 0 1px 0 rgba(255,255,255,0.12), 0 16px 40px -12px rgba(0,0,0,0.95)",
          }}
          title="Click to open · Hold and drag to move"
        >
          {/* Logo icon instead of circle dot */}
          <Mark size={16} className="pointer-events-none shrink-0" />

          <span className="text-[13px] font-medium tracking-[0.01em] text-white/90 pointer-events-none">
            Tray
          </span>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (isTransitioning.current) return;
              handleCreate();
              setExpanded(true);
            }}
            className="grid size-6 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer ml-auto"
            title="New Note (⌘N)"
            aria-label="New Note"
          >
            <Plus size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    );
  }

  // ---- RENDER EXPANDED DESK TRAY (IMAGE 3) OR IN-TRAY NOTE EDITOR ----
  return (
    <div
      onPaste={handlePaste}
      className="box-border flex h-full w-full max-h-full max-w-full flex-col overflow-hidden text-ink-1 rounded-[24px] border border-white/10 select-none p-3 animate-drawer-open"
      style={{
        backgroundColor: "var(--theme-tray-bg)",
        backdropFilter: "var(--theme-tray-blur)",
        WebkitBackdropFilter: "var(--theme-tray-blur)",
        boxShadow: "inset 0 0 0 1px var(--theme-tray-border), 0 40px 90px -30px rgba(0,0,0,0.95)",
      }}
    >
      {/* 1. Fluid unbordered top bar: Clicking top bar minimizes back to pill without closing active note */}
      <div
        onClick={() => {
          if (isTransitioning.current) return;
          setDrawerOpen(false);
          setExpanded(false);
        }}
        title="Tap top bar to minimize"
        className="flex h-7 shrink-0 items-center justify-between px-1 mb-2.5 select-none cursor-pointer group/topbar"
      >
        <div className="flex flex-1 items-center gap-2 py-1">
          {activeNote ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBack();
              }}
              className="flex items-center gap-1 h-6 rounded-md px-1.5 -ml-1 text-[11px] font-mono text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Back to notes list"
            >
              <ArrowLeft size={12} />
              <span>Back</span>
            </button>
          ) : (
            <Mark size={14} className="shrink-0" />
          )}
          <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/50 group-hover/topbar:text-white/80 transition-colors">
            {activeNote ? "EDIT NOTE" : "DESK TRAY"}
          </span>
        </div>

        <div
          className="flex items-center gap-1 shrink-0 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => void tauriApi.openCanvasMode()}
            className="grid size-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Open Canvas"
            aria-label="Open Canvas"
          >
            <ArrowUpRight size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (isTransitioning.current) return;
              setDrawerOpen(false);
              setExpanded(false);
            }}
            className="grid size-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Minimize to Pill (—)"
            aria-label="Minimize to Pill"
          >
            <Minus size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              setExpanded(false);
              void getCurrentWindow().hide();
            }}
            className="grid size-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Hide to System Tray (✕)"
            aria-label="Hide to System Tray"
          >
            <X size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {activeNote ? (
        /* ---- IN-TRAY PROPER NOTE EDITOR ---- */
        <div className="flex flex-1 flex-col overflow-hidden px-1">
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
                onClick={() => {
                  const nextBold = !activeNote.is_bold;
                  editActive({ is_bold: nextBold });
                }}
                className={cx("icon-btn !size-6 cursor-pointer", activeNote.is_bold && "!bg-white/20 !text-white")}
                title="Toggle Bold"
              >
                <Bold size={11.5} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const nextItalic = !activeNote.is_italic;
                  editActive({ is_italic: nextItalic });
                }}
                className={cx("icon-btn !size-6 cursor-pointer", activeNote.is_italic && "!bg-white/20 !text-white")}
                title="Toggle Italic"
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
            value={cleanText(activeNote.title)}
            onChange={(e) => editActive({ title: e.target.value })}
            placeholder="Untitled"
            className="w-full mt-2.5 bg-transparent text-[16px] font-semibold text-ink-1 outline-none placeholder:text-ink-4/60"
            style={{
              fontFamily: fontStack(activeNote.font_family),
              fontWeight: activeNote.is_bold ? 700 : 560,
              fontStyle: activeNote.is_italic ? "italic" : "normal",
            }}
          />

          {/* Media preview if present */}
          {(() => {
            const images = (activeNote.media_urls && activeNote.media_urls.length > 0)
              ? activeNote.media_urls
              : (activeNote.media_url ? [activeNote.media_url] : []);
            if (images.length === 0) return null;
            return (
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto scroll pr-1">
                  {images.map((imgUrl, idx) => (
                    <div
                      key={`tray-img-${idx}`}
                      onClick={() => setPreviewImage(imgUrl)}
                      className="relative group aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center cursor-pointer hover:border-white/30 transition-all"
                      title="Click to preview full image"
                    >
                      <img
                        src={imgUrl}
                        alt=""
                        className="w-full h-full object-cover rounded opacity-95 transition-transform duration-200 group-hover:scale-105"
                        onError={(e) => (e.currentTarget.style.display = "none")}
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
          <div className="flex-1 min-h-0 mt-2 overflow-y-auto scroll">
            {!isTasksMode ? (
              <textarea
                value={fullText}
                onKeyDown={(e) => {
                  const meta = e.ctrlKey || e.metaKey;
                  if (meta && e.key.toLowerCase() === "b") {
                    e.preventDefault();
                    editActive({ is_bold: !activeNote.is_bold });
                  } else if (meta && e.key.toLowerCase() === "i") {
                    e.preventDefault();
                    editActive({ is_italic: !activeNote.is_italic });
                  } else if (e.key === "Enter") {
                    const textarea = e.currentTarget;
                    const val = textarea.value;
                    const selStart = textarea.selectionStart;
                    const selEnd = textarea.selectionEnd;

                    const lineStart = val.lastIndexOf("\n", selStart - 1) + 1;
                    const currentLine = val.substring(lineStart, selStart);
                    const match = currentLine.match(/^(\s*[-*•]\s+)/);

                    if (match) {
                      const bulletPrefix = match[1];
                      const lineContent = currentLine.substring(bulletPrefix.length).trim();

                      if (lineContent === "") {
                        e.preventDefault();
                        const nextVal = val.substring(0, lineStart) + val.substring(selEnd);
                        handleTextChange(nextVal);
                        requestAnimationFrame(() => {
                          textarea.value = nextVal;
                          textarea.setSelectionRange(lineStart, lineStart);
                        });
                      } else {
                        e.preventDefault();
                        const insertion = "\n" + bulletPrefix;
                        const nextVal = val.substring(0, selStart) + insertion + val.substring(selEnd);
                        const nextPos = selStart + insertion.length;
                        handleTextChange(nextVal);
                        requestAnimationFrame(() => {
                          textarea.value = nextVal;
                          textarea.setSelectionRange(nextPos, nextPos);
                        });
                      }
                    }
                  } else if (e.key === "Backspace") {
                    const textarea = e.currentTarget;
                    const val = textarea.value;
                    const selStart = textarea.selectionStart;
                    const selEnd = textarea.selectionEnd;

                    if (selStart === selEnd) {
                      const lineStart = val.lastIndexOf("\n", selStart - 1) + 1;
                      const currentLine = val.substring(lineStart, selStart);
                      const match = currentLine.match(/^(\s*[-*•]\s+)$/);
                      if (match) {
                        e.preventDefault();
                        const nextVal = val.substring(0, lineStart) + val.substring(selEnd);
                        handleTextChange(nextVal);
                        requestAnimationFrame(() => {
                          textarea.value = nextVal;
                          textarea.setSelectionRange(lineStart, lineStart);
                        });
                      }
                    }
                  }
                }}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Start writing..."
                className="w-full h-full min-h-[180px] resize-none bg-transparent text-[12.5px] leading-relaxed text-ink-2 outline-none placeholder:text-ink-4/50 scroll"
                style={{
                  fontFamily: fontStack(activeNote.font_family),
                  fontWeight: activeNote.is_bold ? 650 : 420,
                  fontStyle: activeNote.is_italic ? "italic" : "normal",
                }}
              />
            ) : (
              <div className="space-y-1.5">
                {activeNote.content.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <button
                      type="button"
                      onClick={() => {
                        const content = activeNote.content.map((c) =>
                          c.id === item.id ? { ...c, completed: !c.completed } : c,
                        );
                        editActive({ content });
                      }}
                      className={cx("shrink-0", item.is_todo ? "check" : "size-3 rounded-full bg-white/20")}
                    >
                      {item.is_todo && item.completed && <Check size={8} strokeWidth={3} />}
                    </button>
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => {
                        const content = activeNote.content.map((c) =>
                          c.id === item.id ? { ...c, text: e.target.value } : c,
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
                      }}
                      placeholder="Task item..."
                      className={cx(
                        "flex-1 bg-transparent text-[12px] text-ink-2 outline-none",
                        item.completed && "line-through text-ink-4",
                      )}
                      style={{
                        fontFamily: fontStack(activeNote.font_family),
                        fontWeight: activeNote.is_bold ? 620 : 420,
                        fontStyle: activeNote.is_italic ? "italic" : "normal",
                      }}
                    />
                  </div>
                ))}
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
        </div>
      ) : (
        /* ---- DESK TRAY MAIN MENU (SCREENSHOT 3: CLEAN, UNCLUTTERED, OPEN PROFILE) ---- */
        <div className="flex flex-1 flex-col overflow-hidden px-1 space-y-2">
          {/* + New note button matching Screenshot 3 */}
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-11 w-full items-center gap-2.5 rounded-[14px] bg-white/[0.07] px-3.5 text-[13px] font-medium text-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-all hover:bg-white/[0.12] active:scale-[0.99]"
          >
            <Plus size={15} strokeWidth={2} className="text-white/80" />
            <span>New note</span>
            <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/40 border border-white/[0.08]">
              ⌘N
            </span>
          </button>

          {/* Pull up an old note input matching Screenshot 3 */}
          <div className="relative flex items-center h-11 w-full rounded-[14px] bg-white/[0.035] px-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-all focus-within:bg-white/[0.06] focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
            <Search size={14} className="text-white/35 mr-2.5 pointer-events-none shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Pull up an old note"
              className="flex-1 bg-transparent text-[13px] text-white/90 placeholder:text-white/30 outline-none min-w-0"
            />
            {filter ? (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="text-white/40 hover:text-white p-1"
              >
                <X size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDrawerOpen((prev) => !prev)}
                className={cx(
                  "ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider transition-colors border",
                  drawerOpen || selectedShelf
                    ? "bg-white/15 text-white border-white/25"
                    : "bg-white/[0.04] text-white/40 border-white/[0.06] hover:text-white/70 hover:bg-white/[0.08]",
                )}
                title="Toggle Category Filter Drawer"
              >
                <span>{selectedShelf ? selectedShelf : "FIND"}</span>
                <ChevronDown
                  size={10}
                  className={cx("transition-transform duration-200", drawerOpen && "rotate-180")}
                />
              </button>
            )}
          </div>

          {/* Category Filter Drawer Container (Always visible, smoothly scrollable, clean) */}
          <div className="py-1">
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
                  "shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition-all",
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
                      "shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition-all",
                      active
                        ? "bg-white/20 text-white font-medium border border-white/25 shadow-sm"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80 border border-white/[0.06]",
                    )}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />
                    <span>{shelf}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RECENT Label matching Screenshot 3 */}
          <div className="pt-1.5 px-1">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/30">
              RECENT
            </span>
          </div>

          {/* Recent Notes List matching Screenshot 3 */}
          <div className="flex-1 overflow-y-auto space-y-0.5 scroll pr-0.5">
            {filteredNotes.length === 0 ? (
              <p className="py-6 text-center text-[11.5px] text-white/35">
                No matching notes found.
              </p>
            ) : (
              filteredNotes.slice(0, 5).map((note) => {
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openNoteById(note.id)}
                    className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/[0.05] group"
                  >
                    <span
                      className="h-7 w-[2px] shrink-0 rounded-full bg-white/70 group-hover:bg-white transition-colors"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-white/90">
                        {cleanText(note.title) || "Untitled"}
                      </span>
                      <span className="block truncate font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/35">
                        {cleanText(note.category)}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/35">
                      {relativeShort(note.last_edited)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Back to the canvas link matching Screenshot 3 */}
          <div className="pt-1 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => tauriApi.openCanvasMode()}
              className="flex h-8 w-full items-center justify-between px-2 text-[12px] text-white/40 hover:text-white transition-colors"
            >
              <span>Back to the canvas</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 cursor-zoom-out"
        >
          <div className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-[90vw] max-h-[82vh] object-contain rounded-xl border border-white/15 shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-2.5 -right-2.5 grid size-7 place-items-center rounded-full bg-black/90 text-white hover:bg-black border border-white/20 shadow-lg cursor-pointer"
              title="Close preview"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
