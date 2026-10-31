import React from "react";

/**
 * Renders inline markdown bold and italic formatting without raw asterisks.
 */
export function renderFormattedText(text: string): React.ReactNode {
  if (!text) return text;
  const tokenRegex = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*)/g;
  const parts = text.split(tokenRegex);
  if (parts.length <= 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith("***") && part.endsWith("***") && part.length >= 6) {
      return (
        <strong key={i} className="font-bold italic text-white">
          {part.slice(3, -3)}
        </strong>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} className="font-bold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={i} className="italic text-ink-1">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

/**
 * Converts Markdown text (with **bold** and *italic*) into HTML for a contenteditable rich editor.
 */
export function inlineMarkdownToHtml(line: string): string {
  let formatted = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Replace bold+italic ***text*** -> <strong><em>text</em></strong>
  formatted = formatted.replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Replace bold **text** -> <strong>text</strong>
  formatted = formatted.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  // Replace italic *text* -> <em>text</em>
  formatted = formatted.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
  return formatted;
}

export function markdownToHtml(md: string): string {
  if (!md) return "<div><br></div>";
  return md
    .split("\n")
    .map((line) => (line ? `<div>${inlineMarkdownToHtml(line)}</div>` : "<div><br></div>"))
    .join("");
}
/**
 * Converts rich contenteditable DOM back to clean Markdown without losing formatting.
 */
export function htmlToMarkdown(container: HTMLElement): string {
  const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);
  const lines: string[] = [];
  let cur = "";
  const flush = () => {
    lines.push(cur);
    cur = "";
  };

  const isTrailingBr = (el: HTMLElement): boolean => {
    let sib = el.nextSibling;
    while (sib && sib.nodeType === Node.TEXT_NODE && !(sib.textContent || "").length) sib = sib.nextSibling;
    if (sib) return false;
    const parent = el.parentElement;
    return !!parent && (parent === container || BLOCK_TAGS.has(parent.tagName.toUpperCase()));
  };

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Editors are white-space: pre-wrap, so a pasted "\n" inside a text node is a real line break
      const parts = (node.textContent || "").replace(/\u00a0/g, " ").split(/\r\n|\r|\n/);
      parts.forEach((part, i) => {
        if (i > 0) flush();
        cur += part;
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "BR") {
      // A trailing <br> inside a block is just Chrome's empty-line placeholder.
      if (!isTrailingBr(el)) flush();
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      // Block elements always begin on a fresh line (fixes nested <div> merging into the previous line)
      if (cur !== "") flush();
      const start = lines.length;
      for (const child of Array.from(el.childNodes)) walk(child);
      if (cur !== "" || lines.length === start) flush();
      return;
    }

    const isBold =
      tag === "STRONG" ||
      tag === "B" ||
      el.style.fontWeight === "bold" ||
      parseInt(el.style.fontWeight, 10) >= 600;
    const isItalic = tag === "EM" || tag === "I" || el.style.fontStyle === "italic";

    const before = cur;
    const startLines = lines.length;
    for (const child of Array.from(el.childNodes)) walk(child);

    if ((isBold || isItalic) && lines.length === startLines) {
      const inner = cur.slice(before.length);
      const trimmed = inner.trim();
      if (trimmed) {
        const lead = inner.match(/^\s*/)?.[0] || "";
        const trail = inner.match(/\s*$/)?.[0] || "";
        const mark = isBold && isItalic ? "***" : isBold ? "**" : "*";
        cur = `${before}${lead}${mark}${trimmed}${mark}${trail}`;
      }
    }
  };

  for (const child of Array.from(container.childNodes)) walk(child);
  if (cur !== "") flush();

  return lines.join("\n");
}
/**
 * Toggles bold in the active contenteditable editor or fallback input.
 */
export function toggleRichBold(): void {
  document.execCommand("bold", false);
}

/**
 * Toggles italic in the active contenteditable editor or fallback input.
 */
export function toggleRichItalic(): void {
  document.execCommand("italic", false);
}

/**
 * Queries whether bold is active at the current selection / caret position.
 */
export function isRichBoldActive(): boolean {
  try {
    return document.queryCommandState("bold");
  } catch {
    return false;
  }
}

/**
 * Queries whether italic is active at the current selection / caret position.
 */
export function isRichItalicActive(): boolean {
  try {
    return document.queryCommandState("italic");
  } catch {
    return false;
  }
}

/**
 * Intercepts Enter and Backspace keydown events in contenteditable note editors:
 * 1. Empty Bullet Breakout on Enter: clears bullet prefix on empty bullet lines and pins caret on current line.
 * 2. Bullet De-indentation on Backspace: strips bullet prefix and keeps caret on same line as plain text.
 * 3. Bullet continuation on Enter: auto-prefixes next line with bullet if text exists.
 * Returns true if the event was handled and caller should call onInput.
 */
