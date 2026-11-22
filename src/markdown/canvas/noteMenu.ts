import type { MenuItem } from "../ui";

export interface NoteMenuActions {
  settled: boolean;
  onOpen: () => void;
  onOpenFull?: () => void;
  onToggleSettled?: () => void;
  onMove: () => void;
  onCopy?: () => void;
  onCopyText?: () => void;
  onDelete: () => void;
}

/** What a right-click on a note offers, on the canvas and in the dock. */
export function noteMenuItems(a: NoteMenuActions): MenuItem[] {
  const items: MenuItem[] = [{ key: "open", glyph: "→", label: "open", hint: "⏎", run: a.onOpen }];
  if (a.onOpenFull) items.push({ key: "full", glyph: "⤢", label: "open full size", run: a.onOpenFull });
  if (a.onToggleSettled) items.push({ key: "settle", glyph: a.settled ? "↺" : "✓", label: a.settled ? "bring back" : "settle", run: a.onToggleSettled });
  items.push({ key: "move", glyph: "»", label: "move to…", run: a.onMove });
  if (a.onCopy) items.push({ key: "copy", glyph: "+", label: "copy to…", run: a.onCopy });
  if (a.onCopyText) items.push({ key: "text", glyph: "⧉", label: "copy text", run: a.onCopyText });
  items.push({ key: "delete", glyph: "⌫", label: "delete", danger: true, section: " ", run: a.onDelete });
  return items;
}
