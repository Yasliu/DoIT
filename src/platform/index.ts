/**
 * The frontend's one platform seam. It answers two questions, and components ask it rather than
 * sniffing anything themselves:
 *
 * - Which OS (`platform`, `isLinux`): only for real OS behaviour, such as GNOME wording, the window
 *   frame Linux draws itself and WebKitGTK workarounds.
 * - Which design (`design`, `isMarkdown`, `isModern`, `pick`, `text`): "modern" is the default
 *   look, in `./modern/` and `src/components`; "markdown" is the ILOVEMARKDOWN feature flag, a
 *   separate UI in `src/markdown`. The flag is the `design` setting; switching it takes a restart.
 *   "classic" is the original look, still in the tree but unreachable.
 *
 * `markPlatform` writes both on <html> as `data-platform` and `data-design` before React renders.
 */

import { tauriApi } from "../api/tauriBridge";
import { trackWindowFrame } from "./modern/frame";
import { trackPillLook } from "./pillLook";
import { applyModernTheme, restoreModernTheme, themeFromSettings, type ThemeSettings } from "./modern/theme";
import { applyTheme, restoreTheme, themeFromSettings as markdownThemeFrom } from "../markdown/ui/theme";

export type Platform = "windows" | "linux" | "macos" | "other";
export type Design = "classic" | "modern" | "markdown";

function detect(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "other";
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Dev builds only: `localStorage["doit.dev-platform"] = "windows"` previews another OS's UI. */
const devPlatform = import.meta.env.DEV ? (readStorage("doit.dev-platform") as Platform | null) : null;

export const platform: Platform = devPlatform ?? detect();
export const isLinux = platform === "linux";

/** The ILOVEMARKDOWN flag can be turned on in Settings; modern is the default everywhere. */
export const designIsOptional = true;

export function designFor(_os: Platform, setting: string | null | undefined): Design {
  return setting === "markdown" ? "markdown" : "modern";
}

/** The saved `design` setting, cached so the first paint knows it before settings load. */
export const DESIGN_CACHE_KEY = "doit.design";

export const design: Design = designFor(platform, readStorage(DESIGN_CACHE_KEY));
/** The default design's components ask this; they never render under ILOVEMARKDOWN. */
export const isModern = true;
/** The ILOVEMARKDOWN feature flag is on for this run. */
export const isMarkdown = design === "markdown";

/** The classic value, or the modern one when this window uses the modern design. */
export function pick<T>(_classic: T, modern: T): T {
  return modern;
}

/** Runs before React renders, so the first paint already has the right styles and theme. */
export function markPlatform(): void {
  const root = document.documentElement;
  root.dataset.platform = platform;
  root.dataset.design = design;
  if ("__TAURI_INTERNALS__" in window) trackPillLook(isMarkdown);
  if (isMarkdown) restoreTheme();
  else restoreModernTheme();
  if (isLinux && !window.location.search.includes("window=tray")) trackWindowFrame();
}

/** Which run of DoIT last settled the design cache (see `settleDesign`). */
const DESIGN_RUN_KEY = "doit.design-run";

/**
 * One design per run: the first window of a launch copies the saved `design` setting into the
 * cache, and every window of that run, opened before or after, loads the cached design. A setting
 * changed mid-run waits for the next launch.
 */
function settleDesign(saved: Design): void {
  void tauriApi.launchId().then((run) => {
    if (!run) return;
    if (readStorage(DESIGN_RUN_KEY) !== run) {
      try {
        localStorage.setItem(DESIGN_CACHE_KEY, saved);
        localStorage.setItem(DESIGN_RUN_KEY, run);
      } catch {
        /* without storage this window keeps the design it loaded */
      }
    }
    // Compared with what is stored, not what was written, so broken storage never loops.
    if (designFor(platform, readStorage(DESIGN_CACHE_KEY)) !== design) window.location.reload();
  });
}

/**
 * Applies the saved look once settings load. The classic design themes itself through
 * `theme_mode`; the modern one through `palette`, `appearance`, `glass` and `boxy`.
 */
export function applyThemeSettings(settings: ThemeSettings & { design?: string | null }): void {
  if (designIsOptional) settleDesign(designFor(platform, settings.design));
  if (isMarkdown) applyTheme(markdownThemeFrom(settings));
  else applyModernTheme(themeFromSettings(settings));
}

/** UI copy that the modern design words differently. */
export const text = {
  newCategory: pick("New category", "New shelf"),
  categoryPlaceholder: pick("Category name...", "Shelf name"),
  emptyShelf: pick("Nothing on this shelf yet.", "No notes on this shelf."),
  emptyShelfAction: pick("Click to write the first one", "New note"),
  noNotes: pick("An empty canvas. Write the first note and it will find a shelf.", "No notes yet."),
  openNoteToWrite: pick("Open to start writing.", "Empty note"),
  loadingWorkspace: pick("Opening the workspace…", "Loading notes…"),
};
