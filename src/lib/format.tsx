import React from "react";

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
 * Applies markdown wrapping (e.g. ** for bold, * for italic) to the currently focused input or textarea.
 * If text is selected, wraps or unwraps it.
 * If no text is selected, inserts prefix+suffix and places cursor in the middle so subsequent typing is formatted.
 */
export function applyWrapToActiveElement(prefix: string, suffix: string = prefix): boolean {
  let el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) {
    // If focus was lost due to clicking toolbar button, query the visible note textarea or active input
    el = document.querySelector('textarea:not([disabled]), .line-input:focus, .line-input') as HTMLInputElement | HTMLTextAreaElement | null;
  }
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) {
    return false;
  }

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const val = el.value;
  const selected = val.substring(start, end);
  const before = val.substring(0, start);
  const after = val.substring(end);

  const prefixLen = prefix.length;
  const suffixLen = suffix.length;

  // Check if selected text is already wrapped
  if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length >= prefixLen + suffixLen
  ) {
    const unwrapped = selected.substring(prefixLen, selected.length - suffixLen);
    const nextVal = before + unwrapped + after;
    el.value = nextVal;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(start, start + unwrapped.length);
    el.focus();
    return true;
  }

  // Check if text immediately surrounding selection is wrapped
  if (
    start >= prefixLen &&
    end + suffixLen <= val.length &&
    val.substring(start - prefixLen, start) === prefix &&
    val.substring(end, end + suffixLen) === suffix
  ) {
    const nextVal = val.substring(0, start - prefixLen) + selected + val.substring(end + suffixLen);
    el.value = nextVal;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(start - prefixLen, end - prefixLen);
    el.focus();
    return true;
  }

  // Wrap or insert
  const wrapped = prefix + selected + suffix;
  const nextVal = before + wrapped + after;
  el.value = nextVal;
  el.dispatchEvent(new Event("input", { bubbles: true }));

  if (start === end) {
    // Cursor placed in the middle so typing starts inside bold/italic
    el.setSelectionRange(start + prefixLen, start + prefixLen);
  } else {
    el.setSelectionRange(start, start + wrapped.length);
  }
  el.focus();
  return true;
}
