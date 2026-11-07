import { useMemo, useState } from "react";
import { FileDown, FolderPlus, SquarePen } from "lucide-react";
import { cleanText } from "../../lib/text";
import { LinuxPalette, type PaletteItem } from "./LinuxPalette";
import { shelfIcon } from "./LinuxSpotlight";

interface LinuxNewNoteDialogProps {
  shelves: string[];
  /** The shelf being viewed, which starts highlighted. */
  current: string | null;
  onClose: () => void;
  /** `created` is true when the shelf is new and has to be made first. */
  onCreate: (shelf: string, created: boolean) => void;
  onImportFile: (shelf: string, created: boolean) => void;
}

/** New note: pick its shelf from the keyboard, or import a file onto that shelf instead. */
export function LinuxNewNoteDialog({ shelves, current, onClose, onCreate, onImportFile }: LinuxNewNoteDialogProps) {
  const [query, setQuery] = useState("");
  const q = query.trim();

  const items = useMemo<PaletteItem[]>(() => {
    const ordered = [...shelves.filter((s) => s.toLowerCase() !== "uncategorized"), "Uncategorized"];
    const found = ordered.filter((shelf) => cleanText(shelf).toLowerCase().includes(q.toLowerCase()));
    const list: PaletteItem[] = found.map((shelf) => ({
      key: shelf,
      section: "Shelf",
      icon: shelfIcon(shelf),
      label: cleanText(shelf),
      run: () => onCreate(shelf, false),
    }));
    if (q && !ordered.some((shelf) => cleanText(shelf).toLowerCase() === q.toLowerCase())) {
      list.push({
        key: `new:${q}`,
        section: "Shelf",
        icon: <FolderPlus size={16} />,
        label: `New shelf “${q}”`,
        run: () => onCreate(q, true),
      });
    }
    return list;
  }, [shelves, q, onCreate]);

  const target = (active: PaletteItem | undefined) =>
    active ? (active.key.startsWith("new:") ? { shelf: q, created: true } : { shelf: active.key, created: false }) : null;

  return (
    <LinuxPalette
      label="New note"
      placeholder="New note in…"
      icon={<SquarePen size={17} />}
      enterLabel="create"
      query={query}
      onQuery={setQuery}
      items={items}
      initialKey={current && shelves.includes(current) ? current : undefined}
      onClose={onClose}
      onKey={(e, active) => {
        if (e.key.toLowerCase() === "o" && e.ctrlKey) {
          e.preventDefault();
          const t = target(active);
          if (t) onImportFile(t.shelf, t.created);
          return true;
        }
        return false;
      }}
      footer={(active) => {
        const t = target(active);
        return (
          <button
            type="button"
            disabled={!t}
            onClick={() => t && onImportFile(t.shelf, t.created)}
            className="lx-palette-action"
          >
            <FileDown size={14} />
            Import a file here
            <kbd>Ctrl O</kbd>
          </button>
        );
      }}
    />
  );
}
