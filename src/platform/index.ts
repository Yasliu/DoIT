/**
 * The frontend's one platform seam. It answers two questions, and components ask it rather than
 * sniffing anything themselves:
 *
 * - Which OS (`platform`, `isLinux`): only for real OS behaviour, such as GNOME wording, the window
 *   frame Linux draws itself and WebKitGTK workarounds.
 * - Which design (`design`, `isModern`, `pick`, `text`): "classic" is DoIT's original look;
 *   "modern" is the layer in `./modern/`. Linux always uses modern; Windows uses it only when the
 *   experimental `design` setting says so.
 *
 * `markPlatform` writes both on <html> as `data-platform` and `data-design` before React renders.
 * Modern styles hang off `html[data-design="modern"]`, so the classic design never matches them.
 */

import { listen } from "@tauri-apps/api/event";
import { trackWindowFrame } from "./modern/frame";
import { trackPillLook } from "./pillLook";
import { applyModernTheme, restoreModernTheme, themeFromSettings, type ThemeSettings } from "./modern/theme";

export type Platform = "windows" | "linux" | "macos" | "other";
export type Design = "classic" | "modern";

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

/** Modern is now the official and only design across all platforms. */
export const designIsOptional = false;

export function designFor(_os: Platform, _setting: string | null | undefined): Design {
  return "modern";
}

/** The saved `design` setting, cached so the first paint knows it before settings load. */
export const DESIGN_CACHE_KEY = "doit.design";
export const DESIGN_CHANGED_EVENT = "doit://design-changed";

export const design: Design = "modern";
export const isModern = true;

/** The classic value, or the modern one when this window uses the modern design. */
export function pick<T>(_classic: T, modern: T): T {
  return modern;
}

/** Runs before React renders, so the first paint already has the right styles and theme. */
export function markPlatform(): void {
  const root = document.documentElement;
  root.dataset.platform = platform;
  root.dataset.design = design;
  // The canvas and the dock are separate windows; a design switch in one reloads both.
  if ("__TAURI_INTERNALS__" in window) {
    void listen(DESIGN_CHANGED_EVENT, () => window.location.reload());
    trackPillLook();
  }
  if (!isModern) return;
  restoreModernTheme();
  if (isLinux && !window.location.search.includes("window=tray")) trackWindowFrame();
}

/**
 * Applies the saved look once settings load. The classic design themes itself through
 * `theme_mode`; the modern one through `palette`, `appearance`, `glass` and `boxy`.
 * If the cached design disagrees with the saved one (a cleared WebView profile), the cache is
 * corrected and the window reloads once.
 */
export function applyThemeSettings(settings: ThemeSettings & { design?: string | null }): void {
  if (designIsOptional) {
    const saved = settings.design === "modern" ? "modern" : "classic";
    if (readStorage(DESIGN_CACHE_KEY) !== saved) {
      try {
        localStorage.setItem(DESIGN_CACHE_KEY, saved);
      } catch {
        /* without storage the cache cannot settle, so never reload over it */
      }
      if (readStorage(DESIGN_CACHE_KEY) === saved && designFor(platform, saved) !== design) {
        window.location.reload();
        return;
      }
    }
  }
  if (isModern) applyModernTheme(themeFromSettings(settings));
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
