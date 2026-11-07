import { useMemo, useState, type ReactNode } from "react";
import { FolderPlus } from "lucide-react";
import { cleanText } from "../../lib/text";
import { FIRST_SHELF_LINE, LinuxPalette, SEARCH_FIELD, type PaletteItem } from "./LinuxPalette";
import { shelfIcon } from "./LinuxSpotlight";

/** A shelf the user chose; `created` when it is a new shelf that has to be made first. */
export interface ShelfChoice {
  shelf: string;
  created: boolean;
}

interface LinuxShelfPickerProps {
  label: string;
  placeholder: string;
  icon: ReactNode;
  /** What Enter does, for the hint ("create", "move"). */
  enterLabel: string;
  shelves: string[];
  /** Starts highlighted. */
  current?: string | null;
  /** Not offered (the shelf a note is already on). */
  exclude?: string;
  onClose: () => void;
  onPick: (choice: ShelfChoice) => void;
  /** A second action on the highlighted shelf, run by Ctrl+`key` or its footer button. */
  secondary?: { label: string; icon: ReactNode; key: string; run: (choice: ShelfChoice) => void };
}

/** Pick a shelf from the keyboard: type to filter, or type a new name to make that shelf. */
export function LinuxShelfPicker(props: LinuxShelfPickerProps) {
  const { shelves, exclude, onPick, secondary } = props;
  const [query, setQuery] = useState("");
  const q = query.trim();

  const items = useMemo<PaletteItem[]>(() => {
    const ordered = [...shelves.filter((s) => s.toLowerCase() !== "uncategorized"), "Uncategorized"].filter(
      (s) => s.toLowerCase() !== exclude?.toLowerCase(),
    );
    const list: PaletteItem[] = ordered
      .filter((shelf) => cleanText(shelf).toLowerCase().includes(q.toLowerCase()))
      .map((shelf) => ({
        key: shelf,
        section: "Shelf",
        icon: shelfIcon(shelf),
        label: cleanText(shelf),
        run: () => onPick({ shelf, created: false }),
      }));
    const exists = shelves.some((shelf) => cleanText(shelf).toLowerCase() === q.toLowerCase());
    if (q && !exists) {
      list.push({
        key: `new:${q}`,
        section: "Shelf",
        icon: <FolderPlus size={16} />,
        label: `New shelf “${q}”`,
        run: () => onPick({ shelf: q, created: true }),
      });
    }
    return list;
  }, [shelves, exclude, q, onPick]);

  const choiceOf = (active: PaletteItem | undefined): ShelfChoice | null =>
    active ? (active.key.startsWith("new:") ? { shelf: q, created: true } : { shelf: active.key, created: false }) : null;

  return (
    <LinuxPalette
      label={props.label}
      placeholder={props.placeholder}
      icon={props.icon}
      enterLabel={props.enterLabel}
      query={query}
      onQuery={setQuery}
      items={items}
      initialKey={props.current && shelves.includes(props.current) ? props.current : undefined}
      onClose={props.onClose}
      anchorSelector={SEARCH_FIELD}
      topSelector={FIRST_SHELF_LINE}
      empty="No shelves to choose"
      onKey={(e, active) => {
        if (!secondary || !e.ctrlKey || e.key.toLowerCase() !== secondary.key) return false;
        e.preventDefault();
        const choice = choiceOf(active);
        if (choice) secondary.run(choice);
        return true;
      }}
      footer={(active) => {
        if (!secondary) return null;
        const choice = choiceOf(active);
        return (
          <button type="button" disabled={!choice} onClick={() => choice && secondary.run(choice)} className="lx-palette-action">
            {secondary.icon}
            {secondary.label}
            <kbd>Ctrl {secondary.key.toUpperCase()}</kbd>
          </button>
        );
      }}
    />
  );
}
