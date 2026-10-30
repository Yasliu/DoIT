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
