import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type NoteItem, tauriApi } from "../../api/tauriBridge";
import { fontStack } from "../editor/fonts";
import { noteMenuItems } from "../canvas/noteMenu";
import { ShelfPicker } from "../canvas/ShelfPicker";
import { EditorOverlays, NoteBody, NoteGallery, Toolbar, useNoteEditor, useZoom } from "../editor";
import { useWorkspace } from "../../hooks/useWorkspace";
import { placeCaretAtEditorStart, setMarkdownBaseDir } from "../../lib/format";
import { shelfMark } from "../../lib/shelfMarks";
import { applyShortcutSettings } from "../../lib/shortcuts";
import { cleanText } from "../../lib/text";
import { applyThemeSettings } from "../../platform";
import { Confirm, Frame, Glyph, Menu, type MenuItem } from "../ui";
import { DockList } from "./DockList";

type Mode = "switching" | "panel" | "pill";

/**
 * The dock window. Collapsed it is the pill, which the backend draws natively (this page shows
 * nothing then); expanded it is this panel: a list of notes, or one note open in the editor.
 */
export function Dock() {
  const { notes, shelves, patch, create, remove, moveCategory, createCategory } = useWorkspace();
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; note: NoteItem } | null>(null);
  const [movingNote, setMovingNote] = useState<NoteItem | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteItem | null>(null);
  const [shelfMenu, setShelfMenu] = useState<DOMRect | null>(null);
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  const closingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const collapsingRef = useRef(false);
  const modeRef = useRef<Mode>("switching");
  const [mode, setMode] = useState<Mode>("switching");
  const changeMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
  }, []);
  const [shelvesOpen, setShelvesOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const visibilityLockRef = useRef(0);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const openNoteById = (id: string) => {
    setActiveNoteId((current) => {
      if (current && current !== id) setHistory((prev) => [...prev, current]);
      return id;
    });
  };
  const back = () => {
    if (history.length === 0) return setActiveNoteId(null);
    const next = [...history];
    const previous = next.pop() ?? null;
    setHistory(next);
    setActiveNoteId(previous);
  };

  // A note deleted (here or in the canvas) while open steps back.
  useEffect(() => {
    if (activeNoteId && notes.length > 0 && !notes.some((n) => n.id === activeNoteId)) back();
  }, [notes, activeNoteId]);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeNoteId) ?? null, [notes, activeNoteId]);
  const editActive = (changes: Partial<NoteItem>) => {
    if (!activeNote) return;
    patch({ ...activeNote, ...changes, last_edited: Date.now() });
  };
  const editor = useNoteEditor({ note: activeNote, edit: (changes) => editActive(changes), titleRef });
  const rawMode = editor.rawMode;
  const zoom = useZoom("doit:dock-zoom", Boolean(activeNoteId) && !editor.previewImage);

  // One frame for both shapes: fade the panel out, resize the native frame while nothing is drawn,
  // then fade back in, and the reverse on expand.
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
    if (!shownRef.current && closingRef.current) {
      closingRef.current = false;
      void collapseToPill();
    }
  }, [collapseToPill]);

  const openTray = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    closingRef.current = false;
    shownRef.current = true;
    setShown(true);
  }, []);

  const [quadrant, setQuadrant] = useState<{ grow_x: "right" | "left" | "center"; grow_y: "down" | "up" }>({ grow_x: "left", grow_y: "up" });

  const expandFromPill = useCallback(async () => {
    closingRef.current = false;
    shownRef.current = false;
    setShown(false);
    changeMode("switching");
    const q = await tauriApi.setTrayMode("panel");
    if (q) setQuadrant(q);
    openTray();
    changeMode("panel");
  }, [changeMode, openTray]);

  const closeTray = useCallback(() => {
    if (!shownRef.current || closingRef.current) return;
    closingRef.current = true;
    shownRef.current = false;
    setShown(false);
    // In case the fade's completion never fires.
    hideTimerRef.current = window.setTimeout(hideNow, 180);
  }, [hideNow]);

  const toggleMinimize = useCallback(() => {
    if (Date.now() < visibilityLockRef.current) return;
    visibilityLockRef.current = Date.now() + 350;
    closeTray();
  }, [closeTray]);

  // The page mounted inside a hidden, pre-positioned frame: once it listens for `set-expanded`,
  // report in and show whichever shape the backend asks for.
  const startedRef = useRef<Promise<void> | null>(null);
  const start = useCallback(() => {
    startedRef.current ??= tauriApi.trayReady().then(({ shape, note }) => {
      if (note) setActiveNoteId(note);
      if (shape === "pill") changeMode("pill");
      else {
        openTray();
        changeMode("panel");
      }
    });
  }, [changeMode, openTray]);

  useEffect(() => {
    let unlistenExpand: (() => void) | null = null;
    let unlistenNote: (() => void) | null = null;
    let disposed = false;
    getCurrentWindow()
      .listen<boolean>("set-expanded", (event) => {
        // A click that lands while the page reports in waits until it knows its shape.
        void startedRef.current?.then(() => {
          // false: the quick-note shortcut, pressed while the panel is in front, puts it away.
          if (!event.payload) closeTray();
          else if (modeRef.current === "pill") void expandFromPill();
          else openTray();
        });
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else {
          unlistenExpand = unlisten;
          start();
        }
      });
    getCurrentWindow()
      .listen<string>("open-note", (event) => {
        if (event.payload) setActiveNoteId(event.payload);
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenNote = unlisten;
      });
    return () => {
      disposed = true;
      unlistenExpand?.();
      unlistenNote?.();
    };
  }, [closeTray, expandFromPill, openTray, start]);

  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      applyThemeSettings(s);
      setMarkdownBaseDir(s.storage_path);
      applyShortcutSettings(s);
    });
  }, []);

  // Escape steps back (or puts the dock away); Ctrl+J toggles. Floating layers take Escape first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (editor.previewImage) editor.setPreviewImage(null);
        else if (activeNoteId) back();
        else toggleMinimize();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleMinimize();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeNoteId, editor.previewImage, toggleMinimize]);

  const filteredNotes = useMemo(() => {
    // Settled notes stay out of the list; searching still finds them.
    let list = notes.filter((n) => !n.is_settled || filter.trim()).sort((a, b) => b.last_edited - a.last_edited);
    if (selectedShelf) list = list.filter((n) => n.category.toLowerCase() === selectedShelf.toLowerCase());
    const q = filter.trim().toLowerCase();
    if (q) list = list.filter((n) => n.title.toLowerCase().includes(q) || n.category.toLowerCase().includes(q) || n.content.some((c) => c.text.toLowerCase().includes(q)));
    return list;
  }, [notes, selectedShelf, filter]);

  const createNote = () => openNoteById(create(selectedShelf ?? "Uncategorized", false).id);

  // The top strip: hold and drag to move the dock, click to put it away.
  const onStripDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || Date.now() < visibilityLockRef.current) return;
    void tauriApi.ensureDockTopmost();
    const startX = e.screenX;
    const startY = e.screenY;
    const grabX = e.clientX;
    const grabY = e.clientY;
    let dragging = false;
    const onMove = (m: PointerEvent) => {
      if (dragging || Math.hypot(m.screenX - startX, m.screenY - startY) <= 4) return;
      dragging = true;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void tauriApi.dragDockWindow(grabX, grabY).then(() => {
        void tauriApi.saveTrayPosition();
        void tauriApi.ensureDockTopmost();
      });
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!dragging && Math.hypot(u.screenX - startX, u.screenY - startY) <= 4) toggleMinimize();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // While switching or collapsed, the backend draws the pill and this window shows nothing.
  if (mode !== "panel") return <div className="h-screen w-screen bg-transparent" />;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const shelfItems: MenuItem[] = activeNote
    ? shelves.map((shelf) => ({ key: shelf, glyph: shelfMark(shelf), label: cleanText(shelf), hint: shelf === activeNote.category ? "•" : undefined, run: () => editActive({ category: shelf }) }))
    : [];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background p-[9px]">
      <motion.div
        data-slot="dock-panel"
        initial={{ x: quadrant.grow_x === "right" ? -16 : quadrant.grow_x === "left" ? 16 : 0, y: quadrant.grow_y === "down" ? -16 : 16, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: shown ? 1 : 0 }}
        transition={shown ? { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] } : { duration: 0.12, ease: "easeOut" }}
        onAnimationComplete={() => {
          if (!shown && !shownRef.current && closingRef.current) hideNow();
        }}
        onPaste={editor.onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={editor.onDrop}
        onKeyDownCapture={editor.onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void tauriApi.showTrayContextMenu();
        }}
        className="flex h-full w-full"
        style={{ pointerEvents: shown ? "auto" : "none" }}
      >
        <Frame className="tm-layer flex h-full w-full flex-col pb-2 pt-3" surface="var(--background)">
          <div onPointerDown={onStripDown} title="Click to put away, or drag to move" className="flex h-10 shrink-0 cursor-grab items-center gap-[1ch] px-[1.5ch]">
            {activeNote ? (
              <button type="button" onPointerDown={stop} onClick={back} className="-ml-[1ch] flex h-8 items-center gap-[0.5ch] px-[1ch] text-graph-muted hover:bg-hover hover:text-foreground">
                ← back
              </button>
            ) : (
              <span className="pointer-events-none truncate font-semibold tracking-[0.14em]">DOIT</span>
            )}
            <span className="flex-1" />
            <span className="flex items-center" onPointerDown={stop}>
              {!activeNote && (
                <Glyph label="New note" onClick={createNote}>
                  +
                </Glyph>
              )}
              <Glyph label="Open the canvas" onClick={() => void tauriApi.openCanvasMode()}>
                ↗
              </Glyph>
              <Glyph label="Shrink to the pill" onClick={toggleMinimize}>
                _
              </Glyph>
              <Glyph label="Hide to the system tray" variant="danger" onClick={closeTray}>
                ×
              </Glyph>
            </span>
          </div>

          {activeNote ? (
            <div key={activeNote.id} className="flex min-h-0 flex-1 flex-col" style={{ animation: "tm-fade 140ms var(--ease) both" }}>
              <div className="flex shrink-0 items-center gap-[1ch] px-[2ch] pb-2">
                <button
                  type="button"
                  onClick={(e) => setShelfMenu(shelfMenu ? null : e.currentTarget.getBoundingClientRect())}
                  className="-ml-[1ch] flex h-8 min-w-0 items-center gap-[1ch] px-[1ch] text-graph-muted hover:bg-hover hover:text-foreground"
                >
                  <span className="text-graph-accent">{shelfMark(activeNote.category)}</span>
                  <span className="max-w-[16ch] truncate">{cleanText(activeNote.category)}</span>
                  <span className="text-graph-frame">▾</span>
                </button>
                <span className="flex-1" />
                <Glyph label="Delete note" variant="danger" size="sm" onClick={() => setDeletingNote(activeNote)}>
                  ⌫
                </Glyph>
              </div>
              <div className="tm-rule-b shrink-0 px-[2ch] pb-2">
                <Toolbar editor={editor} note={activeNote} onMode={(raw) => editActive({ format: raw ? "txt" : "md" })} onFont={(font) => editActive({ font_family: font })} zoom={zoom} compact />
              </div>
              <div className="tray-note-scroll min-h-0 flex-1 overflow-auto px-[2.5ch] pb-6 pt-5">
                <div style={zoom.value !== 100 ? { zoom: `${zoom.value}%` } : undefined} className="w-full space-y-3">
                  <input
                    ref={titleRef}
                    type="text"
                    value={activeNote.title ?? ""}
                    onChange={(e) => editActive({ title: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key !== "ArrowDown") return;
                      if (rawMode) {
                        const textarea = document.querySelector(".tray-note-scroll textarea") as HTMLTextAreaElement | null;
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
                    className="w-full text-[16px] font-semibold caret-[var(--graph-accent)]"
                    style={{ fontFamily: fontStack(activeNote.font_family) }}
                  />
                  <NoteGallery editor={editor} variant="dock" />
                  <NoteBody editor={editor} variant="dock" />
                </div>
              </div>
            </div>
          ) : (
            <DockList
              notes={filteredNotes}
              shelves={shelves}
              filter={filter}
              onFilter={setFilter}
              shelf={selectedShelf}
              onShelf={setSelectedShelf}
              shelvesOpen={shelvesOpen}
              onToggleShelves={() => setShelvesOpen((v) => !v)}
              onOpen={openNoteById}
              onNoteMenu={(event, note) => {
                event.preventDefault();
                event.stopPropagation();
                setNoteMenu({ x: event.clientX, y: event.clientY, note });
              }}
            />
          )}
        </Frame>

        <EditorOverlays editor={editor} />

        {shelfMenu && <Menu at={shelfMenu} onClose={() => setShelfMenu(null)} items={shelfItems} activeKey={activeNote?.category} width={200} />}
        {noteMenu && (
          <Menu
            at={{ x: noteMenu.x, y: noteMenu.y }}
            onClose={() => setNoteMenu(null)}
            width={200}
            items={noteMenuItems({
              settled: !!noteMenu.note.is_settled,
              onOpen: () => openNoteById(noteMenu.note.id),
              onToggleSettled: () => patch({ ...noteMenu.note, is_settled: !noteMenu.note.is_settled }, true),
              onMove: () => setMovingNote(noteMenu.note),
              onDelete: () => setDeletingNote(noteMenu.note),
            })}
          />
        )}
        {movingNote && (
          <ShelfPicker
            title="move note"
            placeholder={`move “${cleanText(movingNote.title) || "untitled"}” to…`}
            shelves={shelves}
            exclude={movingNote.category || "Uncategorized"}
            onClose={() => setMovingNote(null)}
            onPick={({ shelf, created }) => {
              const { id } = movingNote;
              setMovingNote(null);
              void (async () => {
                if (created) await createCategory(shelf);
                await moveCategory(id, shelf);
              })();
            }}
          />
        )}
        {deletingNote && (
          <Confirm
            title="delete note"
            body={`“${cleanText(deletingNote.title) || "Untitled"}” goes from your notes folder.`}
            confirmLabel="delete"
            onCancel={() => setDeletingNote(null)}
            onConfirm={() => {
              const wasOpen = deletingNote.id === activeNoteId;
              remove(deletingNote.id);
              setDeletingNote(null);
              if (wasOpen) back();
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
