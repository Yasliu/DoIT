/**
 * The dock pill is drawn natively (no webview runs while DoIT sits in the dock as a pill), but its
 * look still comes from CSS: a hidden probe styled exactly like the pill is measured here and the
 * result handed to the backend whenever the design or theme changes.
 */

import { tauriApi, type PillLook } from "../api/tauriBridge";

/** The pill's markup. The modern design restyles it through `[data-slot="pill"]` in modern.css. */
const PILL_CLASS =
  "box-border flex h-[38px] w-[172px] items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-2xl border border-white/10 text-ink-1";
const LABEL_CLASS = "text-[13px] font-semibold leading-none tracking-[0.02em] text-white/85 whitespace-nowrap";

let sample: CanvasRenderingContext2D | null = null;

/** Any CSS colour (oklab, color-mix, ...) as straight 8-bit RGBA, by painting it once. */
function rgba(color: string): [number, number, number, number] {
  sample ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!sample) return [0, 0, 0, 0];
  sample.clearRect(0, 0, 1, 1);
  sample.fillStyle = "#0000";
  sample.fillStyle = color;
  sample.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = sample.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a];
}

function measure(): PillLook {
  const pill = document.createElement("div");
  pill.dataset.slot = "pill";
  pill.className = PILL_CLASS;
  pill.style.cssText =
    "position:fixed;left:-9999px;top:0;background-color:var(--theme-tray-bg);box-shadow:inset 0 0 0 1px var(--theme-tray-border)";
  const label = document.createElement("span");
  label.className = LABEL_CLASS;
  label.textContent = "DoIT";
  pill.appendChild(label);
  document.body.appendChild(pill);
  const box = getComputedStyle(pill);
  const text = getComputedStyle(label);
  const look: PillLook = {
    width: pill.offsetWidth,
    height: pill.offsetHeight,
    radius: parseFloat(box.borderTopLeftRadius) || 0,
    background: rgba(box.backgroundColor),
    border: rgba(box.borderTopColor),
    border_width: parseFloat(box.borderTopWidth) || 0,
    text: rgba(text.color),
    letter_spacing: parseFloat(text.letterSpacing) || 0,
  };
  pill.remove();
  return look;
}

let queued = false;

/** Measures the pill after the current styles settle and reports it (at most once per frame). */
export function reportPillLook(): void {
  if (queued || !document.body) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void tauriApi.setPillLook(measure());
  });
}

/** Reports the look now and again whenever the theme or design on <html> changes. */
export function trackPillLook(): void {
  reportPillLook();
  new MutationObserver(reportPillLook).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-design", "data-appearance", "data-palette", "data-glass", "data-shape"],
  });
}
