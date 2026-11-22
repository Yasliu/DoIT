import { useMemo, useState } from "react";
import { shelfMark } from "../../lib/shelfMarks";
import { cleanText } from "../../lib/text";
import { Btn, Kbd, Palette, type PaletteItem } from "../ui";

/** A shelf the user chose; `created` when it is a new shelf that has to be made first. */
export interface ShelfChoice {
  shelf: string;
  created: boolean;
}

interface ShelfPickerProps {
  title: string;
  placeholder: string;
  shelves: string[];
  /** Starts highlighted. */
  current?: string | null;
  /** Not offered (the shelf a note is already on). */
  exclude?: string;
  onClose: () => void;
  onPick: (choice: ShelfChoice) => void;
  /** A second action on the highlighted shelf, run by Ctrl+`key` or its footer button. */
  secondary?: { label: string; key: string; run: (choice: ShelfChoice) => void };
}

/** Pick a shelf from the keyboard: type to filter, or type a new name to make that shelf. */
export function ShelfPicker(props: ShelfPickerProps) {
  const { shelves, exclude, onPick, secondary } = props;
  const [query, setQuery] = useState("");
  const q = query.trim();

  const items = useMemo<PaletteItem[]>(() => {
    const ordered = [...shelves.filter((s) => s.toLowerCase() !== "uncategorized"), "Uncategorized"].filter((s) => s.toLowerCase() !== exclude?.toLowerCase());
    const list: PaletteItem[] = ordered
      .filter((shelf) => cleanText(shelf).toLowerCase().includes(q.toLowerCase()))
      .map((shelf) => ({ key: shelf, lead: shelfMark(shelf), label: cleanText(shelf), run: () => onPick({ shelf, created: false }) }));
    if (q && !shelves.some((shelf) => cleanText(shelf).toLowerCase() === q.toLowerCase())) {
      list.push({ key: `new:${q}`, lead: "+", label: `new shelf “${q}”`, run: () => onPick({ shelf: q, created: true }) });
    }
    return list;
  }, [shelves, exclude, q, onPick]);

  const choiceOf = (active: PaletteItem | undefined): ShelfChoice | null =>
    active ? (active.key.startsWith("new:") ? { shelf: q, created: true } : { shelf: active.key, created: false }) : null;

  return (
    <Palette
      title={props.title}
      placeholder={props.placeholder}
      query={query}
      onQuery={setQuery}
      items={items}
      initialKey={props.current && shelves.includes(props.current) ? props.current : undefined}
      onClose={props.onClose}
      empty="no shelves to choose"
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
          <Btn disabled={!choice} onClick={() => choice && secondary.run(choice)} className="h-6 text-[11px]">
            {secondary.label} <Kbd keys={`Ctrl+${secondary.key.toUpperCase()}`} />
          </Btn>
        );
      }}
    />
  );
}
