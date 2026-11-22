import type { NoteItem } from "../../api/tauriBridge";
import { shelfMark } from "../../lib/shelfMarks";
import { cleanText, relativeShort } from "../../lib/text";
import { Field, Glyph } from "../ui";

interface DockListProps {
  notes: NoteItem[];
  shelves: string[];
  filter: string;
  onFilter: (value: string) => void;
  shelf: string | null;
  onShelf: (shelf: string | null) => void;
  shelvesOpen: boolean;
  onToggleShelves: () => void;
  onOpen: (id: string) => void;
  onNoteMenu: (event: React.MouseEvent, note: NoteItem) => void;
}

/** The dock's home: a search line, an optional shelf filter, and the notes, newest first. */
export function DockList(props: DockListProps) {
  const { notes, shelves, filter, shelf } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-[1ch] px-[2ch]">
        <Field
          autoFocus
          prompt="/"
          value={filter}
          onChange={(e) => props.onFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && notes[0]) props.onOpen(notes[0].id);
            if (e.key === "Escape" && filter) {
              e.stopPropagation();
              props.onFilter("");
            }
          }}
          placeholder={shelf ? `search ${cleanText(shelf)}` : "search notes"}
          aria-label="Search notes"
          wrapClassName="flex-1"
          end={
            filter ? (
              <Glyph label="Clear search" size="sm" onClick={() => props.onFilter("")}>
                ×
              </Glyph>
            ) : undefined
          }
        />
        <Glyph label="Filter by shelf" on={props.shelvesOpen || !!shelf} onClick={props.onToggleShelves} aria-expanded={props.shelvesOpen}>
          ▾
        </Glyph>
      </div>

      {props.shelvesOpen && (
        <div className="flex flex-wrap gap-x-[1ch] px-[2ch] pt-3" role="radiogroup" aria-label="Shelf">
          {[null, ...shelves].map((name) => {
            const on = shelf === name || (name !== null && shelf?.toLowerCase() === name.toLowerCase());
            return (
              <button key={name ?? "__all__"} type="button" role="radio" aria-checked={on} onClick={() => props.onShelf(name)} className="tm-choice text-[13px]">
                <span className="tm-mark">{on ? "(•)" : "( )"}</span>
                {name === null ? "all" : `${shelfMark(name)} ${cleanText(name)}`}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="px-[2ch] py-6 text-graph-muted">{filter ? "No matches." : "No notes yet."}</p>
        ) : (
          notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => props.onOpen(note.id)}
              onContextMenu={(e) => props.onNoteMenu(e, note)}
              className="group flex h-10 w-full items-center gap-[1.5ch] px-[2ch] text-left hover:bg-invert hover:text-background"
            >
              <span className="w-[2ch] shrink-0 text-center text-graph-accent group-hover:text-background">{shelfMark(note.category)}</span>
              <span className="min-w-0 flex-1 truncate">{cleanText(note.title) || "Untitled"}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-graph-muted group-hover:text-background">
                {note.is_settled ? "✓ " : ""}
                {relativeShort(note.last_edited)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
