/**
 * The ILOVEMARKDOWN theme: light or dark (the `.dark` class), and one accent that tints the three
 * figure accents. It shares the `palette` and `appearance` settings with the default design: each
 * accent is stored as the default design's palette id, so either design reads the other's choice.
 */

export type Appearance = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

/** Each accent is an oklch hue and chroma; `null` hue is the greyscale accent. */
const ACCENTS = {
  monochrome: { label: "mono", hue: null, chroma: 0 },
  neutral: { label: "blue", hue: 255, chroma: 0.14 },
  ocean: { label: "cyan", hue: 210, chroma: 0.11 },
  grove: { label: "green", hue: 150, chroma: 0.14 },
  ember: { label: "amber", hue: 75, chroma: 0.14 },
  orchid: { label: "rose", hue: 10, chroma: 0.16 },
  iris: { label: "violet", hue: 295, chroma: 0.15 },
} as const;

export type AccentId = keyof typeof ACCENTS;
export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];
export const APPEARANCES: Appearance[] = ["system", "light", "dark"];

export function normalizeAccent(value: string | null | undefined): AccentId {
  if (value && value in ACCENTS) return value as AccentId;
  return "monochrome";
}

export function normalizeAppearance(value: string | null | undefined): Appearance {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export interface Theme {
  accent: AccentId;
  appearance: Appearance;
}

export type ThemeSettings = { palette?: string | null; appearance?: string | null };

export function themeFromSettings(s: ThemeSettings): Theme {
  return { accent: normalizeAccent(s.palette), appearance: normalizeAppearance(s.appearance) };
}

/** The three graph accents for `accent` on a light or dark page, as CSS colours. */
export function accentColors(accent: AccentId, mode: Resolved): [string, string, string] {
  const { hue, chroma } = ACCENTS[accent];
  const light = mode === "light";
  if (hue === null) {
    return light ? ["oklch(0.2 0 0)", "oklch(0.45 0 0)", "oklch(0.6 0 0)"] : ["oklch(0.96 0 0)", "oklch(0.75 0 0)", "oklch(0.6 0 0)"];
  }
  const l = light ? 0.5 : 0.78;
  const c = light ? chroma + 0.03 : chroma;
  return [`oklch(${l} ${c} ${hue})`, `oklch(${l + 0.06} ${c * 0.85} ${(hue + 180) % 360})`, `oklch(${l} ${c * 0.8} ${(hue + 90) % 360})`];
}

export function accentLabel(accent: AccentId): string {
  return ACCENTS[accent].label;
}

const CACHE_KEY = "doit.theme";
/** Read by the launch screen in index.html, before any of this code has loaded. */
const BOOT_CANVAS_KEY = "doit.boot-canvas";
const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let current: Theme | null = null;

export function resolve(appearance: Appearance): Resolved {
  if (appearance === "system") return darkQuery?.matches ? "dark" : "light";
  return appearance;
}

function paint({ accent, appearance }: Theme) {
  const root = document.documentElement;
  const mode = resolve(appearance);
  const [a1, a2, a3] = accentColors(accent, mode);
  root.classList.toggle("dark", mode === "dark");
  root.dataset.appearance = mode;
  root.dataset.accent = accent;
  root.style.setProperty("--graph-accent", a1);
  root.style.setProperty("--graph-accent-2", a2);
  root.style.setProperty("--graph-accent-3", a3);
  const { hue, chroma } = ACCENTS[accent];
  const tint = { hue: hue ?? 0, chroma: hue === null ? 0 : chroma * 0.1 };
  root.style.setProperty("--tint-hue", String(tint.hue));
  root.style.setProperty("--tint-chroma", String(tint.chroma));
  root.style.colorScheme = mode;
  try {
    // The dark one is app.css's `.dark` background.
    localStorage.setItem(BOOT_CANVAS_KEY, mode === "dark" ? `oklch(0.24 ${tint.chroma} ${tint.hue})` : "#fcfcfc");
  } catch {
    /* the launch screen falls back to the OS light or dark */
  }
}

/** Applies a theme and remembers it, so the next window paints it before settings load. */
export function applyTheme(theme: Theme): void {
  current = theme;
  paint(theme);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ palette: theme.accent, appearance: theme.appearance }));
  } catch {
    /* private storage: the theme still applies for this window */
  }
}

/** First paint: the last theme this machine used. */
export function restoreTheme(): void {
  let cached: ThemeSettings = {};
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    /* no cache yet */
  }
  current = themeFromSettings(cached);
  paint(current);
  darkQuery?.addEventListener("change", () => {
    if (current?.appearance === "system") paint(current);
  });
}
