import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ContentItem } from "../api/tauriBridge";
import { getMarkdownShortcuts, matchesCombo } from "./shortcuts";
import { EMOJI_MAP } from "./emoji";
import { INDENT_STEP, indentWidth, layoutLists, type ListLine, type ListPlace } from "./listLayout";

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
const IMAGE_MD = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
const IMAGE_REF_MD = /!\[([^\]\n]*)\]\[([^\]\n]+)\]/g;

export async function copyImageToClipboard(src: string): Promise<boolean> {
  if (!src) return false;
  try {
    let blob: Blob | null = null;
    if (src.startsWith("data:image/png;base64,")) {
      const b64 = src.slice("data:image/png;base64,".length);
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: "image/png" });
    } else if (src.startsWith("data:")) {
      blob = await new Promise<Blob | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const cvs = document.createElement("canvas");
          cvs.width = img.naturalWidth || img.width;
          cvs.height = img.naturalHeight || img.height;
          const ctx = cvs.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          cvs.toBlob((b) => resolve(b), "image/png");
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    } else {
      try {
        const resp = await fetch(src);
        const fetchedBlob = await resp.blob();
        if (fetchedBlob.type === "image/png") {
          blob = fetchedBlob;
        } else {
          const bitmap = await createImageBitmap(fetchedBlob);
          const cvs = document.createElement("canvas");
          cvs.width = bitmap.width;
          cvs.height = bitmap.height;
          const ctx = cvs.getContext("2d");
          ctx?.drawImage(bitmap, 0, 0);
          blob = await new Promise<Blob | null>((resolve) => {
            cvs.toBlob((b) => resolve(b), "image/png");
          });
        }
      } catch {
        blob = null;
      }
    }

    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch (err) {
    console.error("Failed to copy image to clipboard:", err);
    return false;
  }
}

