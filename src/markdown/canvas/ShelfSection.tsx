import type { PointerEvent as ReactPointerEvent } from "react";
import React from "react";
import type { NoteItem } from "../../api/tauriBridge";
import { shelfMark, useShelfMarks } from "../../lib/shelfMarks";
import { cleanText } from "../../lib/text";
import { cn } from "@/lib/utils";
import { Btn, Glyph } from "../ui";
import { NoteCard } from "./NoteCard";

interface ShelfSectionProps {
  shelf: string;
  notes: NoteItem[];
  collapsed: boolean;
  dropActive: boolean;
  draggingId: string | null;
  pressedId: string | null;
  landedId: string | null;
  reorderTargetId?: string | null;
  index: number;
  /** In the settled view, sections only list; they do not offer new notes. */
  readOnly?: boolean;
  onToggleCollapse: () => void;
  onNewNote: (shelf: string) => void;
  onShelfMenu?: (event: React.MouseEvent, shelf: string) => void;
  onOpen: (note: NoteItem, rect: DOMRect, maximize?: boolean) => void;
  onArm: (event: ReactPointerEvent, note: NoteItem) => void;
  onToggleItem: (note: NoteItem, itemId: string) => void;
  onContextMenu?: (event: React.MouseEvent, note: NoteItem) => void;
  onToggleSettled?: (note: NoteItem) => void;
}

/** One shelf on the canvas: a ruled heading, then its cards. Also a drop target for dragged notes. */
function ShelfSectionComponent(props: ShelfSectionProps) {
  const { shelf, notes, collapsed, dropActive, index } = props;
  useShelfMarks();
  const editable = shelf.toLowerCase() !== "uncategorized";

  return (
    <section
      data-shelf={shelf}
      data-drop={dropActive || undefined}
      className="tm-shelf group/section -mx-5 px-5 pb-4 transition-colors duration-200"
      style={{ animation: "tm-in 320ms var(--ease) both", animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex h-10 items-center gap-[1.5ch]">
        <button
          type="button"
          onClick={props.onToggleCollapse}
          onContextMenu={(e) => {
            if (!editable || !props.onShelfMenu) return;
            e.preventDefault();
            props.onShelfMenu(e, shelf);
          }}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-[1ch] whitespace-nowrap hover:text-graph-accent"
        >
          <span className="w-[2ch] text-center text-graph-muted">{collapsed ? "▸" : "▾"}</span>
          <span className="text-graph-accent">{shelfMark(shelf)}</span>
          <h2 className="truncate font-semibold">{cleanText(shelf)}</h2>
        </button>
        <span aria-hidden="true" className="graph-rule min-w-[4ch] flex-1" />
        {!props.readOnly && (
          <span className={cn("flex items-center gap-[1ch] transition-opacity duration-150", !dropActive && "opacity-0 group-hover/section:opacity-100 focus-within:opacity-100")}>
            <Btn onClick={() => props.onNewNote(shelf)} aria-label={`New note in ${shelf}`}>
              + note
            </Btn>
            {editable && props.onShelfMenu && (
              <Glyph label={`${cleanText(shelf)} options`} size="sm" onClick={(e) => props.onShelfMenu?.(e, shelf)}>
                ⋯
              </Glyph>
            )}
          </span>
        )}
      </div>

      <div className="grid transition-[grid-template-rows] duration-300 ease-[var(--ease)]" style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}>
        <div className="@container min-h-0 overflow-hidden">
          <div className="tm-grid px-[1px] pb-2 pt-6">
            {notes.length === 0 ? (
              <button
                type="button"
                onClick={() => props.onNewNote(shelf)}
                className="graph-frame col-span-full flex h-[96px] items-center px-5 text-left text-graph-muted hover:text-foreground"
              >
                {dropActive ? "Drop to move the note here" : "+ new note"}
              </button>
            ) : (
              notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  pressed={props.pressedId === note.id}
                  dragging={props.draggingId === note.id}
                  landed={props.landedId === note.id}
                  reorderTarget={props.reorderTargetId === note.id}
                  onOpen={props.onOpen}
                  onArm={props.onArm}
                  onToggleItem={props.onToggleItem}
                  onContextMenu={props.onContextMenu}
                  onToggleSettled={props.onToggleSettled}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export const ShelfSection = React.memo(ShelfSectionComponent);
