import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NoteItem } from "../../api/tauriBridge";
import { tauriApi } from "../../api/tauriBridge";
import { fontStack } from "../editor/fonts";
import { EditorOverlays, NoteBody, NoteGallery, Toolbar, useNoteEditor, useZoom } from "../editor";
import { placeCaretAtEditorStart } from "../../lib/format";
import { shelfMark } from "../../lib/shelfMarks";
import { cleanText, fullStamp, uid } from "../../lib/text";
import { cn } from "@/lib/utils";
import { Btn, Confirm, Field, Frame, Glyph, Menu, type MenuItem } from "../ui";

interface NoteSheetProps {
  note: NoteItem;
  shelves: string[];
  onCommit: (note: NoteItem) => void;
  onClose: () => void;
  onDelete: (note: NoteItem) => void;
  /** The note was settled or brought back; given the note as it now stands. */
  onSettledChange?: (note: NoteItem) => void;
  /** True when switching notes while the drawer is already open (skip the slide-in). */
  instant?: boolean;
  /** Fired the moment the exit slide starts so the canvas can reclaim the space. */
  onClosing?: () => void;
  width?: number;
  onResizeWidth?: (w: number) => void;
  onResizeStateChange?: (resizing: boolean) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  isBottomMode?: boolean;
}

const minWidth = () => (window.innerWidth <= 1280 ? 360 : 420);

