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
  handleLinkPaste,
  handleRichEditorKeyDown,
  handleTableMouseDown,
  handleTableMouseMove,
  htmlToMarkdown,
  imageMarkdownWithAlt,
  inlineMarkdownToHtml,
  insertSavedImageAtCaret,
  isCaretAtEditorStart,
  markdownToContent,
  markdownToHtml,
  normalizeEditor,
  previewMarkup,
  scrollCaretIntoView,
  setMarkdownBaseDir,
  settleImageBlocks,
} from "./format";
import { enableFigureBlocks } from "../markdown/figures";
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

  it("indents and outdents regular text and code blocks with Tab and Shift+Tab", () => {
    const editor = editorWith("Hello\nHi there\n\n```\nconst x = 1;\nconst y = 2;\n```");

    // 1. Start of plain text line -> inserts 4 spaces
    const first = editor.children[0] as HTMLElement;
    const rStart = document.createRange();
    rStart.setStart(first.firstChild!, 0);
    rStart.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(rStart);
    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(first.textContent).toBe("    Hello");

    // 2. Mid-line -> inserts 4 spaces at caret
    const second = editor.children[1] as HTMLElement;
    const rMid = document.createRange();
    rMid.setStart(second.firstChild!, 2);
    rMid.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(rMid);
    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(second.textContent).toBe("Hi     there");

    // 3. Multi-line selection across lines 0 and 1 -> indents both lines, Shift+Tab brings them back
    const rMulti = document.createRange();
    rMulti.setStart(first.firstChild!, 1);
    rMulti.setEnd(second.firstChild!, 4);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(rMulti);
    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(first.textContent).toBe("        Hello");
    expect(second.textContent).toBe("    Hi     there");

    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(first.textContent).toBe("    Hello");
    expect(second.textContent).toBe("Hi     there");

    // 4. Empty line -> Tab adds 4 spaces cleanly
    const emptyLine = editor.children[2] as HTMLElement;
    const rEmpty = document.createRange();
    rEmpty.setStart(emptyLine, 0);
    rEmpty.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(rEmpty);
    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(emptyLine.textContent).toBe("    ");

    // 5. Fenced code block -> Tab indents and Shift+Tab outdents
    const pre = editor.querySelector("pre.md-pre") as HTMLElement;
    const rPre = document.createRange();
    rPre.setStart(pre.firstChild!, 0);
    rPre.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(rPre);
    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(pre.textContent).toContain("    const x = 1;");
    handleRichEditorKeyDown(
      { key: "Tab", shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>,
      editor,
      vi.fn(),
    );
    expect(pre.textContent).toBe("const x = 1;\nconst y = 2;");

    // 6. Round-trip preserves indented regular text
    const md = saved(editor);
    expect(md.startsWith("    Hello\nHi     there")).toBe(true);
    const reloaded = document.createElement("div");
    reloaded.innerHTML = markdownToHtml(md);
    expect(reloaded.children[0].textContent).toBe("    Hello");

    editor.remove();
  });

  it("resizes table columns interactively on hover/drag and retains portable sizes across devices and previews", () => {
    const md = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const editor = editorWith(md);
    const table = editor.querySelector("table.md-tbl") as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll("tr"));
    const th0 = rows[0].children[0] as HTMLElement;
    const th1 = rows[0].children[1] as HTMLElement;
    const td0 = rows[1].children[0] as HTMLElement;
    const td1 = rows[1].children[1] as HTMLElement;

    const mockRect = (left: number, top: number, width: number, height: number) =>
      () => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    th0.getBoundingClientRect = mockRect(0, 0, 120, 36);
    th1.getBoundingClientRect = mockRect(120, 0, 160, 36);
    td0.getBoundingClientRect = mockRect(0, 36, 120, 36);
    td1.getBoundingClientRect = mockRect(120, 36, 160, 36);

    // Hover near right edge of Col A (x=119, y=18) -> highlights whole Col A & sets cursor attr
    handleTableMouseMove({ target: th0, clientX: 119, clientY: 18 } as unknown as React.MouseEvent<HTMLElement>, editor);
    expect(table.getAttribute("data-resize-cursor")).toBe("col");
    expect(th0.getAttribute("data-resize-col")).toBe("1");
    expect(td0.getAttribute("data-resize-col")).toBe("1");

    // Drag right by +80px -> Col A becomes 200px wide while keeping standard GFM table intact
    const onInput = vi.fn();
    const handled = handleTableMouseDown(
      { button: 0, target: th0, clientX: 119, clientY: 18, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLElement>,
      editor,
      onInput,
    );
    expect(handled).toBe(true);
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 199, clientY: 18 }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: 199, clientY: 18 }));

    expect(onInput).toHaveBeenCalledTimes(1);
    expect(table.getAttribute("data-resize-cursor")).toBeNull();
    expect(table.getAttribute("data-widths")).toBe("200,160");

    // Portable Markdown stays pure GFM + trailing HTML comment
    const serialized = saved(editor);
    expect(serialized).toContain("| Col A | Col B |\n| --- | --- |\n| 1 | 2 |\n<!-- doit-table: cols=200,160 -->");

    // Moving the .md file to another device restores exact column widths & preview scaling
    const items = markdownToContent(serialized, [], () => "line");
    const preview = previewMarkup(items);
    expect(preview.html).toContain('data-sized="1"');
    expect(preview.html).toContain('--tbl-w:360px');
    expect(preview.html).toContain('--col-pct:55.56%');
    expect(preview.html).toContain('--col-pct:44.44%');

    // Leading metadata comment above a table is also honored cleanly
    const leadingHtml = markdownToHtml("<!-- doit-table: cols=240,120 -->\n| A | B |\n| --- | --- |\n| x | y |");
    expect(leadingHtml).toContain('data-widths="240,120"');

    editor.remove();
  });
});

