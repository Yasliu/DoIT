import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { EMOJI_CATEGORIES, EMOJI_LIST } from "../lib/emoji";
import { cx } from "../lib/text";

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

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setActiveCategory("all");
    }
  }, [isOpen]);

  // Click outside and ESC handling
  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
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
    document.addEventListener("keydown", handleDown);
    return () => {
      document.removeEventListener("pointerdown", handleDown, true);
      document.removeEventListener("keydown", handleDown);
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

  if (!isOpen) return null;

  // Calculate position near the anchor button if available
  let style: React.CSSProperties = {
    position: "fixed",
    zIndex: 99999,
  };

  if (anchorRect) {
    const left = Math.max(12, Math.min(anchorRect.left - 100, window.innerWidth - 300));
    const fitsBelow = anchorRect.bottom + 340 <= window.innerHeight;
    const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(12, anchorRect.top - 346);
    style = { ...style, left, top };
  } else {
    style = { ...style, right: 30, top: 90 };
  }

  return createPortal(
    <div
      ref={modalRef}
      style={style}
      className="w-[280px] rounded-[18px] border border-white/15 bg-[#121317]/95 p-3 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl select-none flex flex-col gap-2.5 animate-in fade-in-0 zoom-in-95 duration-150"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Bar */}
      <div className="relative flex items-center h-8 rounded-xl bg-white/[0.04] px-2.5 border border-white/10 focus-within:border-white/25 transition-all">
        <Search size={13} className="text-white/40 mr-2 shrink-0" />
        <input
          type="text"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emojis..."
          className="flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none min-w-0"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-white/40 hover:text-white p-0.5 shrink-0 cursor-pointer"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveCategory("all")}
          className={cx(
            "h-6 rounded-lg px-2 text-[10.5px] font-mono uppercase tracking-wider transition-all shrink-0 cursor-pointer",
            activeCategory === "all"
              ? "bg-white/20 text-white font-medium border border-white/20"
              : "text-white/50 hover:bg-white/[0.08] hover:text-white border border-transparent"
          )}
        >
          All
        </button>
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={cx(
              "h-6 rounded-lg px-2 text-[10.5px] font-mono uppercase tracking-wider transition-all shrink-0 cursor-pointer",
              activeCategory === cat.id
                ? "bg-white/20 text-white font-medium border border-white/20"
                : "text-white/50 hover:bg-white/[0.08] hover:text-white border border-transparent"
            )}
          >
            {cat.name.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className="max-h-[200px] overflow-y-auto pr-1 grid grid-cols-7 gap-1 scrollbar-thin scrollbar-thumb-white/15">
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
              className="size-8 grid place-items-center rounded-lg text-[17px] hover:bg-white/[0.12] hover:scale-120 transition-all cursor-pointer"
            >
              {e.emoji}
            </button>
          ))
        ) : (
          <div className="col-span-7 py-6 text-center text-[11px] text-white/40">
            No emojis found for "{search}"
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
