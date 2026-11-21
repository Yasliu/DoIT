import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EMOJI_CATEGORIES, EMOJI_LIST } from "../../lib/emoji";
import { cn } from "@/lib/utils";
import { Field, Frame, Glyph } from "../ui";

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  anchorRect?: DOMRect | null;
}

export function EmojiPickerModal({ isOpen, onClose, onSelect, anchorRect }: EmojiPickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSearch("");
      setActiveCategory("all");
    }
  }, [isOpen]);

  // Click outside and ESC handling
  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        // Only the picker closes, not the note behind it.
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e instanceof MouseEvent) {
        if (modalRef.current && modalRef.current.contains(e.target as Node)) {
          return;
        }
        if (anchorRect) {
          const { clientX: x, clientY: y } = e;
          if (x >= anchorRect.left && x <= anchorRect.right && y >= anchorRect.top && y <= anchorRect.bottom) {
            return;
          }
        }
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown, true);
    window.addEventListener("keydown", handleDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDown, true);
      window.removeEventListener("keydown", handleDown, true);
    };
  }, [isOpen, onClose, anchorRect]);

  const filteredEmojis = useMemo(() => {
    let list = EMOJI_LIST;
    if (activeCategory !== "all") {
      list = list.filter((e) => e.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [search, activeCategory]);

  // Calculate position near the anchor button if available
  let style: React.CSSProperties = {
    position: "fixed",
    zIndex: 99999,
    display: isOpen ? "flex" : "none",
  };

  if (anchorRect) {
    const left = Math.max(12, Math.min(anchorRect.left - 120, window.innerWidth - 332));
    const fitsBelow = anchorRect.bottom + 360 <= window.innerHeight;
    const top = fitsBelow ? anchorRect.bottom + 10 : Math.max(12, anchorRect.top - 366);
    style = { ...style, left, top };
  } else {
    style = { ...style, right: 30, top: 90 };
  }

  return createPortal(
    <div
      ref={modalRef}
      data-slot="emoji-picker"
      aria-hidden={!isOpen}
      style={style}
      className="w-[320px] select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Frame title="emoji" className="tm-layer flex w-full flex-col gap-2 px-[1.5ch] pb-3 pt-4" surface="var(--background)">
        <Field
          ref={inputRef}
          prompt=":"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="name"
          end={
            search ? (
              <Glyph label="Clear" size="sm" onClick={() => setSearch("")}>
                ×
              </Glyph>
            ) : undefined
          }
        />
        <div className="flex items-center gap-[0.5ch] overflow-x-auto pb-1 [scrollbar-width:none]">
          {[{ id: "all", name: "all" }, ...EMOJI_CATEGORIES].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "h-6 shrink-0 px-[1ch] text-[11px] lowercase transition-colors",
                activeCategory === cat.id ? "bg-invert text-background" : "text-graph-muted hover:text-foreground",
              )}
            >
              {cat.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <div className="grid max-h-[210px] grid-cols-8 gap-px overflow-y-auto">
          {filteredEmojis.length > 0 ? (
            filteredEmojis.map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => {
                  onSelect(e.emoji);
                  onClose();
                }}
                title={`:${e.name}:`}
                className="grid size-9 place-items-center text-[17px] transition-colors hover:bg-invert"
              >
                {e.emoji}
              </button>
            ))
          ) : (
            <div className="col-span-8 py-6 text-center text-graph-muted">No emoji called “{search}”.</div>
          )}
        </div>
      </Frame>
    </div>,
    document.body,
  );
}
