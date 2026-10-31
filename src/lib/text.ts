import type { NoteItem } from "../api/tauriBridge";

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 6) return `${Math.round(s / 86400)}d ago`;
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function relativeShort(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 6) return `${Math.round(s / 86400)}d`;
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function longDate(ts: number): string {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fullStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${clockTime(ts)}`;
}

export function stripDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

export function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "—";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return clean.slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cleanText(str: string | null | undefined): string {
  if (!str) return "";
  let s = str.trim();
  // Remove escaped quotes and backslashes
  s = s.replace(/\\+"/g, "").replace(/\\+/g, "");
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s.trim();
    while (
      (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    ) {
      s = s.slice(1, -1).trim();
    }
    s = s.replace(/^["'\\]+|["'\\]+$/g, "").trim();
    if (s === prev) break;
  }
  return s.replace(/\\"/g, "").replace(/\\\\/g, "").replace(/^["'\\]+|["'\\]+$/g, "").trim();
}

/** Recent edits are opaque; older notes fade toward the chassis. */
export function edgeOpacity(ts: number, now = Date.now()): number {
  const days = Math.max(0, (now - ts) / 86_400_000);
  return Math.max(0.22, 0.9 - days * 0.075);
}

const ACCENTS = ["#f2f2f4", "#cfd0d5", "#a6a8af", "#7c7f87", "#5a5d65", "#43464d"];

/** Shelves are told apart by luminance, never by hue. */
export function accentFor(name: string, shelves: string[]): string {
  const index = shelves.indexOf(name);
  return ACCENTS[(index < 0 ? 0 : index) % ACCENTS.length];
}

const SPANS = {
  feature: "col-span-12 md:col-span-8 lg:col-span-7 xl:col-span-8 row-span-2",
  denseChecklist: "col-span-12 md:col-span-6 lg:col-span-6 row-span-2",
  half: "col-span-12 md:col-span-6 lg:col-span-5 row-span-1",
  third: "col-span-12 md:col-span-6 lg:col-span-4 row-span-1",
  square: "col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3 row-span-1",
} as const;

export type TileWeight = keyof typeof SPANS;

export interface Density {
  weight: TileWeight;
  span: string;
  minHeight: number;
  lines: number;
}

/**
 * Dynamic Bento grid content density sizing:
 * - Single-line text notes scale tightly into tiny square blocks (row-span-1)
 * - Dense checklists and feature items expand into larger structural panels (row-span-2)
 */
export function densityOf(note: NoteItem): Density {
  const chars = note.content.reduce((sum, item) => sum + item.text.trim().length, 0);
  const todoCount = note.content.filter((item) => item.is_todo).length;
  const totalItems = note.content.filter((item) => item.text.trim().length > 0).length;

  if (note.media_url) {
    return { weight: "feature", span: SPANS.feature, minHeight: 280, lines: 3 };
  }
  if (note.is_pinned) {
    return { weight: "feature", span: SPANS.feature, minHeight: 270, lines: 5 };
  }
  // Dense checklists expand into larger structural panels spanning 2 rows
  if (todoCount >= 3 || totalItems >= 4 || chars >= 190) {
    return { weight: "denseChecklist", span: SPANS.denseChecklist, minHeight: 270, lines: 6 };
  }
  // Single-line text notes scale tightly into tiny square blocks
  if (totalItems <= 1 && chars < 55) {
    return { weight: "square", span: SPANS.square, minHeight: 124, lines: 1 };
  }
  if (chars < 120 && totalItems <= 2) {
    return { weight: "third", span: SPANS.third, minHeight: 136, lines: 2 };
  }
  return { weight: "half", span: SPANS.half, minHeight: 142, lines: 3 };
}

export function noteMatches(note: NoteItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    note.title.toLowerCase().includes(q) ||
    note.category.toLowerCase().includes(q) ||
    note.content.some((item) => item.text.toLowerCase().includes(q))
  );
}

export function plainPreview(note: NoteItem, count: number): string[] {
  return note.content
    .filter((item) => item.text.trim().length > 0)
    .slice(0, count)
    .map((item) => item.text.trim());
}

export interface PreviewLine {
  kind: "skip" | "h" | "li" | "p";
  text: string;
}

/**
 * Converts one raw markdown source line into clean plain preview text for note cards:
 * heading hashes, quote markers, bullet markers, table pipes, fences and rules never leak through.
 */
export function previewLine(raw: string): PreviewLine {
  const skip: PreviewLine = { kind: "skip", text: "" };
  let t = raw.trim();
  if (!t) return skip;
  if (/^(```|~~~)/.test(t)) return skip;
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(raw)) return skip;
  if (/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(t)) return skip;

  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => alt || "Image");

  if (t.includes("|")) {
    // table rows / stray pipes: drop every pipe and structural dash token, keep the cell words
    const words = t
      .replace(/\|/g, " ")
      .replace(/(^|\s):?-+:?(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return words ? { kind: "p", text: words } : skip;
  }

  let m = t.match(/^#{1,6}\s+(.*)$/);
  if (m) {
    const text = m[1].replace(/\s*#+\s*$/, "").trim();
    return text ? { kind: "h", text } : skip;
  }
  m = t.match(/^[-*\u2022]\s+(.*)$/);
  if (m) return m[1].trim() ? { kind: "li", text: m[1].trim() } : skip;
  m = t.match(/^>\s?(.*)$/);
  if (m) return m[1].trim() ? { kind: "p", text: m[1].trim() } : skip;
  return { kind: "p", text: t };
}