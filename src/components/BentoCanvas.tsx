import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { NoteItem } from "../api/tauriBridge";
import { cx, longDate, noteMatches, relativeShort } from "../lib/text";
import { CategoryShelf } from "./CategoryShelf";

interface BentoCanvasProps {
  notes: NoteItem[];
  shelves: string[];
  active: string | null;
  query: string;
  loading: boolean;
  locked: boolean;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (shelf: string) => void;
  onOpen: (note: NoteItem, rect: DOMRect) => void;
  onNewNote: (shelf?: string) => void;
  onToggleItem: (note: NoteItem, itemId: string) => void;
  onMoveCategory: (id: string, category: string) => void;
  onDeleteCategory?: (shelf: string) => void;
  onReorderNotes?: (shelf: string, activeId: string, overId: string) => void;
  onContextMenu?: (event: React.MouseEvent, note: NoteItem) => void;
}

interface DragState {
  note: NoteItem;
  x: number;
  y: number;
  dx: number;
  dy: number;
  w: number;
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

export function BentoCanvas({
  notes,
  shelves,
  active,
  query,
  loading,
  locked,
  collapsed,
  onToggleCollapse,
  onOpen,
  onNewNote,
  onToggleItem,
  onMoveCategory,
  onDeleteCategory,
  onReorderNotes,
  onContextMenu,
}: BentoCanvasProps) {
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

  const visible = useMemo(
    () => notes.filter((note) => (active ? note.category === active : true) && noteMatches(note, query)),
    [notes, active, query],
  );

  const groups = useMemo(
    () =>
      shelves
        .filter((shelf) => (active ? shelf === active : true))
        .map((shelf) => ({
          shelf,
          notes: visible.filter((note) => (note.category || "Uncategorized") === shelf).sort(byOrder),
        }))
        .filter((group) => (query.trim() || active ? group.notes.length > 0 : true)),
    [shelves, visible, active, query],
  );

  const totalVisible = visible.length;
  const newest = notes.reduce((max, note) => Math.max(max, note.last_edited), 0);

  const flash = useCallback((id: string) => {
    setLanded(id);
    window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(() => setLanded(null), 700);
  }, []);

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

    const readShelf = (clientX: number, clientY: number) => {
      const under = document.elementFromPoint(clientX, clientY);
      const shelfEl = under?.closest("[data-shelf]") as HTMLElement | null;
      return shelfEl?.dataset.shelf ?? null;
    };

    const readNoteId = (clientX: number, clientY: number) => {
      const under = document.elementFromPoint(clientX, clientY);
      const noteEl = under?.closest("[data-note-id]") as HTMLElement | null;
      return noteEl?.dataset.noteId ?? null;
    };

    const onMove = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || done) return;

      if (!moved && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 6) return;

      if (!moved) {
        moved = true;
        setPressed(null);
        setDrag({
          note,
          x: pointer.clientX,
          y: pointer.clientY,
          dx: startX - rect.left,
          dy: startY - rect.top,
          w: rect.width,
        });
        document.body.style.cursor = "grabbing";
      } else {
        setDrag((prev) => (prev ? { ...prev, x: pointer.clientX, y: pointer.clientY } : prev));
      }

      const name = readShelf(pointer.clientX, pointer.clientY);
      if (name !== overRef.current) {
        overRef.current = name;
        setOver(name);
      }

