import { useCallback, useEffect, useState } from "react";
import { useNoteZoomListeners } from "../../editor/useNoteEditor";

export interface Zoom {
  value: number;
  /** Steps by `delta` percent, clamped to 60–200. */
  adjust: (delta: number) => void;
  reset: () => void;
}

function read(key: string): number {
  try {
    const saved = parseInt(localStorage.getItem(key) ?? "", 10);
    if (saved >= 60 && saved <= 200) return saved;
  } catch {
    /* no storage: start at 100% */
  }
  return 100;
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* the zoom still applies in this window */
  }
}

/**
 * A note's zoom, remembered under `key`: Ctrl + and Ctrl − step it, Ctrl 0 resets, and Ctrl+wheel
 * or a pinch zoom while `enabled`.
 */
export function useZoom(key: string, enabled: boolean): Zoom {
  const [value, setValue] = useState(() => read(key));

  const adjust = useCallback(
    (delta: number) =>
      setValue((prev) => {
        const next = Math.max(60, Math.min(200, Math.round((prev + delta) / 10) * 10));
        write(key, next);
        return next;
      }),
    [key],
  );
  const reset = useCallback(() => {
    setValue(100);
    write(key, 100);
  }, [key]);

  useNoteZoomListeners(enabled, adjust);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const step =
        e.key === "=" || e.key === "+" || e.code === "NumpadAdd" || e.code === "Equal"
          ? 10
          : e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" || e.code === "Minus"
            ? -10
            : 0;
      if (step) {
        e.preventDefault();
        e.stopPropagation();
        adjust(step);
      } else if (e.key === "0" || e.code === "Numpad0" || e.code === "Digit0") {
        e.preventDefault();
        e.stopPropagation();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, adjust, reset]);

  return { value, adjust, reset };
}
