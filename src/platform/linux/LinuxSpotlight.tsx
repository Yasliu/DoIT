import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { FileText, FolderPlus, LayoutGrid, PanelBottomOpen, Settings, SquarePen } from "lucide-react";
import type { NoteItem } from "../../api/tauriBridge";
import { CATEGORY_ICONS, getCategoryIconName } from "../../lib/categoryIcons";
import { cleanText, relativeShort } from "../../lib/text";
import { LinuxPalette, type PaletteItem } from "./LinuxPalette";

interface LinuxSpotlightProps {
  notes: NoteItem[];
  shelves: string[];
  onClose: () => void;
  onOpenNote: (note: NoteItem) => void;
  onOpenShelf: (shelf: string | null) => void;
  onNewNote: () => void;
  onNewShelf: () => void;
  onSettings: () => void;
  onDock: () => void;
}

/** Markdown markers stripped from a line before it is shown as a snippet. */
const plain = (line: string) => line.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|#{1,6}\s+|>\s+)/, "").trim();

function highlight(text: string, q: string): ReactNode {
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="lx-hl">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/** A snippet centred on the first body line that contains `q`. */
function snippet(note: NoteItem, q: string): ReactNode {
  const line = note.content.map((item) => plain(item.text)).find((text) => text.toLowerCase().includes(q));
  if (!line) return null;
  const at = line.toLowerCase().indexOf(q);
  const start = Math.max(0, at - 24);
  return highlight((start > 0 ? "…" : "") + line.slice(start, start + 90), q);
}

export function shelfIcon(shelf: string | null, size = 16) {
  if (shelf === null) return <LayoutGrid size={size} />;
  const name = getCategoryIconName(shelf);
  const Icon = name && name !== "dot" ? CATEGORY_ICONS[name] : null;
  if (Icon) return <Icon size={size} />;
  return (
    <span className="grid place-items-center" style={{ width: size, height: size }}>
      <span className="size-1.5 rounded-full bg-current" />
    </span>
  );
}

/** Ctrl+K: find a note, jump to a shelf or run an action, without touching the canvas. */
export function LinuxSpotlight(props: LinuxSpotlightProps) {
  const [query, setQuery] = useState("");
  // Typing stays instant while a large workspace is searched.
  const q = useDeferredValue(query).trim().toLowerCase();

  const items = useMemo<PaletteItem[]>(() => {
    const close = (fn: () => void) => () => {
      props.onClose();
      fn();
    };
    const noteItem = (note: NoteItem, detail?: ReactNode): PaletteItem => {
      const title = cleanText(note.title) || "Untitled";
      return {
        key: `note:${note.id}`,
        section: q ? "Notes" : "Recent",
        icon: <FileText size={16} />,
        label: highlight(title, q),
        detail,
        meta: `${cleanText(note.category)} · ${relativeShort(note.last_edited)}`,
        run: close(() => props.onOpenNote(note)),
      };
    };

    const notes: PaletteItem[] = [];
    if (q) {
      const inTitle = props.notes.filter((n) => (cleanText(n.title) || "untitled").toLowerCase().includes(q));
      const inBody = props.notes.filter((n) => !inTitle.includes(n) && n.content.some((c) => c.text.toLowerCase().includes(q)));
      const byRecent = (a: NoteItem, b: NoteItem) => b.last_edited - a.last_edited;
      notes.push(...inTitle.sort(byRecent).slice(0, 12).map((n) => noteItem(n)));
      notes.push(...inBody.sort(byRecent).slice(0, 12).map((n) => noteItem(n, snippet(n, q))));
    } else {
      notes.push(...[...props.notes].sort((a, b) => b.last_edited - a.last_edited).slice(0, 6).map((n) => noteItem(n)));
    }

    const shelves: PaletteItem[] = [null, ...props.shelves]
      .filter((shelf) => !q || (shelf ?? "all notes").toLowerCase().includes(q))
      .map((shelf) => ({
        key: `shelf:${shelf ?? "__all__"}`,
        section: "Shelves",
        icon: shelfIcon(shelf),
        label: highlight(shelf === null ? "All notes" : cleanText(shelf), q),
        meta: `${shelf === null ? props.notes.length : props.notes.filter((n) => n.category === shelf).length}`,
        run: close(() => props.onOpenShelf(shelf)),
      }));

    const actions: PaletteItem[] = (
      [
        { key: "new-note", label: "New note", icon: <SquarePen size={16} />, meta: "Ctrl N", run: props.onNewNote },
        { key: "new-shelf", label: "New shelf", icon: <FolderPlus size={16} />, run: props.onNewShelf },
        { key: "dock", label: "Switch to Docking Mode", icon: <PanelBottomOpen size={16} />, meta: "Ctrl J", run: props.onDock },
        { key: "settings", label: "Settings", icon: <Settings size={16} />, meta: "Ctrl ,", run: props.onSettings },
      ] as const
    )
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ key: `action:${a.key}`, section: "Actions", icon: a.icon, label: highlight(a.label, q), meta: "meta" in a ? a.meta : undefined, run: close(a.run) }));

    return [...notes, ...shelves, ...actions];
  }, [q, props]);

  return (
    <LinuxPalette
      label="Search notes"
      placeholder="Search notes, shelves and actions"
      anchorSelector=".lx-search-trigger"
      query={query}
      onQuery={setQuery}
      items={items}
      onClose={props.onClose}
      empty={`Nothing matches “${query.trim()}”`}
    />
  );
}