      const currentOverNote = readNoteId(pointer.clientX, pointer.clientY);
      if (currentOverNote && currentOverNote !== note.id) {
        if (reorderOverRef.current !== currentOverNote) {
          reorderOverRef.current = currentOverNote;
          setReorderOver(currentOverNote);
        }
      } else if (reorderOverRef.current !== null) {
        reorderOverRef.current = null;
        setReorderOver(null);
      }
    };

    const onUp = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || done) return;
      done = true;

      if (!moved) {
        const wait = Math.max(0, 90 - (performance.now() - downAt));
        detach();
        // intent buffer: the press has already compressed; expansion waits out the beat
        beatTimer.current = window.setTimeout(() => {
          setPressed(null);
          onOpen(note, rect);
        }, wait);
        return;
      }

      const target = readShelf(pointer.clientX, pointer.clientY);
      const targetNote = readNoteId(pointer.clientX, pointer.clientY);
      detach();
      setDrag(null);
      setOver(null);
      setReorderOver(null);
      overRef.current = null;
      reorderOverRef.current = null;

      const currentCategory = note.category || "Uncategorized";

      if (target && target.toLowerCase() !== currentCategory.toLowerCase()) {
        if (collapsed[target]) onToggleCollapse(target);
        onMoveCategory(note.id, target);
        flash(note.id);
      } else if (targetNote && targetNote !== note.id) {
        if (onReorderNotes) {
          onReorderNotes(currentCategory, note.id, targetNote);
          flash(note.id);
        }
      }
    };

    const onCancel = () => {
      if (done) return;
      done = true;
      detach();
      setDrag(null);
      setOver(null);
      setPressed(null);
      setReorderOver(null);
      overRef.current = null;
      reorderOverRef.current = null;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const title = active ?? "All notes";
  const today = longDate(Date.now());

  return (
    <div
      className={cx(
        "scroll relative h-full overflow-y-scroll",
        locked && "select-none pointer-events-none",
      )}
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="mx-auto w-full max-w-[1000px] px-6 pb-44 pt-5">
        <header className="flex items-start justify-between gap-8">
          <div className="min-w-0">
            <div className="micro">{today}</div>
            <h1 className="mt-2.5 text-[32px] font-medium leading-[1.04] tracking-[-0.04em] text-ink-1">
              {title}
            </h1>
            <p className="mt-2.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
              {loading
                ? "Opening the workspace…"
                : notes.length === 0
                  ? "An empty canvas. Write the first note and it will find a shelf."
                  : query.trim()
                    ? `${totalVisible} note${totalVisible === 1 ? "" : "s"} matching “${query.trim()}”.`
                    : active
                      ? `${totalVisible} note${totalVisible === 1 ? "" : "s"} on this shelf · last edit ${relativeShort(newest)}.`
                      : `${shelves.length} shelves · ${notes.length} notes · last edit ${relativeShort(newest)}.`}
            </p>
          </div>

          <button type="button" onClick={() => onNewNote()} className="btn mt-1 shrink-0">
            <Plus size={14} strokeWidth={1.9} />
            <span>New note</span>
            <span className="kbd ml-1">⌘N</span>
          </button>
        </header>

        <div className="mt-8 space-y-5">
          {loading ? (
            <div className="space-y-7">
              {[0, 1].map((row) => (
                <div key={row}>
                  <div
                    className="mb-4 h-[10px] w-24 rounded-full bg-white/[0.06]"
                    style={{ animation: "breathe 1.8s ease-in-out infinite" }}
                  />
                  <div className="grid grid-cols-12 gap-3">
                    {[0, 1, 2, 3].map((cell) => (
                      <div
                        key={cell}
                        className={cx(
                          "rounded-[20px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]",
                          cell === 0 ? "col-span-12 lg:col-span-7" : "col-span-12 lg:col-span-5",
                          cell > 1 && "lg:col-span-4",
                        )}
                        style={{
                          height: 150,
                          animation: "breathe 2.2s ease-in-out infinite",
                          animationDelay: `${cell * 120}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-start justify-center rounded-[22px] px-8 py-20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
              <p className="text-[19px] tracking-[-0.02em] text-ink-2">
                {query.trim() ? "Nothing matches that." : "An empty canvas."}
              </p>
              <p className="mt-2 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-4">
                {query.trim()
                  ? "Try a shorter phrase, or clear the search to see the whole workspace."
                  : "Write the first note and it will settle into a shelf of its own."}
              </p>
              <button type="button" onClick={() => onNewNote()} className="btn mt-5">
                <Plus size={14} strokeWidth={1.9} />
                Start writing
              </button>
            </div>
          ) : (
            groups.map((group, index) => (
              <CategoryShelf
                key={group.shelf}
                shelf={group.shelf}
                notes={group.notes}
                shelves={shelves}
                index={index}
                collapsed={!!collapsed[group.shelf]}
                dropActive={over === group.shelf && drag?.note.category !== group.shelf}
                draggingId={drag?.note.id ?? null}
                pressedId={pressed}
                landedId={landed}
                reorderTargetId={reorderOver}
                onToggleCollapse={() => onToggleCollapse(group.shelf)}
                onNewNote={onNewNote}
                onDeleteCategory={onDeleteCategory}
                onOpen={onOpen}
                onArm={arm}
                onToggleItem={onToggleItem}
                onContextMenu={onContextMenu}
              />
            ))
          )}
        </div>
      </div>

      {drag && (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }}
        >
          <div
            className="glass rounded-[18px] px-4 py-3.5"
            style={{ transform: "rotate(1.4deg) scale(1.015)", opacity: 0.94 }}
          >
            <div className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink-1">
              {drag.note.title || "Untitled"}
            </div>
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
              {drag.note.category} → {over ?? "…"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
