/**
 * The frontend's one platform seam. Windows keeps DoIT's original look; Linux gets its own
 * presentation layer (`./linux/`): themes, typography and copy. Components never sniff the OS
 * themselves: they use `isLinux`, `pick` or `text` from here, and Linux styles hang off the
 * `data-platform="linux"` attribute that `markPlatform` puts on <html>.
 */

import { trackWindowFrame } from "./linux/frame";
import { applyLinuxTheme, restoreLinuxTheme, themeFromSettings, type ThemeSettings } from "./linux/theme";

export type Platform = "windows" | "linux" | "macos" | "other";

function detect(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "other";
}

export const platform: Platform = detect();
export const isLinux = platform === "linux";

/** The Windows value everywhere except on Linux. */
export function pick<T>(original: T, linux: T): T {
  return isLinux ? linux : original;
}

/** Runs before React renders, so the first paint already has the right styles and theme. */
export function markPlatform(): void {
  document.documentElement.dataset.platform = platform;
  if (!isLinux) return;
  restoreLinuxTheme();
  if (!window.location.search.includes("window=tray")) trackWindowFrame();
}

/** Applies the saved theme. Windows themes itself through `theme_mode`; Linux ignores that field. */
export function applyThemeSettings(settings: ThemeSettings): void {
  if (isLinux) applyLinuxTheme(themeFromSettings(settings));
}

/** UI copy that Linux words differently. */
export const text = {
  newCategory: pick("New category", "New shelf"),
  categoryPlaceholder: pick("Category name...", "Shelf name"),
  emptyShelf: pick("Nothing on this shelf yet.", "No notes on this shelf."),
  emptyShelfAction: pick("Click to write the first one", "New note"),
  noNotes: pick("An empty canvas. Write the first note and it will find a shelf.", "No notes yet."),
  openNoteToWrite: pick("Open to start writing.", "Empty note"),
  loadingWorkspace: pick("Opening the workspace…", "Loading notes…"),
  pillTitle: pick("Click to open Docking Mode · Hold and drag to move", "Open · drag to move"),
};
