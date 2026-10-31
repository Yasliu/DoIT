import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cleanText } from "../lib/text";

interface CategoryMenuProps {
  x: number;
  y: number;
  shelf: string;
  onClose: () => void;
  onRename: (shelf: string, newName: string) => Promise<string | null>;
  onDelete: (shelf: string) => void;
}

export function CategoryMenu({ x, y, shelf, onClose, onRename, onDelete }: CategoryMenuProps) {
  const [mode, setMode] = useState<"menu" | "rename">("menu");
  const [name, setName] = useState(cleanText(shelf));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const menuWidth = 190;
  const menuHeight = 120;
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
    if (err) setError(err);
    else onClose();
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
          className="fixed z-[95] w-[190px] rounded-[15px] border border-white/15 bg-[#131418]/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.88)] backdrop-blur-2xl select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="truncate px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
            {cleanText(shelf)}
          </div>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            onClick={() => setMode("rename")}
            className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Pencil size={12.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
            Rename category
          </button>
          <button
            type="button"
            onClick={() => onDelete(shelf)}
            className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={12.5} strokeWidth={1.8} className="shrink-0" />
            Delete category
          </button>
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
              maxLength={60}
              className="h-9 w-full rounded-[10px] border border-white/15 bg-white/[0.05] px-3 text-[13px] text-white outline-none focus:border-white/35"
            />
            {error && <div className="mt-2 text-[11px] text-red-400">{error}</div>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-[8px] px-3 text-[12px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-8 rounded-[8px] bg-white px-3 text-[12px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
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
