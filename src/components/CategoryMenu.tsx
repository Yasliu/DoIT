import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { cleanText } from "../lib/text";
import { pick } from "../platform";
import {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICONS,
  getCategoryIconName,
  renameCategoryIcon,
  removeCategoryIcon,
  setCategoryIcon,
} from "../lib/categoryIcons";

interface CategoryMenuProps {
  x: number;
  y: number;
  shelf: string;
  onClose: () => void;
  onRename: (shelf: string, newName: string) => Promise<string | null>;
  onDelete: (shelf: string) => void;
  onOpenIconPicker?: (shelf: string) => void;
}

export function CategoryMenu({ x, y, shelf, onClose, onRename, onDelete, onOpenIconPicker }: CategoryMenuProps) {
  const [mode, setMode] = useState<"menu" | "rename" | "icon">("menu");
  const [name, setName] = useState(cleanText(shelf));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentIcon = getCategoryIconName(shelf);

  const menuWidth = 200;
  const menuHeight = 150;
  const posX = Math.max(12, Math.min(x, window.innerWidth - menuWidth - 16));
  const posY = Math.max(12, Math.min(y, window.innerHeight - menuHeight - 16));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode === "rename") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode]);

  const submit = async () => {
    const next = name.trim();
    if (!next) {
      setError("Name cannot be empty");
      return;
    }
    if (next === cleanText(shelf)) {
      onClose();
      return;
    }
    setBusy(true);
    const err = await onRename(shelf, next);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      renameCategoryIcon(shelf, next);
      onClose();
    }
  };

  const handleDelete = () => {
    removeCategoryIcon(shelf);
    onDelete(shelf);
  };

  return (
    <>
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

      {mode === "menu" ? (
        <div
          style={{ left: posX, top: posY, animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
          className="fixed z-[95] w-[200px] rounded-[15px] border border-white/15 bg-[#131418]/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.88)] backdrop-blur-2xl select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="truncate px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
            {cleanText(shelf)}
          </div>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            onClick={() => {
              if (onOpenIconPicker) {
                onClose();
                onOpenIconPicker(shelf);
              } else {
                setMode("rename");
              }
            }}
            className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
          >
            <Pencil size={12.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
            {pick("Rename & icon", "Edit shelf…")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
          >
            <Trash2 size={12.5} strokeWidth={1.8} className="shrink-0" />
            {pick("Delete category", "Delete shelf")}
          </button>
        </div>
      ) : mode === "icon" ? (
        <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center">
          <div
            style={{ animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
            className="pointer-events-auto w-[320px] rounded-[16px] border border-white/15 bg-[#131418]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.88)] backdrop-blur-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-semibold text-white/90">
                Choose icon for {cleanText(shelf)}
              </div>
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="grid size-6 place-items-center rounded text-ink-4 hover:text-ink-1"
              >
                <X size={13} />
              </button>
            </div>
            <div className="my-2 grid grid-cols-6 gap-1.5 max-h-[220px] overflow-y-auto p-1 scroll">
              {CATEGORY_ICON_NAMES.map((iconName) => {
                const IconComp = CATEGORY_ICONS[iconName];
                const isSelected = currentIcon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => {
                      setCategoryIcon(shelf, iconName);
                      onClose();
                    }}
                    title={iconName}
                    className={`grid size-10 place-items-center rounded-[8px] transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-white text-black font-semibold shadow-sm"
                        : "bg-white/[0.04] text-ink-2 hover:bg-white/[0.1] hover:text-white"
                    }`}
                  >
                    <IconComp size={16} strokeWidth={isSelected ? 2.4 : 1.8} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-2">
              <button
                type="button"
                onClick={() => {
                  setCategoryIcon(shelf, null);
                  onClose();
                }}
                className="text-[11px] text-ink-4 hover:text-red-400 transition-colors cursor-pointer"
              >
                Reset to default dot
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-7 rounded-[6px] px-2.5 text-[11.5px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            style={{ animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
            className="pointer-events-auto w-[320px] rounded-[16px] border border-white/15 bg-[#131418]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.88)] backdrop-blur-2xl"
          >
            <div className="mb-2 text-[12px] font-semibold text-white/90">Rename category</div>
            <input
              ref={inputRef}
              value={name}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              maxLength={24}
              className="h-9 w-full rounded-[10px] border border-white/15 bg-white/[0.05] px-3 text-[13px] text-white outline-none focus:border-white/35"
            />
            {error && <div className="mt-2 text-[11px] text-red-400">{error}</div>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-[8px] px-3 text-[12px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-8 rounded-[8px] bg-white px-3 text-[12px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