describe("figure blocks", () => {
  enableFigureBlocks();
  const note = ["Before", '::graph-check{title="launch"}', "- [x] write notes", "- [ ] ship", "::", "- [ ] my own task"].join("\n");

  it("survive the editor unchanged, drawn as one block", () => {
    const editor = document.createElement("div");
    editor.innerHTML = markdownToHtml(note);
    expect(editor.querySelectorAll(".md-figure")).toHaveLength(1);
    expect(htmlToMarkdown(editor)).toBe(note);
  });

  it("keep their checkboxes out of the card's task map", () => {
    const content = markdownToContent(note, [], () => Math.random().toString(36));
    const own = content.find((item) => item.text === "my own task")!;
    expect(previewMarkup(content).taskIds).toEqual([own.id]);
  });
});

describe("image insertion and markdown rendering", () => {
  it("renders saved images immediately using previewSrc while persisting the relative markdown path", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<div><br></div>";
    document.body.appendChild(editor);

    const firstDiv = editor.firstElementChild as HTMLElement;
    const range = document.createRange();
    range.setStart(firstDiv, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const previewDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    insertSavedImageAtCaret(editor, "assets/deadbeef.png", "Pasted Image", previewDataUrl);

    const img = editor.querySelector("img.md-img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(previewDataUrl);
    expect(img!.getAttribute("data-md")).toBe("![Pasted Image](assets/deadbeef.png)");
    expect(img!.parentElement?.tagName).toBe("DIV");
    expect(img!.parentElement?.childNodes).toHaveLength(1);
    const nextLine = img!.parentElement?.nextElementSibling as HTMLElement | null;
    expect(nextLine?.tagName).toBe("DIV");
    expect(sel?.anchorNode).toBe(nextLine);
    expect(htmlToMarkdown(editor)).toBe("![Pasted Image](assets/deadbeef.png)");

    const items = markdownToContent(htmlToMarkdown(editor), [], () => "line");
    expect(previewMarkup(items).html).toContain(`<img class="md-img"`);
    expect(previewMarkup(items).html).toContain(previewDataUrl);

    editor.remove();
  });

  it("never turns unresolved or inline image syntax into a text link", () => {
    const html = inlineMarkdownToHtml("![image](assets/unresolved.png)");
    expect(html).not.toContain('class="md-link"');
    expect(html).toContain("![image](assets/unresolved.png)");

    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<div>![image](https://example.com/photo.png)</div>";
    document.body.appendChild(editor);
    normalizeEditor(editor);

    expect(editor.querySelector("a.md-link")).toBeNull();
    const img = editor.querySelector("img.md-img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://example.com/photo.png");

    editor.remove();
  });

  it("resolves relative image paths using Windows separators when markdownBaseDir uses backslashes", () => {
    const win = window as Window & { __TAURI_INTERNALS__?: { convertFileSrc?: (path: string) => string } };
    const hadInternals = "__TAURI_INTERNALS__" in win;
    const prevInternals = win.__TAURI_INTERNALS__;
    const convertFileSrc = vi.fn((path: string) => `asset://localhost/${path}`);
    win.__TAURI_INTERNALS__ = { convertFileSrc };
    setMarkdownBaseDir("C:\\Users\\demo\\Documents\\DoIT-Saves");

    try {
      const html = inlineMarkdownToHtml("![Shot](assets/winshot.png)");
      expect(convertFileSrc).toHaveBeenCalledWith("C:\\Users\\demo\\Documents\\DoIT-Saves\\assets\\winshot.png", "asset");
      expect(html).toContain('class="md-img"');
    } finally {
      setMarkdownBaseDir("");
      if (hadInternals) win.__TAURI_INTERNALS__ = prevInternals;
      else delete win.__TAURI_INTERNALS__;
    }
  });

  it("does not intercept clipboard pastes as link pastes when image files are present", () => {
    const editor = document.createElement("div");
    editor.innerHTML = "<div>hello world</div>";
    document.body.appendChild(editor);

    const textNode = editor.firstChild!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const file = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "https://example.com/image.png" : ""),
        files: [file],
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      },
    } as unknown as React.ClipboardEvent<HTMLElement>;

    try {
      expect(handleLinkPaste(event, editor)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    } finally {
      sel?.removeAllRanges();
      editor.remove();
    }
  });
});

