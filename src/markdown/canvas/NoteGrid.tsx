import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NoteItem } from "../../api/tauriBridge";
import { Callout } from "@/registry/default/callout/callout";
import { cleanText } from "../../lib/text";
import { Btn } from "../ui";
import { ShelfSection } from "./ShelfSection";

interface NoteGridProps {
  notes: NoteItem[];
  shelves: string[];
  /** The shelf shown, or every shelf. */
  active: string | null;
  loading: boolean;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (shelf: string) => void;
  onOpen: (note: NoteItem, rect: DOMRect, maximize?: boolean) => void;
  onNewNote: (shelf?: string) => void;
  onToggleItem: (note: NoteItem, itemId: string) => void;
  onMoveCategory: (id: string, category: string) => void;
  /** Holding Ctrl while dropping a note on another shelf copies it there instead. */
  onCopyToShelf?: (note: NoteItem, category: string) => void;
  onShelfMenu?: (event: React.MouseEvent, shelf: string) => void;
  onReorderNotes?: (shelf: string, activeId: string, overId: string) => void;
  onContextMenu?: (event: React.MouseEvent, note: NoteItem) => void;
  onToggleSettled?: (note: NoteItem) => void;
  /** Showing the settled notes: empty shelves and the create buttons step aside. */
  settledView?: boolean;
}

interface DragState {
  note: NoteItem;
  x: number;
  y: number;
}

const byOrder = (a: NoteItem, b: NoteItem) => {
  const ax = a.grid_coordinates?.x;
  const bx = b.grid_coordinates?.x;
  if (typeof ax === "number" && typeof bx === "number") {
    if (ax !== bx) return ax - bx;
  } else if (typeof ax === "number") {
    return -1;
  } else if (typeof bx === "number") {
    return 1;
  }
  return b.last_edited - a.last_edited;
};

/**
 * The canvas: each shelf as a ruled section of cards. A press opens a card; a drag moves it to
 * another shelf (Ctrl copies) or, dropped on a card, reorders it.
 */
