import { describe, expect, it } from "vitest";
import { imageMarkdownWithAlt, markdownToContent } from "./format";

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