export function handleRichEditorKeyDown(
  e: React.KeyboardEvent<HTMLDivElement>,
  editor: HTMLElement,
  onInput: () => void,
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  const findCurrentLineElement = (): HTMLElement => {
    let node: Node | null = range.startContainer;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && node.parentNode === editor) {
        return node as HTMLElement;
      }
      node = node.parentNode;
    }
    if (range.startContainer === editor) {
      const child = editor.childNodes[range.startOffset];
      if (child && child.nodeType === Node.ELEMENT_NODE) {
        return child as HTMLElement;
      }
    }
    return (range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement || editor) as HTMLElement;
  };

  const lineEl = findCurrentLineElement();
  const lineText = lineEl ? (lineEl.textContent || "") : "";

  // Check for markdown bullet prefix (- , * , • )
  const bulletMatch = lineText.match(/^(\s*[-*•]\s+)(.*)$/);
  const isBareBullet = /^\s*[-*•]\s*$/.test(lineText);

  if (e.key === "Enter") {
    // 1. EMPTY BULLET LINE BREAKOUT LOGIC:
    // If the current line contains exactly a markdown bullet prefix but holds zero text content after it:
    if ((bulletMatch && bulletMatch[2].trim() === "") || (isBareBullet && lineText.trim().length > 0)) {
      e.preventDefault();
      // Completely clear markdown bullet characters and keep cursor on the current line as normal text
      if (lineEl === editor) {
        lineEl.innerHTML = "<div><br></div>";
        const target = lineEl.firstElementChild || lineEl;
        const newRange = document.createRange();
        newRange.setStart(target, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        lineEl.innerHTML = "<br>";
        const newRange = document.createRange();
        newRange.setStart(lineEl, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      onInput();
      return true;
    } else if (bulletMatch) {
      // Continuation of bullet list onto next line
      e.preventDefault();
      const bulletPrefix = bulletMatch[1];
      document.execCommand("insertParagraph", false);
      document.execCommand("insertText", false, bulletPrefix);
      onInput();
      return true;
    }
  }

  if (e.key === "Backspace") {
    // 2. BULLET DE-INDENTATION STATE ENGINE:
    // If cursor position is right after markdown bullet prefix, and text content of that bullet line is completely empty:
    if (sel.isCollapsed && isBareBullet && lineText.trim().length > 0) {
      e.preventDefault();
      // Strip markdown bullet prefix cleanly and keep active cursor pinned on same line
      if (lineEl === editor) {
        lineEl.innerHTML = "<div><br></div>";
        const target = lineEl.firstElementChild || lineEl;
        const newRange = document.createRange();
        newRange.setStart(target, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        lineEl.innerHTML = "<br>";
        const newRange = document.createRange();
        newRange.setStart(lineEl, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      onInput();
      return true;
    }
  }

  return false;
}

const BULLET_PREFIX = /^\s*[-*•]\s+/;
const bulletKey = (noteId: string) => `doit.bullets.${noteId}`;

function loadBulletMemory(noteId?: string): Record<string, string> {
  if (!noteId) return {};
  try {
    return JSON.parse(window.localStorage.getItem(bulletKey(noteId)) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveBulletMemory(noteId: string | undefined, memory: Record<string, string>) {
  if (!noteId) return;
  try {
    if (Object.keys(memory).length === 0) window.localStorage.removeItem(bulletKey(noteId));
    else window.localStorage.setItem(bulletKey(noteId), JSON.stringify(memory));
  } catch {
    /* storage unavailable: bullets simply won't be remembered */
  }
}

/**
 * Converts note lines between plain-text and checklist mode without merging or inventing lines:
 * every non-empty line maps 1:1 to an item; blank lines are dropped (one blank item is kept if nothing remains).
 * Bullet prefixes stripped when going to a checklist are remembered per note (by line id) and put back
 * when converting back to text.
 */
export function convertContentMode(
  content: { id: string; text: string; is_todo: boolean; completed: boolean }[],
  toTodo: boolean,
  noteId?: string,
): { id: string; text: string; is_todo: boolean; completed: boolean }[] {
  const memory = loadBulletMemory(noteId);

  const cleaned = content
    .flatMap((c) => c.text.split(/\r?\n/).map((text, i) => ({ c, text, i })))
    .map(({ c, text, i }) => {
      const id = i === 0 ? c.id : `${c.id}_${i}`;
      let out = text;
      if (toTodo) {
        const match = text.match(BULLET_PREFIX);
        if (match) {
          memory[id] = match[0];
          out = text.slice(match[0].length);
        }
      } else if (memory[id] && out.trim().length > 0 && !BULLET_PREFIX.test(out)) {
        out = memory[id] + out;
        delete memory[id];
      }
      return { id, text: out, is_todo: toTodo, completed: toTodo ? c.completed : false };
    })
    .filter((c) => c.text.trim().length > 0);

  saveBulletMemory(noteId, memory);

  if (cleaned.length > 0) return cleaned;
  const base = content[0];
  return [{ id: base?.id ?? "line_0", text: "", is_todo: toTodo, completed: false }];
}