import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ContentItem } from "../api/tauriBridge";
import { getMarkdownShortcuts, matchesCombo } from "./shortcuts";

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

export function inlineMarkdownToHtml(line: string): string {
  // Pull images out first so their paths are never touched by bold/italic rules
  const images: string[] = [];
  const work = line.replace(IMAGE_MD, (match: string, alt: string, src: string) => {
    const url = resolveImageSrc(src);
    if (!url) return match;
    images.push(
      `<img class="md-img" contenteditable="false" draggable="false" data-md="${escapeAttr(match)}" alt="${escapeAttr(alt)}" src="${escapeAttr(url)}" />`,
    );
    return `\u0001${images.length - 1}\u0002`;
  });

  let formatted = escapeHtml(work);

  // Replace bold+italic ***text*** -> <strong><em>text</em></strong>
  formatted = formatted.replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Replace bold **text** -> <strong>text</strong>
  formatted = formatted.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  // Replace italic *text* -> <em>text</em>
  formatted = formatted.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");

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

function alignOf(cell: string): string {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "c" : r ? "r" : l ? "l" : "n";
}

function tableHtml(header: string[], aligns: string[], rows: string[][]): string {
  const n = header.length;
  const al = Array.from({ length: n }, (_, i) => aligns[i] || "n");
  const style = (i: number) =>
    al[i] === "r" ? ' style="text-align:right"' : al[i] === "c" ? ' style="text-align:center"' : "";
  const cell = (tag: string, text: string, i: number) =>
    `<${tag} contenteditable="true"${style(i)}>${inlineMarkdownToHtml(text)}</${tag}>`;
  const head = `<tr>${header.map((h, i) => cell("th", h, i)).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${Array.from({ length: n }, (_, i) => cell("td", r[i] ?? "", i)).join("")}</tr>`)
    .join("");
  return `<div class="md-tablewrap w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent" data-md-table="1" contenteditable="false"><table class="md-tbl" data-align="${al.join(",")}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function preHtml(code: string, lang: string, fence: string): string {
  return `<pre class="md-pre" data-lang="${escapeAttr(lang)}" data-fence="${fence}" contenteditable="plaintext-only" spellcheck="false">${escapeHtml(code)}</pre>`;
}

export function markdownToHtml(md: string): string {
  if (!md) return "<div><br></div>";
  const lines = md.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    const fence = t.match(/^(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      let j = i + 1;
      while (j < lines.length) {
        const c = lines[j].trim();
        if (c.length >= marker.length && c.split("").every((ch) => ch === marker[0])) break;
        j++;
      }
      out.push(preHtml(lines.slice(i + 1, j).join("\n"), fence[2] || "", marker[0].repeat(3)));
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
      out.push(tableHtml(header, aligns, rows));
      i = k - 1;
      continue;
    }

    if (t && HR_RE.test(line)) {
      out.push(`<div class="md-hr" data-raw="${escapeAttr(t)}" contenteditable="false"><hr></div>`);
      continue;
    }

    const info = blockPrefix(line);
    if (info) {
      const rest = line.slice(info.consumed);
      const cb = info.cls.startsWith("md-task") ? CHECKBOX_HTML : "";
      out.push(
        `<div class="${info.cls}" data-p="${escapeAttr(info.prefix)}">${cb}${rest ? inlineMarkdownToHtml(rest) : "<br>"}</div>`,
      );
      continue;
    }

    out.push(line ? `<div>${inlineMarkdownToHtml(line)}</div>` : "<div><br></div>");
  }

  return out.join("");
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

function placeCaretStart(el: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStart(el, 0);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function selectContents(el: HTMLElement, collapseToEnd = false): void {
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
export function normalizeEditor(editor: HTMLElement): void {
  wrapStrayNodes(editor);
  const caretBlock = currentBlock(editor);

  for (const child of Array.from(editor.children)) {
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

    if (el.classList.contains("md-cb")) return;

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
      cur += el.getAttribute("data-md") ?? "";
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
function tableToLines(wrap: HTMLElement): string[] {
  const table = wrap.querySelector("table");
  if (!table) return [];
  const aligns = (table.getAttribute("data-align") || "").split(",");
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).map((c) =>
      htmlToMarkdown(c as HTMLElement).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
    ),
  );
  if (rows.length === 0) return [];
  const n = rows[0].length;
  const fmt = (cells: string[]) => `| ${Array.from({ length: n }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  const marks: Record<string, string> = { l: ":---", c: ":---:", r: "---:" };
  const sep = `| ${Array.from({ length: n }, (_, i) => marks[aligns[i]] ?? "---").join(" | ")} |`;
  return [fmt(rows[0]), sep, ...rows.slice(1).map(fmt)];
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
  const isShortcut = headingLevel > 0 || wantsTable || wantsTask;

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
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      moveInTable(cell, e.key === "Tab" ? (e.shiftKey ? -1 : 1) : 0);
      onInput();
      return true;
    }
    if (isShortcut) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  // ---- inside a code block: plain-text island, leave it alone ----
  if (startEl?.closest("pre.md-pre")) {
    if (isShortcut) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  if (isShortcut) {
    e.preventDefault();
    if (wantsTable) insertTableAtCaret(editor);
    else if (wantsTask) applyTask(editor);
    else applyHeading(editor, headingLevel);
    onInput();
    return true;
  }

  const block = currentBlock(editor);
  if (!block || block.tagName !== "DIV" || !block.hasAttribute("data-p") || !sel.isCollapsed) return false;

  if (e.key === "Enter") {
    const isEmpty = (block.textContent || "") === "";
    const isList = block.classList.contains("md-li") || block.classList.contains("md-quote");
    const isTask = block.classList.contains("md-task");
    if (isEmpty && (isList || isTask)) {
      // empty bullet / quote / task line: leave the list
      e.preventDefault();
      clearPrefix(block);
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
      const r = document.createRange();
      r.setStart(next, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      onInput();
      return true;
    }
    if (/\bmd-h\d\b/.test(block.className) && caretAtEnd(block, range)) {
      e.preventDefault();
      const next = document.createElement("div");
      next.appendChild(document.createElement("br"));
      block.after(next);
      placeCaretStart(next);
      onInput();
      return true;
    }
  }

  if (e.key === "Backspace" && caretOffsetIn(block, range) === 0) {
    e.preventDefault();
    clearPrefix(block);
    onInput();
    return true;
  }

  return false;
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

function caretAtEnd(block: HTMLElement, range: Range): boolean {
  const post = document.createRange();
  post.selectNodeContents(block);
  post.setStart(range.endContainer, range.endOffset);
  return post.toString() === "";
}

function clearPrefix(block: HTMLElement): void {
  block.removeAttribute("data-p");
  block.removeAttribute("class");
  block.querySelectorAll(".md-cb").forEach((b) => b.remove());
  if (!block.firstChild) block.appendChild(document.createElement("br"));
}

/** Toggles a heading (Ctrl+1/2/3 and the toolbar H1/H2/H3 buttons) on the caret line. */
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

  const isHeading = /\bmd-h\d\b/.test(block.className);
  if (level === 0) {
    if (isHeading) clearPrefix(block);
    return;
  }
  const cls = `md-h${level}`;
  if (block.classList.contains(cls)) {
    clearPrefix(block);
  } else {
    block.querySelectorAll(".md-cb").forEach((b) => b.remove());
    block.setAttribute("data-p", `${"#".repeat(level)} `);
    block.className = cls;
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
  if (first) selectContents(first);
}

function moveInTable(cell: HTMLElement, dir: number, forceRow = false): void {
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!table) return;
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
    const firstOfNew = row.children[dir === 0 ? idx % cols : 0] as HTMLElement;
    selectContents(firstOfNew, true);
    return;
  }
  if (target < 0) target = 0;
  selectContents(cells[target], true);
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
  if (focusTarget) selectContents(focusTarget, true);
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

const TASK_LINE = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

export function contentToMarkdown(content: { text: string; is_todo: boolean; completed: boolean }[]): string {
  return content.map((c) => (c.is_todo ? `- [${c.completed ? "x" : " "}] ${c.text}` : c.text)).join("\n");
}

export function markdownToContent(md: string, prev: ContentItem[], newId: () => string): ContentItem[] {
  return md.split("\n").map((line, idx) => {
    const m = line.match(TASK_LINE);
    return {
      id: prev[idx]?.id ?? newId(),
      text: m ? m[2] : line,
      is_todo: !!m,
      completed: !!m && m[1].toLowerCase() === "x",
    };
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
  selectContents(row.children[0] as HTMLElement, true);
}

/** Removes the row under `cell` (body rows only; the header row is protected). */
export function deleteTableRow(cell: HTMLElement): boolean {
  const tr = cell.closest("tr");
  if (!tr || tr.closest("thead")) return false;
  const next = (tr.nextElementSibling ?? tr.previousElementSibling) as HTMLElement | null;
  const idx = Array.from(tr.children).indexOf(cell);
  tr.remove();
  const target = (next?.children[Math.max(0, idx)] as HTMLElement | undefined) ?? null;
  if (target) selectContents(target, true);
  return true;
}
/**
 * Read-only card preview: exactly the markup the editor shows when the note is opened (MD mode),
 * with every editable flag stripped. `taskIds` maps the Nth rendered checkbox to its content item.
 */
export function previewMarkup(content: ContentItem[]): { html: string; taskIds: string[] } {
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
  const target = tr.children[Math.min(idx, cols - 2)] as HTMLElement | undefined;
  if (target) selectContents(target, true);
  return true;
}