export function NoteGrid(props: NoteGridProps) {
  const { notes, shelves, active, loading, collapsed, settledView = false } = props;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [reorderOver, setReorderOver] = useState<string | null>(null);

  const overRef = useRef<string | null>(null);
  const reorderOverRef = useRef<string | null>(null);
  const landTimer = useRef(0);
  const beatTimer = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(landTimer.current);
      window.clearTimeout(beatTimer.current);
    },
    [],
  );

  const visible = useMemo(() => notes.filter((note) => (active ? note.category === active : true)), [notes, active]);

  const groups = useMemo(
    () =>
      shelves
        .filter((shelf) => (active ? shelf === active : true))
        .map((shelf) => ({ shelf, notes: visible.filter((note) => (note.category || "Uncategorized") === shelf).sort(byOrder) }))
        // Settled lists only shelves that hold settled notes; elsewhere an empty shelf invites a note.
        .filter((group) => !settledView || group.notes.length > 0),
    [shelves, visible, active, settledView],
  );


  const flash = useCallback((id: string) => {
    setLanded(id);
    window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(() => setLanded(null), 700);
  }, []);

  // Cards skip rendering while their props stay the same, and typing in an open note renders this
  // canvas on every key: hand them functions that never change but still run the latest ones.
  const latest = useRef({ arm: (_event: ReactPointerEvent, _note: NoteItem) => {}, onContextMenu: props.onContextMenu });
  const stableArm = useCallback((event: ReactPointerEvent, note: NoteItem) => latest.current.arm(event, note), []);
  const stableContextMenu = useCallback((event: React.MouseEvent, note: NoteItem) => latest.current.onContextMenu?.(event, note), []);

  const arm = (event: ReactPointerEvent, note: NoteItem) => {
    if (event.button !== 0) return;
    const root = event.currentTarget as HTMLElement;
    const rect = root.getBoundingClientRect();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const downAt = performance.now();
    let moved = false;
    let done = false;

    window.clearTimeout(beatTimer.current);
    setPressed(note.id);
    try {
      root.setPointerCapture(pointerId);
    } catch {
      /* capture is best-effort */
    }

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.style.cursor = "";
      try {
        root.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    };

    const readShelf = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest("[data-shelf]") as HTMLElement | null)?.dataset.shelf ?? null;
    const readNoteId = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest("[data-note-id]") as HTMLElement | null)?.dataset.noteId ?? null;

    // Drop targets outside the canvas (the index's shelf rows) style themselves off this.
    let dropTarget: HTMLElement | null = null;
    const markDropTarget = (x: number, y: number) => {
      dropTarget?.removeAttribute("data-drop-over");
      dropTarget = (document.elementFromPoint(x, y)?.closest("[data-shelf]") as HTMLElement | null) ?? null;
      dropTarget?.setAttribute("data-drop-over", "");
    };

    const onMove = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || done) return;
      if (!moved && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 6) return;
      if (!moved) {
        moved = true;
        setPressed(null);
        // A drag is not a text selection; drop any the press began.
        window.getSelection()?.removeAllRanges();
        document.body.style.cursor = "grabbing";
      }
      setDrag({ note, x: pointer.clientX, y: pointer.clientY });

      const name = readShelf(pointer.clientX, pointer.clientY);
      if (name !== overRef.current) {
        overRef.current = name;
        setOver(name);
        markDropTarget(pointer.clientX, pointer.clientY);
      }
      const overNote = readNoteId(pointer.clientX, pointer.clientY);
      const next = overNote && overNote !== note.id ? overNote : null;
      if (reorderOverRef.current !== next) {
        reorderOverRef.current = next;
        setReorderOver(next);
      }
    };

    const reset = () => {
      dropTarget?.removeAttribute("data-drop-over");
      detach();
      setDrag(null);
      setOver(null);
      setReorderOver(null);
      overRef.current = null;
      reorderOverRef.current = null;
    };

    const onUp = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || done) return;
      done = true;
      if (!moved) {
        const wait = Math.max(0, 90 - (performance.now() - downAt));
        detach();
        // The press has already shown; opening waits out the beat.
        beatTimer.current = window.setTimeout(() => {
          setPressed(null);
          props.onOpen(note, rect);
        }, wait);
        return;
      }
      const target = readShelf(pointer.clientX, pointer.clientY);
      const targetNote = readNoteId(pointer.clientX, pointer.clientY);
      reset();
      const current = note.category || "Uncategorized";
      if (target && target.toLowerCase() !== current.toLowerCase()) {
        if (collapsed[target]) props.onToggleCollapse(target);
        if (props.onCopyToShelf && pointer.ctrlKey) {
          props.onCopyToShelf(note, target);
        } else {
          props.onMoveCategory(note.id, target);
          flash(note.id);
        }
      } else if (targetNote && targetNote !== note.id && props.onReorderNotes) {
        props.onReorderNotes(current, note.id, targetNote);
        flash(note.id);
      }
    };

    const onCancel = () => {
      if (done) return;
      done = true;
      reset();
      setPressed(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
  latest.current = { arm, onContextMenu: props.onContextMenu };

  const title = settledView ? "Settled" : active ? cleanText(active) : "All notes";

  return (
    <div className="relative h-full overflow-y-auto" style={{ scrollbarGutter: "stable", willChange: "scroll-position", contain: "layout paint", overscrollBehaviorY: "contain" }}>
      <div className="mx-auto w-full max-w-[1180px] px-12 pb-40 pt-12">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <h1 className="truncate text-[24px] font-semibold leading-tight">{title}</h1>
          {!settledView && (
            <Btn variant="primary" onClick={() => props.onNewNote(active ?? undefined)} title="New note (Ctrl+N)">
              + new note
            </Btn>
          )}
        </header>

        <div className="mt-12 space-y-12">
          {loading ? (
            <div className="tm-grid">
              {[0, 1, 2, 3, 4, 5].map((cell) => (
                <div key={cell} className="graph-frame h-[130px]" style={{ animation: "tm-blink 1.6s steps(2) infinite", animationDelay: `${cell * 120}ms` }} />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <Callout title={settledView ? "nothing settled" : "no notes"} className="max-w-[640px]">
              {settledView ? "Settle a note from its menu and it waits here. Search still finds it." : "Press Ctrl+N to write the first note."}
            </Callout>
          ) : (
            groups.map((group, index) => (
              <ShelfSection
                key={group.shelf}
                shelf={group.shelf}
                notes={group.notes}
                index={index}
                readOnly={settledView}
                collapsed={!!collapsed[group.shelf]}
                dropActive={over === group.shelf && drag?.note.category !== group.shelf}
                draggingId={drag?.note.id ?? null}
                pressedId={pressed}
                landedId={landed}
                reorderTargetId={reorderOver}
                onToggleCollapse={() => props.onToggleCollapse(group.shelf)}
                onNewNote={props.onNewNote}
                onShelfMenu={props.onShelfMenu}
                onOpen={props.onOpen}
                onArm={stableArm}
                onToggleItem={props.onToggleItem}
                onContextMenu={props.onContextMenu && stableContextMenu}
                onToggleSettled={props.onToggleSettled}
              />
            ))
          )}
        </div>
      </div>

      {drag &&
        createPortal(
          <div className="pointer-events-none fixed z-[9999]" style={{ left: drag.x + 14, top: drag.y + 10 }}>
            <div className="tm-layer graph-frame max-w-[300px] px-[2ch] py-2">
              <div className="truncate font-semibold">{cleanText(drag.note.title) || "untitled"}</div>
              {over && <div className="mt-1 text-[12px] text-graph-accent">→ {cleanText(over)}</div>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
