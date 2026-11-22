import { useEffect, useRef } from "react";

/**
 * Floating layers (dialogs, menus, palettes) stack: Escape and outside clicks belong to the top one
 * only, so a menu over the note sheet closes the menu and not the sheet.
 */
type Layer = { id: number; onEscape: () => void };
const stack: Layer[] = [];
let nextId = 1;
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || stack.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  stack[stack.length - 1].onEscape();
}

/** Registers a layer while mounted; `onEscape` runs when Escape is pressed and it is on top. */
export function useLayer(onEscape: () => void): { isTop: () => boolean } {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  const id = useRef(0);
  useEffect(() => {
    const layer = { id: nextId++, onEscape: () => handler.current() };
    id.current = layer.id;
    stack.push(layer);
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    return () => {
      const at = stack.findIndex((l) => l.id === layer.id);
      if (at >= 0) stack.splice(at, 1);
    };
  }, []);
  return { isTop: () => stack.length > 0 && stack[stack.length - 1].id === id.current };
}

/** Whether any floating layer is open: window-wide shortcuts wait while one is. */
export function anyLayerOpen(): boolean {
  return stack.length > 0;
}
