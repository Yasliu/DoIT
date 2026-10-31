import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  Check,
  ChevronDown,
  ListChecks,
  Table as TableIcon,
  CornerDownLeft,
  Image as ImageIcon,
  Italic,
  Plus,
  Save,
  Trash,
  Type,
  X,
} from "lucide-react";
import type { NoteItem } from "../api/tauriBridge";
import { NOTE_FONTS, fontStack, tauriApi } from "../api/tauriBridge";
import { useUndoStack } from "../hooks/useUndoStack";
import { HeadingSelect } from "./HeadingSelect";
import { ImageLightbox } from "./ImageLightbox";
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
  const [shelfOpen, setShelfOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newShelf, setNewShelf] = useState("");
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

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    normalizeEditor(editorRef.current);
    const content = markdownToContent(htmlToMarkdown(editorRef.current), draftRef.current.content, () => uid("line"));
    commit({ ...draftRef.current, content, last_edited: Date.now() });
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

  const runEditorCommand = (fn: (editor: HTMLElement) => void) => {
    const ed = editorRef.current;
    if (!ed) return;
    fn(ed);
    handleEditorInput();
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

  const edit = (patch: Partial<NoteItem>) => {
    commit({ ...draftRef.current, ...patch, last_edited: Date.now() });
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
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setPhase("in");
        onOpening?.();
      }),
    );
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
  }, [fontOpen, shelfOpen]);

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
    phaseTimer.current = window.setTimeout(() => onClose(), 320);
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
          transform: phase === "settled" ? "none" : phase === "in" ? "translate3d(0,0,0)" : "translate3d(106%,0,0)",
          opacity: phase === "pre" ? 0 : 1,
          // entry: long soft landing + quick fade; exit keeps the plain 300ms ease-out
          transition:
            phase === "settled"
              ? "none"
              : phase === "out"
                ? "transform 300ms ease-out"
                : "transform 460ms cubic-bezier(0.32, 0.72, 0, 1), opacity 240ms ease-out",
          willChange: phase === "settled" ? "auto" : "transform",
        }}
        className="absolute inset-y-0 right-0 z-30 flex w-[clamp(420px,42vw,600px)] flex-col overflow-hidden rounded-[22px] glass-sheet outline-none border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
      >        <div
          className="h-[2px] shrink-0 origin-left"
          style={{ backgroundColor: accent, animation: "strip-in 620ms cubic-bezier(0.22,1,0.36,1) both" }}
        />

        <div className="flex min-h-[52px] shrink-0 flex-nowrap items-center justify-between gap-x-3 px-5 py-1.5">
          <div className="flex min-w-0 max-w-[130px] shrink items-center gap-2.5">
            {external ? (
              <span
                title={draft.source_path}
                className="flex h-6 max-w-[220px] items-center gap-1.5 truncate rounded-md px-1.5 font-mono text-[9.5px] tracking-[0.06em] text-ink-3"
              >
                <span className="size-[4px] shrink-0 rounded-full bg-white/60" />
                <span className="truncate">{(draft.source_path || "").split(/[\\/]/).pop()}</span>
              </span>
            ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
                className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-1"
              >
                <span className="size-[4px] shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                <span className="fade-end max-w-[96px] overflow-hidden whitespace-nowrap">{cleanText(draft.category)}</span>
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

            )}
          </div>

          <div className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto">
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

            {!rawMode && (
            <>
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

            <span className="mx-1 h-4 w-px bg-white/[0.08]" />
            <HeadingSelect editorRef={editorRef} onSelect={(level) => runEditorCommand((ed) => applyHeading(ed, level))} />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runEditorCommand((ed) => insertTableAtCaret(ed))}
              aria-label="Insert table"
              title="Insert table (Ctrl+T)"
              className="icon-btn !size-7 cursor-pointer"
            >
              <TableIcon size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runEditorCommand((ed) => applyTask(ed))}
              aria-label="Task checkbox"
              title="Task checkbox (- [ ])"
              className="icon-btn !size-7 cursor-pointer"
            >
              <ListChecks size={13.5} strokeWidth={1.8} />
            </button>
            <span className="mx-1 h-4 w-px bg-white/[0.08]" />
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

            {!external && (
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
            )}
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

        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2">
          <ModeToggle rawMode={rawMode} onChange={setMode} />
          {external && (
            <div className="flex min-w-0 items-center gap-2">
              {saveError && (
                <span className="max-w-[200px] truncate text-[10.5px] text-red-400" title={saveError}>
                  {saveError}
                </span>
              )}
              {dirty && !savedFlash && <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">Unsaved</span>}
              <button
                type="button"
                onClick={() => void saveExternal()}
                title="Save to the original file (Ctrl+S)"
                className={cx(
                  "flex h-7 items-center gap-1.5 rounded-[8px] border px-3 text-[11.5px] font-medium transition-colors duration-150",
                  dirty
                    ? "border-white bg-white text-black hover:bg-white/90"
                    : "border-white/[0.14] text-ink-3 hover:border-white/30 hover:text-ink-1",
                )}
              >
                <Save size={12.5} strokeWidth={2} />
                {savedFlash ? "Saved" : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="scroll min-h-0 flex-1 overflow-y-auto px-6">
          <div className="mx-auto w-full max-w-[760px] pb-8 pt-2">
            <input
              ref={titleRef}
              value={draft.title ?? ""}
              onChange={(event) => edit({ title: event.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              data-undo="title"
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

            <div data-undo="body">
              {rawMode ? (
                <RawEditor
                  content={draft.content}
                  minHeight={300}
                  className="text-[13px]"
                  onChange={(content) => commit({ ...draftRef.current, content, last_edited: Date.now() })}
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
                  className="w-full min-h-[300px] whitespace-pre-wrap break-words bg-transparent text-[15.5px] leading-relaxed text-ink-2 outline-none scroll select-text"
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
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">
            <span>
              {body.filter((item) => item.is_todo).filter((item) => item.completed).length}/
              {body.filter((item) => item.is_todo).length} closed
            </span>
            <span className="mx-1 h-3 w-px bg-white/10" />
            <CornerDownLeft size={10} strokeWidth={1.8} />
            new line | esc
          </span>
        </div>
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
    </>
  );
}
