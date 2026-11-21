import { useEffect, useState } from "react";
import { tauriApi } from "../api/tauriBridge";

/**
 * A shelf's mark: one character drawn before its name. Stored in the shelf's `icon` field; icon
 * names saved by earlier designs (Lucide names) read as the nearest mark.
 */

/** The marks offered in the picker, in order. */
export const SHELF_MARKS = [
  "■", "□", "●", "○", "◆", "◇", "▲", "△", "▼", "★", "☆", "✦",
  "§", "¶", "#", "@", "&", "$", "%", "λ", "π", "Σ", "Δ", "Ω",
  "∞", "≡", "※", "♪", "♥", "⌂", "⌘", "✓", "→", "↗", "∴", "◎",
] as const;

const FROM_ICON: Record<string, string> = {
  dot: "·", Folder: "■", BookOpen: "¶", Code: "λ", Terminal: "$", Sparkles: "✦", Flame: "▲", CheckSquare: "✓",
  ListTodo: "≡", GraduationCap: "Σ", Briefcase: "◆", Heart: "♥", Globe: "○", FileText: "¶", Cpu: "⌘",
  Palette: "◇", Coffee: "∴", Bookmark: "▼", Star: "★", Music: "♪", Film: "▶", Lightbulb: "※", Layers: "≡",
  Tag: "#", Smile: "☆", Zap: "ϟ", Target: "◎", Box: "□", Archive: "▤", Compass: "✧", Calendar: "▦",
  Clock: "◷", Pin: "↓", TrendingUp: "↗", User: "@", Library: "‖", Hash: "#", ChefHat: "♨", Plane: "→",
  Dumbbell: "=", ShoppingCart: "$", Wallet: "$", House: "⌂", Users: "&", Gift: "✚", PawPrint: "∴",
  Gamepad2: "◎", Camera: "◉", Car: "○", Sprout: "✿", Mountain: "△", Stethoscope: "✚", Baby: "☆",
  Wrench: "%", Landmark: "Π",
};

/** Words in a shelf name and the mark they suggest; specific themes come before generic ones. */
const SUGGESTIONS: Array<[RegExp, string]> = [
  [/recipe|cook|kitchen|food|meal|bak(e|ing)|dinner|lunch|breakfast/, "♨"],
  [/travel|trip|flight|vacation|holiday|journey/, "→"],
  [/code|dev|tech|prog|web|app|script|git|software/, "λ"],
  [/school|study|exam|math|phys|chem|bio|class|learn|edu/, "Σ"],
  [/work|job|office|client|project|business|career|meeting/, "◆"],
  [/todo|task|plan|checklist|goal/, "✓"],
  [/idea|brain|think|spark/, "※"],
  [/design|art|draw|paint|creative/, "◇"],
  [/personal|life|self|health|family|home|house/, "♥"],
  [/finance|money|budget|bill|invest|bank|tax/, "$"],
  [/read|book|doc|paper|article|journal|diary/, "¶"],
  [/music|audio|song/, "♪"],
  [/archive|old|backup|vault/, "▼"],
  [/star|fav|priority|urgent/, "★"],
];

/** The mark a new shelf called `name` gets until someone picks one. */
export function suggestShelfMark(name: string): string {
  const q = name.toLowerCase().trim();
  if (!q || q === "uncategorized") return "□";
  return SUGGESTIONS.find(([pattern]) => pattern.test(q))?.[1] ?? "■";
}

const STORAGE_KEY = "doit.category_icons";
const CHANGED = "shelf-marks-changed";
let memory: Record<string, string> | null = null;

function stored(): Record<string, string> {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    memory = {};
  }
  return memory!;
}

function write(next: Record<string, string>) {
  memory = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* the marks still apply in this window */
  }
  window.dispatchEvent(new CustomEvent(CHANGED));
}

/** Seeds the marks from the backend's shelf list. */
export function initShelfMarks(icons: Record<string, string>): void {
  write({ ...icons });
}

/** The character drawn for `shelf`. */
export function shelfMark(shelf: string | null | undefined): string {
  if (!shelf) return "*";
  const value = stored()[shelf.toLowerCase()];
  if (!value) return suggestShelfMark(shelf);
  return FROM_ICON[value] ?? ([...value].length === 1 ? value : suggestShelfMark(shelf));
}

export function setShelfMark(shelf: string, mark: string | null): void {
  if (!shelf) return;
  const next = { ...stored() };
  if (mark) next[shelf.toLowerCase()] = mark;
  else delete next[shelf.toLowerCase()];
  write(next);
  void tauriApi.setShelfIcon(shelf, mark);
}

export function renameShelfMark(oldName: string, newName: string): void {
  const next = { ...stored() };
  const value = next[oldName.toLowerCase()];
  if (!value) return;
  next[newName.toLowerCase()] = value;
  delete next[oldName.toLowerCase()];
  write(next);
}

export function removeShelfMark(shelf: string): void {
  const next = { ...stored() };
  if (!(shelf.toLowerCase() in next)) return;
  delete next[shelf.toLowerCase()];
  write(next);
}

/** Re-renders the caller when any shelf's mark changes. */
export function useShelfMarks(): void {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((v) => v + 1);
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, []);
}
