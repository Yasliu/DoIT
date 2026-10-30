import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlignLeft,
  Bold,
  Check,
  ChevronDown,
  CornerDownLeft,
  Image as ImageIcon,
  Italic,
  ListTodo,
  Plus,
  Trash,
  Type,
  X,
} from "lucide-react";
import type { ContentItem, NoteItem } from "../api/tauriBridge";
import { NOTE_FONTS, fontStack } from "../api/tauriBridge";
import {
  htmlToMarkdown,
  isRichBoldActive,
  isRichItalicActive,
  markdownToHtml,
} from "../lib/format";
import { springTo } from "../lib/spring";
import { accentFor, cleanText, cx, fullStamp, uid } from "../lib/text";

interface NoteSheetProps {
  note: NoteItem;
  origin: DOMRect;
  canvas: HTMLElement | null;
  shelves: string[];
  onCommit: (note: NoteItem) => void;
  onClose: () => void;
  onDelete: (note: NoteItem) => void;
}

export function NoteSheet({
  note,
  origin: _origin,
  canvas: _canvas,
  shelves,
  onCommit,
  onClose,
  onDelete,
}: NoteSheetProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const scrim = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const deleted = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const [draft, setDraft] = useState<NoteItem>(note);
  const draftRef = useRef(draft);
  const saveTimer = useRef(0);
  const [fontOpen, setFontOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const isPanningImage = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newShelf, setNewShelf] = useState("");
  const [focusLine, setFocusLine] = useState<string | null>(null);
  const lineRefs = useRef(new Map<string, HTMLInputElement>());
  const titleRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<() => void>(() => {});
  const closeCancel = useRef<() => void>(() => {});

  // Rich text formatting state
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isItalicActive, setIsItalicActive] = useState(false);
  const lastNoteIdRef = useRef<string | null>(null);

  const updateActiveFormatting = () => {
    setIsBoldActive(isRichBoldActive());
    setIsItalicActive(isRichItalicActive());
  };

  const initEditor = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    if (node) {
      if (lastNoteIdRef.current !== draft.id || !node.innerHTML || node.innerHTML === "<div><br></div>") {
        lastNoteIdRef.current = draft.id;
        const md = draft.content.map((c) => c.text).join("\n");
        node.innerHTML = markdownToHtml(md);
      }
    }
  }, [draft.id, draft.content]);

  useEffect(() => {
    if (lastNoteIdRef.current !== draft.id) {
      lastNoteIdRef.current = draft.id;
      if (editorRef.current) {
        const md = draft.content.map((c) => c.text).join("\n");
        editorRef.current.innerHTML = markdownToHtml(md);
      }
    }
  }, [draft.id, draft.content]);

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const md = htmlToMarkdown(editorRef.current);
    const lines = md.split("\n");
    const content = lines.map((line, idx) => ({
      id: draft.content[idx]?.id ?? uid("line"),
      text: line,
      is_todo: false,
      completed: false,
    }));
    commit({ ...draftRef.current, content, last_edited: Date.now() });
    updateActiveFormatting();
  };

  const handleToolbarFormat = (style: "bold" | "italic") => {
    const activeEl = document.activeElement;

    // 1. Task line input selection formatting
    if (activeEl instanceof HTMLInputElement && focusLine) {
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

        patchLine(focusLine, { text: nextVal });
        requestAnimationFrame(() => {
          activeEl.setSelectionRange(newStart, newEnd);
        });
        return;
      }
    }

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

  const appendImages = (newUrls: string[]) => {
    const existing = (draftRef.current.media_urls && draftRef.current.media_urls.length > 0)
      ? draftRef.current.media_urls
      : (draftRef.current.media_url ? [draftRef.current.media_url] : []);
    const merged = [...existing, ...newUrls];
    edit({ media_urls: merged, media_url: merged[0] });
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
    const loaded: string[] = [];
    let pending = files.length;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target?.result as string;
        if (dataUrl) loaded.push(dataUrl);
        pending -= 1;
        if (pending === 0 && loaded.length > 0) {
          appendImages(loaded);
        }
      };
      reader.readAsDataURL(file);
    });
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

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const loaded: string[] = [];
    let pending = imageFiles.length;
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target?.result as string;
        if (dataUrl) loaded.push(dataUrl);
        pending -= 1;
        if (pending === 0 && loaded.length > 0) {
          appendImages(loaded);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const isAllTodos = draft.content.some((c) => c.is_todo);
  const toggleContentMode = () => {
    const nextIsTodo = !isAllTodos;
    const content = draftRef.current.content.map((c) => ({ ...c, is_todo: nextIsTodo }));
    commit({ ...draftRef.current, content, last_edited: Date.now() }, true);
  };

  const accent = accentFor(draft.category, shelves);

  const commit = (next: NoteItem, immediate = false) => {
    draftRef.current = next;
    setDraft(next);
    window.clearTimeout(saveTimer.current);
    if (immediate) {
      commitRef.current(next);
      return;
    }
    saveTimer.current = window.setTimeout(() => commitRef.current(draftRef.current), 240);
  };

  const edit = (patch: Partial<NoteItem>) => {
    commit({ ...draftRef.current, ...patch, last_edited: Date.now() });
  };

  // ---- Organic soft modal bloom transition (Eliminates bubble popping & ghost after-images) ----
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;

    el.style.transformOrigin = "center center";
    el.style.transform = "translate3d(0, 10px, 0) scale(0.96)";
    el.style.opacity = "0";
    if (scrim.current) scrim.current.style.opacity = "0";

    const cancel = springTo({
      from: 0,
      to: 100,
      tune: 32,
      onFrame: (value) => {
        const k = value / 100;
        el.style.transform = `translate3d(0, ${(10 * (1 - k)).toFixed(2)}px, 0) scale(${(0.96 + 0.04 * k).toFixed(4)})`;
        el.style.opacity = `${k.toFixed(3)}`;
        if (scrim.current) scrim.current.style.opacity = `${k.toFixed(3)}`;
      },
      onDone: () => {
        el.style.transform = "none";
        el.style.opacity = "1";
        el.style.willChange = "auto";
        if (scrim.current) scrim.current.style.opacity = "1";
      },
    });

    return cancel;
  }, []);

  useEffect(() => {
    const el = frame.current;
    el?.focus();
    if (!note.title) {
      requestAnimationFrame(() => titleRef.current?.focus());
    }
    // run once on mount only: a later save must never pull focus off a line
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (fontOpen || shelfOpen) {
          setFontOpen(false);
          setShelfOpen(false);
          return;
        }
        closeRef.current();
      }
      if (event.key === "Tab" && frame.current) {
        const root = frame.current;
        const nodes = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((node) => node.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = active ? root.contains(active) : false;

        if (!inside) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fontOpen, shelfOpen]);

  useEffect(() => {
    if (!focusLine) return;
    const input = lineRefs.current.get(focusLine);
    input?.focus();
    setFocusLine(null);
  }, [focusLine, draft.content]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current);
      closeCancel.current();
      if (!deleted.current) {
        commitRef.current(draftRef.current);
      }
    };
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    window.clearTimeout(saveTimer.current);

    // Prune excessive empty items before persisting
    const cur = draftRef.current;
    let prunedContent = cur.content;
    if (prunedContent.length > 1) {
      prunedContent = prunedContent.filter(
        (c, i) =>
          c.text.trim().length > 0 ||
          (i === prunedContent.length - 1 && prunedContent.some((other) => other.text.trim().length > 0)),
      );
      if (prunedContent.length === 0) {
        prunedContent = [{ id: uid("line"), text: "", is_todo: cur.content[0]?.is_todo ?? false, completed: false }];
      }
    }
    const cleanFinal = { ...cur, content: prunedContent };
    draftRef.current = cleanFinal;
    commitRef.current(cleanFinal);

    if (scrim.current) scrim.current.style.pointerEvents = "none";
    if (frame.current) frame.current.style.pointerEvents = "none";
    onClose();
  };

  closeRef.current = close;

  const addLine = (afterIndex: number) => {
    const item: ContentItem = {
      id: uid("line"),
      text: "",
      is_todo: draftRef.current.content[afterIndex]?.is_todo ?? true,
      completed: false,
    };
    const content = [...draftRef.current.content];
    content.splice(afterIndex + 1, 0, item);
    commit({ ...draftRef.current, content, last_edited: Date.now() }, true);
    setFocusLine(item.id);
  };

  const removeLine = (id: string, index: number) => {
    const content = draftRef.current.content.filter((item) => item.id !== id);
    const next = content.length
      ? content
      : [{ id: uid("line"), text: "", is_todo: true, completed: false }];
    commit({ ...draftRef.current, content: next, last_edited: Date.now() }, true);
    const neighbour = next[Math.max(0, index - 1)];
    if (neighbour) setFocusLine(neighbour.id);
  };

  const patchLine = (id: string, patch: Partial<ContentItem>) => {
    const content = draftRef.current.content.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    commit({ ...draftRef.current, content, last_edited: Date.now() });
  };


  const addShelf = () => {
    const name = newShelf.trim();
    if (!name) return;
    edit({ category: name });
    setNewShelf("");
    setShelfOpen(false);
  };

  const body = draft.content;

  return (
    <>
      <div
        ref={scrim}
        className="sheet-scrim"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        aria-hidden="true"
      />

      <div className="fixed inset-0 z-60 flex items-center justify-center p-4 sm:p-6 md:p-8 pointer-events-none">
        <div
          ref={frame}
          role="dialog"
          aria-modal="true"
          aria-label={cleanText(draft.title) || "Untitled note"}
          tabIndex={-1}
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleDrop}
          className="pointer-events-auto flex flex-col w-[92vw] max-w-[920px] min-h-[380px] max-h-[88vh] h-auto overflow-hidden rounded-[24px] glass-sheet outline-none border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.85)]"
        >
        <div
          className="h-[2px] shrink-0 origin-left"
          style={{ backgroundColor: accent, animation: "strip-in 620ms cubic-bezier(0.22,1,0.36,1) both" }}
        />

        <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
                className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-1"
              >
                <span className="size-[4px] rounded-full" style={{ backgroundColor: accent }} />
                {cleanText(draft.category)}
                <ChevronDown size={10} strokeWidth={2} />
              </button>

              {shelfOpen && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={() => setShelfOpen(false)} />
                  <div className="absolute left-0 top-8 z-50 w-[220px] rounded-[14px] bg-[#14151a] border border-white/20 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
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

          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setFontOpen((v) => !v)}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-1"
                title="Note typeface"
              >
                <Type size={12} strokeWidth={1.7} />
                <span className="max-w-[92px] truncate">{cleanText(draft.font_family) || "Instrument Sans"}</span>
              </button>

              {fontOpen && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={() => setFontOpen(false)} />
                  <div className="absolute right-0 top-9 z-50 w-[230px] rounded-[14px] bg-[#14151a] border border-white/20 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
                    {NOTE_FONTS.map((font) => (
                      <button
                        key={font.name}
                        type="button"
                        onClick={() => {
                          edit({ font_family: font.name });
                          setFontOpen(false);
                        }}
                        className={cx(
                          "flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[13px]",
                          font.name === draft.font_family
                            ? "bg-white/[0.08] text-ink-1"
                            : "text-ink-2 hover:bg-white/[0.06] hover:text-ink-1",
                        )}
                        style={{ fontFamily: font.stack }}
                      >
                        <span className="truncate">{font.label}</span>
                        {font.name === draft.font_family && <Check size={11} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <span className="mx-1 h-4 w-px bg-white/[0.08]" />

            <button
              type="button"
              onClick={toggleContentMode}
              title={isAllTodos ? "Switch to Plain Text Mode" : "Switch to Tasks/Checklist Mode"}
              aria-label="Toggle content mode"
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-mono uppercase tracking-wider text-ink-3 transition-colors hover:bg-white/[0.08] hover:text-ink-1"
            >
              {isAllTodos ? (
                <>
                  <ListTodo size={12.5} className="text-white" />
                  <span>Tasks</span>
                </>
              ) : (
                <>
                  <AlignLeft size={12.5} className="text-white" />
                  <span>Text</span>
                </>
              )}
            </button>

            <span className="mx-1 h-4 w-px bg-white/[0.08]" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToolbarFormat("bold")}
              aria-label="Toggle Bold"
              title="Bold text (Ctrl+B)"
              data-active={isBoldActive || undefined}
              className={cx("icon-btn !size-7 cursor-pointer", isBoldActive && "!bg-white/20 !text-white")}
            >
              <Bold size={12.5} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToolbarFormat("italic")}
              aria-label="Toggle Italic"
              title="Italic text (Ctrl+I)"
              data-active={isItalicActive || undefined}
              className={cx("icon-btn !size-7 cursor-pointer", isItalicActive && "!bg-white/20 !text-white")}
            >
              <Italic size={12.5} strokeWidth={2.4} />
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
                      appendImages(loaded);
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
              aria-label="Attach media"
              title="Attach image (or paste screenshot directly with Ctrl+V)"
              data-active={(draft.media_urls && draft.media_urls.length > 0) || !!draft.media_url || undefined}
              className="icon-btn !size-7"
            >
              <ImageIcon size={12.5} strokeWidth={1.7} />
            </button>

            <span className="mx-1 h-4 w-px bg-white/[0.08]" />

            <button
              type="button"
              onClick={() => {
                deleted.current = true;
                onDelete(draftRef.current);
              }}
              aria-label="Delete note"
              className="icon-btn !size-7 hover:!text-white"
              title="Delete note"
            >
              <Trash size={12.5} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close note"
              className="icon-btn !size-7"
            >
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="scroll min-h-0 flex-1 overflow-y-auto px-6">
          <div className="mx-auto w-full max-w-[760px] pb-8 pt-2">
            <input
              ref={titleRef}
              value={cleanText(draft.title)}
              onChange={(event) => edit({ title: event.target.value })}
              placeholder="Untitled"
              aria-label="Note title"
              className="w-full bg-transparent text-[27px] leading-[1.18] tracking-[-0.032em] text-ink-1 outline-none placeholder:text-ink-4/70"
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

            {!isAllTodos ? (
              /* Basic Note (Point 4): Freeform multi-line text writing without lists or checkboxes */
              <div className="min-h-[220px]">
                <div
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
                    if (e.key === "Enter") {
                      const sel = window.getSelection();
                      if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        const textBefore = range.startContainer.textContent || "";
                        const offset = range.startOffset;
                        const lineBefore = textBefore.substring(0, offset);
                        const match = lineBefore.match(/^(\s*[-*•]\s+)/);
                        if (match) {
                          const bullet = match[1];
                          const textAfter = lineBefore.substring(bullet.length).trim();
                          if (textAfter === "") {
                            e.preventDefault();
                            range.startContainer.textContent = "";
                            handleEditorInput();
                            return;
                          } else {
                            e.preventDefault();
                            document.execCommand("insertParagraph", false);
                            document.execCommand("insertText", false, bullet);
                            handleEditorInput();
                            return;
                          }
                        }
                      }
                    }
                    if (e.key === "Backspace") {
                      const sel = window.getSelection();
                      if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        if (range.collapsed) {
                          const text = range.startContainer.textContent || "";
                          if (text.match(/^(\s*[-*•]\s*)$/)) {
                            e.preventDefault();
                            range.startContainer.textContent = "";
                            handleEditorInput();
                            return;
                          }
                        }
                      }
                    }
                  }}
                  onKeyUp={updateActiveFormatting}
                  onMouseUp={updateActiveFormatting}
                  className="w-full min-h-[300px] bg-transparent text-[15.5px] leading-relaxed text-ink-2 outline-none scroll select-text"
                  style={{
                    fontFamily: fontStack(draft.font_family),
                  }}
                />
              </div>
            ) : (
              /* Checklist / Tasks Mode */
              <>
                <div className="space-y-[2px]">
                  {body.map((item, index) => (
                    <div
                      key={item.id}
                      className="group/line -mx-2 flex items-start gap-2.5 rounded-[8px] px-2 py-[3px] transition-colors hover:bg-white/[0.025]"
                    >
                      <button
                        type="button"
                        onClick={() => patchLine(item.id, { completed: !item.completed })}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          patchLine(item.id, { is_todo: !item.is_todo });
                        }}
                        data-done={item.is_todo && item.completed ? true : undefined}
                        aria-label={item.is_todo ? "Toggle task" : "Convert to task"}
                        title={item.is_todo ? "Right-click for a plain line" : "Right-click for a checkbox"}
                        className={cx("mt-[5px] shrink-0", item.is_todo ? "check" : "grid size-4 place-items-center")}
                      >
                        {item.is_todo ? (
                          <Check size={10} strokeWidth={3} />
                        ) : (
                          <span className="size-[3px] rounded-full bg-white/30 transition-colors group-hover/line:bg-white/55" />
                        )}
                      </button>

                      <input
                        ref={(node) => {
                          if (node) lineRefs.current.set(item.id, node);
                          else lineRefs.current.delete(item.id);
                        }}
                        onFocus={() => setFocusLine(item.id)}
                        value={item.text}
                        onChange={(event) => patchLine(item.id, { text: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addLine(index);
                          }
                          if (event.key === "Backspace" && item.text === "" && body.length > 1) {
                            event.preventDefault();
                            removeLine(item.id, index);
                          }
                        }}
                        placeholder={item.is_todo ? "Task" : index === 0 ? "Write something..." : ""}
                        aria-label="Note line"
                        className={cx(
                          "line-input",
                          item.is_todo && item.completed && "text-ink-4 line-through",
                        )}
                        style={{
                          fontFamily: fontStack(draft.font_family),
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => removeLine(item.id, index)}
                        aria-label="Remove line"
                        className="mt-[5px] grid size-4 shrink-0 place-items-center rounded text-ink-4 opacity-0 transition-opacity hover:text-ink-1 focus-visible:opacity-100 group-hover/line:opacity-100"
                      >
                        <X size={10} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addLine(body.length - 1)}
                  className="mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-ink-4 transition-colors hover:bg-white/[0.04] hover:text-ink-2"
                >
                  <Plus size={12} strokeWidth={1.8} />
                  Add item
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between gap-6 px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">
            Last edited {fullStamp(draft.last_edited)}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">
            <span>
              {body.filter((item) => item.is_todo).filter((item) => item.completed).length}/
              {body.filter((item) => item.is_todo).length} closed
            </span>
            <span className="mx-1 h-3 w-px bg-white/10" />
            <CornerDownLeft size={10} strokeWidth={1.8} />
            new line · esc
          </span>
        </div>
      </div>
      </div>

      {/* Lightbox Preview Modal with Zoom & Holding-Mouse Pan */}
      {previewImage && (
        <div
          onClick={() => {
            setPreviewImage(null);
            setZoomLevel(1);
            setImagePan({ x: 0, y: 0 });
          }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 select-none"
        >
          {/* Zoom & Action Controls Bar */}
          <div
            className="flex items-center gap-2 mb-2 z-20 bg-black/80 px-3.5 py-1.5 rounded-full border border-white/20 shadow-xl"
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
            onClick={(e) => e.stopPropagation()}
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
              className="max-w-[90vw] max-h-[82vh] object-contain rounded-xl border border-white/20 shadow-2xl select-none"
              title="Hold and drag to move · Click to toggle 2x zoom · Scroll to zoom"
            />
          </div>
        </div>
      )}
    </>
  );
}