describe("images and the caret", () => {
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const imageLine = `<div><img class="md-img" contenteditable="false" data-md="![p](a.png)" src="${pixel}"></div>`;
  const editorWith = (html: string) => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = html;
    document.body.appendChild(editor);
    return editor;
  };

  it("locks an image's line and keeps an editable line after it, and before it at the top", () => {
    const editor = editorWith(imageLine);
    settleImageBlocks(editor);
    const [before, line, after] = Array.from(editor.children) as HTMLElement[];
    expect(line.getAttribute("contenteditable")).toBe("false");
    expect(before.hasAttribute("data-gap")).toBe(true);
    expect(after.hasAttribute("data-gap")).toBe(true);
    // Settling again changes nothing.
    settleImageBlocks(editor);
    expect(editor.children).toHaveLength(3);
    editor.remove();
  });

  it("leaves text lines around an image as they are, and the note's Markdown unchanged", () => {
    const editor = editorWith(`<div>above</div>${imageLine}<div>below</div>`);
    settleImageBlocks(editor);
    expect(editor.children).toHaveLength(3);
    expect(htmlToMarkdown(editor)).toBe("above\n![p](a.png)\nbelow");
    editor.remove();
  });

  it("does not save the lines it adds", () => {
    const editor = editorWith(imageLine);
    settleImageBlocks(editor);
    expect(htmlToMarkdown(editor)).toBe("![p](a.png)");
    editor.remove();
  });

  it("moves a caret left beside an image onto the line after it", () => {
    const editor = editorWith(`<div>top</div><div><img class="md-img" data-md="![p](a.png)" src="${pixel}">&#8203;</div>`);
    const line = editor.children[1];
    const range = document.createRange();
    range.setStart(line.lastChild as Node, 1);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    settleImageBlocks(editor);
    const after = editor.children[2];
    expect(after).toBeDefined();
    expect(sel?.anchorNode).toBe(after);
    expect(htmlToMarkdown(editor)).toBe("top\n![p](a.png)");
    editor.remove();
  });

  it("drops the line of an image that was deleted instead of leaving a blank no caret can enter", () => {
    const editor = editorWith(`<div>top</div>${imageLine}<div>below</div>`);
    settleImageBlocks(editor);
    editor.querySelector("img")?.remove();
    settleImageBlocks(editor);
    expect(editor.children).toHaveLength(2);
    expect(htmlToMarkdown(editor)).toBe("top\nbelow");
    editor.remove();
  });

  it("removes only the image when Backspace is pressed on the line below it", () => {
    const editor = editorWith(`<div>top</div>${imageLine}<div>below</div>`);
    settleImageBlocks(editor);
    const below = editor.lastElementChild as HTMLElement;
    const range = document.createRange();
    range.setStart(below.firstChild as Node, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const event = { key: "Backspace", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>;
    expect(handleRichEditorKeyDown(event, editor, () => undefined)).toBe(true);
    expect(htmlToMarkdown(editor)).toBe("top\nbelow");
    editor.remove();
  });
});
