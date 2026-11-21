/**
 * The figures a note can hold, each with the block a new one starts from. A figure is written as a
 * Comark block, so the note stays plain Markdown:
 *
 *     ::graph-check{title="launch"}
 *     - [x] write release notes
 *     ::
 */

import type { ContentItem } from "../../api/tauriBridge";

export interface FigureKind {
  /** The block's tag, as written after `::`. */
  tag: string;
  label: string;
  /** One character for the insert menu. */
  glyph: string;
  /** What a freshly inserted figure contains. */
  template: string;
}

export const FIGURES: FigureKind[] = [
  { tag: "callout", label: "callout", glyph: "!", template: '::callout{type="tip"}\nSomething worth pulling out of the note.\n::' },
  { tag: "quote", label: "quote", glyph: "“", template: '::quote{by="Who said it"}\nThe words, as they were said.\n::' },
  {
    tag: "steps",
    label: "steps",
    glyph: "1.",
    template: '::steps{title="plan"}\n1. First step\n\n   What it involves.\n\n2. **The step you are on**\n\n3. *A step to come*\n::',
  },
  {
    tag: "graph-check",
    label: "checklist",
    glyph: "✓",
    template: '::graph-check{title="tasks"}\n- [x] Something done\n- [ ] Something open\n  - [ ] A sub-task\n::',
  },
  {
    tag: "graph-timeline",
    label: "timeline",
    glyph: "│",
    template: '::graph-timeline{title="this week"}\n- Mon: kickoff — with the team\n- **Wed: review**\n- *Fri: ship*\n::',
  },
  {
    tag: "graph-board",
    label: "board",
    glyph: "▥",
    template: '::graph-board{title="board"}\n### Now\n- **The thing in progress**\n\n### Next\n- Waiting its turn\n\n### Later\n- *Someday*\n::',
  },
  { tag: "graph-meter", label: "meter", glyph: "▰", template: '::graph-meter{title="progress"}\n40% — of the draft\n::' },
  { tag: "graph-kpi", label: "number", glyph: "#", template: '::graph-kpi{title="this week"}\n12 pages — +3 on last week\n\n4 6 5 8 12\n::' },
  { tag: "graph-stat", label: "stats", glyph: "Σ", template: '::graph-stat{title="totals"}\n- 12 pages\n- 3 chapters\n- 4 open questions\n::' },
  {
    tag: "graph-table",
    label: "table",
    glyph: "▦",
    template: '::graph-table{title="table"}\n---\nheaders: [Item, Owner, Due]\nrows:\n  - [Draft, Sam, Fri]\n  - [Review, Ana, Mon]\n---\n::',
  },
  {
    tag: "graph-compare",
    label: "compare",
    glyph: "≠",
    template:
      '::graph-compare{title="compare"}\n---\ncolumns: [Option A, Option B]\nrows:\n  - label: Cheap\n    values: [true, false]\n  - label: Fast\n    values: [false, true]\n  - label: Setup\n    values: [an hour, a day]\n---\n::',
  },
  {
    tag: "decision",
    label: "decision",
    glyph: "◆",
    template: '::decision{title="decision" status="accepted"}\n- **The chosen option** — why it won\n- *A rejected option* — why not\n\nWhat happens next.\n::',
  },
  {
    tag: "graph-gantt",
    label: "schedule",
    glyph: "═",
    template:
      '::graph-gantt{title="schedule"}\n---\nticks: [W1, W2, W3, W4]\nitems:\n  - label: design\n    start: 0\n    end: 0.35\n  - label: build\n    start: 0.3\n    end: 0.8\n    accent: true\n  - label: launch\n    start: 0.8\n    end: 1\n---\n::',
  },
  { tag: "graph-countdown", label: "countdown", glyph: "◷", template: `::graph-countdown{title="countdown"}\n${new Date().getFullYear() + 1}-01-01 — until the new year\n::` },
  { tag: "keys", label: "keys", glyph: "⌘", template: '::keys{title="keys"}\n- Ctrl+K: search\n- Ctrl+N: new note\n::' },
  { tag: "terminal", label: "terminal", glyph: "$", template: '::terminal{title="shell"}\n```\n$ npm run build\n# builds the app\n```\n::' },
];

const TAGS = new Set(FIGURES.map((f) => f.tag));

/**
 * Figure blocks are an ILOVEMARKDOWN feature. Until a window turns them on, the Markdown code
 * reads `::tag … ::` as ordinary lines, so the default design shows them as written.
 */
let enabled = false;

export function enableFigureBlocks(): void {
  enabled = true;
}

/** The tag a line opens a figure with (`::graph-check{…}`), or null. */
export function figureOpening(line: string): string | null {
  if (!enabled) return null;
  const m = line.trim().match(/^::([a-z][\w-]*)(?:\{.*\})?\s*$/);
  return m && TAGS.has(m[1]) ? m[1] : null;
}

/** Whether a line closes a figure. */
export function isFigureClosing(line: string): boolean {
  return enabled && line.trim() === "::";
}

/**
 * The note's lines with each closed figure folded into one line of its inner text, and where in
 * the folded lines the figures are: a figure is one block on the card, however many source lines
 * it takes.
 */
export function foldFigures(content: ContentItem[]): { content: ContentItem[]; figures: number[] } {
  const folded: ContentItem[] = [];
  const figures: number[] = [];
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    let end = -1;
    if (!item.is_todo && figureOpening(item.text)) {
      end = content.findIndex((next, j) => j > i && isFigureClosing(next.text));
    }
    if (end < 0) {
      folded.push(item);
      continue;
    }
    const inner = content.slice(i + 1, end).map((line) => line.text.trim()).filter(Boolean);
    figures.push(folded.length);
    folded.push({ ...item, text: inner.join(" "), is_todo: false, completed: false });
    i = end;
  }
  return { content: folded, figures };
}
