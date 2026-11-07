import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getCategoryIconName, renameCategoryIcon, removeCategoryIcon, setCategoryIcon } from "../../lib/categoryIcons";
import { cleanText } from "../../lib/text";
import { ShelfIconGrid } from "./ShelfIcons";

interface LinuxShelfDialogProps {
  shelf: string;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => Promise<string | null>;
  onDelete: (shelf: string) => void;
}

/** Rename a shelf and pick its icon. Linux's take on the Edit Category dialog. */
export function LinuxShelfDialog({ shelf, onClose, onRename, onDelete }: LinuxShelfDialogProps) {
  const [name, setName] = useState(cleanText(shelf));
  const [icon, setIcon] = useState<string>(() => getCategoryIconName(shelf));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    const next = name.trim();
    if (!next) {
      setError("A shelf needs a name.");
      return;
    }
    setBusy(true);
    let target = shelf;
    if (next !== cleanText(shelf)) {
      const err = await onRename(shelf, next);
      if (err) {
        setError(err);
        setBusy(false);
        return;
      }
      renameCategoryIcon(shelf, next);
      target = next;
    }
    setCategoryIcon(target, icon);
    onClose();
  };

  return (
    <>
      <div className="lx-scrim" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[125] grid place-items-center p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="shelf-dialog-title" className="lx-dialog w-full max-w-[372px]">
          <div className="flex items-center justify-between">
            <h2 id="shelf-dialog-title" className="text-[15px] font-semibold text-ink-1">
              Edit shelf
            </h2>
            <button type="button" className="lx-icon-button -mr-1.5" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <input
            autoFocus
            value={name}
            maxLength={28}
            aria-label="Shelf name"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            className="lx-input mt-4 w-full"
          />
          {error && <p className="mt-1.5 text-[12px] text-[var(--l-error-foreground)]">{error}</p>}

          <div className="mt-3">
            <ShelfIconGrid value={icon} onChange={setIcon} />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              className="ghost text-[var(--l-error-foreground)]! hover:bg-[var(--l-error-surface)]!"
              onClick={() => {
                removeCategoryIcon(shelf);
                onDelete(shelf);
              }}
            >
              Delete shelf
            </button>
            <button type="button" className="btn" data-variant="primary" onClick={() => void save()} disabled={busy}>
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
