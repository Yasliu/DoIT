import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogPlacement } from "./ModernPalette";
import { FolderInput, X } from "lucide-react";
import { CATEGORY_ICONS } from "../../lib/categoryIcons";
import { ShelfIconGrid, suggestShelfIcon } from "./ShelfIcons";

interface ModernNewShelfDialogProps {
  shelves: string[];
  onClose: () => void;
  onCreate: (name: string, icon: string) => void;
  /** Import a folder as a shelf, named `name` or, when empty, after the folder. `icon` is null when
   *  nobody picked one, so it can be suggested from the shelf's final name. */
  onImportFolder: (name: string, icon: string | null) => void;
}

/** New shelf: name an empty one, or bring in a folder of Markdown and text files as a shelf. */
export function ModernNewShelfDialog({ shelves, onClose, onCreate, onImportFolder }: ModernNewShelfDialogProps) {
  const frame = useDialogPlacement(400);
  const [name, setName] = useState("");
  // The icon follows the name until it is picked by hand.
  const [picked, setPicked] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const trimmed = name.trim();
  const icon = picked ?? suggestShelfIcon(trimmed);
  const Icon = icon === "dot" ? null : CATEGORY_ICONS[icon];
  const taken = shelves.some((s) => s.toLowerCase() === trimmed.toLowerCase());
  const error = taken ? "A shelf with this name already exists." : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const create = () => {
    if (trimmed && !taken) onCreate(trimmed, icon);
  };

  return createPortal(
    <>
      <div className="ui-scrim" onMouseDown={onClose} />
      <div {...frame}>
        <div role="dialog" aria-modal="true" aria-labelledby="new-shelf-title" className="ui-dialog w-full max-w-[400px]">
          <div className="flex items-center justify-between">
            <h2 id="new-shelf-title" className="text-[15px] font-semibold text-ink-1">
              New shelf
            </h2>
            <button type="button" className="ui-icon-button -mr-1.5" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGridOpen((v) => !v)}
            aria-expanded={gridOpen}
            aria-label="Choose an icon"
            title={picked ? "Icon" : "Icon (suggested from the name)"}
            className="ui-icon-pick"
          >
            {Icon ? <Icon size={18} /> : <span className="size-1.5 rounded-full bg-current" />}
          </button>
          <input
            autoFocus
            value={name}
            maxLength={24}
            placeholder="Name"
            aria-label="Shelf name"
            aria-invalid={taken}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key.toLowerCase() === "o" && e.ctrlKey) {
                e.preventDefault();
                onImportFolder(trimmed, picked);
              }
            }}
            className="ui-input min-w-0 flex-1"
          />
          </div>
          <div className="grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out)]" style={{ gridTemplateRows: gridOpen ? "1fr" : "0fr" }}>
            <div className="min-h-0 overflow-hidden">
              <div className="pt-3">
                <ShelfIconGrid
                  value={icon}
                  onChange={(choice) => {
                    setPicked(choice);
                    setGridOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[12.5px] leading-[18px] text-ink-3">
            {error ?? "Or import a folder: its Markdown and text files become this shelf's notes."}
          </p>
          <div className="mt-5 flex items-center justify-between gap-2">
            <button type="button" className="btn" onClick={() => onImportFolder(trimmed, picked)} title="Ctrl O">
              <FolderInput size={15} />
              Import a folder…
            </button>
            <button type="button" className="btn" data-variant="primary" onClick={create} disabled={!trimmed || taken}>
              Create
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
