// @vitest-environment happy-dom
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  addTableColumn,
  addTableRow,
  applyTableDimensions,
  contentToMarkdown,
  deleteTableColumn,
  deleteTableRow,
  handleRichEditorKeyDown,
  htmlToMarkdown,
  imageMarkdownWithAlt,
  isCaretAtEditorStart,
  markdownToContent,
  markdownToHtml,
  previewMarkup,
  scrollCaretIntoView,
} from "./format";
import { densityOf, plainPreview, previewLine } from "./text";

const image = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null }) as unknown as HTMLImageElement;

describe("markdownToContent", () => {
  it("keeps the objects of unchanged lines and rebuilds only the line that changed", () => {
    const newId = () => "new";
    const before = markdownToContent("one\n- [ ] two\nthree", [], newId);
    const after = markdownToContent("one\n- [x] two\nthree", before, newId);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).toMatchObject({ id: before[1].id, text: "two", is_todo: true, completed: true });
  });
});

describe("imageMarkdownWithAlt", () => {
  it("keeps the link the note wrote, not the URL the webview loads", () => {
    const saved = image({ "data-md": "![old](assets/3f2a.png)", src: "asset://localhost/notes/assets/3f2a.png" });
    expect(imageMarkdownWithAlt(saved, "new")).toBe("![new](assets/3f2a.png)");
    expect(imageMarkdownWithAlt(image({ "data-md": "![old][img-2]" }), "new")).toBe("![new][img-2]");
  });
});

