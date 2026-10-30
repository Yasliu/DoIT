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
export function markdownToHtml(md: string): string {
  if (!md) return "<div><br></div>";
  const lines = md.split("\n");
  const htmlLines = lines.map((line) => {
    if (!line) return "<div><br></div>";
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

    return `<div>${formatted}</div>`;
  });

  return htmlLines.join("");
}

/**
 * Converts rich contenteditable DOM back to clean Markdown without losing formatting.
 */
export function htmlToMarkdown(container: HTMLElement): string {
  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "BR") {
      return "\n";
    }

    let inner = "";
    for (const child of Array.from(el.childNodes)) {
      inner += processNode(child);
    }

    const isBold =
      tag === "STRONG" ||
      tag === "B" ||
      el.style.fontWeight === "bold" ||
      parseInt(el.style.fontWeight, 10) >= 600;

    const isItalic =
      tag === "EM" ||
      tag === "I" ||
      el.style.fontStyle === "italic";

    if (isBold && isItalic) {
      const trimmed = inner.trim();
      if (trimmed) {
        const lead = inner.match(/^\s*/)?.[0] || "";
        const trail = inner.match(/\s*$/)?.[0] || "";
        return `${lead}***${trimmed}***${trail}`;
      }
    } else if (isBold) {
      const trimmed = inner.trim();
      if (trimmed) {
        const lead = inner.match(/^\s*/)?.[0] || "";
        const trail = inner.match(/\s*$/)?.[0] || "";
        return `${lead}**${trimmed}**${trail}`;
      }
    } else if (isItalic) {
      const trimmed = inner.trim();
      if (trimmed) {
        const lead = inner.match(/^\s*/)?.[0] || "";
        const trail = inner.match(/\s*$/)?.[0] || "";
        return `${lead}*${trimmed}*${trail}`;
      }
    }

    if (tag === "DIV" || tag === "P") {
      return inner + "\n";
    }

    return inner;
  }

  let result = "";
  for (const child of Array.from(container.childNodes)) {
    result += processNode(child);
  }

  // Normalize newlines
  const normalized = result.replace(/\r\n/g, "\n");
  // Remove single trailing newline added by last div
  return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
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
