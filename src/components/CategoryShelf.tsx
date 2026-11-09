import { ChevronDown, Palette, Plus, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import React, { useEffect, useState } from "react";
import type { NoteItem } from "../api/tauriBridge";
import { accentFor, cleanText, cx } from "../lib/text";
import { CATEGORY_ICONS, getCategoryIconName } from "../lib/categoryIcons";
import { pick, text } from "../platform";
import { NoteTile } from "./NoteTile";

interface CategoryShelfProps {
  shelf: string;
  notes: NoteItem[];
  shelves: string[];
  collapsed: boolean;
  dropActive: boolean;
  draggingId: string | null;
  pressedId: string | null;
  landedId: string | null;
  reorderTargetId?: string | null;
  index: number;
  onToggleCollapse: () => void;
  onNewNote: (shelf: string) => void;
  onDeleteCategory?: (shelf: string) => void;
  onCategoryContextMenu?: (event: React.MouseEvent, shelf: string) => void;
  onOpenIconPicker?: (shelf: string) => void;
  onOpen: (note: NoteItem, rect: DOMRect, maximize?: boolean) => void;
  onArm: (event: ReactPointerEvent, note: NoteItem) => void;
  onToggleItem: (note: NoteItem, itemId: string) => void;
  onContextMenu?: (event: React.MouseEvent, note: NoteItem) => void;
  onToggleSettled?: (note: NoteItem) => void;
}

function CategoryShelfComponent({
  shelf,
  notes,
  shelves,
  collapsed,
  dropActive,
  draggingId,
  pressedId,
  landedId,
  reorderTargetId,
  index,
  onToggleCollapse,
  onNewNote,
  onDeleteCategory,
  onCategoryContextMenu,
  onOpenIconPicker,
  onOpen,
  onArm,
  onToggleItem,
  onContextMenu,
  onToggleSettled,
}: CategoryShelfProps) {
  const [, setIconsVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setIconsVersion((v) => v + 1);
    window.addEventListener("category-icons-changed", handleUpdate);
    return () => window.removeEventListener("category-icons-changed", handleUpdate);
  }, []);

  const iconKey = getCategoryIconName(shelf);
  const CustomIcon = iconKey && iconKey !== "dot" ? CATEGORY_ICONS[iconKey] : null;
  const accent = accentFor(shelf, shelves);

  return (
    <section
      data-shelf={shelf}
      className={cx(
        "group/section relative -mx-3 rounded-[22px] px-3 pb-3 pt-1 transition-colors duration-300",
        dropActive && "bg-white/[0.035]",
      )}
      style={{
        animation: "rise 560ms cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${Math.min(index, 8) * 55}ms`,
      }}
    >
      <div data-slot="shelf-head" className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          onContextMenu={(e) => {
            if (!onCategoryContextMenu || shelf.toLowerCase() === "uncategorized") return;
            e.preventDefault();
            onCategoryContextMenu(e, shelf);
          }}
          className="group/head flex min-w-0 items-center gap-2.5"
          aria-expanded={!collapsed}
        >
          {CustomIcon ? (
            <span
              onClick={(e) => {
                if (onOpenIconPicker && shelf.toLowerCase() !== "uncategorized") {
                  e.stopPropagation();
                  onOpenIconPicker(shelf);
                }
              }}
              className="size-5 rounded-[6px] bg-white/[0.06] flex items-center justify-center shrink-0 hover:scale-115 transition-transform"
              title={shelf.toLowerCase() !== "uncategorized" ? "Click to change icon" : undefined}
            >
              <CustomIcon size={13} strokeWidth={2} style={{ color: accent }} />
            </span>
          ) : (
            <span
              onClick={(e) => {
                if (onOpenIconPicker && shelf.toLowerCase() !== "uncategorized") {
                  e.stopPropagation();
                  onOpenIconPicker(shelf);
                }
              }}
              className="size-2 rounded-full shrink-0 hover:scale-150 transition-transform"
              style={{ backgroundColor: accent }}
              title={shelf.toLowerCase() !== "uncategorized" ? "Click to choose icon" : undefined}
            />
          )}

          <h2 className="truncate text-[14px] font-medium tracking-[-0.008em] text-ink-1 transition-colors group-hover/head:text-white">
            {cleanText(shelf)}
          </h2>
          <span data-slot="shelf-count" className="font-mono text-[9.5px] tabular-nums tracking-[0.08em] text-ink-4">
            {pick(String(notes.length).padStart(2, "0"), String(notes.length))}
          </span>
        </button>

        <span className="shelf-rule" />

        <button
          type="button"
          onClick={() => onNewNote(shelf)}
          className="ghost !h-7 !px-1.5 opacity-0 transition-opacity duration-200 group-hover/section:opacity-100 focus-visible:opacity-100"
          style={{ opacity: dropActive ? 1 : undefined }}
          aria-label={`New note in ${shelf}`}
        >
          <Plus size={13} strokeWidth={1.8} />
          <span className="text-[11px]">Note</span>
        </button>

        {shelf.toLowerCase() !== "uncategorized" && onOpenIconPicker && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenIconPicker(shelf);
            }}
            className="ghost !size-7 !p-0 !inline-flex !items-center !justify-center opacity-0 transition-opacity duration-200 group-hover/section:opacity-100 hover:text-white focus-visible:opacity-100"
            title={`Change icon for ${shelf}`}
            aria-label={`Change icon for ${shelf}`}
          >
            <Palette size={12.5} strokeWidth={1.8} />
          </button>
        )}

        {shelf.toLowerCase() !== "uncategorized" && onDeleteCategory && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCategory(shelf);
            }}
            className={`ghost !size-7 !p-0 !inline-flex !items-center !justify-center opacity-0 transition-opacity duration-200 group-hover/section:opacity-100 focus-visible:opacity-100 ${pick("hover:text-red-400", "hover:!text-red-400 hover:!bg-red-500/10")}`}
            title={`Delete ${shelf} category`}
            aria-label={`Delete ${shelf} category`}
          >
            <Trash2 size={12} strokeWidth={1.7} />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand shelf" : "Collapse shelf"}
          className="grid size-6 shrink-0 place-items-center rounded-md text-ink-4 transition-colors hover:bg-white/[0.06] hover:text-ink-1"
        >
          <ChevronDown
            size={13}
            strokeWidth={1.7}
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </button>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "1fr",
          transition: "grid-template-rows 460ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div className="min-h-0 overflow-hidden @container">
          <div data-slot="shelf-grid" className="grid grid-cols-12 grid-flow-row-dense gap-3.5 auto-rows-[minmax(130px,auto)] pb-1 pt-3.5">
            {notes.length === 0 ? (
              <button
                type="button"
                onClick={() => onNewNote(shelf)}
                data-slot="empty-shelf"
                className={cx(
                  "col-span-12 rounded-[18px] px-5 py-7 text-left transition-colors duration-200",
                  "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]",
                  dropActive && "bg-white/[0.04]",
                )}
              >
                <p className="text-[12.5px] text-ink-3">
                  {dropActive ? "Release to move this note here." : text.emptyShelf}
                </p>
                <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-4">
                  {text.emptyShelfAction}
                </p>
              </button>
            ) : (
              notes.map((note) => (
                <NoteTile
                  key={note.id}
                  note={note}
                  shelves={shelves}
                  pressed={pressedId === note.id}
                  dragging={draggingId === note.id}
                  landed={landedId === note.id}
                  reorderTarget={reorderTargetId === note.id}
                  onOpen={onOpen}
                  onArm={onArm}
                  onToggleItem={onToggleItem}
                  onContextMenu={onContextMenu}
                  onToggleSettled={onToggleSettled}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export const CategoryShelf = React.memo(CategoryShelfComponent);