describe("table sizing formatting and preview", () => {
  it("round-trips column widths and row heights via portable markdown comments and previewMarkup", () => {
    const md = [
      "| Name | Role |",
      "| --- | --- |",
      "| Alice | Admin |",
      "<!-- doit-table: cols=180,260 rows=40,56 -->",
    ].join("\n");

    const host = document.createElement("div");
    host.innerHTML = markdownToHtml(md);

    const table = host.querySelector("table.md-tbl") as HTMLTableElement;
    expect(table).not.toBeNull();
    expect(table.getAttribute("data-sized")).toBe("1");
    expect(table.getAttribute("data-widths")).toBe("180,260");
    expect(table.getAttribute("data-heights")).toBe("40,56");
    expect(table.style.getPropertyValue("--tbl-w")).toBe("440px");

    const headers = table.querySelectorAll("th");
    expect((headers[0] as HTMLElement).style.getPropertyValue("--col-pct")).toBe("40.91%");
    expect((headers[1] as HTMLElement).style.getPropertyValue("--col-pct")).toBe("59.09%");

    const rows = table.querySelectorAll("tr");
    expect(rows[0].getAttribute("data-h")).toBe("40");
    expect(rows[1].getAttribute("data-h")).toBe("56");

    expect(htmlToMarkdown(host)).toBe(md);

    const items = markdownToContent(md, [], () => "id");
    const preview = previewMarkup(items);
    expect(preview.html).toContain('data-sized="1"');
    expect(preview.html).toContain('--col-pct:40.91%');
    expect(preview.html).toContain('data-h="56"');
    expect(previewLine("<!-- doit-table: cols=180,260 rows=40,56 -->")).toEqual({ kind: "skip", text: "" });
    expect(plainPreview({ id: "1", title: "", content: items, category: "Work", last_edited: 1, grid_coordinates: { x: 0, y: 0, w: 320, h: 220 } }, 10)).toEqual([
      "| Name | Role |",
      "| --- | --- |",
      "| Alice | Admin |",
    ]);
    expect(densityOf({ id: "1", title: "", content: items, category: "Work", last_edited: 1, grid_coordinates: { x: 0, y: 0, w: 320, h: 220 } }).weight).toBe("denseChecklist");
  });

  it("keeps table dimensions synchronized when adding or deleting columns and rows", () => {
    const host = document.createElement("div");
    host.contentEditable = "true";
    document.body.appendChild(host);
    host.innerHTML = markdownToHtml("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const table = host.querySelector("table.md-tbl") as HTMLTableElement;

    applyTableDimensions(table, [150, 250], [36, 44]);
    expect(table.getAttribute("data-widths")).toBe("150,250");
    expect(table.getAttribute("data-heights")).toBe("36,44");

    const firstCell = table.querySelector("th") as HTMLElement;
    addTableColumn(firstCell);
    expect(table.getAttribute("data-widths")).toBe("150,250,140");

    const lastHeader = table.querySelector("thead tr")?.lastElementChild as HTMLElement;
    expect(deleteTableColumn(lastHeader)).toBe(true);
    expect(table.getAttribute("data-widths")).toBe("150,250");

    addTableRow(firstCell);
    expect(table.getAttribute("data-heights")).toBe("36,0,44");

    const insertedBodyCell = table.querySelector("tbody tr td") as HTMLElement;
    expect(deleteTableRow(insertedBodyCell)).toBe(true);
    expect(table.getAttribute("data-heights")).toBe("36,44");
    host.remove();
  });
});

describe("table keyboard navigation", () => {
  function setCaret(node: Node, offset: number) {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function keyEvent(key: string): React.KeyboardEvent<HTMLDivElement> {
    return {
      key,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLDivElement>;
  }

  it("navigates seamlessly across cells with arrow keys and respects table start/exit boundaries", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = markdownToHtml("| H1 | H2 |\n| --- | --- |\n| A1 | A2 |\nAfter");
    document.body.appendChild(editor);

    const cells = Array.from(editor.querySelectorAll("th,td")) as HTMLElement[];
    const [h1, h2, a1, a2] = cells;

    // In top row of first-block table, isCaretAtEditorStart is true; in row 2 it is false.
    setCaret(h1.firstChild!, 0);
    expect(isCaretAtEditorStart(editor)).toBe(true);
    setCaret(a1.firstChild!, 0);
    expect(isCaretAtEditorStart(editor)).toBe(false);

    // ArrowUp from row 2 col 0 moves to row 1 col 0 (h1)
    const upEv = keyEvent("ArrowUp");
    expect(handleRichEditorKeyDown(upEv, editor, vi.fn())).toBe(true);
    expect(window.getSelection()?.anchorNode).toBe(h1);

    // ArrowRight at end of h1 moves to h2
    setCaret(h1.firstChild!, h1.firstChild!.textContent!.length);
    const rightEv = keyEvent("ArrowRight");
    expect(handleRichEditorKeyDown(rightEv, editor, vi.fn())).toBe(true);
    expect(window.getSelection()?.anchorNode).toBe(h2);

    // ArrowDown from h2 moves to a2
    setCaret(h2.firstChild!, 0);
    const downEv = keyEvent("ArrowDown");
    expect(handleRichEditorKeyDown(downEv, editor, vi.fn())).toBe(true);
    expect(window.getSelection()?.anchorNode).toBe(a2);

    // ArrowLeft at start of a2 moves to a1
    setCaret(a2.firstChild!, 0);
    const leftEv = keyEvent("ArrowLeft");
    expect(handleRichEditorKeyDown(leftEv, editor, vi.fn())).toBe(true);
    expect(window.getSelection()?.anchorNode).toBe(a1);

    // ArrowRight at end of last cell (a2) exits into block after table
    setCaret(a2.firstChild!, a2.firstChild!.textContent!.length);
    expect(handleRichEditorKeyDown(keyEvent("ArrowRight"), editor, vi.fn())).toBe(true);
    const afterBlock = editor.lastElementChild as HTMLElement;
    expect(afterBlock.textContent).toBe("After");
    expect(afterBlock.contains(window.getSelection()?.anchorNode ?? null)).toBe(true);

    // ArrowUp from block after table re-enters last row first cell (a1)
    setCaret(afterBlock.firstChild!, 0);
    expect(handleRichEditorKeyDown(keyEvent("ArrowUp"), editor, vi.fn())).toBe(true);
    expect(window.getSelection()?.anchorNode).toBe(a1);

    editor.remove();
  });
});

describe("scrollCaretIntoView", () => {
  it("scrolls the overflow container downward when the caret goes past the bottom threshold", () => {
    const scrollBox = document.createElement("div");
    scrollBox.className = "overflow-y-auto";
    scrollBox.scrollTop = 100;
    scrollBox.getBoundingClientRect = () =>
      ({ top: 100, bottom: 500, left: 0, right: 400, width: 400, height: 400, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;

    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const line = document.createElement("div");
    line.textContent = "Bottom line";
    line.getBoundingClientRect = () =>
      ({ top: 510, bottom: 530, left: 0, right: 200, width: 200, height: 20, x: 0, y: 510, toJSON: () => ({}) }) as DOMRect;

    editor.appendChild(line);
    scrollBox.appendChild(editor);
    document.body.appendChild(scrollBox);

    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(line.firstChild!, 4);
    range.collapse(true);
    range.getBoundingClientRect = () =>
      ({ top: 510, bottom: 530, left: 10, right: 10, width: 0, height: 20, x: 10, y: 510, toJSON: () => ({}) }) as DOMRect;
    sel.removeAllRanges();
    sel.addRange(range);

    scrollCaretIntoView(editor);
    // bottom = 530, container.bottom - 44 = 456 -> delta = 74 -> scrollTop = 174
    expect(scrollBox.scrollTop).toBe(174);

    scrollBox.remove();
  });
});

describe("list nesting and moving lines", () => {
  function editorWith(markdown: string): HTMLElement {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = markdownToHtml(markdown);
    document.body.appendChild(editor);
    return editor;
  }

  function press(editor: HTMLElement, line: number, key: string, mods: { shiftKey?: boolean; altKey?: boolean } = {}) {
    const block = editor.children[line];
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const event = { key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn(), ...mods };
    return handleRichEditorKeyDown(event as unknown as React.KeyboardEvent<HTMLDivElement>, editor, vi.fn());
  }

  const saved = (editor: HTMLElement) => contentToMarkdown(markdownToContent(htmlToMarkdown(editor), [], () => "id"));

  it("nests list lines with Tab and brings them back with Shift+Tab, as saved to the note", () => {
    const editor = editorWith("- parent\n- [ ] task\n1. first\n1. second");
    press(editor, 1, "Tab");
    press(editor, 3, "Tab");
    expect(saved(editor)).toBe("- parent\n    - [ ] task\n1. first\n    1. second");

    press(editor, 1, "Tab", { shiftKey: true });
    expect(saved(editor)).toBe("- parent\n- [ ] task\n1. first\n    1. second");
    editor.remove();
  });

  it("moves a line with Alt+Down together with the lines nested under it", () => {
    const editor = editorWith("- a\n    - a1\n- b");
    press(editor, 0, "ArrowDown", { altKey: true });
    expect(saved(editor)).toBe("- b\n- a\n    - a1");
    editor.remove();
  });
});
