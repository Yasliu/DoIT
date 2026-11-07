import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * The canvas window is undecorated, so Linux draws a rounded, hairline-bordered frame itself.
 * Maximized or fullscreen, the window meets the screen edges and the frame goes square.
 */
export function trackWindowFrame(): void {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const win = getCurrentWindow();
  const sync = async () => {
    const edgeToEdge = (await win.isMaximized().catch(() => false)) || (await win.isFullscreen().catch(() => false));
    document.documentElement.toggleAttribute("data-maximized", edgeToEdge);
  };
  void sync();
  void win.onResized(() => void sync());
}
