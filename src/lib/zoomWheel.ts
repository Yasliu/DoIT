import { isLinux } from "../platform";

type WheelHandler = (event: WheelEvent) => void;

/** How long a pinch stays armed after its last wheel event (a pinch sends no key press). */
const PINCH_HOLD_MS = 400;

/**
 * Listens for Ctrl+wheel (and touchpad pinch) so a handler can cancel the browser's page zoom.
 *
 * A wheel listener that may cancel makes the page wait for script before every scroll step, and
 * WebKitGTK then scrolls on the main thread for the whole page. So on Linux the cancelling
 * listener is attached only while Ctrl or Meta is held, or for a moment after a pinch's wheel
 * events started (read through a listener that cannot cancel). Windows' WebView2 keeps it
 * attached: its pinch arrives as Ctrl+wheel with no key held, and the first event must be caught.
 */
export function listenZoomWheel(handler: WheelHandler): () => void {
  if (!isLinux) {
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }

  let attached = false;
  let keyHeld = false;
  let timer = 0;
  const attach = () => {
    if (attached) return;
    attached = true;
    window.addEventListener("wheel", handler, { passive: false, capture: true });
  };
  const detach = () => {
    window.clearTimeout(timer);
    if (!attached || keyHeld) return;
    attached = false;
    window.removeEventListener("wheel", handler, { capture: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Control" && event.key !== "Meta") return;
    keyHeld = event.type === "keydown";
    if (keyHeld) attach();
    else timer = window.setTimeout(detach, 0);
  };
  const onBlur = () => {
    keyHeld = false;
    detach();
  };
  const onProbe = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    attach();
    window.clearTimeout(timer);
    timer = window.setTimeout(detach, PINCH_HOLD_MS);
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("wheel", onProbe, { passive: true, capture: true });
  return () => {
    keyHeld = false;
    detach();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("wheel", onProbe, { capture: true });
  };
}
