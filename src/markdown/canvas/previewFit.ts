import { useLayoutEffect } from "react";

/**
 * A card's preview: as tall as its note up to a cap of `lines` lines (plus `extra` px for figures),
 * stretched to fill a card its grid row made taller, and cut after the last line that fits whole.
 */
export function useFitPreview(el: HTMLElement | null, lines: number, extra: number): void {
  useLayoutEffect(() => {
    if (!el) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const box = el.getBoundingClientRect();
      // Layout px, whatever transform a press or drag puts on the card.
      const scale = el.offsetHeight ? box.height / el.offsetHeight : 0;
      if (!scale) return;
      const blocks = measure(el, box.top, scale);
      const content = blocks.reduce((end, block) => Math.max(end, block.bottom), 0);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
      el.style.minHeight = `${Math.min(content, lines * lineHeight + extra)}px`;
      const cut = cleanCut(blocks, el.clientHeight);
      el.style.clipPath = cut === null ? "" : `inset(0 0 ${el.clientHeight - cut}px 0)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    // The box resizes with its card; blocks resize as fonts load and figures draw.
    const resized = new ResizeObserver(schedule);
    const observe = () => {
      resized.disconnect();
      resized.observe(el);
      for (const child of el.children) resized.observe(child);
    };
    const replaced = new MutationObserver(() => {
      observe();
      schedule();
    });
    fit();
    observe();
    replaced.observe(el, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      replaced.disconnect();
    };
  }, [el, lines, extra]);
}

/** A block of the preview in px from its top; text blocks can be cut between their lines. */
export interface Block {
  top: number;
  bottom: number;
  /** Where its first line starts, past padding, and how tall each line is; null for a figure, table or image. */
  lines: { start: number; height: number } | null;
}

/**
 * Where a preview `room` px tall should end so no line shows cut in half: after the last block that
 * fits, or after the last whole line of a text block that runs past the edge. A figure or table
 * that does not fit is left out whole. Null when everything fits.
 */
export function cleanCut(blocks: Block[], room: number): number | null {
  const slack = 0.5;
  if (blocks.every((block) => block.bottom <= room + slack)) return null;
  let cut = 0;
  for (const block of [...blocks].sort((a, b) => a.top - b.top)) {
    if (block.bottom <= room + slack) {
      cut = Math.max(cut, block.bottom);
      continue;
    }
    if (block.top < room && block.lines && block.lines.height > 0) {
      const whole = Math.floor((room - block.lines.start + slack) / block.lines.height);
      if (whole > 0) cut = block.lines.start + whole * block.lines.height;
    }
    break;
  }
  // Nothing fits whole (one tall figure, say): show what there is room for.
  return cut > 0 ? cut : room;
}

const NOT_TEXT = ".md-figure, .md-tablewrap, .md-pre, pre, table, hr, .md-hr";

function measure(el: HTMLElement, top: number, scale: number): Block[] {
  const at = (rect: DOMRect) => ({ top: (rect.top - top) / scale, bottom: (rect.bottom - top) / scale });
  const children = [...el.children] as HTMLElement[];
  if (children.length === 0) {
    // Plain text (the raw preview): one block of lines.
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    if (!rect.height) return [];
    const { top: start, bottom } = at(rect);
    return [{ top: start, bottom, lines: { start, height: parseFloat(getComputedStyle(el).lineHeight) } }];
  }
  return children.map((child) => {
    const { top: start, bottom } = at(child.getBoundingClientRect());
    const text = !child.matches(NOT_TEXT) && !child.querySelector(`img, ${NOT_TEXT}`);
    const style = getComputedStyle(child);
    const height = parseFloat(style.lineHeight);
    const lines = text && height > 0 ? { start: start + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0), height } : null;
    return { top: start, bottom, lines };
  });
}