/** The open note, in a drawer beside the canvas (or full size). Edits reach the workspace at once. */
export function NoteSheet({
  note,
  shelves,
  onCommit,
  onClose,
  onDelete,
  onSettledChange,
  instant = false,
  onClosing,
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
  const closing = useRef(false);
  const deleted = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const [draft, setDraft] = useState<NoteItem>(note);
  const draftRef = useRef(draft);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shelfMenu, setShelfMenu] = useState<DOMRect | null>(null);
  const [newShelf, setNewShelf] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<() => void>(() => {});

  /** Every edit goes to the workspace at once, so the card follows the typing; the workspace waits
   *  for a pause before writing the file. */
  const commit = (next: NoteItem) => {
    draftRef.current = next;
    setDraft(next);
    if (next.source_path) {
      // A file opened in place saves only from the Save button.
      dirtyRef.current = true;
      setDirty(true);
      void tauriApi.setExternalDirty(true);
      setSavedFlash(false);
      return;
    }
    commitRef.current(next);
  };
  const edit = (patch: Partial<NoteItem>) => commit({ ...draftRef.current, ...patch, last_edited: Date.now() });

  // The card's menu can settle or move this note while it is open; the next save must not undo it.
  useEffect(() => {
    if (!!draftRef.current.is_settled === !!note.is_settled) return;
    draftRef.current = { ...draftRef.current, is_settled: note.is_settled };
    setDraft(draftRef.current);
  }, [note.is_settled]);
  useEffect(() => {
    if (draftRef.current.category === note.category) return;
    draftRef.current = { ...draftRef.current, category: note.category };
    setDraft(draftRef.current);
  }, [note.category]);

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

  /** MD and Text also flip the file extension (.md and .txt) on the next write. */
  const setMode = (raw: boolean) => {
    if (raw === (draftRef.current.format === "txt")) return;
    commit({ ...draftRef.current, format: raw ? "txt" : "md", last_edited: Date.now() });
  };

  const editor = useNoteEditor({
    note: draft,
    edit,
    titleRef,
    onSave: () => {
      if (draftRef.current.source_path) void saveExternal();
    },
  });
  const zoom = useZoom("doit:note-zoom", !editor.previewImage);

  // Decided once, at mount: a hidden window gets no animation frames, so a timer covers them.
  const animateIn = useRef(!instant);
  useLayoutEffect(() => {
    if (!animateIn.current) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setPhase("in");
    };
    const id = requestAnimationFrame(start);
    const timer = window.setTimeout(start, 120);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    frame.current?.focus({ preventScroll: true });
    if (!note.title) requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    // Once, on mount: a later save must never pull focus off a line.
  }, []);

  useEffect(() => {
    // Floating layers take Escape first (see ui/layers); one that reaches here closes the note.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(
    () => () => {
      if (draftRef.current.source_path) void tauriApi.setExternalDirty(false);
      window.clearTimeout(phaseTimer.current);
      if (!deleted.current && !draftRef.current.source_path) commitRef.current(draftRef.current);
    },
    [],
  );

  const close = () => {
    if (closing.current) return;
    if (draftRef.current.source_path && dirtyRef.current && !window.confirm("Discard unsaved changes to this file?")) return;
    closing.current = true;
    // Drop trailing empty lines only; blank lines between paragraphs are real content.
    const cur = draftRef.current;
    let content = [...cur.content];
    while (content.length > 1 && content[content.length - 1].text.trim() === "") content.pop();
    if (content.length === 0) content = [{ id: uid("line"), text: "", is_todo: cur.content[0]?.is_todo ?? false, completed: false }];
    const clean = { ...cur, content };
    draftRef.current = clean;
    if (!clean.source_path) commitRef.current(clean);

    onClosing?.();
    if (frame.current) frame.current.style.pointerEvents = "none";
    setPhase("in");
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase("out")));
    phaseTimer.current = window.setTimeout(() => onClose(), 260);
  };
  closeRef.current = close;

  /** Settling puts the note away, so the sheet closes with it; bringing one back leaves it open. */
  const toggleSettled = () => {
    const next = { ...draftRef.current, is_settled: !draftRef.current.is_settled };
    draftRef.current = next;
    setDraft(next);
    onSettledChange?.(next);
    if (next.is_settled) close();
  };

  // ---- resizing the drawer from its left edge ----
  const resizing = useRef(false);
  const onResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    onResizeStateChange?.(true);
    const startX = e.clientX;
    const startWidth = width || frame.current?.offsetWidth || 520;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const finish = () => {
      resizing.current = false;
      onResizeStateChange?.(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    const clamp = (w: number) => Math.round(Math.min(Math.max(w, minWidth()), Math.max(minWidth(), window.innerWidth - 64 - 480)));
    const onMove = (m: MouseEvent) => {
      if (!resizing.current) return;
      const raw = startWidth + startX - m.clientX;
      // Dragged far enough, it snaps to full size.
      if (raw >= window.innerWidth * 0.7 || raw >= window.innerWidth - 300) {
        finish();
        onToggleMaximize?.();
        return;
      }
      onResizeWidth?.(clamp(raw));
    };
    const onUp = (u: MouseEvent) => {
      if (!resizing.current) return;
      finish();
      const w = clamp(startWidth + startX - u.clientX);
      onResizeWidth?.(w);
      try {
        localStorage.setItem("doit.drawer_width", String(w));
      } catch {
        /* storage full or blocked */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const shelfItems: MenuItem[] = shelves.map((shelf) => ({
    key: shelf,
    glyph: shelfMark(shelf),
    label: cleanText(shelf),
    hint: shelf === draft.category ? "•" : undefined,
    run: () => edit({ category: shelf }),
  }));
  const addShelf = () => {
    const name = newShelf.trim().slice(0, 24);
    if (!name) return;
    edit({ category: name });
    setNewShelf("");
    setShelfMenu(null);
  };

  const offscreen = isBottomMode ? "translate3d(0,104%,0)" : "translate3d(104%,0,0)";

  return (
    <>
      <div
        ref={frame}
        role="complementary"
        aria-label={cleanText(draft.title) || "Untitled note"}
        tabIndex={-1}
        onKeyDownCapture={editor.onKeyDown}
        onPaste={editor.onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={editor.onDrop}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "transform" && phase === "in") setPhase("settled");
        }}
        style={{
          transform: phase === "out" ? offscreen : phase === "settled" || isMaximized || phase === "in" ? "none" : offscreen,
          opacity: phase === "pre" ? 0 : 1,
          transition:
            phase === "out"
              ? "transform 240ms var(--ease), opacity 200ms ease-out"
              : phase === "in"
                ? "transform 300ms var(--ease), opacity 200ms ease-out"
                : "none",
          willChange: phase === "settled" ? "auto" : "transform",
        }}
        className="relative z-30 h-full w-full outline-none"
      >
        <Frame className="tm-layer flex h-full flex-col pb-2 pt-5" surface="var(--background)">
          <span className="absolute right-[1.5ch] top-0 z-20 flex -translate-y-1/2 items-center bg-background px-[0.5ch]">
            {!external && onSettledChange && (
              <Glyph label={draft.is_settled ? "Bring back to its shelf" : "Settle: put away, search still finds it"} onClick={toggleSettled}>
                {draft.is_settled ? "↺" : "✓"}
              </Glyph>
            )}
            {!external && (
              <Glyph label="Delete note" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                ⌫
              </Glyph>
            )}
            {onToggleMaximize && (
              <Glyph label={isMaximized ? "Restore the drawer" : "Full size"} onClick={onToggleMaximize}>
                {isMaximized ? "⤡" : "⤢"}
              </Glyph>
            )}
            <Glyph label="Close note (Esc)" onClick={close}>
              ×
            </Glyph>
          </span>

          {!isMaximized && !isBottomMode && (
            <div
              onMouseDown={onResizeDown}
              title="Drag to resize"
              className="group/resize absolute -left-[4px] top-0 z-40 h-full w-[8px] cursor-col-resize"
            >
              <span className="absolute left-1/2 top-1/2 h-10 w-px -translate-y-1/2 bg-graph-frame transition-colors group-hover/resize:bg-graph-accent" />
            </div>
          )}

          <div className={cn("flex shrink-0 items-center gap-[1ch] pb-3", isMaximized ? "px-10" : "px-6")}>
            {external ? (
              <>
                <span title={draft.source_path} className="min-w-0 truncate text-[13px] text-graph-muted">
                  {draft.source_path}
                </span>
                {saveError && (
                  <span className="max-w-[24ch] truncate text-[12px] text-destructive" title={saveError}>
                    {saveError}
                  </span>
                )}
                <Btn variant={dirty ? "primary" : "default"} onClick={() => void saveExternal()} keys="Ctrl+S" className="ml-auto">
                  {savedFlash ? "saved" : "save"}
                </Btn>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => setShelfMenu(shelfMenu ? null : e.currentTarget.getBoundingClientRect())}
                aria-expanded={!!shelfMenu}
                className="-ml-[1ch] flex h-8 items-center gap-[1ch] px-[1ch] text-graph-muted hover:bg-hover hover:text-foreground"
              >
                <span className="text-graph-accent">{shelfMark(draft.category)}</span>
                <span className="max-w-[24ch] truncate">{cleanText(draft.category)}</span>
                <span className="text-graph-frame">▾</span>
              </button>
            )}
          </div>

          <div className={cn("tm-rule-b shrink-0 pb-3", isMaximized ? "px-10" : "px-6")}>
            <Toolbar editor={editor} note={draft} onMode={setMode} onFont={(font) => edit({ font_family: font })} zoom={zoom} compact={!isMaximized && (width ?? 600) < 520} />
          </div>

          <div className={cn("min-h-0 flex-1 overflow-auto", isMaximized ? "px-12" : "px-8")}>
            <div className={cn("mx-auto w-full pb-12 pt-8", isMaximized ? "max-w-[88ch]" : "max-w-[80ch]")} style={zoom.value !== 100 ? { zoom: `${zoom.value}%` } : undefined}>
                <input
                  ref={titleRef}
                  value={draft.title ?? ""}
                  onChange={(event) => edit({ title: event.target.value })}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key !== "ArrowDown") return;
                    if (rawMode) {
                      const textarea = frame.current?.querySelector("textarea");
                      if (textarea) {
                        e.preventDefault();
                        textarea.focus();
                        textarea.setSelectionRange(0, 0);
                      }
                    } else if (editor.bodyRef.current) {
                      e.preventDefault();
                      placeCaretAtEditorStart(editor.bodyRef.current);
                    }
                  }}
                  data-undo="title"
                  placeholder="untitled"
                  aria-label="Note title"
                  className={cn("w-full min-w-0 font-semibold caret-[var(--graph-accent)]", isMaximized ? "text-[26px] leading-[1.3]" : "text-[22px] leading-[1.35]")}
                  style={{ fontFamily: fontStack(draft.font_family) }}
                />

              <NoteGallery editor={editor} variant="sheet" />
              <div className="graph-rule my-6" />
              <NoteBody editor={editor} variant="sheet" maximized={isMaximized} />
            </div>
          </div>

          <div className={cn("tm-rule-t flex h-10 shrink-0 items-center gap-[2ch] text-[12px] text-graph-muted", isMaximized ? "px-10" : "px-6")}>
            {external && dirty && <span className="text-graph-accent">unsaved</span>}
            <span className="truncate">edited {fullStamp(draft.last_edited).toLowerCase()}</span>
          </div>
        </Frame>
      </div>

      <EditorOverlays editor={editor} />

      {shelfMenu && (
        <Menu
          at={shelfMenu}
          onClose={() => setShelfMenu(null)}
          items={shelfItems}
          activeKey={draft.category}
          footer={
            <div className="tm-rule-t mt-1 px-[1.5ch] pt-2">
              <Field data-own-keys value={newShelf} onChange={(e) => setNewShelf(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addShelf()} placeholder="new shelf" prompt="+" maxLength={24} />
            </div>
          }
        />
      )}

      {showDeleteConfirm && (
        <Confirm
          title="delete note"
          body={`“${cleanText(draft.title) || "Untitled"}” goes from your notes folder. You can undo right after.`}
          confirmLabel="delete"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            deleted.current = true;
            onDelete(draftRef.current);
            onClose();
          }}
        />
      )}
    </>
  );
}
