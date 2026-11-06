import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ContentItem } from "../api/tauriBridge";
import { getMarkdownShortcuts, matchesCombo } from "./shortcuts";
import { EMOJI_MAP } from "./emoji";

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

export function openExternalUrl(url: string): void {
  if (!url) return;
  void import("@tauri-apps/plugin-opener")
    .then((m) => m.openUrl(url))
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}

export function inlineMarkdownToHtml(line: string): string {
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
      const fnBadge = info.cls === "md-footnote-def" ? `<span class="md-fn-badge" contenteditable="false">${escapeHtml(info.prefix)}</span>` : "";
      out.push(
        `<div class="${info.cls}" data-p="${escapeAttr(info.prefix)}">${cb}${fnBadge}${rest ? inlineMarkdownToHtml(rest) : "<br>"}</div>`,
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
  }
}

  wrapStrayNodes(editor);
  convertInlineInTextNodes(editor);
  const caretBlock = currentBlock(editor);

  // Fenced code block detection: merge consecutive divs bounded by ``` ... ``` or ~~~ ... ~~~
  const childrenList = Array.from(editor.children);
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
    if (e.key === "Enter" && !e.shiftKey) {
      const table = cell.closest("table") as HTMLTableElement | null;
      if (table) {
        const cells = Array.from(table.querySelectorAll("th,td")) as HTMLElement[];
        const isLastCell = cells.indexOf(cell) === cells.length - 1;
        const tr = cell.closest("tr");
        const isLastRow = tr && tr === table.querySelector("tbody tr:last-child, tr:last-child");
        const isRowEmpty = tr && Array.from(tr.children).every((c) => (c.textContent || "").trim() === "");

        if ((isLastCell && caretAtEnd(cell, range)) || (isLastRow && isRowEmpty)) {
          e.preventDefault();
          if (isLastRow && isRowEmpty && table.querySelectorAll("tr").length > 1) {
            tr?.remove();
          }
          const tableWrap = (cell.closest(".md-tablewrap") as HTMLElement) || table;
          let targetLine = tableWrap.nextElementSibling as HTMLElement | null;
          if (
            !targetLine ||
            targetLine.classList.contains("md-tablewrap") ||
            targetLine.classList.contains("md-pre") ||
            targetLine.hasAttribute("data-raw") ||
            targetLine.textContent?.trim()
          ) {
            const newLine = document.createElement("div");
            newLine.appendChild(document.createElement("br"));
            tableWrap.after(newLine);
            targetLine = newLine;
          }
          placeCaretStart(targetLine);
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

  const block = currentBlock(editor);
  if (!block || block.tagName !== "DIV" || !sel.isCollapsed) return false;

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
    if (isEmpty && (isList || isTask || isHeading || isOl || isDd || isFnDef)) {
      // Empty bullet / task / quote / heading line: exit to normal text paragraph!
      e.preventDefault();
      clearPrefix(block);
      placeCaretStart(block);
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

    if (isList && caretAtEnd(block, range)) {
      e.preventDefault();
      const next = document.createElement("div");
      next.setAttribute("data-p", block.getAttribute("data-p") || "- ");
      next.className = block.className || "md-li";
      next.appendChild(document.createElement("br"));
      block.after(next);
      placeCaretStart(next);
      onInput();
      return true;
    }

    if (isOl && caretAtEnd(block, range)) {
      e.preventDefault();
      const currentPrefix = block.getAttribute("data-p") || "1. ";
      const numMatch = currentPrefix.match(/\d+/);
      const nextNum = numMatch ? parseInt(numMatch[0], 10) + 1 : 1;
      const nextPrefix = `${nextNum}. `;
      const next = document.createElement("div");
      next.setAttribute("data-p", nextPrefix);
      next.className = "md-ol";
      next.appendChild(document.createElement("br"));
      block.after(next);
      placeCaretStart(next);
      onInput();
      return true;
    }

    if (isHeading && caretAtEnd(block, range)) {
      e.preventDefault();
      const next = document.createElement("div");
      next.appendChild(document.createElement("br"));
      block.after(next);
      placeCaretStart(next);
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
    if (isList || isTask || isHeading || hasPrefix || isOl || isDd || isFnDef) {
      e.preventDefault();
      clearPrefix(block);
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

function caretAtEnd(block: HTMLElement, range: Range): boolean {
  const post = document.createRange();
  post.selectNodeContents(block);
  post.setStart(range.endContainer, range.endOffset);
  return post.toString() === "";
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
    if (dir === 0) {
      const tableWrap = (cell.closest(".md-tablewrap") as HTMLElement) || table;
      let targetLine = tableWrap.nextElementSibling as HTMLElement | null;
      if (
        !targetLine ||
        targetLine.classList.contains("md-tablewrap") ||
        targetLine.classList.contains("md-pre") ||
        targetLine.hasAttribute("data-raw") ||
        targetLine.textContent?.trim()
      ) {
        const newLine = document.createElement("div");
        newLine.appendChild(document.createElement("br"));
        tableWrap.after(newLine);
        targetLine = newLine;
      }
      placeCaretStart(targetLine);
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
    return;
  }
  block.querySelectorAll(".md-cb, .md-fn-badge").forEach((b) => b.remove());
  block.setAttribute("data-p", "1. ");
  block.className = "md-ol";
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

