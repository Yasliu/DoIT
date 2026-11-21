import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import type { NoteItem } from "../../api/tauriBridge";
import { TABLE_META_RE } from "../../lib/format";
import { shelfMark } from "../../lib/shelfMarks";
import { cleanText, relativeShort } from "../../lib/text";
import { Kbd, Palette, type PaletteItem } from "../ui";

interface SpotlightProps {
  notes: NoteItem[];
  shelves: string[];
  onClose: () => void;
  onOpenNote: (note: NoteItem) => void;
  onOpenShelf: (shelf: string | null) => void;
  onNewNote: () => void;
  onNewShelf: () => void;
  onOverview: () => void;
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
      <mark className="tm-match">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/** A snippet around the first body line that contains `q`. */
function snippet(note: NoteItem, q: string): ReactNode {
  const line = note.content
    .filter((item) => !TABLE_META_RE.test(item.text))
    .map((item) => plain(item.text))
    .find((text) => text.toLowerCase().includes(q));
  if (!line) return null;
  const at = line.toLowerCase().indexOf(q);
  const start = Math.max(0, at - 24);
  return highlight((start > 0 ? "…" : "") + line.slice(start, start + 90), q);
}

/** Ctrl+K: grep the notes, jump to a shelf, or run a command. */
export function Spotlight(props: SpotlightProps) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim().toLowerCase();

  const items = useMemo<PaletteItem[]>(() => {
    const close = (fn: () => void) => () => {
      props.onClose();
      fn();
    };
    const noteItem = (note: NoteItem, detail?: ReactNode): PaletteItem => ({
      key: `note:${note.id}`,
      section: q ? "notes" : "recent",
      lead: shelfMark(note.category),
      label: highlight(cleanText(note.title) || "Untitled", q),
      detail,
      meta: relativeShort(note.last_edited),
      run: close(() => props.onOpenNote(note)),
    });

    const notes: PaletteItem[] = [];
    if (q) {
      const inTitle = props.notes.filter((n) => (cleanText(n.title) || "untitled").toLowerCase().includes(q));
      const inBody = props.notes.filter((n) => !inTitle.includes(n) && n.content.some((c) => c.text.toLowerCase().includes(q)));
      const byRecent = (a: NoteItem, b: NoteItem) => b.last_edited - a.last_edited;
      notes.push(...inTitle.sort(byRecent).slice(0, 12).map((n) => noteItem(n)));
      notes.push(...inBody.sort(byRecent).slice(0, 12).map((n) => noteItem(n, snippet(n, q))));
    } else {
      notes.push(...props.notes.filter((n) => !n.is_settled).sort((a, b) => b.last_edited - a.last_edited).slice(0, 6).map((n) => noteItem(n)));
    }

    const shelves: PaletteItem[] = [null, ...props.shelves]
      .filter((shelf) => !q || (shelf ?? "all notes").toLowerCase().includes(q))
      .map((shelf) => ({
        key: `shelf:${shelf ?? "__all__"}`,
        section: "shelves",
        lead: shelf === null ? "*" : shelfMark(shelf),
        label: highlight(shelf === null ? "all notes" : cleanText(shelf), q),
        meta: `${props.notes.filter((n) => !n.is_settled && (shelf === null || n.category === shelf)).length}`,
        run: close(() => props.onOpenShelf(shelf)),
      }));

    const commands = [
      { key: "new-note", label: "new note", lead: "+", keys: "Ctrl+N", run: props.onNewNote },
      { key: "new-shelf", label: "new shelf", lead: "■", run: props.onNewShelf },
      { key: "overview", label: "overview", lead: "Σ", run: props.onOverview },
      { key: "dock", label: "shrink to the dock", lead: "↘", keys: "Ctrl+J", run: props.onDock },
      { key: "settings", label: "settings", lead: "%", keys: "Ctrl+,", run: props.onSettings },
    ]
      .filter((a) => !q || a.label.includes(q))
      .map(
        (a): PaletteItem => ({
          key: `cmd:${a.key}`,
          section: "actions",
          lead: a.lead,
          label: highlight(a.label, q),
          meta: a.keys ? <Kbd keys={a.keys} /> : undefined,
          run: close(a.run),
        }),
      );

    return [...notes, ...shelves, ...commands];
  }, [q, props]);

  return (
    <Palette
      title="search"
      prompt="/"
      placeholder="search notes, shelves and actions"
      query={query}
      onQuery={setQuery}
      items={items}
      onClose={props.onClose}
      empty={`no match for “${query.trim()}”`}
    />
  );
}
