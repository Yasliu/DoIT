import { useEffect, useRef, useState } from "react";
import { motion, Reorder } from "motion/react";
import { FolderPlus, MoreHorizontal, Settings, SquarePen } from "lucide-react";
import { Mark } from "../../components/Mark";
import { cleanText, cx } from "../../lib/text";
import { shelfIcon } from "./ModernSpotlight";

interface ModernSidebarProps {
  shelves: string[];
  counts: Record<string, number>;
  total: number;
  active: string | null;
  isSettings: boolean;
  /** Collapsed, it is an icon rail; the toggle lives in the title bar. */
  open: boolean;
  onSelect: (shelf: string | null) => void;
  onNewNote: () => void;
  onNewShelf: () => void;
  onOpenSettings: () => void;
  onShelfMenu: (event: React.MouseEvent, shelf: string) => void;
  /** The shelves (without Uncategorized, which stays last) in their new order. */
  onReorderShelves: (order: string[]) => void;
}

const isUncategorized = (shelf: string) => shelf.toLowerCase() === "uncategorized";

/** The modern sidebar, laid out like T3 Code's: create on top, the shelves, then Settings. */
export function ModernSidebar(props: ModernSidebarProps) {
  const { shelves, counts, total, active, isSettings, open } = props;
  const [, setIconsVersion] = useState(0);

  useEffect(() => {
    const bump = () => setIconsVersion((v) => v + 1);
    window.addEventListener("category-icons-changed", bump);
    return () => window.removeEventListener("category-icons-changed", bump);
  }, []);

  // Shelves the user can drag; All notes stays first and Uncategorized last.
  const movable = shelves.filter((shelf) => !isUncategorized(shelf));
  const [order, setOrder] = useState(movable);
  const dragging = useRef(false);
  const [lifted, setLifted] = useState<string | null>(null);
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

  const row = (key: string | null, label: string, count: number, sortable: boolean) => {
    const selected = !isSettings && active === key;
    const editable = key !== null && !isUncategorized(key);
    return (
      <>
        <button
          type="button"
          className="ui-row"
          data-active={selected || undefined}
          onClick={() => {
            // A drag ends with a pointer release over the row; that is not a click.
            if (justDragged.current) {
              justDragged.current = false;
              return;
            }
            props.onSelect(key);
          }}
          onKeyDown={(e) => {
            if (!sortable || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
            e.preventDefault();
            move(key!, e.key === "ArrowUp" ? -1 : 1);
          }}
          onContextMenu={(e) => {
            if (!editable) return;
            e.preventDefault();
            props.onShelfMenu(e, key!);
          }}
          title={open ? undefined : label}
          aria-description={sortable ? "Drag, or press Alt+Up or Alt+Down, to reorder" : undefined}
        >
          {selected && (
            <motion.span layoutId="ui-selected-row" className="ui-row-selected" transition={{ type: "spring", duration: 0.3, bounce: 0.1 }} />
          )}
          <span className="ui-row-icon">{shelfIcon(key)}</span>
          {open && <span className="ui-row-label">{label}</span>}
          {open && <span className="ui-row-count">{count}</span>}
        </button>
        {open && editable && (
          <button
            type="button"
            className="ui-row-more ui-icon-button size-6!"
            aria-label={`${label} options`}
            onClick={(e) => props.onShelfMenu(e, key!)}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </>
    );
  };

  return (
    <aside data-slot="sidebar" data-open={open} className="ui-sidebar">
      <div className="ui-sidebar-brand" data-tauri-drag-region>
        <Mark size={open ? 26 : 24} className="pointer-events-none shrink-0" />
        {open && <span className="pointer-events-none truncate text-[17px] font-semibold tracking-[-0.02em] text-ink-1">DoIT</span>}
      </div>

      <div className="ui-sidebar-header">
        <button type="button" className="ui-create" onClick={props.onNewNote} title="New note (Ctrl N)" aria-label="New note">
          <SquarePen size={16} />
          {open && <span>New note</span>}
        </button>
        <button type="button" className="ui-create" onClick={props.onNewShelf} title="New shelf" aria-label="New shelf">
          <FolderPlus size={16} />
          {open && <span>New shelf</span>}
        </button>
      </div>

      <nav className="ui-sidebar-list" aria-label="Shelves">
        <div className="ui-row-wrap">{row(null, "All notes", total, false)}</div>
        <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-px">
          {order.map((shelf) => (
            <Reorder.Item
              key={shelf}
              as="div"
              value={shelf}
              className="ui-row-wrap"
              data-shelf={shelf}
              onDragStart={() => {
                dragging.current = true;
                justDragged.current = true;
                setLifted(shelf);
              }}
              onDragEnd={() => {
                dragging.current = false;
                setLifted(null);
                commit(order);
                // A release outside the row produces no click to swallow.
                window.setTimeout(() => (justDragged.current = false), 0);
              }}
              data-dragging={lifted === shelf || undefined}
              whileDrag={{ scale: 1.02 }}
              transition={{ type: "spring", duration: 0.25, bounce: 0.15 }}
              data-sortable
            >
              {row(shelf, cleanText(shelf), counts[shelf] ?? 0, true)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </nav>

      <div className="ui-sidebar-footer">
        {/* Uncategorized sits apart from the sortable shelves, just above Settings. */}
        {shelves.filter(isUncategorized).map((shelf) => (
          <div key={shelf} className="ui-row-wrap" data-shelf={shelf}>
            {row(shelf, cleanText(shelf), counts[shelf] ?? 0, false)}
          </div>
        ))}
        <button
          type="button"
          className={cx("ui-row")}
          data-active={isSettings || undefined}
          onClick={props.onOpenSettings}
          title={open ? undefined : "Settings"}
        >
          <span className="ui-row-icon">
            <Settings size={16} />
          </span>
          {open && <span className="ui-row-label">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
