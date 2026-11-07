import { ListFilter, Search, X } from "lucide-react";
import type { NoteItem } from "../../api/tauriBridge";
import { cleanText, cx, relativeShort } from "../../lib/text";

interface LinuxDockHomeProps {
  notes: NoteItem[];
  shelves: string[];
  filter: string;
  onFilter: (value: string) => void;
  shelf: string | null;
  onShelf: (shelf: string | null) => void;
  shelvesOpen: boolean;
  onToggleShelves: () => void;
  onOpen: (id: string) => void;
}

/** The dock panel's note list on Linux: search, an optional shelf filter, and the notes. */
export function LinuxDockHome(props: LinuxDockHomeProps) {
  const { notes, shelves, filter, shelf } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-1">
      <label className="lx-dock-search">
        <Search size={15} className="shrink-0 text-ink-3" />
        <input
          autoFocus
          value={filter}
          onChange={(e) => props.onFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && notes[0]) props.onOpen(notes[0].id);
            if (e.key === "Escape") props.onFilter("");
          }}
          placeholder={shelf ? `Search ${cleanText(shelf)}` : "Search notes"}
          aria-label="Search notes"
          spellCheck={false}
        />
        {filter && (
          <button type="button" className="lx-icon-button size-6!" onClick={() => props.onFilter("")} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          className={cx("lx-icon-button size-7!", (props.shelvesOpen || shelf) && "text-ink-1! bg-[var(--hover)]")}
          onClick={props.onToggleShelves}
          aria-expanded={props.shelvesOpen}
          aria-label="Filter by shelf"
          title="Filter by shelf"
        >
          <ListFilter size={15} />
        </button>
      </label>

      {props.shelvesOpen && (
        <div className="flex flex-wrap gap-1 px-0.5" role="radiogroup" aria-label="Shelf">
          {[null, ...shelves].map((name) => {
            const on = shelf === name || (name !== null && shelf?.toLowerCase() === name.toLowerCase());
            return (
              <button
                key={name ?? "__all__"}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => props.onShelf(name)}
                className={cx("lx-chip", on && "is-on")}
              >
                {name === null ? "All" : cleanText(name)}
              </button>
            );
          })}
        </div>
      )}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:none]">
        {notes.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-ink-3">{filter ? "No matches" : "No notes yet"}</p>
        ) : (
          notes.map((note) => (
            <button key={note.id} type="button" onClick={() => props.onOpen(note.id)} className="lx-dock-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink-1">{cleanText(note.title) || "Untitled"}</span>
                <span className="block truncate text-[12px] text-ink-3">{cleanText(note.category)}</span>
              </span>
              <span className="shrink-0 self-start pt-0.5 text-[12px] tabular-nums text-ink-3">{relativeShort(note.last_edited)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