export function insertInlineImageAtCaret(editor: HTMLElement, base64OrUrl: string, alt = "Pasted Image"): void {
  let maxN = 0;
  const imgs = Array.from(editor.querySelectorAll("img[data-ref]"));
  imgs.forEach((img) => {
    const m = (img.getAttribute("data-ref") || "").match(/^img-(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  const text = editor.innerText || editor.textContent || "";
  const matches = text.matchAll(/\[img-(\d+)\]/g);
  for (const m of matches) {
    maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  const nextId = `img-${maxN + 1}`;

  const img = createImage(base64OrUrl, alt);
  img.setAttribute("data-ref", nextId);
  img.setAttribute("data-md", `![${alt}][${nextId}]`);
  placeImageAtCaret(editor, img);
}

function createImage(src: string, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "md-img";
  img.contentEditable = "false";
  img.draggable = false;
  img.alt = alt;
  img.src = src;
  return img;
}

/** Alt text that cannot end the image's Markdown early. */
function safeAlt(alt: string): string {
  return alt.replace(/[[\]]/g, " ").trim() || "Image";
}

/** Inserts an image saved next to the notes, linked by its relative `path`. */
export function insertSavedImageAtCaret(editor: HTMLElement, path: string, alt: string): void {
  const label = safeAlt(alt);
  const img = createImage(resolveImageSrc(path) ?? path, label);
  img.setAttribute("data-md", `![${label}](${path})`);
  placeImageAtCaret(editor, img);
}

/** The plain-text counterpart of `insertSavedImageAtCaret`. */
export function insertSavedImageInMarkdown(md: string, path: string, caretPos: number, alt: string): { text: string; newCaret: number } {
  const before = md.slice(0, caretPos);
  const segment = `${before.length > 0 && !before.endsWith("\n") ? "\n" : ""}![${safeAlt(alt)}](${path})\n`;
  return { text: `${before}${segment}${md.slice(caretPos)}`, newCaret: caretPos + segment.length };
}

/** The image's Markdown with new alt text, keeping its link exactly as the note wrote it. */
export function imageMarkdownWithAlt(img: HTMLImageElement, alt: string): string {
  const current = img.getAttribute("data-md") ?? "";
  const target = current.match(/^!\[[^\]]*\](\(.*\)|\[.*\])$/)?.[1];
  return `![${safeAlt(alt)}]${target ?? `(${img.getAttribute("src") ?? ""})`}`;
}

function placeImageAtCaret(editor: HTMLElement, img: HTMLImageElement): void {
  const nextLine = document.createElement("div");
  const br = document.createElement("br");
  nextLine.appendChild(br);

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).startContainer)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();

    let block: Node | null = range.startContainer;
    while (block && block.parentNode !== editor && block !== editor) {
      block = block.parentNode;
    }

    if (block && block !== editor && block.parentNode === editor) {
      range.insertNode(img);
      block.parentNode.insertBefore(nextLine, block.nextSibling);
    } else {
      range.insertNode(img);
      img.after(nextLine);
    }

    const newRange = document.createRange();
    newRange.setStart(nextLine, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    const imgDiv = document.createElement("div");
    imgDiv.appendChild(img);
    editor.appendChild(imgDiv);
    editor.appendChild(nextLine);

    if (sel) {
      const newRange = document.createRange();
      newRange.setStart(nextLine, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }
}

export function insertInlineImageInMarkdown(
  md: string,
  base64OrUrl: string,
  caretPos: number,
  alt = "Pasted Image"
): { text: string; newCaret: number } {
  let maxN = 0;
  const matches = md.matchAll(/\[img-(\d+)\]/g);
  for (const m of matches) {
    maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  const nextId = `img-${maxN + 1}`;
  const tag = `![${alt}][${nextId}]`;

  const before = md.slice(0, caretPos);
  const after = md.slice(caretPos);

  const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const insertedSegment = `${prefix}${tag}\n`;
  const newTagInserted = `${before}${insertedSegment}${after}`;
  const newDef = `[${nextId}]: ${base64OrUrl}`;
  const finalMd = `${newTagInserted.trimEnd()}\n\n${newDef}`;

  return {
    text: finalMd,
    newCaret: caretPos + insertedSegment.length,
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");

/** Maps a markdown image path to something the webview can load (Tauri asset protocol for local files). */
function resolveImageSrc(raw: string): string | null {
  const p = raw.trim().replace(/^<|>$/g, "");
  if (/^(https?:|data:image\/|blob:|asset:)/i.test(p)) return p;
  const isLocal = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || /^file:\/\//i.test(p);
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (inTauri && isLocal) return convertFileSrc(p.replace(/^file:\/\/\/?/i, ""));
  if (inTauri && markdownBaseDir && !/^[a-z][a-z0-9+.-]*:/i.test(p)) {
    return convertFileSrc(`${markdownBaseDir}/${p.replace(/^\.[\\/]/, "")}`);
  }
  return null;
}

export function openExternalUrl(url: string): void {
  if (!url) return;
  void import("@tauri-apps/plugin-opener")
    .then((m) => m.openUrl(url))
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}

export function inlineMarkdownToHtml(line: string, refMap?: Map<string, string>): string {
  // Pull images out first so their paths are never touched by other rules
  const images: string[] = [];
  let work = line.replace(IMAGE_MD, (match: string, alt: string, src: string) => {
    const url = resolveImageSrc(src);
    if (!url) return match;
    images.push(
      `<img class="md-img" contenteditable="false" draggable="false" data-md="${escapeAttr(match)}" alt="${escapeAttr(alt)}" src="${escapeAttr(url)}" />`,
    );
    return `\u0001${images.length - 1}\u0002`;
  });

  // Reference-style images: ![alt][ref-id]
  work = work.replace(IMAGE_REF_MD, (match: string, alt: string, refId: string) => {
    const rawSrc = refMap?.get(refId.trim().toLowerCase());
    const url = rawSrc ? resolveImageSrc(rawSrc) : null;
    if (!url) return match;
    images.push(
      `<img class="md-img" contenteditable="false" draggable="false" data-ref="${escapeAttr(refId.trim())}" data-md="${escapeAttr(match)}" alt="${escapeAttr(alt)}" src="${escapeAttr(url)}" />`,
    );
    return `\u0001${images.length - 1}\u0002`;
  });

  // Pull links out next: [title](url)
  const links: string[] = [];
  work = work.replace(/\[([^\]\n]+)\]\(([^)\n\s]+)\)/g, (_m: string, title: string, url: string) => {
    links.push(
      `<a class="md-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="Ctrl+Click to open: ${escapeAttr(url)}">${escapeHtml(title)}</a>`,
    );
    return `\u0003${links.length - 1}\u0004`;
  });

  let formatted = escapeHtml(work);

  // Emojis: :name: -> emoji
  formatted = formatted.replace(/:([a-z0-9_+-]+):/g, (match, name) => EMOJI_MAP[name] ?? match);

  // Footnote references: [^1]
  formatted = formatted.replace(/\[\^([^\]\n]+)\](?!:)/g, '<sup class="md-footnote-ref" data-fn="$1">[$1]</sup>');

  // Replace bold+italic ***text*** -> <strong><em>text</em></strong>
  formatted = formatted.replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Replace bold **text** -> <strong>text</strong>
  formatted = formatted.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  // Replace italic *text* -> <em>text</em>
  formatted = formatted.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
  // Replace strikethrough ~~text~~ -> <del class="md-del">$1</del>
  formatted = formatted.replace(/~~([^~\n]+?)~~/g, '<del class="md-del">$1</del>');
  // Replace highlight ===text=== or ==text== -> <mark class="md-mark">$1</mark>
  formatted = formatted.replace(/(?:===|==)([^=\n]+?)(?:===|==)/g, '<mark class="md-mark">$1</mark>');
  // Replace inline code `text` -> <code class="md-code">$2</code>
  formatted = formatted.replace(/(?<!`)([`])([^`\n]+?)\1(?!`)/g, '<code class="md-code">$2</code>');
  // Replace subscript ~text~ (single ~ not adjacent to ~)
  formatted = formatted.replace(/(?<!~)~([^~\s\n]+?)~(?!~)/g, '<sub class="md-sub">$1</sub>');
  // Replace superscript ^text^ or letter^number (e.g. x^2)
  formatted = formatted.replace(/\^([^^ \n]+?)\^/g, '<sup class="md-sup">$1</sup>');
  formatted = formatted.replace(/([a-zA-Z0-9])\^(\d+)\b/g, '$1<sup class="md-sup">$2</sup>');

  // Restore links and images
  formatted = formatted.replace(/\u0003(\d+)\u0004/g, (_m: string, i: string) => links[Number(i)] ?? "");
  return formatted.replace(/\u0001(\d+)\u0002/g, (_m: string, i: string) => images[Number(i)] ?? "");
}

// ---------------------------------------------------------------------------
// Markdown -> editable DOM. Syntax markers never appear as text: headings / bullets / quotes keep
// their marker in `data-p`, tables become real <table>s, fenced code becomes a <pre>, rules an <hr>.
// ---------------------------------------------------------------------------

let markdownBaseDir = "";
/** Folder that relative image paths (![alt](img.png)) resolve against. */
export function setMarkdownBaseDir(dir: string | null | undefined): void {
  markdownBaseDir = (dir || "").replace(/[\\/]+$/, "");
}

const CHECKBOX_HTML = `<span class="md-cb" contenteditable="false"></span>`;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

/** Detects a block prefix at the start of a source line. */
function blockPrefix(text: string, typed = false): { cls: string; prefix: string; consumed: number } | null {
  const task = text.match(/^(\s*[-*]\s+\[([ xX])\](?:\s+|$))/);
  if (task) {
    const done = task[2].toLowerCase() === "x";
    return {
      cls: done ? "md-task md-task-done" : "md-task",
      prefix: task[1].replace(/\s*$/, "") + " ",
      consumed: task[1].length,
    };
  }
  if (typed) {
    // live typing: "[] " or "[ ] " at the start of a line becomes a task
    const quick = text.match(/^\[([ xX]?)\]\s+/);
    if (quick) {
      const state = quick[1].trim() ? quick[1] : " ";
      return {
        cls: state.toLowerCase() === "x" ? "md-task md-task-done" : "md-task",
        prefix: `- [${state}] `,
        consumed: quick[0].length,
      };
    }
  }
  const ol = text.match(/^(\s*\d+\.\s+)/);
  if (ol) return { cls: "md-ol", prefix: ol[1], consumed: ol[1].length };

  const fn = text.match(/^(\[\^([^\]\n]+)\]:\s*)/);
  if (fn) return { cls: "md-footnote-def", prefix: fn[1], consumed: fn[1].length };

  const dl = text.match(/^(:{1,2}\s+)/);
  if (dl) return { cls: "md-dd", prefix: dl[1], consumed: dl[1].length };

  const h = text.match(/^(#{1,6})\s+/);
  if (h) return { cls: `md-h${h[1].length}`, prefix: h[0], consumed: h[0].length };
  const li = text.match(/^(\s*[-*\u2022]\s+)/);
  if (li) return { cls: "md-li", prefix: li[1], consumed: li[1].length };
  const q = text.match(/^(>\s?)/);
  if (q) return { cls: "md-quote", prefix: q[1], consumed: q[1].length };
  return null;
}

function parseRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

const isTableRow = (line: string) => TABLE_ROW_RE.test(line);
const isSeparator = (line: string) => isTableRow(line) && parseRow(line).every((c) => /^:?-+:?$/.test(c));
export const TABLE_META_RE = /^\s*<!--\s*doit-table:\s*(.*?)\s*-->\s*$/i;

function parseNumList(raw: string): number[] {
  return raw.split(",").map((s) => Math.max(0, Math.round(Number(s.trim()) || 0)));
}

function parseTableMeta(line: string): { cols?: number[]; rows?: number[] } | null {
  const m = line.match(TABLE_META_RE);
  if (!m) return null;
  const body = m[1];
  const colsMatch = body.match(/\bcols=([0-9]+(?:\s*,\s*[0-9]+)*)/i);
  const rowsMatch = body.match(/\brows=([0-9]+(?:\s*,\s*[0-9]+)*)/i);
  const cols = colsMatch ? parseNumList(colsMatch[1]) : undefined;
  const rows = rowsMatch ? parseNumList(rowsMatch[1]) : undefined;
  return {
    cols: cols && cols.some((v) => v > 0) ? cols : undefined,
    rows: rows && rows.some((v) => v > 0) ? rows : undefined,
  };
}

function alignOf(cell: string): string {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "c" : r ? "r" : l ? "l" : "n";
}

function tableHtml(
  header: string[],
  aligns: string[],
  rows: string[][],
  colWidths?: number[],
  rowHeights?: number[],
): string {
  const n = header.length;
  const al = Array.from({ length: n }, (_, i) => aligns[i] || "n");
  const hasCols = Boolean(colWidths && colWidths.some((w) => w > 0));
  const widths = hasCols
    ? Array.from({ length: n }, (_, i) => {
        const w = colWidths?.[i] ?? 0;
        return w > 0 ? Math.round(w) : 140;
      })
    : [];
  const totalW = widths.reduce((a, b) => a + b, 0);
  const hasRows = Boolean(rowHeights && rowHeights.some((h) => h > 0));
  const rowCount = 1 + rows.length;
  const heights = hasRows
    ? Array.from({ length: rowCount }, (_, i) => {
        const h = rowHeights?.[i] ?? 0;
        return h > 0 ? Math.round(h) : 0;
      })
    : [];

  const style = (i: number) => {
    const parts: string[] = [];
    if (al[i] === "r") parts.push("text-align:right");
    else if (al[i] === "c") parts.push("text-align:center");
    if (hasCols && totalW > 0) {
      const w = widths[i];
      const pct = ((w / totalW) * 100).toFixed(2);
      parts.push(`width:${w}px`, `--col-w:${w}px`, `--col-pct:${pct}%`);
    }
    return parts.length > 0 ? ` style="${parts.join(";")}"` : "";
  };
  const rowAttr = (rIdx: number) => {
    const h = heights[rIdx] ?? 0;
    return h > 0 ? ` data-h="${h}" style="height:${h}px;--row-h:${h}px"` : "";
  };
  const cell = (tag: string, text: string, i: number) =>
    `<${tag} contenteditable="true"${style(i)}>${inlineMarkdownToHtml(text)}</${tag}>`;
  const head = `<tr${rowAttr(0)}>${header.map((h, i) => cell("th", h, i)).join("")}</tr>`;
  const body = rows
    .map((r, rIdx) => `<tr${rowAttr(rIdx + 1)}>${Array.from({ length: n }, (_, i) => cell("td", r[i] ?? "", i)).join("")}</tr>`)
    .join("");
  const tblAttrs = [
    `class="md-tbl"`,
    `data-align="${al.join(",")}"`,
    hasCols ? `data-sized="1" data-widths="${widths.join(",")}" style="--tbl-w:${totalW}px"` : "",
    hasRows ? `data-heights="${heights.join(",")}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="md-tablewrap w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent" data-md-table="1" contenteditable="false"><table ${tblAttrs}><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function preHtml(code: string, lang: string, fence: string): string {
  const body = code ? escapeHtml(code) : "<br>";
  return `<pre class="md-pre" data-lang="${escapeAttr(lang)}" data-fence="${fence}" contenteditable="plaintext-only" spellcheck="false">${body}</pre>`;
}

export function insertCodeBlockAtCaret(editor: HTMLElement, lang = ""): void {
  const pre = firstElement(preHtml("", lang, "```"));
  if (!pre) return;
  const block = currentBlock(editor);
  if (block) {
    if (!block.textContent?.trim() && block.tagName === "DIV" && !isSpecialBlock(block)) {
      block.replaceWith(pre);
    } else {
      block.after(pre);
    }
  } else {
    editor.appendChild(pre);
  }
  ensureTrailingLine(pre);
  placeCaretStart(pre);
}

export function markdownToHtml(md: string): string {
  if (!md) return "<div><br></div>";
  const lines = md.split("\n");

  // Pre-collect reference definitions: [img-1]: data:image/png;base64,...
  const refMap = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^\s*\[([a-zA-Z0-9_\-]+)\]:\s*(\S+)\s*$/);
    if (m) {
      refMap.set(m[1].toLowerCase(), m[2]);
    }
  }

  // List lines are rendered once every line is known: their depth and number depend on their neighbours.
  const blocks: { line: ListLine; html: (place: ListPlace) => string }[] = [];
  const other = (html: string) => blocks.push({ line: { kind: "other" }, html: () => html });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    // Skip image reference definition lines from visible block rendering
    if (/^\s*\[([a-zA-Z0-9_\-]+)\]:\s*(\S+)\s*$/.test(line)) {
      continue;
    }

    if (!t) {
      other("<div><br></div>");
      continue;
    }

    const fence = t.match(/^(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      let j = i + 1;
      while (j < lines.length) {
        const c = lines[j].trim();
        if (c.length >= marker.length && c.split("").every((ch) => ch === marker[0])) break;
        j++;
      }
      other(preHtml(lines.slice(i + 1, j).join("\n"), fence[2] || "", marker[0].repeat(3)));
      i = j;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const header = parseRow(line);
      const aligns = parseRow(lines[i + 1]).map(alignOf);
      const rows: string[][] = [];
      let k = i + 2;
      while (k < lines.length && isTableRow(lines[k]) && !isSeparator(lines[k])) {
        rows.push(parseRow(lines[k]));
        k++;
      }
      let meta: { cols?: number[]; rows?: number[] } | null = null;
      if (k < lines.length && TABLE_META_RE.test(lines[k])) {
        meta = parseTableMeta(lines[k]);
        k++;
      }
      other(tableHtml(header, aligns, rows, meta?.cols, meta?.rows));
      i = k - 1;
      continue;
    }

    if (TABLE_META_RE.test(line)) {
      continue;
    }

    if (t && HR_RE.test(line)) {
      other(`<div class="md-hr" data-raw="${escapeAttr(t)}" contenteditable="false"><hr></div>`);
      continue;
    }

    const info = blockPrefix(line);
    if (info) {
      const rest = line.slice(info.consumed);
      const body = rest ? inlineMarkdownToHtml(rest, refMap) : "<br>";
      const cb = info.cls.startsWith("md-task") ? CHECKBOX_HTML : "";
      const listLine = listLineOf(info.cls, info.prefix);
      blocks.push({
        line: listLine,
        html: (place) => {
          const prefix = place.number !== undefined ? numberedPrefix(info.prefix, place.number) : info.prefix;
          const fnBadge = info.cls === "md-footnote-def" ? `<span class="md-fn-badge" contenteditable="false">${escapeHtml(prefix)}</span>` : "";
          const depth = place.depth > 0 ? ` style="--md-depth:${place.depth}"` : "";
          return `<div class="${info.cls}" data-p="${escapeAttr(prefix)}"${depth}>${cb}${fnBadge}${body}</div>`;
        },
      });
      continue;
    }

    other(line ? `<div>${inlineMarkdownToHtml(line, refMap)}</div>` : "<div><br></div>");
  }

  const places = layoutLists(blocks.map((b) => b.line));
  return blocks.map((b, i) => b.html(places[i])).join("");
}

/** How list nesting sees a block with class `cls` and prefix `prefix`. */
function listLineOf(cls: string | null | undefined, prefix: string): ListLine {
  const indent = prefix.match(/^\s*/)?.[0] ?? "";
  if (cls === "md-li") return { kind: "bullet", indent };
  if (cls?.startsWith("md-task")) return { kind: "task", indent };
  if (cls === "md-ol") return { kind: "numbered", indent, start: parseInt(prefix.match(/\d+/)?.[0] ?? "1", 10) };
  return { kind: "other" };
}

/** `prefix` (a numbered line's) showing `number` instead. */
function numberedPrefix(prefix: string, number: number): string {
  return `${prefix.match(/^\s*/)?.[0] ?? ""}${number}. `;
}

const BLOCK_SELECTOR = "div,pre,table,p,ul,ol,li,h1,h2,h3,h4,h5,h6,blockquote";

function isSpecialBlock(el: Element): boolean {
  return el.classList.contains("md-tablewrap") || el.classList.contains("md-pre") || el.hasAttribute("data-raw");
}

function currentBlock(editor: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;
  if (!editor.contains(node)) return null;
  if (node === editor) {
    return (editor.children[range.startOffset] as HTMLElement) ?? (editor.lastElementChild as HTMLElement | null);
  }
  while (node && node.parentNode !== editor) node = node.parentNode;
  return node instanceof HTMLElement ? node : null;
}

function wrapStrayNodes(editor: HTMLElement): void {
  const isStray = (n: ChildNode) =>
    n.nodeType === Node.TEXT_NODE || (n instanceof HTMLElement && !n.matches(BLOCK_SELECTOR));
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount ? { node: sel.anchorNode, offset: sel.anchorOffset } : null;
  let moved = false;
  let run: ChildNode[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length === 1 && run[0].nodeType === Node.TEXT_NODE && !(run[0].textContent || "").length) {
      run = [];
      return;
    }
    const div = document.createElement("div");
    run[0].before(div);
    run.forEach((n) => div.appendChild(n));
    run = [];
    moved = true;
  };
  for (const n of Array.from(editor.childNodes)) {
    if (isStray(n)) run.push(n);
    else flushRun();
  }
  flushRun();
  if (moved && sel && saved?.node && editor.contains(saved.node)) {
    const r = document.createRange();
    const max = saved.node.nodeType === Node.TEXT_NODE ? (saved.node as Text).data.length : saved.node.childNodes.length;
    r.setStart(saved.node, Math.min(saved.offset, max));
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function focusEditableHost(el: HTMLElement): void {
  const host = (el.closest('[contenteditable="true"], [contenteditable=""]') as HTMLElement | null) ?? el;
  if (document.activeElement !== host) {
    host.focus({ preventScroll: true });
  }
}

function placeCaretStart(el: HTMLElement): void {
  focusEditableHost(el);
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStart(el, 0);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function selectContents(el: HTMLElement, collapseToEnd = false): void {
  focusEditableHost(el);
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  if (collapseToEnd) r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

function ensureTrailingLine(after: Element): void {
  if (!after.nextElementSibling) {
    const line = document.createElement("div");
    line.appendChild(document.createElement("br"));
    after.after(line);
  }
}

function firstElement(html: string): HTMLElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content.firstElementChild as HTMLElement;
}

function removeLeadingChars(el: HTMLElement, count: number): void {
  let remove = count;
  for (const node of textNodesOf(el)) {
    if (remove <= 0) break;
    const n = Math.min(remove, node.data.length);
    node.deleteData(0, n);
    remove -= n;
  }
}

function makeCheckbox(): HTMLSpanElement {
  const cb = document.createElement("span");
  cb.className = "md-cb";
  cb.contentEditable = "false";
  return cb;
}

/** Keeps exactly one leading checkbox on a task line and its done-state class in sync with data-p. */
function ensureCheckbox(block: HTMLElement, placeCaret: boolean): void {
  const boxes = block.querySelectorAll(".md-cb");
  boxes.forEach((b, i) => {
    if (i > 0) b.remove();
  });
  let cb = block.querySelector(".md-cb") as HTMLElement | null;
  let created = false;
  if (!cb) {
    cb = makeCheckbox();
    block.prepend(cb);
    created = true;
  } else if (block.firstChild !== cb) {
    block.prepend(cb);
  }
  const done = /\[[xX]\]/.test(block.getAttribute("data-p") || "");
  block.className = done ? "md-task md-task-done" : "md-task";
  if (!block.querySelector("br") && (block.textContent || "") === "") block.appendChild(document.createElement("br"));
  if (created && placeCaret) {
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.setStart(block, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
}
/**
 * Runs on every editor input: turns typed prefixes ("# ", "- ", "> ") into real heading / bullet / quote
 * lines (marker moves into data-p, never shown) and turns a typed "| a | b |" + "|---|---|" pair into a table.
 */
/**
 * True when an edit inside `block` cannot change any other block: nothing in it opens a code fence,
 * makes a table, draws a rule or turns the line into a list. Such an edit normalizes `block` alone.
 */
export function editStaysInBlock(block: HTMLElement): boolean {
  if (block.tagName !== "DIV" || isSpecialBlock(block)) return false;
  const text = block.textContent || "";
  if (text.includes("|") || /^\s*(`{3,}|~{3,})/.test(text) || HR_RE.test(text)) return false;
  return block.hasAttribute("data-p") || !blockPrefix(text, true);
}

/** Tidies the editor after an edit. With `only`, tidies just that block (see `editStaysInBlock`). */
export function normalizeEditor(editor: HTMLElement, only?: HTMLElement): void {

function convertInlineInTextNodes(container: HTMLElement): void {
  const sel = window.getSelection();
  const anchorNode = sel?.anchorNode;
  const anchorOffset = sel?.anchorOffset ?? 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let n = walker.nextNode();
  while (n) {
    const parent = n.parentElement;
    if (
      parent &&
      !parent.closest("pre") &&
      !parent.closest("code.md-code") &&
      !parent.closest("a.md-link") &&
      !parent.classList.contains("md-cb") &&
      !parent.classList.contains("md-fn-badge") &&
      !parent.classList.contains("md-footnote-ref")
    ) {
      textNodes.push(n as Text);
    }
    n = walker.nextNode();
  }

  for (const node of textNodes) {
    const val = node.data;
    if (!val) continue;

    // 1. Emoji :name:
    const emojiMatch = val.match(/:([a-z0-9_+-]+):/);
    if (emojiMatch && EMOJI_MAP[emojiMatch[1]]) {
      const emojiChar = EMOJI_MAP[emojiMatch[1]];
      const startIdx = emojiMatch.index!;
      const endIdx = startIdx + emojiMatch[0].length;
      const isCaretHere = anchorNode === node && anchorOffset >= endIdx;
      const before = val.slice(0, startIdx);
      const after = val.slice(endIdx);
      node.data = before + emojiChar + after;
      if (isCaretHere && sel) {
        const r = document.createRange();
        r.setStart(node, startIdx + emojiChar.length);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 2. Inline Code `code`
    const codeMatch = val.match(/(?<!`)([`])([^`\n]+)\1(?!`)/);
    if (codeMatch && codeMatch.index !== undefined) {
      const startIdx = codeMatch.index;
      const fullLen = codeMatch[0].length;
      const innerText = codeMatch[2];
      const isCaretAtEnd = anchorNode === node && anchorOffset >= startIdx + fullLen;

      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(startIdx + fullLen);

      const codeEl = document.createElement("code");
      codeEl.className = "md-code";
      codeEl.textContent = innerText;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(codeEl);
      codeEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 3. Strikethrough ~~text~~
    const delMatch = val.match(/~~([^~\n]+)~~/);
    if (delMatch && delMatch.index !== undefined) {
      const startIdx = delMatch.index;
      const fullLen = delMatch[0].length;
      const innerText = delMatch[1];
      const isCaretAtEnd = anchorNode === node && anchorOffset >= startIdx + fullLen;

      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(startIdx + fullLen);

      const delEl = document.createElement("del");
      delEl.className = "md-del";
      delEl.textContent = innerText;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(delEl);
      delEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 4. Highlight ==text== or ===text===
    const markMatch = val.match(/(?:===|==)([^=\n]+?)(?:===|==)/);
    if (markMatch && markMatch.index !== undefined) {
      const startIdx = markMatch.index;
      const fullLen = markMatch[0].length;
      const innerText = markMatch[1];
      const isCaretAtEnd = anchorNode === node && anchorOffset >= startIdx + fullLen;

      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(startIdx + fullLen);

      const markEl = document.createElement("mark");
      markEl.className = "md-mark";
      markEl.textContent = innerText;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(markEl);
      markEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 5. Link [title](url)
    const linkMatch = val.match(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (linkMatch && linkMatch.index !== undefined) {
      const startIdx = linkMatch.index;
      const fullLen = linkMatch[0].length;
      const title = linkMatch[1];
      const href = linkMatch[2];
      const isCaretAtEnd = anchorNode === node && anchorOffset >= startIdx + fullLen;

      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(startIdx + fullLen);

      const aEl = document.createElement("a");
      aEl.className = "md-link";
      aEl.href = href;
      aEl.target = "_blank";
      aEl.rel = "noopener noreferrer";
      aEl.title = `Ctrl+Click to open: ${href}`;
      aEl.textContent = title;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(aEl);
      aEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 6. Footnote ref [^1]
    const fnMatch = val.match(/\[\^(\d+)\](?!:)/);
    if (fnMatch && fnMatch.index !== undefined) {
      const startIdx = fnMatch.index;
      const fullLen = fnMatch[0].length;
      const fnNum = fnMatch[1];
      const isCaretAtEnd = anchorNode === node && anchorOffset >= startIdx + fullLen;

      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(startIdx + fullLen);

      const supEl = document.createElement("sup");
      supEl.className = "md-footnote-ref";
      supEl.setAttribute("data-fn", fnNum);
      supEl.setAttribute("contenteditable", "false");
      supEl.textContent = `[${fnNum}]`;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(supEl);
      supEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 7. Subscript ~text~ e.g. H~2~O
    const subMatch = val.match(/(?<!~)~([^~\s\n]+)~(?!~)/);
    if (subMatch && subMatch.index !== undefined) {
      const startIdx = subMatch.index;
      const fullLen = subMatch[0].length;
      const innerText = subMatch[1];
      const isCaretAtEnd = anchorNode === node && anchorOffset >= startIdx + fullLen;

      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(startIdx + fullLen);

      const subEl = document.createElement("sub");
      subEl.className = "md-sub";
      subEl.textContent = innerText;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(subEl);
      subEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // 8. Superscript ^text^ e.g. x^2^ or x^2
    let supMatch = val.match(/\^([^^ \n]+)\^/);
    let innerSup = "";
    let sIdx = -1;
    let sLen = 0;

    if (supMatch && supMatch.index !== undefined) {
      sIdx = supMatch.index;
      sLen = supMatch[0].length;
      innerSup = supMatch[1];
    } else {
      const shortMatch = val.match(/([a-zA-Z0-9])\^(\d+)/);
      if (shortMatch && shortMatch.index !== undefined) {
        sIdx = shortMatch.index + shortMatch[1].length;
        sLen = shortMatch[0].length - shortMatch[1].length;
        innerSup = shortMatch[2];
      }
    }

    if (sIdx >= 0) {
      const isCaretAtEnd = anchorNode === node && anchorOffset >= sIdx + sLen;
      const beforeText = val.slice(0, sIdx);
      const afterText = val.slice(sIdx + sLen);

      const supEl = document.createElement("sup");
      supEl.className = "md-sup";
      supEl.textContent = innerSup;

      const afterNode = document.createTextNode(afterText || "\u200B");
      node.data = beforeText;
      node.after(supEl);
      supEl.after(afterNode);

      if (isCaretAtEnd && sel) {
        const r = document.createRange();
        r.setStart(afterNode, afterText ? 0 : 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }
  }
}

  if (!only) wrapStrayNodes(editor);
  convertInlineInTextNodes(only ?? editor);
  const caretBlock = currentBlock(editor);

  // Fenced code block detection: merge consecutive divs bounded by ``` ... ``` or ~~~ ... ~~~
  const childrenList = only ? [] : Array.from(editor.children);
  for (let idx = 0; idx < childrenList.length; idx++) {
    const el = childrenList[idx];
    if (!(el instanceof HTMLElement) || el.tagName !== "DIV" || isSpecialBlock(el) || el.hasAttribute("data-p")) continue;
    const raw = (el.textContent || "").trim();
    const openFence = raw.match(/^(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
    if (openFence) {
      const marker = openFence[1];
      const lang = openFence[2] || "";
      let closeIdx = -1;
      for (let k = idx + 1; k < childrenList.length; k++) {
        const nextEl = childrenList[k];
        if (!(nextEl instanceof HTMLElement) || isSpecialBlock(nextEl)) break;
        const nextRaw = (nextEl.textContent || "").trim();
        if (nextRaw.length >= marker.length && nextRaw.split("").every((ch) => ch === marker[0])) {
          closeIdx = k;
          break;
        }
      }

      if (closeIdx > idx) {
        const codeLines: string[] = [];
        for (let k = idx + 1; k < closeIdx; k++) {
          codeLines.push((childrenList[k].textContent || "").replace(/\u00a0/g, " "));
        }
        const preNode = firstElement(preHtml(codeLines.join("\n"), lang, marker));
        if (preNode) {
          el.replaceWith(preNode);
          for (let k = idx + 1; k <= closeIdx; k++) {
            childrenList[k].remove();
          }
          ensureTrailingLine(preNode);
          childrenList.splice(idx, closeIdx - idx + 1, preNode);
          continue;
        }
      }
    }
  }

  for (const child of only ? [only] : Array.from(editor.children)) {
    if (!(child instanceof HTMLElement) || child.tagName !== "DIV" || isSpecialBlock(child)) continue;

    if (child.hasAttribute("data-p")) {
      // "[ ] " typed inside a bullet upgrades it to a task line
      if (child.classList.contains("md-li")) {
        const m = (child.textContent || "").match(/^\[([ xX])\]\s/);
        if (m) {
          removeLeadingChars(child, m[0].length);
          const base = (child.getAttribute("data-p") || "- ").replace(/\s*$/, "");
          child.setAttribute("data-p", `${base} [${m[1]}] `);
          child.className = m[1].toLowerCase() === "x" ? "md-task md-task-done" : "md-task";
        }
      }
      if (child.classList.contains("md-task")) ensureCheckbox(child, child === caretBlock);
      continue;
    }

    // Horizontal rule / line divider: typed "---", "----", "***", "___" on a line
    const rawText = child.textContent || "";
    if (HR_RE.test(rawText)) {
      const hrNode = firstElement(`<div class="md-hr" data-raw="${escapeAttr(rawText.trim())}" contenteditable="false"><hr></div>`);
      if (hrNode) {
        child.replaceWith(hrNode);
        if (child === caretBlock) {
          const nextLine = document.createElement("div");
          nextLine.appendChild(document.createElement("br"));
          hrNode.after(nextLine);
          placeCaretStart(nextLine);
        } else {
          ensureTrailingLine(hrNode);
        }
        continue;
      }
    }

    const info = blockPrefix(child.textContent || "", true);
    if (!info) continue;

    removeLeadingChars(child, info.consumed);
    child.setAttribute("data-p", info.prefix);
    child.className = info.cls;
    if ((child.textContent || "") === "" && !child.querySelector("br")) {
      child.appendChild(document.createElement("br"));
      if (child === caretBlock && !info.cls.startsWith("md-task")) placeCaretStart(child);
    }
    if (info.cls.startsWith("md-task")) ensureCheckbox(child, child === caretBlock);
  }

  if (!only) renumberOrderedLists(editor);

  // Typed table: header row line directly above a just-typed separator line
  if (caretBlock && caretBlock.tagName === "DIV" && !isSpecialBlock(caretBlock) && !caretBlock.hasAttribute("data-p")) {
    const text = caretBlock.textContent || "";
    const prev = caretBlock.previousElementSibling;
    if (
      prev instanceof HTMLElement &&
      prev.tagName === "DIV" &&
      !isSpecialBlock(prev) &&
      !prev.hasAttribute("data-p") &&
      isSeparator(text) &&
      isTableRow(prev.textContent || "")
    ) {
      const header = parseRow(prev.textContent || "");
      const sepCells = parseRow(text);
      if (header.length === sepCells.length) {
        const wrap = firstElement(tableHtml(header, sepCells.map(alignOf), [[]]));
        prev.replaceWith(wrap);
        caretBlock.remove();
        ensureTrailingLine(wrap);
        const cell = wrap.querySelector("tbody td") as HTMLElement | null;
        if (cell) selectContents(cell, true);
      }
    }
  }
}

/** Plain-text paste: multi-line text is re-parsed as markdown so headings / tables / lists render at once. */
/** Pasting a web address over selected text on one line links that text to it. Returns true when handled. */
export function handleLinkPaste(e: React.ClipboardEvent<HTMLElement>, editor: HTMLElement): boolean {
  const url = (e.clipboardData?.getData("text/plain") || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  const line = topLevelBlock(editor, range.startContainer, range.startOffset, false);
  if (!line || line !== topLevelBlock(editor, range.endContainer, range.endOffset, true)) return false;
  const inside = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest("a, code, pre, td, th");
  if (inside(range.startContainer) || inside(range.endContainer) || !range.toString().trim()) return false;
  e.preventDefault();
  applyLink(editor, url);
  return true;
}

export function handleMarkdownPaste(e: React.ClipboardEvent<HTMLElement>): boolean {
  const items = e.clipboardData?.items;
  if (items && Array.from(items).some((i) => i.type.startsWith("image/"))) return false;
  const target = e.target as HTMLElement;
  if (target.closest?.("pre.md-pre")) return false;
  const text = (e.clipboardData?.getData("text/plain") || "").replace(/\r\n?/g, "\n");
  if (!text) return false;
  e.preventDefault();
  if (target.closest?.("td,th")) {
    document.execCommand("insertText", false, text.replace(/\s*\n\s*/g, " "));
  } else if (!text.includes("\n")) {
    document.execCommand("insertText", false, text);
  } else {
    document.execCommand("insertHTML", false, markdownToHtml(text));
  }
  return true;
}
/**
 * Converts rich contenteditable DOM back to clean Markdown without losing formatting.
 */
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);

/** Markdown lines read from part of the editor, with the image references they define. */
export interface MarkdownPiece {
  lines: string[];
  references: Map<string, string>;
}

/** True when `node`, read on its own, gives the same lines as it does in the whole editor. */
export function readsAsOwnLines(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return BLOCK_TAGS.has(node.tagName.toUpperCase()) || node.classList.contains("md-tablewrap") || node.classList.contains("md-pre") || node.hasAttribute("data-raw");
}

/** Joins pieces read in document order into the note's Markdown. */
export function joinMarkdown(pieces: MarkdownPiece[]): string {
  let result = pieces.flatMap((piece) => piece.lines).join("\n").replace(/\n+$/, "");
  const definitions = pieces.flatMap((piece) => Array.from(piece.references.entries()));
  if (definitions.length > 0) {
    const unique = new Map(definitions);
    result = `${result}\n\n${Array.from(unique.entries())
      .map(([k, v]) => `[${k}]: ${v}`)
      .join("\n")}`;
  }
  return result;
}

export function htmlToMarkdown(container: HTMLElement): string {
  return joinMarkdown([readMarkdown(container, Array.from(container.childNodes))]);
}

/** Reads `nodes`, children of the editor `container`, as Markdown lines. */
export function readMarkdown(container: HTMLElement, nodes: Node[]): MarkdownPiece {
  const lines: string[] = [];
  const refDefinitions = new Map<string, string>();
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
      const parts = (node.textContent || "").replace(/\u200B/g, "").replace(/\u00a0/g, " ").split(/\r\n|\r|\n/);
      parts.forEach((part, i) => {
        if (i > 0) flush();
        cur += part;
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (el.classList.contains("md-cb") || el.classList.contains("md-fn-badge")) return;

    if (tag === "A") {
      const href = el.getAttribute("href") || "";
      const text = (el.textContent || "").replace(/\u200B/g, "");
      cur += `[${text}](${href})`;
      return;
    }

    if (tag === "CODE" || el.classList.contains("md-code")) {
      const codeText = (el.textContent || "").replace(/\u200B/g, "");
      cur += `\`${codeText}\``;
      return;
    }

    if (el.classList.contains("md-footnote-ref") || (tag === "SUP" && el.hasAttribute("data-fn"))) {
      const fnId = el.getAttribute("data-fn") || (el.textContent || "").replace(/[\[\]\u200B]/g, "") || "1";
      cur += `[^${fnId}]`;
      return;
    }

    if (el.classList.contains("md-tablewrap")) {
      if (cur !== "") flush();
      tableToLines(el).forEach((l) => lines.push(l));
      return;
    }

    if (el.classList.contains("md-pre")) {
      if (cur !== "") flush();
      const fence = el.getAttribute("data-fence") || "```";
      const lang = el.getAttribute("data-lang") || "";
      const body = (el.textContent || "").replace(/\u00a0/g, " ").replace(/\n$/, "");
      lines.push(`${fence}${lang}`);
      body.split("\n").forEach((l) => lines.push(l));
      lines.push(fence);
      return;
    }

    if (el.hasAttribute("data-raw")) {
      if (cur !== "") flush();
      lines.push(el.getAttribute("data-raw") || "");
      return;
    }

    if (tag === "IMG") {
      const refId = el.getAttribute("data-ref");
      const alt = el.getAttribute("alt") || "Image";
      const src = el.getAttribute("src") || "";
      if (refId) {
        cur += `![${alt}][${refId}]`;
        if (src) {
          refDefinitions.set(refId, src);
        }
      } else {
        cur += el.getAttribute("data-md") || `![${alt}](${src})`;
      }
      return;
    }

    if (tag === "BR") {
      // A trailing <br> inside a block is just Chrome's empty-line placeholder.
      if (!isTrailingBr(el)) flush();
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      // Block elements always begin on a fresh line (fixes nested <div> merging into the previous line)
      if (cur !== "") flush();
      const start = lines.length;
      cur = el.getAttribute("data-p") ?? "";
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
    const isDel = tag === "DEL" || tag === "S" || tag === "STRIKE" || el.classList.contains("md-del") || (el.style.textDecoration && el.style.textDecoration.includes("line-through"));
    const isMark = tag === "MARK" || el.classList.contains("md-mark");
    const isSub = tag === "SUB" || el.classList.contains("md-sub");
    const isSup = tag === "SUP" || el.classList.contains("md-sup");

    const before = cur;
    const startLines = lines.length;
    for (const child of Array.from(el.childNodes)) walk(child);

    if ((isBold || isItalic || isDel || isMark || isSub || isSup) && lines.length === startLines) {
      const inner = cur.slice(before.length);
      const trimmed = inner.trim();
      if (trimmed) {
        const lead = inner.match(/^\s*/)?.[0] || "";
        const trail = inner.match(/\s*$/)?.[0] || "";
        let mark = "";
        if (isBold && isItalic) mark = "***";
        else if (isBold) mark = "**";
        else if (isItalic) mark = "*";
        else if (isDel) mark = "~~";
        else if (isMark) mark = "==";
        else if (isSub) mark = "~";
        else if (isSup) mark = "^";
        cur = `${before}${lead}${mark}${trimmed}${mark}${trail}`;
      }
    }
  };

  for (const child of nodes) walk(child);
  if (cur !== "") flush();

  return { lines, references: refDefinitions };
}
function parseAttrNums(attr: string | null): number[] {
  if (!attr) return [];
  return attr.split(",").map((s) => Math.max(0, Math.round(Number(s.trim()) || 0)));
}

function getTableDimensions(table: HTMLTableElement): { widths: number[]; heights: number[] } {
  return {
    widths: parseAttrNums(table.getAttribute("data-widths")),
    heights: parseAttrNums(table.getAttribute("data-heights")),
  };
}

/** Applies custom column widths and row heights to `table` and stores them on data attributes for serialization. */
export function applyTableDimensions(table: HTMLTableElement, colWidths?: number[], rowHeights?: number[]): void {
  const rows = Array.from(table.querySelectorAll("tr"));
  const cols = rows[0]?.children.length ?? 0;
  const hasCols = Boolean(colWidths && colWidths.some((w) => w > 0));
  const widths = hasCols
    ? Array.from({ length: cols }, (_, i) => {
        const w = colWidths?.[i] ?? 0;
        return w > 0 ? Math.round(w) : 140;
      })
    : [];
  const totalW = widths.reduce((a, b) => a + b, 0);

  if (hasCols && totalW > 0) {
    table.setAttribute("data-sized", "1");
    table.setAttribute("data-widths", widths.join(","));
    table.style.setProperty("--tbl-w", `${totalW}px`);
  } else {
    table.removeAttribute("data-sized");
    table.removeAttribute("data-widths");
    table.style.removeProperty("--tbl-w");
  }

  const hasRows = Boolean(rowHeights && rowHeights.some((h) => h > 0));
  const heights = hasRows
    ? Array.from({ length: rows.length }, (_, i) => {
        const h = rowHeights?.[i] ?? 0;
        return h > 0 ? Math.round(h) : 0;
      })
    : [];

  if (hasRows) {
    table.setAttribute("data-heights", heights.join(","));
  } else {
    table.removeAttribute("data-heights");
  }

  rows.forEach((tr, rIdx) => {
    const rowEl = tr as HTMLElement;
    const h = heights[rIdx] ?? 0;
    if (h > 0) {
      rowEl.setAttribute("data-h", String(h));
      rowEl.style.height = `${h}px`;
      rowEl.style.setProperty("--row-h", `${h}px`);
    } else {
      rowEl.removeAttribute("data-h");
      rowEl.style.removeProperty("height");
      rowEl.style.removeProperty("--row-h");
    }

    Array.from(tr.children).forEach((cellEl, cIdx) => {
      const c = cellEl as HTMLElement;
      if (hasCols && totalW > 0 && cIdx < widths.length) {
        const w = widths[cIdx];
        const pct = ((w / totalW) * 100).toFixed(2);
        c.style.width = `${w}px`;
        c.style.setProperty("--col-w", `${w}px`);
        c.style.setProperty("--col-pct", `${pct}%`);
      } else {
        c.style.removeProperty("width");
        c.style.removeProperty("--col-w");
        c.style.removeProperty("--col-pct");
      }
    });
  });
}

function tableToLines(wrap: HTMLElement): string[] {
  const table = wrap.querySelector("table") as HTMLTableElement | null;
  if (!table) return [];
  const aligns = (table.getAttribute("data-align") || "").split(",");
  const trs = Array.from(table.querySelectorAll("tr"));
  const rows = trs.map((tr) =>
    Array.from(tr.children).map((c) =>
      htmlToMarkdown(c as HTMLElement).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
    ),
  );
  if (rows.length === 0) return [];
  const n = rows[0].length;
  const fmt = (cells: string[]) => `| ${Array.from({ length: n }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  const marks: Record<string, string> = { l: ":---", c: ":---:", r: "---:" };
  const sep = `| ${Array.from({ length: n }, (_, i) => marks[aligns[i]] ?? "---").join(" | ")} |`;
  const out = [fmt(rows[0]), sep, ...rows.slice(1).map(fmt)];

  const { widths, heights } = getTableDimensions(table);
  const rowHeights = heights.length > 0 ? heights : trs.map((tr) => Math.max(0, Math.round(Number(tr.getAttribute("data-h")) || 0)));
  const parts: string[] = [];
  if (widths.some((w) => w > 0)) {
    const normalized = Array.from({ length: n }, (_, i) => (widths[i] > 0 ? widths[i] : 140));
    parts.push(`cols=${normalized.join(",")}`);
  }
  if (rowHeights.some((h) => h > 0)) {
    const normalized = Array.from({ length: trs.length }, (_, i) => (rowHeights[i] > 0 ? rowHeights[i] : 0));
    parts.push(`rows=${normalized.join(",")}`);
  }
  if (parts.length > 0) {
    out.push(`<!-- doit-table: ${parts.join(" ")} -->`);
  }
  return out;
}

/** Scrolls the enclosing note scroll container so the caret stays comfortably inside the viewport. */
export function scrollCaretIntoView(editor: HTMLElement | null): void {
  if (!editor) return;
  const scrollContainer = editor.closest(".overflow-y-auto, .overflow-y-scroll") as HTMLElement | null;
  if (!scrollContainer) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return;

  let rect = range.getBoundingClientRect();
  if (rect.height === 0 && rect.top === 0 && rect.bottom === 0) {
    const clientRect = range.getClientRects()[0];
    if (clientRect && (clientRect.height > 0 || clientRect.top !== 0 || clientRect.bottom !== 0)) {
      rect = clientRect;
    } else {
      const el =
        range.startContainer instanceof HTMLElement
          ? range.startContainer
          : range.startContainer.parentElement;
      if (!el) return;
      rect = el.getBoundingClientRect();
    }
  }
  if (rect.height === 0 && rect.top === 0 && rect.bottom === 0) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const bottomMargin = 44;
  const topMargin = 24;
  if (rect.bottom > containerRect.bottom - bottomMargin) {
    scrollContainer.scrollTop += rect.bottom - (containerRect.bottom - bottomMargin);
  } else if (rect.top < containerRect.top + topMargin) {
    scrollContainer.scrollTop -= (containerRect.top + topMargin) - rect.top;
  }
}

interface TableEdgeHit {
  table: HTMLTableElement;
  colIdx: number | null;
  rowIdx: number | null;
  colCell: HTMLElement | null;
  rowCell: HTMLElement | null;
  cursor: string;
}

let activeTableResize = false;

function detectTableEdge(clientX: number, clientY: number, target: HTMLElement, editor: HTMLElement): TableEdgeHit | null {
  const wrap = target.closest(".md-tablewrap") as HTMLElement | null;
  if (!wrap || !editor.contains(wrap)) return null;
  const table = wrap.querySelector("table.md-tbl") as HTMLTableElement | null;
  if (!table) return null;

  const allRows = Array.from(table.querySelectorAll("tr"));
  if (allRows.length === 0) return null;

  let cell = target.closest("th,td") as HTMLElement | null;
  if (!cell || !table.contains(cell)) {
    for (const candidate of Array.from(table.querySelectorAll("th,td")) as HTMLElement[]) {
      const r = candidate.getBoundingClientRect();
      if (clientX >= r.left - 6 && clientX <= r.right + 6 && clientY >= r.top - 5 && clientY <= r.bottom + 5) {
        cell = candidate;
        break;
      }
    }
  }
  if (!cell) return null;

  const tr = cell.closest("tr");
  if (!tr) return null;
  const rowCells = Array.from(tr.children) as HTMLElement[];
  const cellColIdx = rowCells.indexOf(cell);
  const cellRowIdx = allRows.indexOf(tr);
  if (cellColIdx < 0 || cellRowIdx < 0) return null;

  const rect = cell.getBoundingClientRect();
  const nearRight = Math.abs(clientX - rect.right) <= 6;
  const nearLeft = !nearRight && cellColIdx > 0 && Math.abs(clientX - rect.left) <= 6;
  const nearBottom = Math.abs(clientY - rect.bottom) <= 5;
  const nearTop = !nearBottom && cellRowIdx > 0 && Math.abs(clientY - rect.top) <= 5;

  if (!nearRight && !nearLeft && !nearBottom && !nearTop) return null;

  const colIdx = nearRight ? cellColIdx : nearLeft ? cellColIdx - 1 : null;
  const rowIdx = nearBottom ? cellRowIdx : nearTop ? cellRowIdx - 1 : null;
  const colCell = colIdx !== null ? (rowCells[colIdx] ?? null) : null;
  const rowCell =
    rowIdx !== null ? ((allRows[rowIdx]?.children[cellColIdx] as HTMLElement | undefined) ?? null) : null;
  const cursor = colIdx !== null && rowIdx !== null ? "nwse-resize" : colIdx !== null ? "col-resize" : "row-resize";

  return { table, colIdx, rowIdx, colCell, rowCell, cursor };
}

/** Clears table edge hover highlights and resize cursor on the editor. */
export function clearTableResizeHover(editor: HTMLElement | null): void {
  if (!editor) return;
  editor.querySelectorAll("[data-resize-col]").forEach((el) => el.removeAttribute("data-resize-col"));
  editor.querySelectorAll("[data-resize-row]").forEach((el) => el.removeAttribute("data-resize-row"));
  if (!activeTableResize && editor.style.cursor) {
    editor.style.cursor = "";
  }
}

/** Updates hover cursor and border highlight when the pointer nears a table cell edge. */
export function handleTableMouseMove(e: React.MouseEvent<HTMLElement>, editor: HTMLElement): void {
  if (activeTableResize) return;
  const target = e.target as HTMLElement | null;
  if (!target) {
    clearTableResizeHover(editor);
    return;
  }
  const hit = detectTableEdge(e.clientX, e.clientY, target, editor);
  clearTableResizeHover(editor);
  if (!hit) return;
  editor.style.cursor = hit.cursor;
  if (hit.colCell) hit.colCell.setAttribute("data-resize-col", "1");
  if (hit.rowCell) hit.rowCell.setAttribute("data-resize-row", "1");
}

/** Starts free drag-resizing when mousedown lands on a table column/row edge. Returns true if handled. */
export function handleTableMouseDown(
  e: React.MouseEvent<HTMLElement>,
  editor: HTMLElement,
  onInput: () => void,
): boolean {
  if (e.button !== 0) return false;
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const hit = detectTableEdge(e.clientX, e.clientY, target, editor);
  if (!hit) return false;

  e.preventDefault();
  e.stopPropagation();

  const { table, colIdx, rowIdx, cursor } = hit;
  const zoomHost = table.closest("[style*='zoom']") as HTMLElement | null;
  const zoomPct = zoomHost ? parseFloat(zoomHost.style.zoom) : NaN;
  const zoomScale = Number.isFinite(zoomPct) && zoomPct > 0 ? zoomPct / 100 : 1;

  const firstRowCells = Array.from(table.querySelector("tr")?.children ?? []) as HTMLElement[];
  const allRows = Array.from(table.querySelectorAll("tr"));
  const existing = getTableDimensions(table);
  const hasExistingCols = existing.widths.length === firstRowCells.length && existing.widths.some((w) => w > 0);
  const widths = hasExistingCols
    ? [...existing.widths]
    : firstRowCells.map((c) => Math.max(48, Math.round(c.getBoundingClientRect().width / zoomScale) || 140));
  const heights = Array.from({ length: allRows.length }, (_, i) => existing.heights[i] ?? 0);

  const startX = e.clientX;
  const startY = e.clientY;
  const startColW = colIdx !== null ? (widths[colIdx] || 140) : 0;
  const startRowH =
    rowIdx !== null
      ? heights[rowIdx] > 0
        ? heights[rowIdx]
        : Math.max(28, Math.round(allRows[rowIdx].getBoundingClientRect().height / zoomScale) || 36)
      : 0;

  let resized = false;
  activeTableResize = true;
  document.body.style.userSelect = "none";
  document.body.style.cursor = cursor;

  const onMove = (moveEv: MouseEvent) => {
    const dx = moveEv.clientX - startX;
    const dy = moveEv.clientY - startY;
    if (!resized && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    resized = true;
    if (colIdx !== null) {
      widths[colIdx] = Math.max(48, Math.round(startColW + dx / zoomScale));
    }
    if (rowIdx !== null) {
      heights[rowIdx] = Math.max(28, Math.round(startRowH + dy / zoomScale));
    }
    applyTableDimensions(
      table,
      colIdx !== null || hasExistingCols ? widths : undefined,
      rowIdx !== null || existing.heights.some((h) => h > 0) ? heights : undefined,
    );
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    activeTableResize = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    clearTableResizeHover(editor);
    if (resized) onInput();
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return true;
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
 * Editor keyboard layer: table-cell navigation (Tab / Shift+Tab / Enter), Ctrl+1/2/3 headings, Ctrl+T table,
 * bullet / quote exit on Enter, heading exit on Enter, and prefix removal on Backspace at line start.
 * Returns true when the event was handled (caller should treat the document as changed).
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

  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;

  const sc = getMarkdownShortcuts();
  const headingLevel = matchesCombo(e, sc.h1) ? 1 : matchesCombo(e, sc.h2) ? 2 : matchesCombo(e, sc.h3) ? 3 : 0;
  const wantsTable = matchesCombo(e, sc.table);
  const wantsTask = matchesCombo(e, sc.task);
  const wantsDel = matchesCombo(e, sc.strikethrough);
  const wantsMark = matchesCombo(e, sc.highlight);
  const wantsCode = matchesCombo(e, sc.inlineCode);
  const wantsLink = matchesCombo(e, sc.link);
  const wantsOl = matchesCombo(e, sc.orderedList);
  const wantsQuote = matchesCombo(e, sc.blockquote);
  const wantsSub = matchesCombo(e, sc.subscript);
  const wantsSup = matchesCombo(e, sc.superscript);
  const wantsFn = matchesCombo(e, sc.footnote);
  const isShortcut =
    headingLevel > 0 ||
    wantsTable ||
    wantsTask ||
    wantsDel ||
    wantsMark ||
    wantsCode ||
    wantsLink ||
    wantsOl ||
    wantsQuote ||
    wantsSub ||
    wantsSup ||
    wantsFn;

  // ---- inside a table cell ----
  const cell = startEl?.closest("td,th") as HTMLElement | null;
  if (cell && editor.contains(cell)) {
    if (matchesCombo(e, sc.tableCol) || matchesCombo(e, sc.tableRow)) {
      e.preventDefault();
      if (matchesCombo(e, sc.tableCol)) addColumn(cell.closest("table") as HTMLTableElement, cell);
      else moveInTable(cell, 1, true);
      onInput();
      return true;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveInTable(cell, e.shiftKey ? -1 : 1);
      onInput();
      return true;
    }
    if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && sel.isCollapsed) {
      const table = cell.closest("table") as HTMLTableElement | null;
      const tableWrap = (cell.closest(".md-tablewrap") as HTMLElement | null) ?? table;
      if (table && tableWrap) {
        const cells = Array.from(table.querySelectorAll("th,td")) as HTMLElement[];
        const cols = table.querySelector("tr")?.children.length ?? 1;
        const idx = cells.indexOf(cell);
        if (e.key === "ArrowRight" && caretAtEnd(cell, range)) {
          e.preventDefault();
          if (idx + 1 < cells.length) {
            focusTableCell(cells[idx + 1], true, editor);
          } else {
            const created = moveCaretAfterTable(tableWrap, editor, false);
            if (created) onInput();
          }
          return true;
        }
        if (e.key === "ArrowLeft" && caretAtStart(cell, range)) {
          e.preventDefault();
          if (idx > 0) {
            focusTableCell(cells[idx - 1], false, editor);
          } else {
            moveCaretBeforeTable(tableWrap, editor);
          }
          return true;
        }
        if (e.key === "ArrowDown" && caretOnLastLine(cell, range)) {
          e.preventDefault();
          if (idx + cols < cells.length) {
            focusTableCell(cells[idx + cols], false, editor);
          } else {
            const created = moveCaretAfterTable(tableWrap, editor, false);
            if (created) onInput();
          }
          return true;
        }
        if (e.key === "ArrowUp" && caretOnFirstLine(cell, range)) {
          if (idx - cols >= 0) {
            e.preventDefault();
            focusTableCell(cells[idx - cols], false, editor);
            return true;
          }
          if (moveCaretBeforeTable(tableWrap, editor)) {
            e.preventDefault();
            return true;
          }
        }
      }
    }
    if (e.key === "Backspace" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      const table = cell.closest("table") as HTMLTableElement | null;
      if (table) {
        const cells = Array.from(table.querySelectorAll("th,td")) as HTMLElement[];
        const isFirstCell = cells[0] === cell;
        const allCellsEmpty = cells.every((c) => (c.textContent || "").trim() === "");
        const cellEmpty = (cell.textContent || "").trim() === "";

        if (allCellsEmpty || (isFirstCell && cellEmpty && caretAtStart(cell, range))) {
          e.preventDefault();
          deleteTable(cell);
          onInput();
          return true;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const table = cell.closest("table") as HTMLTableElement | null;
      if (table) {
        const cells = Array.from(table.querySelectorAll("th,td")) as HTMLElement[];
        const isLastCell = cells.indexOf(cell) === cells.length - 1;
        const tr = cell.closest("tr");
        const allRows = table.querySelectorAll("tr");
        const isLastRow = tr && tr === allRows[allRows.length - 1];
        const isRowEmpty = tr && Array.from(tr.children).every((c) => (c.textContent || "").trim() === "");

        if ((isLastCell && caretAtEnd(cell, range)) || (isLastRow && isRowEmpty)) {
          e.preventDefault();
          if (isLastRow && isRowEmpty && table.querySelectorAll("tr").length > 1) {
            const rowIdx = tr ? Array.from(table.querySelectorAll("tr")).indexOf(tr) : -1;
            tr?.remove();
            syncTableRowsAfterDelete(table, rowIdx);
          }
          const tableWrap = (cell.closest(".md-tablewrap") as HTMLElement) || table;
          moveCaretAfterTable(tableWrap, editor, true);
          onInput();
          return true;
        }
      }
      e.preventDefault();
      moveInTable(cell, 0);
      onInput();
      return true;
    }
    if (isShortcut) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  // ---- inside a code block: plain-text island with clean exit mechanics ----
  const preBlock = startEl?.closest("pre.md-pre") as HTMLElement | null;
  if (preBlock && editor.contains(preBlock)) {
    if (isShortcut) {
      e.preventDefault();
      return true;
    }
    // Shift+Enter or typing ``` on a line exits the code block
    if (e.key === "Enter") {
      const text = (preBlock.textContent || "").replace(/\u00a0/g, " ");
      const isShift = e.shiftKey;
      const endsWithFence = /(?:^|\n)(`{3,}|~{3,})\s*$/.test(text);
      if (isShift || endsWithFence) {
        e.preventDefault();
        if (endsWithFence) {
          preBlock.textContent = text.replace(/(?:^|\n)(`{3,}|~{3,})\s*$/, "").replace(/\n$/, "");
        }
        const nextLine = document.createElement("div");
        nextLine.appendChild(document.createElement("br"));
        preBlock.after(nextLine);
        placeCaretStart(nextLine);
        onInput();
        return true;
      }
    }
    return false;
  }

  if (isShortcut) {
    e.preventDefault();
    if (wantsTable) insertTableAtCaret(editor);
    else if (wantsTask) applyTask(editor);
    else if (headingLevel > 0) applyHeading(editor, headingLevel);
    else if (wantsDel) applyStrikethrough(editor);
    else if (wantsMark) applyHighlight(editor);
    else if (wantsCode) applyInlineCode(editor);
    else if (wantsLink) applyLink(editor);
    else if (wantsOl) applyOrderedList(editor);
    else if (wantsQuote) applyBlockquote(editor);
    else if (wantsSub) applySubscript(editor);
    else if (wantsSup) applySuperscript(editor);
    else if (wantsFn) applyFootnote(editor);
    onInput();
    return true;
  }

  // ---- list nesting and moving lines: work on every selected line ----
  if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const lines = selectedBlocks(editor, range);
    if (lines.some((line) => isListBlock(line))) {
      // Kept in the editor even when the line cannot move further, so focus never jumps away.
      e.preventDefault();
      if (e.shiftKey ? outdentLines(editor, lines) : indentLines(editor, lines)) onInput();
      return true;
    }
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    if (moveLines(editor, range, e.key === "ArrowUp" ? -1 : 1)) onInput();
    return true;
  }

  const block = currentBlock(editor);
  if (!block || block.tagName !== "DIV" || !sel.isCollapsed) return false;

  // Seamless arrow entry into adjacent tables from normal/task blocks
  if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
    if (
      (e.key === "ArrowDown" && caretOnLastLine(block, range)) ||
      (e.key === "ArrowRight" && caretAtEnd(block, range))
    ) {
      let next = block.nextElementSibling as HTMLElement | null;
      while (next && next.classList.contains("md-hr")) next = next.nextElementSibling as HTMLElement | null;
      if (next && next.classList.contains("md-tablewrap")) {
        const firstCell = next.querySelector("th,td") as HTMLElement | null;
        if (firstCell) {
          e.preventDefault();
          focusTableCell(firstCell, true, editor);
          return true;
        }
      }
    }
    const cbInBlock = block.classList.contains("md-task") ? block.querySelector(".md-cb") : null;
    const atBlockStart = cbInBlock
      ? isCaretRightAfterCheckbox(block, cbInBlock, range)
      : caretOffsetIn(block, range) === 0;
    if (
      (e.key === "ArrowUp" && caretOnFirstLine(block, range)) ||
      (e.key === "ArrowLeft" && atBlockStart)
    ) {
      let prev = block.previousElementSibling as HTMLElement | null;
      while (prev && prev.classList.contains("md-hr")) prev = prev.previousElementSibling as HTMLElement | null;
      if (prev && prev.classList.contains("md-tablewrap")) {
        const rows = Array.from(prev.querySelectorAll("tr"));
        const lastRow = rows[rows.length - 1];
        const targetCell =
          e.key === "ArrowLeft"
            ? (Array.from(prev.querySelectorAll("th,td")).pop() as HTMLElement | undefined)
            : (lastRow?.firstElementChild as HTMLElement | null);
        if (targetCell) {
          e.preventDefault();
          focusTableCell(targetCell, false, editor);
          return true;
        }
      }
    }
  }

  const isList = block.classList.contains("md-li") || block.classList.contains("md-quote");
  const isTask = block.classList.contains("md-task");
  const isOl = block.classList.contains("md-ol");
  const isDd = block.classList.contains("md-dd");
  const isFnDef = block.classList.contains("md-footnote-def");
  const isHeading = /\bmd-h\d\b/.test(block.className);
  const hasPrefix = block.hasAttribute("data-p");

  // Clean empty check: ignore zero-width spaces, non-breaking spaces, trailing newlines and spaces
  const cleanContent = (block.textContent || "").replace(/[\u200B\u00A0\r\n\s]/g, "");
  const isEmpty = cleanContent === "" || cleanContent === "-" || cleanContent === "*" || cleanContent === "•";
  const isHr = HR_RE.test(cleanContent) || HR_RE.test(block.textContent || "");

  if (e.key === "Enter" && isHr) {
    e.preventDefault();
    const hrNode = firstElement(`<div class="md-hr" data-raw="${escapeAttr(cleanContent)}" contenteditable="false"><hr></div>`);
    if (hrNode) {
      block.replaceWith(hrNode);
      const next = document.createElement("div");
      next.appendChild(document.createElement("br"));
      hrNode.after(next);
      placeCaretStart(next);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }
  }

  const fenceMatch = (block.textContent || "").trim().match(/^(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
  if (e.key === "Enter" && fenceMatch) {
    e.preventDefault();
    const marker = fenceMatch[1];
    const lang = fenceMatch[2] || "";
    const preNode = firstElement(preHtml("", lang, marker));
    if (preNode) {
      block.replaceWith(preNode);
      ensureTrailingLine(preNode);
      placeCaretStart(preNode);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }
  }

  if (!hasPrefix && !isList && !isTask && !isHeading && !isOl && !isDd && !isFnDef) {
    if (e.key === "Backspace" && caretOffsetIn(block, range) === 0) {
      const prev = block.previousElementSibling;
      if (prev && prev instanceof HTMLElement && (prev.classList.contains("md-hr") || prev.hasAttribute("data-raw"))) {
        e.preventDefault();
        prev.remove();
        onInput();
        return true;
      }
    }
    return false;
  }

  if (e.key === "Enter") {
    // Empty nested list line: step out one level first, like every outliner.
    if (isEmpty && lineWidth(block) > 0 && outdentLines(editor, [block])) {
      e.preventDefault();
      onInput();
      return true;
    }
    if (isEmpty && (isList || isTask || isHeading || isOl || isDd || isFnDef)) {
      // Empty bullet / task / quote / heading line: exit to normal text paragraph!
      e.preventDefault();
      clearPrefix(block);
      renumberOrderedLists(editor);
      placeCaretStart(block);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }

    if (isTask && caretAtEnd(block, range)) {
      e.preventDefault();
      const next = document.createElement("div");
      next.setAttribute("data-p", (block.getAttribute("data-p") || "- [ ] ").replace(/\[[ xX]\]/, "[ ]"));
      next.className = "md-task";
      next.appendChild(makeCheckbox());
      next.appendChild(document.createElement("br"));
      block.after(next);
      renumberOrderedLists(editor);
      const r = document.createRange();
      r.setStart(next, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }

    if (isList && caretAtEnd(block, range)) {
      e.preventDefault();
      const next = document.createElement("div");
      next.setAttribute("data-p", block.getAttribute("data-p") || "- ");
      next.className = block.className || "md-li";
      next.appendChild(document.createElement("br"));
      block.after(next);
      renumberOrderedLists(editor);
      placeCaretStart(next);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }

    if (isOl) {
      e.preventDefault();
      const next = document.createElement("div");
      next.className = "md-ol";
      // Same level as this line; the number is set by renumberOrderedLists below.
      next.setAttribute("data-p", block.getAttribute("data-p") || "1. ");

      const atEnd = caretAtEnd(block, range);
      if (atEnd) {
        next.appendChild(document.createElement("br"));
      } else {
        try {
          const postRange = document.createRange();
          postRange.selectNodeContents(block);
          postRange.setStart(range.endContainer, range.endOffset);
          const frag = postRange.extractContents();
          if (!frag.textContent && !frag.querySelector("img, svg, a, span")) {
            next.appendChild(document.createElement("br"));
          } else {
            next.appendChild(frag);
          }
        } catch {
          next.appendChild(document.createElement("br"));
        }
      }

      if (!block.textContent && !block.querySelector("img, svg, a, span, br")) {
        block.appendChild(document.createElement("br"));
      }

      block.after(next);
      renumberOrderedLists(editor);
      placeCaretStart(next);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }

    if (isHeading && caretAtEnd(block, range)) {
      e.preventDefault();
      const next = document.createElement("div");
      next.appendChild(document.createElement("br"));
      block.after(next);
      placeCaretStart(next);
      scrollCaretIntoView(editor);
      onInput();
      return true;
    }
  }

  // Checkbox navigation guard: never allow cursor to step behind/left of the checkbox
  if (isTask && (e.key === "ArrowLeft" || e.key === "Home")) {
    const cb = block.querySelector(".md-cb");
    if (cb) {
      if (e.key === "Home") {
        e.preventDefault();
        placeCaretAfterCheckbox(block, cb);
        return true;
      }
      if (isCaretRightAfterCheckbox(block, cb, range)) {
        e.preventDefault();
        const prev = block.previousElementSibling as HTMLElement | null;
        if (prev) {
          const r = document.createRange();
          r.selectNodeContents(prev);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        }
        return true;
      }
    }
  }

  if (e.key === "Backspace" && (caretOffsetIn(block, range) === 0 || isEmpty)) {
    const prev = block.previousElementSibling;
    if (prev && prev instanceof HTMLElement && (prev.classList.contains("md-hr") || prev.hasAttribute("data-raw"))) {
      e.preventDefault();
      prev.remove();
      onInput();
      return true;
    }
    // At the start of a nested list line: step out one level before the marker goes.
    if (lineWidth(block) > 0 && outdentLines(editor, [block])) {
      e.preventDefault();
      onInput();
      return true;
    }
    if (isList || isTask || isHeading || hasPrefix || isOl || isDd || isFnDef) {
      e.preventDefault();
      clearPrefix(block);
      renumberOrderedLists(editor);
      placeCaretStart(block);
      onInput();
      return true;
    }
  }

  return false;
}

export function placeCaretAfterCheckbox(block: HTMLElement, cb: Element): void {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  const next = cb.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE) {
    r.setStart(next, 0);
  } else if (next) {
    r.setStartBefore(next);
  } else {
    const br = document.createElement("br");
    block.appendChild(br);
    r.setStartBefore(br);
  }
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function isCaretRightAfterCheckbox(block: HTMLElement, cb: Element, range: Range): boolean {
  if (range.startContainer === block && range.startOffset === 1) return true;
  const next = cb.nextSibling;
  if (next && range.startContainer === next && range.startOffset === 0) return true;
  return false;
}

export function fixCheckboxCaret(editor: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return;

  const node = range.startContainer;
  const taskBlock = (node instanceof HTMLElement ? node : node.parentElement)?.closest(".md-task") as HTMLElement | null;
  if (!taskBlock) return;

  const cb = taskBlock.querySelector(".md-cb");
  if (!cb) return;

  let isBefore = false;
  if (range.startContainer === taskBlock && range.startOffset === 0) {
    isBefore = true;
  } else if (cb.contains(range.startContainer) || range.startContainer === cb) {
    isBefore = true;
  }

  if (isBefore) {
    placeCaretAfterCheckbox(taskBlock, cb);
  }
}

export function isCaretAtEditorStart(editor: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const firstBlock = editor.firstElementChild as HTMLElement | null;
  if (!firstBlock) return true;
  if (!firstBlock.contains(range.startContainer) && range.startContainer !== editor && range.startContainer !== firstBlock) {
    return false;
  }
  if (firstBlock.classList.contains("md-tablewrap")) {
    const startEl =
      range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
    const cell = startEl?.closest("th,td") as HTMLElement | null;
    if (!cell || !firstBlock.contains(cell)) return false;
    const firstRow = firstBlock.querySelector("tr");
    if (!firstRow || cell.closest("tr") !== firstRow) return false;
    return caretOnFirstLine(cell, range);
  }
  const pre = document.createRange();
  pre.selectNodeContents(firstBlock);
  try {
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().replace(/[\u200B\u00A0\r\n\s]/g, "").length === 0;
  } catch {
    return false;
  }
}

export function placeCaretAtEditorStart(editor: HTMLElement): void {
  editor.focus();
  const firstBlock = editor.firstElementChild as HTMLElement | null;
  if (!firstBlock) return;
  placeCaretStart(firstBlock);
}
// ---------------------------------------------------------------------------
// Markdown editing helpers (headings, tables, toolbar commands)
// ---------------------------------------------------------------------------

function textNodesOf(el: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
  return out;
}

function caretOffsetIn(block: HTMLElement, range: Range): number {
  const pre = document.createRange();
  pre.selectNodeContents(block);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function caretAtStart(block: HTMLElement, range: Range): boolean {
  try {
    const pre = document.createRange();
    pre.selectNodeContents(block);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().trim() === "";
  } catch {
    return false;
  }
}

function caretAtEnd(block: HTMLElement, range: Range): boolean {
  try {
    const post = document.createRange();
    post.selectNodeContents(block);
    post.setStart(range.endContainer, range.endOffset);
    if (post.toString().replace(/[\u200B\u00A0\r\n\s]/g, "") !== "") return false;
    const frag = post.cloneContents();
    if (frag.querySelector("img, svg, table, pre")) return false;
    return true;
  } catch {
    return false;
  }
}

function caretOnFirstLine(container: HTMLElement, range: Range): boolean {
  if (caretAtStart(container, range)) return true;
  const rect = range.getBoundingClientRect();
  if (rect.height === 0) return true;
  const startRange = document.createRange();
  startRange.selectNodeContents(container);
  startRange.collapse(true);
  const startRect = startRange.getBoundingClientRect();
  if (startRect.height === 0) {
    const cs = getComputedStyle(container);
    const padTop = parseFloat(cs.paddingTop) || 0;
    return rect.top - (container.getBoundingClientRect().top + padTop) < rect.height * 0.9;
  }
  return Math.abs(rect.top - startRect.top) < Math.max(rect.height, startRect.height) * 0.6;
}

function caretOnLastLine(container: HTMLElement, range: Range): boolean {
  if (caretAtEnd(container, range)) return true;
  const rect = range.getBoundingClientRect();
  if (rect.height === 0) return true;
  const endRange = document.createRange();
  endRange.selectNodeContents(container);
  endRange.collapse(false);
  const endRect = endRange.getBoundingClientRect();
  if (endRect.height === 0) {
    const cs = getComputedStyle(container);
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    return container.getBoundingClientRect().bottom - padBottom - rect.bottom < rect.height * 0.9;
  }
  return Math.abs(rect.bottom - endRect.bottom) < Math.max(rect.height, endRect.height) * 0.6;
}

function focusTableCell(cell: HTMLElement, toStart: boolean, editor?: HTMLElement | null): void {
  cell.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (sel) {
    const r = document.createRange();
    r.selectNodeContents(cell);
    r.collapse(toStart);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  scrollCaretIntoView(editor ?? cell);
}

function moveCaretBeforeTable(tableWrap: HTMLElement, editor: HTMLElement): boolean {
  let prev = tableWrap.previousElementSibling as HTMLElement | null;
  while (prev && prev.classList.contains("md-hr")) prev = prev.previousElementSibling as HTMLElement | null;
  if (!prev) return false;
  if (prev.classList.contains("md-tablewrap")) {
    const lastCell = Array.from(prev.querySelectorAll("th,td")).pop() as HTMLElement | undefined;
    if (lastCell) {
      focusTableCell(lastCell, false, editor);
      return true;
    }
  }
  selectContents(prev, true);
  scrollCaretIntoView(editor);
  return true;
}

function moveCaretAfterTable(tableWrap: HTMLElement, editor: HTMLElement, createIfNonEmpty: boolean): boolean {
  let targetLine = tableWrap.nextElementSibling as HTMLElement | null;
  while (targetLine && targetLine.classList.contains("md-hr")) {
    targetLine = targetLine.nextElementSibling as HTMLElement | null;
  }
  if (!createIfNonEmpty && targetLine && targetLine.classList.contains("md-tablewrap")) {
    const nextCell = targetLine.querySelector("th,td") as HTMLElement | null;
    if (nextCell) {
      focusTableCell(nextCell, true, editor);
      return false;
    }
  }
  let created = false;
  if (
    !targetLine ||
    targetLine.classList.contains("md-tablewrap") ||
    targetLine.classList.contains("md-pre") ||
    targetLine.hasAttribute("data-raw") ||
    (createIfNonEmpty && targetLine.textContent?.trim())
  ) {
    const newLine = document.createElement("div");
    newLine.appendChild(document.createElement("br"));
    tableWrap.after(newLine);
    targetLine = newLine;
    created = true;
  }
  placeCaretStart(targetLine);
  scrollCaretIntoView(editor);
  return created;
}

function syncTableRowInserted(table: HTMLTableElement, rowIdx: number): void {
  const { widths, heights } = getTableDimensions(table);
  if (heights.some((h) => h > 0)) {
    const rowCount = table.querySelectorAll("tr").length;
    while (heights.length < rowCount - 1) heights.push(0);
    heights.splice(Math.max(0, rowIdx), 0, 0);
  }
  if (widths.some((w) => w > 0) || heights.some((h) => h > 0)) {
    applyTableDimensions(table, widths, heights);
  }
}

function syncTableRowsAfterDelete(table: HTMLTableElement, rowIdx: number): void {
  const { widths, heights } = getTableDimensions(table);
  if (rowIdx >= 0 && rowIdx < heights.length) {
    heights.splice(rowIdx, 1);
  }
  if (widths.some((w) => w > 0) || heights.some((h) => h > 0)) {
    applyTableDimensions(table, widths, heights);
  }
}

/** How list nesting sees a top-level editor block. */
function blockListLine(block: Element): ListLine {
  if (!(block instanceof HTMLElement) || block.tagName !== "DIV" || isSpecialBlock(block)) return { kind: "other" };
  const cls = block.classList.contains("md-task") ? "md-task" : block.classList.contains("md-ol") ? "md-ol" : block.classList.contains("md-li") ? "md-li" : null;
  return listLineOf(cls, block.getAttribute("data-p") ?? "");
}

function isListBlock(block: Element | null | undefined): block is HTMLElement {
  return !!block && blockListLine(block).kind !== "other";
}

/**
 * Lays out the editor's lists after an edit: numbers each run of numbered lines (per nesting level,
 * keeping their indentation) and draws every list line at its depth.
 */
export function renumberOrderedLists(editor: HTMLElement): void {
  const blocks = Array.from(editor.children);
  const places = layoutLists(blocks.map(blockListLine));
  blocks.forEach((block, i) => {
    if (!(block instanceof HTMLElement)) return;
    const { depth, number } = places[i];
    if (number !== undefined) {
      const prefix = numberedPrefix(block.getAttribute("data-p") ?? "", number);
      if (block.getAttribute("data-p") !== prefix) block.setAttribute("data-p", prefix);
    }
    if (depth > 0) block.style.setProperty("--md-depth", String(depth));
    else if (block.style.getPropertyValue("--md-depth")) block.style.removeProperty("--md-depth");
  });
}

// ---- list nesting (Tab / Shift+Tab) and moving lines (Alt+Up / Alt+Down) ----

function topLevelBlock(editor: HTMLElement, node: Node, offset: number, atEnd: boolean): HTMLElement | null {
  if (node === editor) {
    const child = editor.children[atEnd ? offset - 1 : offset] ?? editor.lastElementChild;
    return child instanceof HTMLElement ? child : null;
  }
  let n: Node | null = node;
  while (n && n.parentNode !== editor) n = n.parentNode;
  return n instanceof HTMLElement ? n : null;
}

/** The top-level lines the selection covers. A selection ending at the very start of a line leaves that line out. */
function selectedBlocks(editor: HTMLElement, range: Range): HTMLElement[] {
  const first = topLevelBlock(editor, range.startContainer, range.startOffset, false);
  let last = topLevelBlock(editor, range.endContainer, range.endOffset, true);
  if (!first || !last) return [];
  if (last !== first) {
    const end = range.cloneRange();
    end.collapse(false);
    if (caretOffsetIn(last, end) === 0) last = (last.previousElementSibling as HTMLElement | null) ?? first;
  }
  const blocks: HTMLElement[] = [];
  for (let b: Element | null = first; b; b = b.nextElementSibling) {
    if (b instanceof HTMLElement) blocks.push(b);
    if (b === last) break;
  }
  return blocks;
}

function lineIndent(block: HTMLElement): string {
  return (block.getAttribute("data-p") ?? "").match(/^\s*/)?.[0] ?? "";
}

function lineWidth(block: Element): number {
  return block instanceof HTMLElement && isListBlock(block) ? indentWidth(lineIndent(block)) : 0;
}

/** The list lines nested under `block`. */
function nestedUnder(block: HTMLElement): HTMLElement[] {
  const width = lineWidth(block);
  const nested: HTMLElement[] = [];
  for (let n = block.nextElementSibling; isListBlock(n) && lineWidth(n) > width; n = n.nextElementSibling) nested.push(n);
  return nested;
}

/** Shifts a list line's indentation by `delta` columns. Changed lines are indented with spaces. A
 * numbered line is reset to 1, so it starts a new level at 1 and joins an existing one in sequence. */
function shiftIndent(block: HTMLElement, delta: number): void {
  const indent = lineIndent(block);
  let marker = (block.getAttribute("data-p") ?? "").slice(indent.length);
  if (block.classList.contains("md-ol")) marker = marker.replace(/\d+/, "1");
  block.setAttribute("data-p", " ".repeat(Math.max(0, indentWidth(indent) + delta)) + marker);
}

/** The selected list lines that are not nested under another selected line that moves, each with its
 * nested lines. A line for which `moves` is false leaves its nested lines free to move on their own. */
function selectedItems(lines: HTMLElement[], moves: (line: HTMLElement) => boolean = () => true): { line: HTMLElement; nested: HTMLElement[] }[] {
  const items: { line: HTMLElement; nested: HTMLElement[] }[] = [];
  const covered = new Set<HTMLElement>();
  for (const line of lines) {
    if (!isListBlock(line) || covered.has(line) || !moves(line)) continue;
    const nested = nestedUnder(line);
    nested.forEach((n) => covered.add(n));
    items.push({ line, nested });
  }
  return items;
}

/** Tab: nests the selected list lines (and what is nested under them) one level deeper. A line can
 * only nest under a list line above it, so a list never skips a level. */
function indentLines(editor: HTMLElement, lines: HTMLElement[]): boolean {
  const items = selectedItems(lines);
  const first = items[0]?.line;
  const above = first?.previousElementSibling ?? null;
  if (!first || !isListBlock(above) || lineWidth(above) < lineWidth(first)) return false;
  const step = indentWidth(INDENT_STEP);
  for (const { line, nested } of items) [line, ...nested].forEach((b) => shiftIndent(b, step));
  renumberOrderedLists(editor);
  return true;
}

/** Shift+Tab: moves the selected list lines (and what is nested under them) out to their parent's level. */
function outdentLines(editor: HTMLElement, lines: HTMLElement[]): boolean {
  const moves = selectedItems(lines, (line) => lineWidth(line) > 0).map(({ line, nested }) => {
    const width = lineWidth(line);
    let parent = line.previousElementSibling;
    while (isListBlock(parent) && lineWidth(parent) >= width) parent = parent.previousElementSibling;
    const target = isListBlock(parent) ? lineWidth(parent) : 0;
    return { blocks: [line, ...nested], delta: target - width };
  });
  if (moves.length === 0) return false;
  for (const { blocks, delta } of moves) blocks.forEach((b) => shiftIndent(b, delta));
  renumberOrderedLists(editor);
  return true;
}

/** Alt+Up / Alt+Down: moves the selected lines, with the lines nested under them, past the line or
 * item next to them. They keep their indentation. */
function moveLines(editor: HTMLElement, range: Range, direction: -1 | 1): boolean {
  const lines = selectedBlocks(editor, range);
  if (lines.length === 0) return false;
  let last = lines[lines.length - 1];
  for (const { nested } of selectedItems(lines)) {
    const end = nested[nested.length - 1];
    if (end && last.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING) last = end;
  }
  const unit: HTMLElement[] = [];
  for (let b: Element | null = lines[0]; b; b = b.nextElementSibling) {
    if (b instanceof HTMLElement) unit.push(b);
    if (b === last) break;
  }
  const width = lineWidth(lines[0]);
  const saved = { sc: range.startContainer, so: range.startOffset, ec: range.endContainer, eo: range.endOffset };

  if (direction < 0) {
    let target = lines[0].previousElementSibling;
    if (!target) return false;
    // Land above the whole item before, not between it and its nested lines.
    while (isListBlock(target) && lineWidth(target) > width && target.previousElementSibling) target = target.previousElementSibling;
    target.before(...unit);
  } else {
    const next = last.nextElementSibling;
    if (!next) return false;
    const nested = isListBlock(next) && lineWidth(next) >= width ? nestedUnder(next) : [];
    (nested[nested.length - 1] ?? next).after(...unit);
  }
  // Never left nested under nothing: four leading spaces with no list above read as code elsewhere.
  if (isListBlock(lines[0])) {
    const above = lines[0].previousElementSibling;
    const deepest = isListBlock(above) ? lineWidth(above) + indentWidth(INDENT_STEP) : 0;
    if (width > deepest) unit.filter((b) => isListBlock(b)).forEach((b) => shiftIndent(b, deepest - width));
  }

  const sel = window.getSelection();
  if (sel) {
    const restored = document.createRange();
    restored.setStart(saved.sc, saved.so);
    restored.setEnd(saved.ec, saved.eo);
    sel.removeAllRanges();
    sel.addRange(restored);
  }
  renumberOrderedLists(editor);
  scrollCaretIntoView(editor);
  return true;
}

function clearPrefix(block: HTMLElement): void {
  block.removeAttribute("data-p");
  block.removeAttribute("class");
  block.querySelectorAll(".md-cb, .md-fn-badge").forEach((b) => b.remove());
  if (!block.firstChild) block.appendChild(document.createElement("br"));
}

/** Toggles or applies a heading (Ctrl+1/2/3 and the toolbar selector) on the caret line. */
export function applyHeading(editor: HTMLElement, level: number): void {
  wrapStrayNodes(editor);
  let block = currentBlock(editor);
  if (!block) block = editor.lastElementChild as HTMLElement | null;
  if (!block) {
    block = document.createElement("div");
    block.appendChild(document.createElement("br"));
    editor.appendChild(block);
  }
  if (block.tagName !== "DIV" || isSpecialBlock(block)) return;

  if (level === 0) {
    clearPrefix(block);
  } else {
    block.querySelectorAll(".md-cb").forEach((b) => b.remove());
    block.setAttribute("data-p", `${"#".repeat(level)} `);
    block.className = `md-h${level}`;
  }

  // Preserve editor selection inside the modified block
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/** Injects the table blueprint at the caret line (Ctrl+T and the toolbar table button). */
export function insertTableAtCaret(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  const wrap = firstElement(markdownToHtml("| Header | Header |\n|---|---|\n|  |  |"));
  const block = currentBlock(editor);
  const blankLine = !!block && block.tagName === "DIV" && !isSpecialBlock(block) && (block.textContent || "") === "";

  if (!block) editor.appendChild(wrap);
  else if (blankLine) block.replaceWith(wrap);
  else block.after(wrap);

  ensureTrailingLine(wrap);
  const first = wrap.querySelector("th") as HTMLElement | null;
  if (first) {
    selectContents(first);
    scrollCaretIntoView(editor);
  }
}

function moveInTable(cell: HTMLElement, dir: number, forceRow = false): void {
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!table) return;
  const editor = cell.closest(".md-tablewrap")?.parentElement ?? null;
  const cells = Array.from(table.querySelectorAll("th,td")) as HTMLElement[];
  const cols = table.querySelector("tr")?.children.length ?? 1;
  const idx = cells.indexOf(cell);

  // Tab on the last header cell grows the table by one column
  if (dir === 1 && !forceRow && cell.tagName === "TH" && idx === cols - 1) {
    addColumn(table, cell);
    return;
  }

  // dir 0 = Enter (same column, next row), +1 Tab, -1 Shift+Tab
  let target = dir === 0 ? idx + cols : idx + dir;
  if (forceRow) target = cells.length;

  if (target >= cells.length) {
    if (dir === 0) {
      const tableWrap = (cell.closest(".md-tablewrap") as HTMLElement) || table;
      if (editor) {
        moveCaretAfterTable(tableWrap, editor, true);
      } else {
        let targetLine = tableWrap.nextElementSibling as HTMLElement | null;
        if (!targetLine || isSpecialBlock(targetLine) || targetLine.textContent?.trim()) {
          const newLine = document.createElement("div");
          newLine.appendChild(document.createElement("br"));
          tableWrap.after(newLine);
          targetLine = newLine;
        }
        placeCaretStart(targetLine);
      }
      return;
    }
    const body = table.querySelector("tbody") ?? table.appendChild(document.createElement("tbody"));
    const row = document.createElement("tr");
    const aligns = (table.getAttribute("data-align") || "").split(",");
    for (let i = 0; i < cols; i++) {
      const td = document.createElement("td");
      td.contentEditable = "true";
      if (aligns[i] === "r") td.style.textAlign = "right";
      if (aligns[i] === "c") td.style.textAlign = "center";
      row.appendChild(td);
    }
    body.appendChild(row);
    const rowIdx = Array.from(table.querySelectorAll("tr")).indexOf(row);
    syncTableRowInserted(table, rowIdx);
    const firstOfNew = row.children[dir === 0 ? idx % cols : 0] as HTMLElement;
    focusTableCell(firstOfNew, false, editor);
    return;
  }
  if (target < 0) target = 0;
  focusTableCell(cells[target], false, editor);
}

/** Appends a fresh column to every row of the table (header gets a th, body rows a td). */
function addColumn(table: HTMLTableElement, focusFrom: HTMLElement): void {
  const focusRow = focusFrom.closest("tr");
  let focusTarget: HTMLElement | null = null;
  table.querySelectorAll("tr").forEach((tr) => {
    const isHead = !!tr.closest("thead");
    const c = document.createElement(isHead ? "th" : "td");
    c.contentEditable = "true";
    if (isHead) c.textContent = "Header";
    tr.appendChild(c);
    if (tr === focusRow) focusTarget = c;
  });
  const aligns = (table.getAttribute("data-align") || "").split(",").filter((a) => a !== "");
  aligns.push("n");
  table.setAttribute("data-align", aligns.join(","));
  const { widths, heights } = getTableDimensions(table);
  if (widths.some((w) => w > 0)) {
    widths.push(140);
    applyTableDimensions(table, widths, heights);
  }
  if (focusTarget) focusTableCell(focusTarget, false, table.closest(".md-tablewrap")?.parentElement);
}

/** Heading level of the caret line (0 = normal text); drives the toolbar dropdown label. */
export function getHeadingLevel(editor: HTMLElement): number {
  const block = currentBlock(editor);
  const m = block?.className.match(/\bmd-h(\d)\b/);
  return m ? Math.min(3, Number(m[1])) : 0;
}

/** Turns the caret line into an interactive "- [ ]" task (or back into plain text). */
export function applyTask(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  let block = currentBlock(editor);
  if (!block) block = editor.lastElementChild as HTMLElement | null;
  if (!block) {
    block = document.createElement("div");
    block.appendChild(document.createElement("br"));
    editor.appendChild(block);
  }
  if (block.tagName !== "DIV" || isSpecialBlock(block)) return;

  if (block.classList.contains("md-task")) {
    clearPrefix(block);
    return;
  }
  block.setAttribute("data-p", "- [ ] ");
  block.className = "md-task";
  ensureCheckbox(block, true);
}

/** Click on a rendered checkbox flips `- [ ]` <-> `- [x]` on that line only. Returns true when handled. */
export function handleCheckboxClick(e: React.MouseEvent<HTMLElement>, editor: HTMLElement | null): boolean {
  const cb = (e.target as HTMLElement).closest?.(".md-cb");
  if (!cb || !editor || !editor.contains(cb)) return false;
  const block = cb.parentElement;
  if (!block) return false;
  const p = block.getAttribute("data-p") || "- [ ] ";
  const done = /\[[xX]\]/.test(p);
  block.setAttribute("data-p", p.replace(/\[[ xX]\]/, done ? "[ ]" : "[x]"));
  block.className = done ? "md-task" : "md-task md-task-done";
  return true;
}

// ---------------------------------------------------------------------------
// Unified document model: one markdown string <-> flat content lines.
// Task lines (`- [ ] text`) are stored as is_todo items; everything else is plain text.
// ---------------------------------------------------------------------------

const TASK_LINE = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/;

export function contentToMarkdown(content: Pick<ContentItem, "text" | "is_todo" | "completed" | "indent">[]): string {
  return content
    .map((c) => (c.is_todo ? `${c.indent ?? ""}- [${c.completed ? "x" : " "}] ${c.text}` : c.text))
    .join("\n");
}

/** The note's lines for `md`. A line that did not change keeps its previous object. */
export function markdownToContent(md: string, prev: ContentItem[], newId: () => string): ContentItem[] {
  return md.split("\n").map((line, idx) => {
    const before = prev[idx];
    if (before && !before.is_todo && before.text === line && !line.includes("[")) return before;
    const m = line.match(TASK_LINE);
    const text = m ? m[3] : line;
    const is_todo = !!m;
    const completed = !!m && m[2].toLowerCase() === "x";
    const indent = m?.[1] ?? "";
    if (
      before &&
      before.text === text &&
      before.is_todo === is_todo &&
      before.completed === completed &&
      (before.indent ?? "") === indent
    ) {
      return before;
    }
    return indent ? { id: before?.id ?? newId(), text, is_todo, completed, indent } : { id: before?.id ?? newId(), text, is_todo, completed };
  });
}
/** Context-menu helpers: operate on the table that owns `cell`. */
export function addTableColumn(cell: HTMLElement): void {
  const table = cell.closest("table") as HTMLTableElement | null;
  if (table) addColumn(table, cell);
}

export function addTableRow(cell: HTMLElement): void {
  const table = cell.closest("table") as HTMLTableElement | null;
  const tr = cell.closest("tr");
  if (!table || !tr) return;
  const cols = table.querySelector("tr")?.children.length ?? 1;
  const aligns = (table.getAttribute("data-align") || "").split(",");
  const row = document.createElement("tr");
  for (let i = 0; i < cols; i++) {
    const td = document.createElement("td");
    td.contentEditable = "true";
    if (aligns[i] === "r") td.style.textAlign = "right";
    if (aligns[i] === "c") td.style.textAlign = "center";
    row.appendChild(td);
  }
  if (tr.closest("thead")) {
    const body = table.querySelector("tbody") ?? table.appendChild(document.createElement("tbody"));
    body.prepend(row);
  } else {
    tr.after(row);
  }
  const rowIdx = Array.from(table.querySelectorAll("tr")).indexOf(row);
  syncTableRowInserted(table, rowIdx);
  focusTableCell(row.children[0] as HTMLElement, false, table.closest(".md-tablewrap")?.parentElement);
}

/** Removes the row under `cell` (body rows only; the header row is protected). */
/** Removes the entire table enclosing `cell`, replacing it with an empty editable line. */
export function deleteTable(cell: HTMLElement): boolean {
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!table) return false;
  const wrap = (table.closest(".md-tablewrap") as HTMLElement | null) ?? table;
  const line = document.createElement("div");
  line.appendChild(document.createElement("br"));
  wrap.replaceWith(line);
  placeCaretStart(line);
  return true;
}

export function deleteTableRow(cell: HTMLElement): boolean {
  const tr = cell.closest("tr");
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!tr || !table || tr.closest("thead")) return false;
  const rowIdx = Array.from(table.querySelectorAll("tr")).indexOf(tr);
  const next = (tr.nextElementSibling ?? tr.previousElementSibling) as HTMLElement | null;
  const idx = Array.from(tr.children).indexOf(cell);
  tr.remove();
  syncTableRowsAfterDelete(table, rowIdx);
  const target = (next?.children[Math.max(0, idx)] as HTMLElement | undefined) ?? null;
  if (target) focusTableCell(target, false, table.closest(".md-tablewrap")?.parentElement);
  return true;
}
/**
 * Read-only card preview: exactly the markup the editor shows when the note is opened (MD mode),
 * with every editable flag stripped. `taskIds` maps the Nth rendered checkbox to its content item.
 */
/** More lines than the tallest card shows. Rendering all of a long note into its card cost more than the rest of the canvas. */
const PREVIEW_LINES = 40;
const IMAGE_REFERENCE_LINE = /^\s*\[[a-zA-Z0-9_\-]+\]:\s*\S+\s*$/;

/** The start of a note, plus any trailing rows/metadata of an open table and image references it links to. */
function previewContent(content: ContentItem[]): ContentItem[] {
  if (content.length <= PREVIEW_LINES) return content;
  let end = PREVIEW_LINES;
  if (isTableRow(content[end - 1]?.text ?? "")) {
    while (end < content.length && isTableRow(content[end].text)) end++;
  }
  if (end < content.length && TABLE_META_RE.test(content[end].text)) {
    end++;
  }
  return [...content.slice(0, end), ...content.slice(end).filter((item) => IMAGE_REFERENCE_LINE.test(item.text))];
}

/** The start of a text-mode note, as its card shows it. */
export function previewText(content: ContentItem[]): string {
  return contentToMarkdown(content.slice(0, PREVIEW_LINES));
}

export function previewMarkup(fullContent: ContentItem[]): { html: string; taskIds: string[] } {
  const content = previewContent(fullContent);
  const html = markdownToHtml(contentToMarkdown(content))
    .replace(/ contenteditable="[^"]*"/g, "")
    .replace(/ spellcheck="false"/g, "");

  const taskIds: string[] = [];
  let fence: string | null = null;
  for (const item of content) {
    const line = item.is_todo ? `- [${item.completed ? "x" : " "}] ${item.text}` : item.text;
    const t = line.trim();
    const m = t.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (m && m[1][0] === fence[0] && t.split("").every((ch) => ch === fence![0])) fence = null;
    } else if (m) {
      fence = m[1];
    } else if (item.is_todo) {
      taskIds.push(item.id);
    }
  }
  return { html, taskIds };
}
/** Removes the column under `cell` from every row (a table always keeps at least one column). */
export function deleteTableColumn(cell: HTMLElement): boolean {
  const table = cell.closest("table") as HTMLTableElement | null;
  const tr = cell.closest("tr");
  if (!table || !tr) return false;
  const cols = tr.children.length;
  if (cols <= 1) return false;
  const idx = Array.from(tr.children).indexOf(cell);
  table.querySelectorAll("tr").forEach((row) => row.children[idx]?.remove());
  const aligns = (table.getAttribute("data-align") || "").split(",").filter((a) => a !== "");
  aligns.splice(idx, 1);
  table.setAttribute("data-align", aligns.join(","));
  const { widths, heights } = getTableDimensions(table);
  if (idx < widths.length) widths.splice(idx, 1);
  if (widths.some((w) => w > 0) || heights.some((h) => h > 0)) {
    applyTableDimensions(table, widths, heights);
  }
  const target = tr.children[Math.min(idx, cols - 2)] as HTMLElement | undefined;
  if (target) focusTableCell(target, false, table.closest(".md-tablewrap")?.parentElement);
  return true;
}

/**
 * Wraps the current selection with prefix and suffix, or inserts a placeholder.
 */
function applyInlineTag(editor: HTMLElement, tag: string, className: string): void {
  wrapStrayNodes(editor);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) editor.focus();
  const currentSel = window.getSelection();
  if (!currentSel || currentSel.rangeCount === 0) return;
  const range = currentSel.getRangeAt(0);

  if (range.collapsed) {
    const el = document.createElement(tag);
    el.className = className;
    const zw = document.createTextNode("\u200B");
    el.appendChild(zw);
    range.insertNode(el);

    const afterNode = document.createTextNode("\u200B");
    el.after(afterNode);

    const r = document.createRange();
    r.setStart(zw, 0);
    r.collapse(true);
    currentSel.removeAllRanges();
    currentSel.addRange(r);
  } else {
    const selectedText = range.toString();
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = selectedText;
    range.deleteContents();
    range.insertNode(el);

    const afterNode = document.createTextNode("\u200B");
    el.after(afterNode);
    const r = document.createRange();
    r.setStart(afterNode, 1);
    r.collapse(true);
    currentSel.removeAllRanges();
    currentSel.addRange(r);
  }
}

export function applyInlineCode(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) editor.focus();
  const currentSel = window.getSelection();
  if (!currentSel || currentSel.rangeCount === 0) return;
  const range = currentSel.getRangeAt(0);

  const existingCode = (
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement
  )?.closest("code.md-code") as HTMLElement | null;

  if (existingCode && editor.contains(existingCode)) {
    let after = existingCode.nextSibling;
    if (!after) {
      after = document.createTextNode("\u200B");
      existingCode.after(after);
    }
    const r = document.createRange();
    r.setStart(after, after.nodeType === Node.TEXT_NODE ? Math.min(1, (after as Text).length) : 0);
    r.collapse(true);
    currentSel.removeAllRanges();
    currentSel.addRange(r);
    return;
  }

  if (range.collapsed) {
    const codeEl = document.createElement("code");
    codeEl.className = "md-code";
    const zw = document.createTextNode("\u200B");
    codeEl.appendChild(zw);
    range.insertNode(codeEl);

    const afterNode = document.createTextNode("\u200B");
    codeEl.after(afterNode);

    const r = document.createRange();
    r.setStart(zw, 0);
    r.collapse(true);
    currentSel.removeAllRanges();
    currentSel.addRange(r);
  } else {
    const selectedText = range.toString();
    const codeEl = document.createElement("code");
    codeEl.className = "md-code";
    codeEl.textContent = selectedText;
    range.deleteContents();
    range.insertNode(codeEl);

    const afterNode = document.createTextNode("\u200B");
    codeEl.after(afterNode);
    const r = document.createRange();
    r.setStart(afterNode, 1);
    r.collapse(true);
    currentSel.removeAllRanges();
    currentSel.addRange(r);
  }
}

export function applyStrikethrough(editor: HTMLElement): void {
  applyInlineTag(editor, "del", "md-del");
}

export function applyHighlight(editor: HTMLElement): void {
  applyInlineTag(editor, "mark", "md-mark");
}

export function applySubscript(editor: HTMLElement): void {
  applyInlineTag(editor, "sub", "md-sub");
}

export function applySuperscript(editor: HTMLElement): void {
  applyInlineTag(editor, "sup", "md-sup");
}

export function applyLink(editor: HTMLElement, customUrl?: string): void {
  wrapStrayNodes(editor);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) editor.focus();
  const currentSel = window.getSelection();
  if (!currentSel || currentSel.rangeCount === 0) return;
  const range = currentSel.getRangeAt(0);

  const selectedText = range.collapsed ? "" : range.toString();
  const urlPrompt = customUrl ?? window.prompt("Enter link URL:", "https://");
  if (urlPrompt === null) return;
  const url = urlPrompt.trim() || "https://";

  let title = selectedText;
  if (!title) {
    const titlePrompt = window.prompt("Enter link text:", url);
    if (titlePrompt === null) return;
    title = titlePrompt.trim() || url;
  }

  const a = document.createElement("a");
  a.className = "md-link";
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = `Ctrl+Click to open: ${url}`;
  a.textContent = title;

  range.deleteContents();
  range.insertNode(a);

  const afterNode = document.createTextNode("\u200B");
  a.after(afterNode);
  const r = document.createRange();
  r.setStart(afterNode, 1);
  r.collapse(true);
  currentSel.removeAllRanges();
  currentSel.addRange(r);
}

export function applyFootnote(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) editor.focus();
  const currentSel = window.getSelection();
  if (!currentSel || currentSel.rangeCount === 0) return;
  const range = currentSel.getRangeAt(0);

  const existingRefs = Array.from(editor.querySelectorAll(".md-footnote-ref, .md-footnote-def"));
  let nextIdx = 1;
  const nums: number[] = [];
  existingRefs.forEach((el) => {
    const fnAttr = el.getAttribute("data-fn");
    if (fnAttr) {
      const n = parseInt(fnAttr, 10);
      if (!isNaN(n)) nums.push(n);
    }
    const pAttr = el.getAttribute("data-p");
    if (pAttr) {
      const m = pAttr.match(/\[\^(\d+)\]/);
      if (m) nums.push(parseInt(m[1], 10));
    }
  });
  if (nums.length > 0) nextIdx = Math.max(...nums) + 1;

  // Insert footnote ref tag at caret
  const sup = document.createElement("sup");
  sup.className = "md-footnote-ref";
  sup.setAttribute("data-fn", String(nextIdx));
  sup.setAttribute("contenteditable", "false");
  sup.textContent = `[${nextIdx}]`;
  range.deleteContents();
  range.insertNode(sup);

  const afterSup = document.createTextNode("\u200B");
  sup.after(afterSup);

  // Append footnote definition line at bottom
  const defLine = document.createElement("div");
  defLine.setAttribute("data-p", `[^${nextIdx}]: `);
  defLine.className = "md-footnote-def";

  const badge = document.createElement("span");
  badge.className = "md-fn-badge";
  badge.setAttribute("contenteditable", "false");
  badge.textContent = `[^${nextIdx}]: `;
  defLine.appendChild(badge);

  const textNode = document.createTextNode("Footnote explanation");
  defLine.appendChild(textNode);
  editor.appendChild(defLine);

  // Focus and select the explanation text
  const r = document.createRange();
  r.selectNodeContents(textNode);
  currentSel.removeAllRanges();
  currentSel.addRange(r);
}

export function applyOrderedList(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  let block = currentBlock(editor);
  if (!block) block = editor.lastElementChild as HTMLElement | null;
  if (!block) {
    block = document.createElement("div");
    block.appendChild(document.createElement("br"));
    editor.appendChild(block);
  }
  if (block.tagName !== "DIV" || isSpecialBlock(block)) return;

  if (block.classList.contains("md-ol")) {
    clearPrefix(block);
    renumberOrderedLists(editor);
    return;
  }
  block.querySelectorAll(".md-cb, .md-fn-badge").forEach((b) => b.remove());
  block.setAttribute("data-p", "1. ");
  block.className = "md-ol";
  renumberOrderedLists(editor);
}

export function applyBlockquote(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  let block = currentBlock(editor);
  if (!block) block = editor.lastElementChild as HTMLElement | null;
  if (!block) {
    block = document.createElement("div");
    block.appendChild(document.createElement("br"));
    editor.appendChild(block);
  }
  if (block.tagName !== "DIV" || isSpecialBlock(block)) return;

  if (block.classList.contains("md-quote")) {
    clearPrefix(block);
    return;
  }
  block.querySelectorAll(".md-cb, .md-fn-badge").forEach((b) => b.remove());
  block.setAttribute("data-p", "> ");
  block.className = "md-quote";
}

export function applyDefinitionList(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  let block = currentBlock(editor);
  if (!block) block = editor.lastElementChild as HTMLElement | null;
  if (!block) {
    block = document.createElement("div");
    block.appendChild(document.createElement("br"));
    editor.appendChild(block);
  }
  if (block.tagName !== "DIV" || isSpecialBlock(block)) return;

  if (block.classList.contains("md-dd")) {
    clearPrefix(block);
    return;
  }
  const termText = block.textContent?.trim() || "Term";
  block.textContent = termText;
  block.removeAttribute("data-p");
  block.removeAttribute("class");

  const defLine = document.createElement("div");
  defLine.setAttribute("data-p", ": ");
  defLine.className = "md-dd";
  defLine.appendChild(document.createTextNode("Definition here"));
  block.after(defLine);

  selectContents(defLine, true);
}

export function insertEmojiAtCaret(editor: HTMLElement, emoji: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) editor.focus();
  const currentSel = window.getSelection();
  if (!currentSel || currentSel.rangeCount === 0) return;
  const range = currentSel.getRangeAt(0);

  const textNode = document.createTextNode(emoji);
  range.deleteContents();
  range.insertNode(textNode);
  const newRange = document.createRange();
  newRange.setStartAfter(textNode);
  newRange.collapse(true);
  currentSel.removeAllRanges();
  currentSel.addRange(newRange);
}

