// How lines nest into lists: the depth each list line is drawn at, and the number a numbered line
// shows. Markdown nests by leading whitespace, so depth is relative: a line indented more than the
// list line above it is its child, whatever the exact widths (two-space and four-space files both work).

/** One line of a note, as list nesting sees it. `start` is the number a numbered line was written with. */
export type ListLine =
  | { kind: "other" }
  | { kind: "bullet" | "task"; indent: string }
  | { kind: "numbered"; indent: string; start: number };

export interface ListPlace {
  depth: number;
  /** The number a numbered line shows. */
  number?: number;
}

/** What Tab adds in front of a list line. Four spaces nest under any marker, even `10. `. */
export const INDENT_STEP = "    ";

/** Width of leading whitespace, a tab counting as four spaces. */
export function indentWidth(indent: string): number {
  let width = 0;
  for (const ch of indent) width += ch === "\t" ? 4 : 1;
  return width;
}

/**
 * Places every line. Any line that is not a list line ends the list. Numbering restarts at each new
 * level and carries on past nested lines; a bullet at the same level ends a numbered run.
 */
export function layoutLists(lines: ListLine[]): ListPlace[] {
  const levels: { width: number; count: number }[] = [];
  return lines.map((line) => {
    if (line.kind === "other") {
      levels.length = 0;
      return { depth: 0 };
    }
    const width = indentWidth(line.indent);
    while (levels.length > 0 && levels[levels.length - 1].width > width) levels.pop();
    if (levels.length === 0 || levels[levels.length - 1].width < width) levels.push({ width, count: 0 });
    const level = levels[levels.length - 1];
    const depth = levels.length - 1;
    if (line.kind !== "numbered") {
      level.count = 0;
      return { depth };
    }
    level.count = level.count === 0 ? line.start : level.count + 1;
    return { depth, number: level.count };
  });
}
