import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Folder, Trash2 } from "lucide-react";
import type { NoteItem } from "../api/tauriBridge";
import { accentFor, cleanText, cx } from "../lib/text";

interface ContextMenuProps {
  x: number;
  y: number;
  note: NoteItem;
  shelves: string[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onMoveCategory: (id: string, category: string) => void;
}

export function ContextMenu({
  x,
  y,
  note,
  shelves,
  onClose,
  onDelete,
  onMoveCategory,
}: ContextMenuProps) {
  const [shelfSubmenuOpen, setShelfSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Position clamping to prevent overflowing the monitor/window boundaries
  const menuWidth = 210;
  const menuHeight = 220;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const posX = Math.max(12, Math.min(x, vw - menuWidth - 16));
  const posY = Math.max(12, Math.min(y, vh - menuHeight - 16));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Invisible backdrop to dismiss on outside click */}
      <div
        className="fixed inset-0 z-[90] cursor-default"
        onPointerDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Bubble Pop Floating Glass Menu */}
      <div
        ref={menuRef}
        style={{
          left: posX,
          top: posY,
          animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
        className="fixed z-[95] w-[210px] rounded-[15px] bg-[#131418]/95 border border-white/15 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.88)] backdrop-blur-2xl select-none"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Note Title Header */}
        <div className="px-2.5 py-1.5">
          <div className="truncate text-[11px] font-semibold text-white/90">
            {cleanText(note.title) || "Untitled Note"}
          </div>
          <div className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
            {cleanText(note.category)}
          </div>
        </div>

        <div className="my-1 h-px bg-white/[0.08]" />

        {/* Change Category Action */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShelfSubmenuOpen((v) => !v)}
            className="flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Folder size={12.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
              <span className="truncate">Move to shelf</span>
            </div>
            <ChevronRight
              size={12}
              strokeWidth={2}
              className={cx(
                "shrink-0 text-white/40 transition-transform duration-150",
                shelfSubmenuOpen && "rotate-90",
              )}
            />
          </button>

          {/* Inline / Submenu Shelves List */}
          {shelfSubmenuOpen && (
            <div className="mt-1 space-y-0.5 rounded-[10px] bg-white/[0.04] p-1 border border-white/[0.06] max-h-[140px] overflow-y-auto scroll">
              {shelves.map((shelf) => {
                const isCurrent = (note.category || "").toLowerCase() === shelf.toLowerCase();
                const accent = accentFor(shelf, shelves);
                return (
                  <button
                    key={shelf}
                    type="button"
                    onClick={() => {
                      onMoveCategory(note.id, shelf);
                      onClose();
                    }}
                    className={cx(
                      "flex h-7 w-full items-center justify-between rounded-[6px] px-2 text-[11.5px] transition-colors duration-150 text-left",
                      isCurrent
                        ? "bg-white/[0.1] text-white font-medium"
                        : "text-ink-3 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-[5px] shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                      <span className="truncate">{cleanText(shelf)}</span>
                    </div>
                    {isCurrent && <Check size={11} strokeWidth={2.4} className="shrink-0 text-white" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="my-1 h-px bg-white/[0.08]" />

        {/* Delete Note Action */}
        <button
          type="button"
          onClick={() => {
            onDelete(note.id);
            onClose();
          }}
          className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-[12px] text-ink-3 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-400 group/del"
        >
          <Trash2 size={12.5} strokeWidth={1.8} className="shrink-0 text-ink-4 group-hover/del:text-red-400" />
          <span className="truncate">Delete note</span>
        </button>
      </div>
    </>
  );
}
