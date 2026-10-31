export interface MarkdownShortcuts {
  h1: string;
  h2: string;
  h3: string;
  bold: string;
  italic: string;
  table: string;
  tableCol: string;
  tableRow: string;
}

export const DEFAULT_MD_SHORTCUTS: MarkdownShortcuts = {
  h1: "Ctrl+1",
  h2: "Ctrl+2",
  h3: "Ctrl+3",
  bold: "Ctrl+B",
  italic: "Ctrl+I",
  table: "Ctrl+T",
  tableCol: "Ctrl+Alt+ArrowRight",
  tableRow: "Ctrl+Alt+ArrowDown",
};

let current: MarkdownShortcuts = { ...DEFAULT_MD_SHORTCUTS };

interface SettingsLike {
  hotkey_h1?: string;
  hotkey_h2?: string;
  hotkey_h3?: string;
  hotkey_bold?: string;
  hotkey_italic?: string;
  hotkey_table?: string;
  hotkey_table_col?: string;
  hotkey_table_row?: string;
}

/** Applies the editable shortcut settings to the live editors (called after settings load / save). */
export function applyShortcutSettings(s: SettingsLike): void {
  current = {
    h1: s.hotkey_h1 || DEFAULT_MD_SHORTCUTS.h1,
    h2: s.hotkey_h2 || DEFAULT_MD_SHORTCUTS.h2,
    h3: s.hotkey_h3 || DEFAULT_MD_SHORTCUTS.h3,
    bold: s.hotkey_bold || DEFAULT_MD_SHORTCUTS.bold,
    italic: s.hotkey_italic || DEFAULT_MD_SHORTCUTS.italic,
    table: s.hotkey_table || DEFAULT_MD_SHORTCUTS.table,
    tableCol: s.hotkey_table_col || DEFAULT_MD_SHORTCUTS.tableCol,
    tableRow: s.hotkey_table_row || DEFAULT_MD_SHORTCUTS.tableRow,
  };
}

export function getMarkdownShortcuts(): MarkdownShortcuts {
  return current;
}

const ALIASES: Record<string, string> = {
  control: "ctrl",
  cmd: "ctrl",
  command: "ctrl",
  meta: "ctrl",
  option: "alt",
};

export function normalizeCombo(combo: string): string {
  const raw = combo.trim();
  const plusKey = raw.endsWith("++") || raw === "+";
  const parts = (plusKey ? raw.slice(0, -1) : raw)
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => ALIASES[p] ?? p);
  const mods = ["ctrl", "alt", "shift"].filter((m) => parts.includes(m));
  const key = plusKey ? "+" : parts.filter((p) => !["ctrl", "alt", "shift"].includes(p)).pop() ?? "";
  return [...mods, key].filter(Boolean).join("+");
}

interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Builds a "Ctrl+Shift+K" style label from a key event; null for bare modifier presses. */
export function comboFromEvent(e: KeyEventLike): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = e.code && /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key;
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join("+");
}

export function matchesCombo(e: KeyEventLike, combo: string): boolean {
  const label = comboFromEvent(e);
  return !!label && normalizeCombo(label) === normalizeCombo(combo);
}
