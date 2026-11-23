import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from "react";

/**
 * A card that opens while the pointer is over its trigger or the card itself, or while either has
 * keyboard focus (a mouse click's focus does not hold it open). Spread `props` on both elements
 * (or on one wrapper around both); a short delay lets the pointer cross the gap between them.
 * Escape closes it and brings focus back to `trigger`. Give the card `cardId` and the trigger
 * `aria-controls={cardId}` and `aria-expanded={open}`.
 */
export function useHoverCard(trigger: RefObject<HTMLElement | null>, closeDelay = 160) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(0);
  const refocusing = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerEnter = useCallback(() => {
    window.clearTimeout(timer.current);
    setHovered(true);
  }, []);
  const onPointerLeave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovered(false), closeDelay);
  }, [closeDelay]);
  const onFocus = useCallback((e: FocusEvent<HTMLElement>) => {
    // Escape moved focus back to the trigger: that is not a request to open again.
    if (refocusing.current) refocusing.current = false;
    else if (e.target.matches(":focus-visible")) setFocused(true);
  }, []);
  const onBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      // Focus moving between the trigger and the card keeps it open.
      const next = e.relatedTarget instanceof Element ? e.relatedTarget.closest("[data-hover-card]") : null;
      if (next?.getAttribute("data-hover-card") !== id) setFocused(false);
    },
    [id],
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Escape") return;
      setHovered(false);
      setFocused(false);
      // Focus inside the card would fall to the page as the card goes.
      if (trigger.current && document.activeElement !== trigger.current) {
        refocusing.current = true;
        trigger.current.focus();
      }
    },
    [trigger],
  );

  return {
    open: hovered || focused,
    cardId: `${id}card`,
    props: { "data-hover-card": id, onPointerEnter, onPointerLeave, onFocus, onBlur, onKeyDown },
  };
}
