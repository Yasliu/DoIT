import { useEffect, useRef, useState, type ReactNode } from "react";
import { Reorder } from "motion/react";
import { cn } from "@/lib/utils";
import { shelfMark, useShelfMarks } from "../../lib/shelfMarks";
import { cleanText } from "../../lib/text";
import { Glyph } from "../ui";

export type CanvasView = { kind: "shelf"; shelf: string | null } | { kind: "settled" } | { kind: "overview" } | { kind: "settings" };

interface ShelfIndexProps {
  shelves: string[];
  counts: Record<string, number>;
  total: number;
  settledCount: number;
  view: CanvasView;
  /** Collapsed, it is a rail of marks. */
  open: boolean;
  onView: (view: CanvasView) => void;
  onNewShelf: () => void;
  onShelfMenu: (event: React.MouseEvent, shelf: string) => void;
  /** The shelves (without Uncategorized, which stays last) in their new order. */
  onReorderShelves: (order: string[]) => void;
}

const isUncategorized = (shelf: string) => shelf.toLowerCase() === "uncategorized";

/** The left index: every shelf with its count, then the views that are not shelves. */
export function ShelfIndex(props: ShelfIndexProps) {
  const { shelves, counts, total, settledCount, view, open } = props;
  useShelfMarks();

  const movable = shelves.filter((shelf) => !isUncategorized(shelf));
  const [order, setOrder] = useState(movable);
  const dragging = useRef(false);
  const justDragged = useRef(false);
  useEffect(() => {
    if (!dragging.current) setOrder(movable);
  }, [movable.join("\u0000")]);

  const commit = (next: string[]) => {
    if (next.join("\u0000") !== movable.join("\u0000")) props.onReorderShelves(next);
  };
  const move = (shelf: string, by: number) => {
    const from = order.indexOf(shelf);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    commit(next);
  };

  const isActive = (target: CanvasView) => {
    if (target.kind !== view.kind) return false;
    return target.kind !== "shelf" || view.kind !== "shelf" || target.shelf === view.shelf;
  };

  const row = (target: CanvasView, mark: ReactNode, label: string, count: number | null, shelf?: string, sortable = false) => {
    const active = isActive(target);
    const editable = shelf !== undefined && !isUncategorized(shelf);
    return (
      <button
        type="button"
        data-active={active || undefined}
        onClick={() => {
          // A drag ends with a pointer release over the row; that is not a click.
          if (justDragged.current) {
            justDragged.current = false;
            return;
          }
          props.onView(target);
        }}
        onKeyDown={(e) => {
          if (!sortable || !shelf || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          move(shelf, e.key === "ArrowUp" ? -1 : 1);
        }}
        onContextMenu={(e) => {
          if (!editable) return;
          e.preventDefault();
          props.onShelfMenu(e, shelf!);
        }}
        title={open ? undefined : label}
        aria-current={active || undefined}
        aria-description={sortable ? "Drag, or press Alt+Up or Alt+Down, to reorder" : undefined}
        className={cn(
          "group/row flex h-9 w-full items-center gap-[1.5ch] px-[2ch] text-left whitespace-nowrap transition-colors",
          active ? "bg-invert text-background" : "hover:bg-hover",
          !open && "justify-center px-0",
        )}
      >
        {(mark || !open) && <span className={cn("w-[2ch] shrink-0 text-center", active ? "" : "text-graph-accent")}>{mark || label.slice(0, 1)}</span>}
        {open && (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== null && <span className={cn("shrink-0 tabular-nums", active ? "" : "text-graph-muted")}>{count}</span>}
          </>
        )}
      </button>
    );
  };

  return (
    <aside
      aria-label="Shelves"
      className={cn("tm-rule-r flex h-full shrink-0 flex-col overflow-hidden pb-4 pt-2 transition-[width] duration-200", open ? "w-[240px]" : "w-[52px]")}
    >
      <button
        type="button"
        onClick={props.onNewShelf}
        title={open ? undefined : "New shelf"}
        aria-label="New shelf"
        className={cn(
          "tm-rule-b mb-3 flex h-10 w-full shrink-0 items-center gap-[1.5ch] px-[2ch] text-left text-graph-muted transition-colors hover:bg-hover hover:text-foreground",
          !open && "justify-center px-0",
        )}
      >
        <span className="w-[2ch] shrink-0 text-center">+</span>
        {open && <span>new shelf</span>}
      </button>
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {row({ kind: "shelf", shelf: null }, open ? "" : "*", "all notes", total)}
        <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder}>
          {order.map((shelf) => (
            <Reorder.Item
              key={shelf}
              as="div"
              value={shelf}
              data-shelf={shelf}
              className="group/shelf relative data-[drop-over]:outline data-[drop-over]:outline-1 data-[drop-over]:outline-dashed data-[drop-over]:outline-[var(--graph-accent)] data-[drop-over]:-outline-offset-1"
              onDragStart={() => {
                dragging.current = true;
                justDragged.current = true;
              }}
              onDragEnd={() => {
                dragging.current = false;
                commit(order);
                window.setTimeout(() => (justDragged.current = false), 0);
              }}
              whileDrag={{ backgroundColor: "var(--hover)" }}
              transition={{ duration: 0.18, ease: [0.215, 0.61, 0.355, 1] }}
            >
              {row({ kind: "shelf", shelf }, shelfMark(shelf), cleanText(shelf).toLowerCase(), counts[shelf] ?? 0, shelf, true)}
              {open && (
                <span className="absolute right-[0.5ch] top-1/2 hidden -translate-y-1/2 bg-background group-hover/shelf:block">
                  <Glyph label={`${cleanText(shelf)} options`} size="sm" onClick={(e) => props.onShelfMenu(e, shelf)}>
                    ⋯
                  </Glyph>
                </span>
              )}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </nav>

      <div className="tm-rule-t mt-3 pt-3">
        {shelves.filter(isUncategorized).map((shelf) => (
          <div key={shelf} data-shelf={shelf} className="data-[drop-over]:outline data-[drop-over]:outline-1 data-[drop-over]:outline-dashed data-[drop-over]:outline-[var(--graph-accent)]">
            {row({ kind: "shelf", shelf }, shelfMark(shelf), "uncategorized", counts[shelf] ?? 0, shelf)}
          </div>
        ))}
        {row({ kind: "settled" }, open ? "" : "✓", "settled", settledCount)}
        {row({ kind: "overview" }, open ? "" : "Σ", "overview", null)}
        {row({ kind: "settings" }, open ? "" : "%", "settings", null)}
      </div>

    </aside>
  );
}
