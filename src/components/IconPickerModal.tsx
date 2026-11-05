import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICONS,
  getCategoryIconName,
  renameCategoryIcon,
  setCategoryIcon,
} from "../lib/categoryIcons";
import { cleanText, cx } from "../lib/text";

interface IconPickerModalProps {
  shelf: string;
  accent?: string;
  onClose: () => void;
  onRename?: (oldName: string, newName: string) => Promise<string | null> | void;
  onDelete?: (shelf: string) => void;
}

export function IconPickerModal({
  shelf,
  accent = "#ffffff",
  onClose,
  onRename,
  onDelete,
}: IconPickerModalProps) {
  const [name, setName] = useState(cleanText(shelf));
  const [selected, setSelected] = useState<string | null>(() => getCategoryIconName(shelf));
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fast filtered icon list
  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORY_ICON_NAMES;
    return CATEGORY_ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [search]);

  const CurrentIconComp = selected && selected !== "dot" ? CATEGORY_ICONS[selected] : null;

  const handleSave = async () => {
    const nextName = name.trim();
    if (!nextName) {
      setError("Category name cannot be empty");
      return;
    }

    setBusy(true);
    let finalShelfName = shelf;

    // Handle rename if name was changed and callback provided
    if (nextName !== cleanText(shelf) && onRename) {
      try {
        const err = await onRename(shelf, nextName);
        if (err) {
          setError(err);
          setBusy(false);
          return;
        }
        renameCategoryIcon(shelf, nextName);
        finalShelfName = nextName;
      } catch (err: any) {
        setError(typeof err === "string" ? err : err?.message || "Failed to rename shelf");
        setBusy(false);
        return;
      }
    }

    // Commit icon selection
    setCategoryIcon(finalShelfName, selected);
    setBusy(false);
    onClose();
  };

  return (
    <>
      {/* High-Performance Lightweight Backdrop (no GPU blur filter) */}
      <div
        className="fixed inset-0 z-[120] bg-black/75 transition-opacity duration-150"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Modal Dialog */}
      <div className="pointer-events-none fixed inset-0 z-[125] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-editor-title"
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto w-full max-w-[420px] rounded-[20px] border border-white/15 bg-[#14151a] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.95)] select-none text-ink-1"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h2 id="category-editor-title" className="text-[14px] font-semibold text-white tracking-[-0.01em]">
                Edit Category
              </h2>
              <div className="text-[11px] text-ink-4 mt-0.5">
                Rename shelf and customize its icon
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid size-7.5 place-items-center rounded-lg text-ink-4 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Section 1: Shelf Name & Rename */}
          <div className="mt-3.5 space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-[0.1em] text-ink-4 block">
              Shelf Name
            </label>
            <div className="relative">
              <input
                ref={nameInputRef}
                value={name}
                maxLength={28}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
                placeholder="Category name..."
                className="w-full h-9 rounded-[10px] bg-white/[0.06] border border-white/12 px-3 text-[13px] font-medium text-white placeholder:text-ink-4 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            {error && (
              <p className="text-[11px] text-red-400 font-medium px-0.5">{error}</p>
            )}
          </div>

          {/* Live Preview Pill */}
          <div className="my-3 flex items-center justify-between px-3 py-2 rounded-[10px] bg-white/[0.035] border border-white/[0.07]">
            <span className="text-[10.5px] text-ink-4 font-mono uppercase tracking-[0.08em]">Live Preview</span>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-[7px] bg-white/[0.06] border border-white/10">
              {CurrentIconComp ? (
                <CurrentIconComp size={14} strokeWidth={2} style={{ color: accent }} className="shrink-0" />
              ) : (
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
              )}
              <span className="text-[12px] font-medium text-ink-1 truncate max-w-[170px]">
                {name.trim() || "Untitled"}
              </span>
            </div>
          </div>

          {/* Section 2: Choose Icon */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-ink-4">
                Shelf Icon ({filteredIcons.length} available)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelected("dot")}
                  className={cx(
                    "flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[10.5px] font-medium transition-colors cursor-pointer",
                    selected === "dot"
                      ? "bg-white/20 text-white font-semibold"
                      : "text-ink-4 hover:bg-white/[0.06] hover:text-ink-2",
                  )}
                  title="Use a minimalist accent dot"
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span>Dot</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[10.5px] font-medium text-ink-4 hover:bg-white/[0.06] hover:text-ink-2 transition-colors cursor-pointer"
                  title="Reset to default theme icon"
                >
                  <RotateCcw size={10} strokeWidth={2} />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Fast Icon Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons (e.g. book, study, code, star)..."
                className="w-full h-7.5 rounded-[8px] bg-white/[0.04] border border-white/[0.08] pl-7.5 pr-2.5 text-[11.5px] text-white placeholder:text-ink-4 outline-none focus:border-white/25 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-white"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* High-Speed Zero-Lag Icon Grid */}
            <div className="grid grid-cols-6 gap-1.5 max-h-[190px] overflow-y-auto scroll pr-1 p-0.5 contain-content">
              {filteredIcons.length === 0 ? (
                <div className="col-span-6 py-6 text-center text-[11px] text-ink-4">
                  No icons matching "{search}"
                </div>
              ) : (
                filteredIcons.map((iconName) => {
                  const IconComponent = CATEGORY_ICONS[iconName];
                  const isSelected = selected === iconName;

                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setSelected(iconName)}
                      title={iconName}
                      className={cx(
                        "group relative grid size-10.5 place-items-center rounded-[10px] transition-colors duration-75 cursor-pointer",
                        isSelected
                          ? "bg-white/[0.18] text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)]"
                          : "bg-white/[0.035] text-ink-3 hover:bg-white/[0.09] hover:text-white",
                      )}
                    >
                      <IconComponent
                        size={16}
                        strokeWidth={isSelected ? 2.2 : 1.8}
                        style={{ color: isSelected ? accent : undefined }}
                        className="transition-colors group-hover:!text-white pointer-events-none"
                      />
                      {isSelected && (
                        <span className="absolute -top-1 -right-1 size-3 rounded-full bg-white text-black grid place-items-center shadow-sm">
                          <Check size={8} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-white/10 gap-2">
            {onDelete && shelf.toLowerCase() !== "uncategorized" ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete category "${cleanText(shelf)}"? Notes inside will be moved to Uncategorized.`)) {
                    onDelete(shelf);
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11px] font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
                title="Delete shelf"
              >
                <Trash2 size={12} strokeWidth={1.8} />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-ink-3 hover:bg-white/[0.07] hover:text-ink-1 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSave()}
                className="px-4 py-1.5 rounded-[8px] bg-white text-black text-[12px] font-medium hover:bg-white/90 disabled:opacity-50 transition-colors cursor-pointer shadow-sm shrink-0"
              >
                {busy ? "Saving..." : "Done"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
